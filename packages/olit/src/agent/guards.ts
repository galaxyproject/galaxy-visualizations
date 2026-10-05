import { contentText } from "@earendil-works/pi-ai";
import type {
  AfterToolCallContext,
  AfterToolCallResult,
  AgentMessage,
  BeforeToolCallContext,
  BeforeToolCallResult,
} from "@earendil-works/pi-agent-core";

import { destructiveGate, type Ask } from "./destructive";
import { SraImportGate } from "./sra-gate";
import type { Guard, ToolTraits } from "./tool";
import type { Watch } from "./watch";

const FAILED_REPEAT_LIMIT = 3;
const SETTLED_REPEAT_LIMIT = 3;
const COOLDOWN_MS = 120_000;
export const MAX_RESULT_BYTES = 256 * 1024;
const MIN_SECRET_LENGTH = 8;
const HARMONY_MARKER = "<|";

const CONFUSABLES: Record<string, string> = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  х: "x",
  у: "y",
  А: "A",
  Е: "E",
  О: "O",
  Р: "P",
  С: "C",
  Х: "X",
  У: "Y",
  ν: "v",
  τ: "t",
};

const fold = (text: string) => [...text].map((ch) => CONFUSABLES[ch] ?? ch).join("");

/** `name` up to the first harmony control token. */
export const plainToolName = (name: string) => name.split(HARMONY_MARKER)[0].trim();

/** `text` with harmony control tokens dropped, so replaying it cannot re-parse. */
export function withoutControlTokens(text: string): string {
  if (!text.includes(HARMONY_MARKER)) {
    return text;
  }
  return text
    .split(HARMONY_MARKER)
    .map((part, i) => {
      const end = part.indexOf("|>");
      return i && end >= 0 ? part.slice(end + 2) : part;
    })
    .join("");
}

/** What a "not found" tool name meant, as loom's hint says it; control tokens trimmed or lookalikes folded. */
export function notFoundHint(name: string, advertised: string[]): string | undefined {
  const trimmed = plainToolName(name);
  if (trimmed !== name && advertised.includes(trimmed)) {
    return `Did you mean \`${trimmed}\`?`;
  }
  if (![...name].some((ch) => ch in CONFUSABLES)) {
    return undefined;
  }
  const match = advertised.find((candidate) => fold(candidate) === fold(name));
  return match
    ? `Did you mean \`${match}\`? The tool name you called contains Unicode confusables (visually similar non-Latin characters).`
    : undefined;
}

export function redact(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of [...secrets]
    .filter((s) => s.length >= MIN_SECRET_LENGTH)
    .sort((a, b) => b.length - a.length)) {
    out = out.split(secret).join("[redacted]");
  }
  return out;
}

const key = (name: string, args: unknown) => `${name} ${JSON.stringify(args)}`;

export interface GuardOptions {
  /** What each tool says of itself: settled, what it polls, whether a call destroys. */
  tools: ReadonlyMap<string, ToolTraits>;
  /** The session's unfinished work, read live: something submitted this turn counts too. */
  watch: Watch;
  secrets: string[];
  /** Tools that exist but this session does not grant, with the capability each needs. */
  withheld: Map<string, string>;
  advertised: string[];
  ask?: Ask;
  now?: () => number;
}

