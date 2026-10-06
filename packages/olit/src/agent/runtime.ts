import type { Context as Chord } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  DEFAULT_COMPACTION_POLICY,
  Harness,
  UsageDoc,
  type Conversation,
  type ConversationId,
  type EntryRecord,
  type Storage,
  type Submission,
} from "@earendil-works/pi-durable";

import { artifactsOf } from "../artifacts/kinds";
import type { Ask } from "./destructive";
import { Binding, FollowUps, Sessions } from "./documents";
import { DEFAULT_CAPABILITIES, MAX_STEPS, olitExtension } from "./extension";
import { connectGalaxy, type Galaxy } from "./galaxy";
import { olitModels } from "./model";
import { GALAXY_READY, GALAXY_UNREACHABLE, systemText, type GalaxyStatus } from "./prompt";
import { probeWindow, resolve, type LlmConfig, type Target } from "./providers";
import { editRecord } from "./record-write";
import { modelsOf, SCHEMA, type SessionDocument } from "./saved";
import { writeSessionSummary } from "./session-summary";
import { skillRegistry } from "./skills";
import type { Capability, Python } from "./tool";
import { galaxyOps, olitTools } from "./tools";
import { galaxyWatch, WATCH_TASK, type Watched } from "./watch";

export const context = BACKGROUND_CONTEXT;

const MIN_SECRET_LENGTH = 8;
/** Earlier artifacts a tool can place; a spec carries its rows, so few are offered. */
const ARTIFACT_LIMIT = 20;

export interface RuntimeConfig extends LlmConfig {
  galaxy_root: string;
  /** Headless only; in the browser the user's session authenticates. */
  galaxy_key?: string;
  credentials?: RequestCredentials;
  ai_reserve_tokens?: number;
  ai_keep_recent_tokens?: number;
  ai_compaction?: boolean;
  capabilities?: Capability[];
  max_steps?: number;
}

export interface RuntimeOptions {
  storage: Storage;
  config: RuntimeConfig;
  python: Python;
  /** Where a headless run reads provider keys; a browser has none. */
  env?: Record<string, string | undefined>;
  /** Present when a user can approve a destructive operation. */
  ask?: Ask;
  /** Galaxy work is polled this often. */
  pollMs?: number;
}

/** Where a new conversation works, as the page or the harness knows it. */
export interface Placement {
  historyId?: string;
  datasetId?: string;
  instructions?: string;
}

const uuid = () => globalThis.crypto?.randomUUID?.() || `s-${Date.now()}-${Math.random()}`;

async function target(config: LlmConfig, env: Record<string, string | undefined>): Promise<Target> {
  const resolved = resolve(config, env);
  if (resolved.provider.probeWindow && !config.ai_context_window && resolved.baseUrl) {
    resolved.contextWindow = (await probeWindow(resolved.baseUrl)) ?? resolved.contextWindow;
  }
  return resolved;
}

/** The model a provider switch changes, and what compaction and the guards read of it. */
interface Current {
  config: RuntimeConfig;
  target: Target;
  model: { provider: string; modelId: string };
  apiKey?: string;
}

/**
 * Olit on pi-durable: one Harness over one storage with Olit's extension installed, and what a host
 * decides around it: which conversation a history continues, the model in use, and how a Stop
 * holds back follow-ups.
 */
export class Runtime {
  private constructor(
    readonly harness: Harness,
    readonly galaxy: Galaxy,
    readonly galaxyStatus: GalaxyStatus,
    private readonly current: Current,
    private readonly connect: ReturnType<typeof olitModels>["connect"],
    private readonly env: Record<string, string | undefined>,
  ) {}

