import type { Context as Chord } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import {
  createRegistry,
  DEFAULT_COMPACTION_POLICY,
  Harness,
  UsageDoc,
  type Conversation,
  type ConversationId,
  type Cursor,
  type EntryRecord,
  type Storage,
  type Submission,
} from "@earendil-works/pi-durable";

import { artifactsOf, type Artifact } from "../artifacts/kinds";
import type { AskFor } from "./destructive";
import { Binding, FollowUps, Sessions } from "./documents";
import { DEFAULT_CAPABILITIES, MAX_STEPS, olitExtension } from "./extension";
import { connectGalaxy, connectWeb, type Galaxy } from "./galaxy";
import { olitModels } from "./model";
import { recordsOn, type RecordSummary } from "./notebook";
import { GALAXY_READY, GALAXY_UNREACHABLE, systemText, type GalaxyStatus } from "./prompt";
import { probeWindow, resolve, type LlmConfig, type Target } from "./providers";
import { editRecord } from "./record-write";
import { modelsOf, SCHEMA, thisBuild, usageTotals, type SessionDocument } from "./saved";
import { skillRegistry } from "./skills";
import type { Capability, Python } from "./tool";
import { galaxyOps, olitTools } from "./tools";
import { galaxyWatch, WATCH_TASK, type Watched } from "./watch";

export const context = BACKGROUND_CONTEXT;

/** Earlier artifacts a tool can place; a spec carries its rows, so few are offered. */
const ARTIFACT_LIMIT = 20;

/** How Olit's turns run under pi-durable, whatever the model: what `describe` reports as well. */
export const LOOP = {
  toolExecution: "sequential",
  followUpMode: "all",
  promptPlacement: "lead",
} as const;

/**
 * The newest artifacts a conversation's results carried, oldest of them first. Read from its
 * whole history rather than its context, so a chart the user saw stays placeable after the turns
 * that made it were summarized away.
 */
export async function artifactsIn(
  conversation: Pick<Conversation, "entries">,
  ctx: Chord,
): Promise<Artifact[]> {
  const found: Artifact[] = [];
  let cursor: Cursor | undefined;
  do {
    const page = await conversation.entries({}, 200, cursor, ctx);
    found.unshift(...artifactsOf([...page.items].reverse()));
    cursor = page.next;
  } while (cursor && found.length < ARTIFACT_LIMIT);
  return found.slice(-ARTIFACT_LIMIT);
}

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
  ask?: AskFor;
  /** Galaxy work is polled this often. */
  pollMs?: number;
}

/** Where a new conversation works, as the page or the harness knows it. */
export interface Placement {
  historyId?: string;
  datasetId?: string;
  instructions?: string;
  /**
   * A session found again through the record attached to its history, once the browser kept
   * nothing of it: its identity and record are durable, its conversation was not.
   */
  record?: RecordSummary;
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
  /** Why Galaxy did not answer when the session opened, when it did not. */
  galaxyProblem?: string;
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
    let galaxyProblem: string | undefined;
    const galaxyStatus = await galaxy
      .get("api/version")
      .then((): GalaxyStatus => GALAXY_READY)
      .catch((e): GalaxyStatus => {
        galaxyProblem = String((e as Error)?.message ?? e);
        return GALAXY_UNREACHABLE;
      });
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
        web: connectWeb(signal),
        ops: galaxyOps({ ...galaxyOptions, root: galaxy.root, signal }),
        python: { ...python, run: (code) => python.run(code, signal) },
      }),
      artifacts: async (id, ctx) => {
        const conversation = await harness!.conversation(id, ctx);
        return conversation ? artifactsIn(conversation, ctx) : [];
      },
      watched: (id, ctx) => watchedBy(harness!, id, ctx),
      tools: olitTools(skills),
      capabilities,
      secrets: () =>
        [current.apiKey, config.galaxy_key].filter((s): s is string => typeof s === "string"),
      prompt: ({ model, provider, datasetId }) =>
        [
          systemText({
            model,
            provider,
            galaxyStatus,
            seedDataset: datasetId,
            galaxyRoot: galaxy.root,
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
          ...LOOP,
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
    const runtime = new Runtime(harness, galaxy, galaxyStatus, current, connect, env);
    runtime.galaxyProblem = galaxyProblem;
    // Before scheduling starts, so no run the store holds takes another step unasked.
    await runtime.hold(await runtime.active());
    harness.resume();
    return runtime;
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
            sessionId: placement.record?.sessionId ?? uuid(),
            startedAt: placement.record?.created || new Date().toISOString(),
            ...(placement.record ? { pageId: placement.record.pageId } : {}),
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

  /** The conversation this browser keeps for the history, now on the dataset it was launched on. */
  async kept(placement: Placement): Promise<Conversation | undefined> {
    const index = await this.harness.snapshot(Sessions, context);
    const known = placement.historyId ? index?.byHistory[placement.historyId] : undefined;
    const found =
      known === undefined
        ? undefined
        : await this.harness.conversation(known as ConversationId, context);
    if (found) {
      await found.configure({ model: this.model }, context);
      if (placement.datasetId) {
        await found.commit(async (tx) => {
          (await tx.doc(Binding, found.id)).datasetId = placement.datasetId;
        }, context);
      }
    }
    return found;
  }

  /** The conversation this history continues, or a new one. */
  async continuing(placement: Placement): Promise<Conversation> {
    return (await this.kept(placement)) ?? this.create(placement);
  }

  /** The Olit records attached to the launch history, for a session this browser no longer keeps. */
  records(historyId: string | undefined): Promise<RecordSummary[]> {
    return historyId ? recordsOn(this.galaxy, historyId) : Promise.resolve([]);
  }

  /** The user's own message, which lets settled work start runs again. */
  async submit(conversation: Conversation, text: string): Promise<Submission> {
    await conversation.commit(async (tx) => {
      Object.assign(await tx.doc(FollowUps, conversation.id), { automatic: 0, paused: false });
    }, context);
    return conversation.submit({ type: "input", content: text }, context);
  }

  /** Every conversation with live work: a run, or Galaxy work it watches. */
  async active(): Promise<Conversation[]> {
    const { tasks } = await this.harness.inspect(context);
    const ids = new Set(tasks.map(({ record }) => record.conversationId).filter((id) => id));
    const found = await Promise.all(
      [...ids].map((id) => this.harness.conversation(id as ConversationId, context)),
    );
    return found.filter((c): c is Conversation => c !== undefined);
  }

  hold(conversations: Conversation[]): Promise<void> {
    return hold(conversations);
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
    const build = thisBuild();
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
        ...(build ? { build } : {}),
        models: modelsOf(exported.entries),
        usage: usageTotals(totals),
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
          // A save keeps totals, not a breakdown by model.
          const { input, output, cost } = document.session.usage;
          (await tx.doc(UsageDoc, id)).models["saved"] = {
            input,
            output,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: input + output,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost ?? 0 },
          };
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

/**
 * Hold conversations nobody is looking at: each run ends and its follow-ups wait for the user's
 * next message, while its Galaxy work is still watched. Returns once the pauses are committed and
 * the aborts enqueued, without waiting for a running tool to end.
 */
export async function hold(conversations: Conversation[]): Promise<void> {
  for (const conversation of conversations) {
    await conversation.commit(async (tx) => {
      (await tx.doc(FollowUps, conversation.id)).paused = true;
    }, context);
  }
  // One synchronous pass: every abort mark is enqueued before scheduling can take a step.
  for (const conversation of conversations) {
    conversation
      .abort(context, { keepQueued: true })
      .catch((e) => console.warn("[olit] a held conversation did not stop", e));
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
