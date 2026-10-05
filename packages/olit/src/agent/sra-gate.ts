const RUN_TOOL = /^(?:galaxy_)?run_tool$/;
const SRA_TOOL = /^(?:(?:[^/]+\/repos\/iuc\/sra_tools\/)?(?:fastq_dump|fasterq_dump))(?:\/[^/]+)?$/;
const ACCESSION = /^(?:SRR|ERR|DRR)\d+$/;
const SEPARATORS = /[\s,;]+/;

type Json = Record<string, unknown>;

const obj = (value: unknown): Json | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Json) : undefined;

function parseObj(value: unknown): Json | undefined {
  if (typeof value !== "string") {
    return obj(value);
  }
  try {
    return obj(JSON.parse(value));
  } catch {
    return undefined;
  }
}

/** A canonical rendering, so two spellings of the same settings share a key. */
function stable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Json)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable((value as Json)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

function flatten(inputs: Json): Json {
  const flat: Json = {};
  for (const [key, value] of Object.entries(inputs)) {
    const group = key === "input" || key === "adv" ? obj(value) : undefined;
    if (!group) {
      flat[key] = value;
      continue;
    }
    for (const [child, childValue] of Object.entries(group)) {
      if (child !== "__current_case__") {
        flat[`${key}|${child}`] = childValue;
      }
    }
  }
  return flat;
}

function accessions(value: unknown): string[] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const runs = value
    .trim()
    .split(SEPARATORS)
    .filter((run) => run);
  return runs.length && runs.every((run) => ACCESSION.test(run)) ? runs : undefined;
}

interface SraCall {
  key: string;
  runs?: string[];
  mapped: boolean;
  fileList: boolean;
}

export function sraCall(name: unknown, raw: unknown): SraCall | undefined {
  if (
    !RUN_TOOL.test(
      String(name ?? "")
        .trim()
        .toLowerCase(),
    )
  ) {
    return undefined;
  }
  const args = parseObj(raw);
  if (!args) {
    return undefined;
  }
  const { tool_id: toolId, history_id: historyId } = args;
  if (
    typeof toolId !== "string" ||
    typeof historyId !== "string" ||
    !historyId ||
    !SRA_TOOL.test(toolId)
  ) {
    return undefined;
  }
  const inputs = parseObj(args.inputs);
  if (!inputs) {
    return undefined;
  }
  const flat = flatten(inputs);
  const mode = flat["input|input_select"] ?? "accession_number";
  if (mode !== "accession_number" && mode !== "file_list") {
    return undefined;
  }
  const value = flat[mode === "file_list" ? "input|file_list" : "input|accession"];
  const ref = obj(value) ?? {};
  const settings = Object.fromEntries(
    Object.entries(flat).filter(
      ([k]) => !["input|input_select", "input|accession", "input|file_list"].includes(k),
    ),
  );
  return {
    key: stable({ ...args, inputs: settings }),
    runs: mode === "accession_number" ? accessions(value) : undefined,
    mapped: ref.__class__ === "Batch" || ref.batch === true || ref.src === "hdca",
    fileList: mode === "file_list" && ref.src === "hda" && typeof ref.id === "string",
  };
}

export function remediation(runs: string[]): string {
  const unique = [...new Set(runs)];
  const candidates = unique.length
    ? `Candidate accessions from the blocked calls: ${JSON.stringify(unique.join(","))}. `
    : "";
  return (
    "Refused: batch SRA imports before submission. No job was submitted by this blocked call. " +
    "Use one fastq_dump/fasterq_dump call for all requested, missing accessions with identical " +
    "settings, not one job per accession or a mapped collection. " +
    candidates +
    "Exclude verified or running imports first. For the remaining accessions, use a " +
    "comma-separated input|accession string with input|input_select=accession_number, or one " +
    "text HDA (one accession per line) with input|input_select=file_list and " +
    'input|file_list={src:"hda",id:<real dataset ID>}. ' +
    "Inspect the installed tool template; retain the extraction settings and use its " +
    "list:paired output for paired reads. Check the history and notebook first so verified or " +
    "running imports are not repeated. Correct the call yourself; do not ask the user to " +
    "authorize batching or retry the same single-accession calls."
  );
}

/** Turn-local import intent: what was fanned out, what was let through, what landed. */
export class SraImportGate {
  private batches = new Map<string, Set<string>>();
  private blocked = new Set<string>();
  private releasedSingleton = new Set<string>();
  private submitted = new Map<string, Set<string>>();

  observe(calls: Array<{ id: string; name: string; arguments: unknown }>): void {
    const groups = new Map<string, Array<[string, string]>>();
    for (const call of calls) {
      const parsed = sraCall(call.name, call.arguments);
      if (!parsed || parsed.mapped || parsed.runs?.length !== 1) {
        continue;
      }
      if (this.submitted.get(parsed.key)?.has(parsed.runs[0])) {
        continue;
      }
      groups.set(parsed.key, [...(groups.get(parsed.key) ?? []), [call.id, parsed.runs[0]]]);
    }
    for (const [key, group] of groups) {
      if (group.length < 2) {
        continue;
      }
      const batch = this.batches.get(key) ?? new Set();
      this.batches.set(key, batch);
      for (const [id, run] of group) {
        batch.add(run);
        this.blocked.add(id);
      }
    }
  }

  check(id: string, name: string, args: unknown): string | undefined {
    const call = sraCall(name, args);
    if (!call) {
      return undefined;
    }
    const batch = this.batches.get(call.key);
    const runs = call.runs ?? [];
    const duplicate = new Set(runs).size < runs.length;
    const single = runs.length === 1 ? runs[0] : undefined;
    let serialized = !!(batch && single && batch.size > 1 && batch.has(single));
    const blocked = this.blocked.has(id) || call.mapped || duplicate;
    if (serialized && !blocked && !this.releasedSingleton.has(call.key)) {
      this.releasedSingleton.add(call.key);
      serialized = false;
    }
    if (!blocked && !serialized) {
      if (batch && single) {
        batch.delete(single);
      }
      if (batch && (call.fileList || runs.length > 1)) {
        this.batches.delete(call.key);
      }
      if (runs.length > 1) {
        const sent = this.submitted.get(call.key) ?? new Set();
        runs.forEach((run) => sent.add(run));
        this.submitted.set(call.key, sent);
      }
      return undefined;
    }
    return remediation([...(batch ?? []), ...runs]);
  }
}