  static async open({ storage, config, python, env = {}, ask, pollMs }: RuntimeOptions) {
    const galaxyOptions = {
      root: config.galaxy_root,
      key: config.galaxy_key,
      credentials: config.credentials,
    };
    const galaxy = connectGalaxy(galaxyOptions);
    const { models, connect } = olitModels(env);
    const resolved = await target(config, env);
    const connected = await connect(resolved);
    const current: Current = { config, target: resolved, ...connected };
    const galaxyStatus = await galaxy
      .get("api/version")
      .then((): GalaxyStatus => GALAXY_READY)
      .catch((): GalaxyStatus => GALAXY_UNREACHABLE);
    const skills = skillRegistry();
    const capabilities = config.capabilities ?? DEFAULT_CAPABILITIES;
    let harness: Harness | undefined;
    const watch = galaxyWatch({
      galaxy,
      pollMs,
      editRecord: async (id, edit) => {
        const bound = await harness?.snapshot(Binding, id, context);
        return editRecord({ galaxy, pageId: bound?.pageId }, edit);
      },
    });
    const extension = olitExtension({
      galaxy,
      clients: (signal) => ({
        galaxy: connectGalaxy({ ...galaxyOptions, signal }),
        ops: galaxyOps({ ...galaxyOptions, root: galaxy.root, signal }),
        python: { ...python, run: (code) => python.run(code, signal) },
      }),
      artifacts: async (id, ctx) => {
        const conversation = await harness!.conversation(id, ctx);
        const entries = conversation ? (await conversation.context(ctx)).entries : [];
        return artifactsOf(entries).slice(-ARTIFACT_LIMIT);
      },
      watched: (id, ctx) => watchedBy(harness!, id, ctx),
      tools: olitTools(skills),
      capabilities,
      secrets: () =>
        [current.apiKey, config.galaxy_key].filter(
          (s): s is string => typeof s === "string" && s.length >= MIN_SECRET_LENGTH,
        ),
      prompt: ({ model, provider, datasetId }) =>
        [
          systemText({
            model,
            provider,
            galaxyStatus,
            seedDataset: datasetId,
            galaxyRoot: galaxy.root,
            galaxyReads: capabilities.includes("read"),
          }),
          skills.routerText(),
        ]
          .filter(Boolean)
          .join("\n\n"),
      ask,
      watch,
    });
    const registry = createRegistry();
    registry.install(extension);
    harness = await Harness.open(
      storage,
      {
        models,
        registry,
        settings: {
          toolExecution: "sequential",
          followUpMode: "all",
          promptPlacement: "lead",
          maxTurns: config.max_steps || MAX_STEPS,
          get compaction() {
            const reserveTokens =
              current.config.ai_reserve_tokens ||
              current.target.maxTokens ||
              DEFAULT_COMPACTION_POLICY.reserveTokens;
            const window = current.target.contextWindow ?? Number.MAX_SAFE_INTEGER;
            return {
              enabled: current.config.ai_compaction !== false,
              reserveTokens,
              keepRecentTokens: Math.min(
                current.config.ai_keep_recent_tokens || DEFAULT_COMPACTION_POLICY.keepRecentTokens,
                Math.max(0, window - reserveTokens),
              ),
            };
          },
        },
        onReport: (error) => console.warn("[olit]", error),
      },
      context,
    );
    harness.resume();
    return new Runtime(harness, galaxy, galaxyStatus, current, connect, env);
  }

  get capabilities(): Capability[] {
    return this.current.config.capabilities ?? DEFAULT_CAPABILITIES;
  }

  get maxSteps(): number {
    return this.current.config.max_steps || MAX_STEPS;
  }

  /** The model new requests use. */
  get model() {
    return this.current.model;
  }

  /** Switch provider or model for `conversation`, and for every conversation opened after. */
  async switchModel(conversation: Conversation, config: LlmConfig): Promise<void> {
    const merged = { ...this.current.config, ...config };
    const next = await target(merged, this.env);
    Object.assign(this.current, { config: merged, target: next, ...(await this.connect(next)) });
    await conversation.configure({ model: this.model }, context);
  }

  /** A new conversation for `placement`, which its history continues from now on. */
  create(placement: Placement = {}): Promise<Conversation> {
    return this.harness.createConversation(
      {
        ownership: { kind: "ownerless" },
        agent: {
          model: this.model,
          ...(placement.instructions ? { instructions: placement.instructions } : {}),
        },
        init: async (tx, id) => {
          Object.assign(await tx.doc(Binding, id), {
            sessionId: uuid(),
            startedAt: new Date().toISOString(),
            ...(placement.historyId ? { historyId: placement.historyId } : {}),
            ...(placement.datasetId ? { datasetId: placement.datasetId } : {}),
          });
          if (placement.historyId) {
            (await tx.doc(Sessions)).byHistory[placement.historyId] = id;
          }
        },
      },
      context,
    );
  }

  /** The conversation this history continues, or a new one. */
  async continuing(placement: Placement): Promise<Conversation> {
    const index = await this.harness.snapshot(Sessions, context);
    const known = placement.historyId ? index?.byHistory[placement.historyId] : undefined;
    const found =
      known === undefined
        ? undefined
        : await this.harness.conversation(known as ConversationId, context);
    if (found) {
      await found.configure({ model: this.model }, context);
      return found;
    }
    return this.create(placement);
  }

  /** The user's own message, which lets settled work start runs again. */
  async submit(conversation: Conversation, text: string): Promise<Submission> {
    await conversation.commit(async (tx) => {
      Object.assign(await tx.doc(FollowUps, conversation.id), { automatic: 0, paused: false });
    }, context);
    return conversation.submit({ type: "input", content: text }, context);
  }

