import { destructiveGate, type Ask } from "./destructive";
import { SraImportGate } from "./sra-gate";
import type { Guard, ToolTraits } from "./tool";
import type { Watched } from "./watch";

const FAILED_REPEAT_LIMIT = 3;
const SETTLED_REPEAT_LIMIT = 3;
const COOLDOWN_MS = 120_000;
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
  secrets: string[];
  /** Tools that exist but this session does not grant, with the capability each needs. */
  withheld: Map<string, string>;
  advertised: string[];
  ask?: Ask;
  now?: () => number;
}

export interface Call {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

/** Olit's guards over one run's calls. */
export function guards(options: GuardOptions) {
  const now = options.now ?? Date.now;
  const failures = new Map<string, number>();
  const checked = new Map<string, Record<string, unknown>>();
  const settled = new Map<string, number>();
  const readAt = new Map<string, number>();
  const sra = new SraImportGate();
  const destructive = destructiveGate(
    options.ask,
    (name, args) => options.tools.get(name)?.destroys(args) === true,
  );
  const refused = new Map<string, Guard>();

  function refusal(
    name: string,
    args: Record<string, unknown>,
    id: string,
    watched: Watched[],
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
    const states = new Map(
      watched.flatMap((w) => [w.id, ...(w.outputs ?? [])].map((id) => [id, w.state])),
    );
    if (resource && states.has(resource)) {
      const last = readAt.get(resource);
      if (last !== undefined && now() - last < COOLDOWN_MS) {
        const remaining = Math.floor((COOLDOWN_MS - (now() - last)) / 1000);
        return [
          "galaxy-poll",
          `Refused: ${resource} was ${states.get(resource) || "unfinished"} when it was last read, and the ` +
            "background monitor is watching it -- you are told when it settles, without spending a call. " +
            `Reading it again cannot say anything new for another ${remaining}s.`,
        ];
      }
      readAt.set(resource, now());
    }
    const fannedOut = sra.check(id, name, args);
    return fannedOut ? ["sra-fan-out", fannedOut] : undefined;
  }

  /** One answer's calls, read together so the SRA gate sees the batch. */
  function observe(calls: Call[]) {
    sra.observe(calls);
  }

  /** The refusal of a call about to run; `watched` is the conversation's unfinished work. */
  async function check(call: Call, watched: Watched[]): Promise<string | undefined> {
    checked.set(call.id, call.arguments);
    const hit = refusal(call.name, call.arguments, call.id, watched);
    if (hit) {
      refused.set(call.id, hit[0]);
      return hit[1];
    }
    const declined = await destructive(call.name, call.arguments);
    if (declined) {
      refused.set(call.id, "destructive-declined");
    }
    return declined;
  }

  /** A result as the model may read it: secrets and control tokens out. */
  function screened(text: string): string | undefined {
    const clean = withoutControlTokens(redact(text, options.secrets));
    return clean === text ? undefined : clean;
  }

  /** What the model reads for a call to a tool it was not offered, and the guard behind it. */
  function unoffered(name: string): { text: string; guard?: Guard } | undefined {
    const plain = plainToolName(name);
    const capability = options.withheld.get(plain);
    if (capability) {
      return {
        text:
          `Refused: '${plain}' needs the '${capability}' capability, which is not granted in this session. ` +
          "Tell the user, and stay within the tools you are offered.",
        guard: "capability",
      };
    }
    const hint = notFoundHint(name, options.advertised);
    return hint ? { text: withoutControlTokens(`Tool ${name} not found\n\n${hint}`) } : undefined;
  }

  /** Count a failed call by the arguments it was checked with, so an unchanged repeat meets the guard. */
  function noteFailure(name: string, id: string) {
    const args = checked.get(id);
    if (!args) return;
    checked.delete(id);
    failures.set(key(name, args), (failures.get(key(name, args)) ?? 0) + 1);
  }

  /** The guard that refused this call before it ran, if one did. */
  const guardOf = (id: string): Guard | undefined => refused.get(id);

  return { observe, check, screened, unoffered, noteFailure, guardOf };
}