/** Olit's guards on pi's hooks; one instance per turn. */
export function guards(options: GuardOptions) {
  const now = options.now ?? Date.now;
  const failures = new Map<string, number>();
  const checked = new Map<string, Record<string, unknown>>();
  const settled = new Map<string, number>();
  const readAt = new Map<string, number>();
  const states = () =>
    new Map(
      options.watch.list().flatMap((w) => [w.id, ...(w.outputs ?? [])].map((id) => [id, w.state])),
    );
  const sra = new SraImportGate();
  const destructive = destructiveGate(
    options.ask,
    (name, args) => options.tools.get(name)?.destroys(args) === true,
  );
  const refused = new Map<string, Guard>();
  let observed: unknown;

  function refusal(
    name: string,
    args: Record<string, unknown>,
    id: string,
  ): [Guard, string] | undefined {
    const count = failures.get(key(name, args)) ?? 0;
    if (count >= FAILED_REPEAT_LIMIT) {
      failures.delete(key(name, args));
      return [
        "repeated-failure",
        `Refused: '${name}' was already called with these exact arguments ${count} times and failed each time. ` +
          "Change the arguments or the approach; resending the same call cannot succeed.",
      ];
    }
    const traits = options.tools.get(name);
    if (traits?.settled) {
      const asked = (settled.get(key(name, args)) ?? 0) + 1;
      settled.set(key(name, args), asked);
      if (asked >= SETTLED_REPEAT_LIMIT) {
        return [
          "settled-question",
          `Refused: '${name}' was already answered ${asked - 1} times with these exact arguments, and its ` +
            "answer is fixed for this session. Use the answer you have, or take a different route.",
        ];
      }
    }
    const resource = traits?.polls ? String(args[traits.polls] ?? "") : "";
    if (resource && states().has(resource)) {
      const last = readAt.get(resource);
      if (last !== undefined && now() - last < COOLDOWN_MS) {
        const remaining = Math.floor((COOLDOWN_MS - (now() - last)) / 1000);
        return [
          "galaxy-poll",
          `Refused: ${resource} was ${states().get(resource) || "unfinished"} when it was last read, and the ` +
            "background monitor is watching it -- you are told when it settles, without spending a call. " +
            `Reading it again cannot say anything new for another ${remaining}s.`,
        ];
      }
      readAt.set(resource, now());
    }
    const fannedOut = sra.check(id, name, args);
    return fannedOut ? ["sra-fan-out", fannedOut] : undefined;
  }

  async function beforeToolCall(
    context: BeforeToolCallContext,
  ): Promise<BeforeToolCallResult | undefined> {
    if (observed !== context.assistantMessage) {
      observed = context.assistantMessage;
      sra.observe(
        context.assistantMessage.content.flatMap((c) =>
          c.type === "toolCall" ? [{ id: c.id, name: c.name, arguments: c.arguments }] : [],
        ),
      );
    }
    const { id, name } = context.toolCall;
    const args = (context.args ?? {}) as Record<string, unknown>;
    checked.set(id, args);
    const hit = refusal(name, args, id);
    if (hit) {
      refused.set(id, hit[0]);
      return { block: true, reason: hit[1] };
    }
    const gated = await destructive(context);
    if (gated?.block) {
      refused.set(id, "destructive-declined");
    }
    return gated;
  }

  async function afterToolCall({
    toolCall,
    result,
  }: AfterToolCallContext): Promise<AfterToolCallResult | undefined> {
    const text = contentText(result.content);
    const size = new TextEncoder().encode(text).length;
    if (size > MAX_RESULT_BYTES) {
      return {
        content: [
          {
            type: "text",
            text:
              `Tool call "${toolCall.name}" returned ${Math.floor(size / 1024)} KB, over the ${MAX_RESULT_BYTES / 1024} KB limit for a ` +
              "single result, so it was discarded. Ask for less of it: check this tool's parameters for a way to " +
              "narrow the request, or use a more specific tool.",
          },
        ],
        isError: true,
      };
    }
    const clean = withoutControlTokens(redact(text, options.secrets));
    return clean === text ? undefined : { content: [{ type: "text", text: clean }] };
  }

  /** Count a failed call by the arguments it was checked with, so an unchanged repeat meets the guard. */
  function noteFailure(name: string, id: string) {
    const args = checked.get(id);
    if (!args) return;
    checked.delete(id);
    failures.set(key(name, args), (failures.get(key(name, args)) ?? 0) + 1);
  }

  /** The guard that refused this call, including pi's own "not found" for a withheld tool. */
  function guardOf(id: string, name: string, notFound: boolean): Guard | undefined {
    if (refused.has(id)) {
      return refused.get(id);
    }
    return notFound && options.withheld.has(name) ? "capability" : undefined;
  }

  /** What the model reads in place of pi's bare "not found". */
  function convert(messages: AgentMessage[]): AgentMessage[] {
    return messages.map((m) => {
      if (m.role !== "toolResult" || !m.isError) {
        return m;
      }
      const text = contentText(m.content);
      if (text !== `Tool ${m.toolName} not found`) {
        return m;
      }
      const name = plainToolName(m.toolName);
      const capability = options.withheld.get(name);
      const hint = notFoundHint(m.toolName, options.advertised);
      const replaced = capability
        ? `Refused: '${name}' needs the '${capability}' capability, which is not granted in this session. ` +
          "Tell the user, and stay within the tools you are offered."
        : hint && `${text}\n\n${hint}`;
      return {
        ...m,
        toolName: plainToolName(m.toolName),
        content: [{ type: "text", text: withoutControlTokens(replaced ?? text) }],
      };
    });
  }

  return { beforeToolCall, afterToolCall, noteFailure, guardOf, convert };
}