  /** Stop: the run ends, and follow-ups wait for the user's next message. */
  async stop(conversation: Conversation): Promise<void> {
    await conversation.commit(async (tx) => {
      (await tx.doc(FollowUps, conversation.id)).paused = true;
    }, context);
    await conversation.abort(context, { keepQueued: true });
  }

  /** Upsert the record's session block: loom writes it at session end, a tab has none. */
  async summarize(conversation: Conversation): Promise<void> {
    const bound = await this.harness.snapshot(Binding, conversation.id, context);
    if (!bound?.sessionId) return;
    await writeSessionSummary(this.galaxy, bound.pageId, {
      id: bound.sessionId,
      startedAt: bound.startedAt ?? new Date().toISOString(),
      endedAt: new Date().toISOString(),
      orphanedActiveSteps: 0,
    });
  }

  /** The conversation as a saved session: its context, and what binds it to Galaxy. */
  async export(conversation: Conversation, title = ""): Promise<SessionDocument> {
    const [exported, bound, usage] = await Promise.all([
      conversation.export(context),
      this.harness.snapshot(Binding, conversation.id, context),
      this.harness.snapshot(UsageDoc, conversation.id, context),
    ]);
    const totals = Object.values(usage?.models ?? {});
    const now = new Date().toISOString();
    return {
      olit_session: SCHEMA,
      ...(bound?.historyId ? { history_id: bound.historyId } : {}),
      ...(bound?.datasetId ? { dataset_id: bound.datasetId } : {}),
      session: {
        id: bound?.sessionId ?? uuid(),
        title,
        createdAt: bound?.startedAt ?? now,
        updatedAt: now,
        turn: exported.entries.filter((e) => e.kind === "pi.user").length,
        ...(bound?.pageId ? { recordPageId: bound.pageId } : {}),
        models: modelsOf(exported.entries),
        usage: {
          input: totals.reduce((sum, u) => sum + (u.input ?? 0), 0),
          output: totals.reduce((sum, u) => sum + (u.output ?? 0), 0),
          cost: totals.length ? totals.reduce((sum, u) => sum + (u.cost?.total ?? 0), 0) : null,
        },
      },
      entries: [...exported.entries],
    };
  }

  /**
   * A saved session as saved: the conversation already holding that save when it has not moved on
   * since, a new one opened from the document otherwise.
   */
  async open(document: SessionDocument, savedId: string): Promise<Conversation> {
    const index = await this.harness.snapshot(Sessions, context);
    const known = index?.bySaved[savedId];
    if (known && known.updatedAt === document.session.updatedAt) {
      const found = await this.harness.conversation(known.conversation as ConversationId, context);
      if (found && (await lastEntry(found)) === known.last) {
        await found.configure({ model: this.model }, context);
        return found;
      }
    }
    const opened = await this.harness.importConversation(
      { entries: document.entries },
      {
        ownership: { kind: "ownerless" },
        agent: { model: this.model },
        init: async (tx, id) => {
          Object.assign(await tx.doc(Binding, id), {
            sessionId: document.session.id,
            startedAt: document.session.createdAt,
            ...(document.history_id ? { historyId: document.history_id } : {}),
            ...(document.dataset_id ? { datasetId: document.dataset_id } : {}),
            ...(document.session.recordPageId ? { pageId: document.session.recordPageId } : {}),
          });
          if (document.history_id) (await tx.doc(Sessions)).byHistory[document.history_id] = id;
        },
      },
      context,
    );
    await this.saved(opened, savedId, document);
    return opened;
  }

  /** Remember that this conversation, as it stands, is what `savedId` holds. */
  async saved(conversation: Conversation, savedId: string, document: SessionDocument) {
    const last = await lastEntry(conversation);
    await this.harness.commit(async (tx) => {
      (await tx.doc(Sessions)).bySaved[savedId] = {
        conversation: conversation.id,
        updatedAt: document.session.updatedAt,
        ...(last === undefined ? {} : { last }),
      };
    }, context);
  }

  close() {
    return this.harness.close(context);
  }
}

/** Galaxy work the conversation watches, with the state its watch last read. */
export async function watchedBy(
  harness: Harness,
  conversationId: ConversationId,
  ctx: Chord,
): Promise<Watched[]> {
  const { tasks } = await harness.inspect(ctx);
  return tasks.flatMap(({ record }) => {
    if (record.kind !== WATCH_TASK || record.conversationId !== conversationId) return [];
    const state = (record.state as { checkpoint?: { state?: string } }).checkpoint?.state;
    return [{ ...(record.input as unknown as Watched), ...(state ? { state } : {}) }];
  });
}

/** The id of the newest entry of the conversation's active context. */
async function lastEntry(conversation: Conversation): Promise<number | undefined> {
  return (await conversation.context(context)).entries.at(-1)?.id;
}
