import { quote } from "../quote";

type Dataset = Record<string, any>;
type Mate = "forward" | "reverse";
type Entry = [string, Dataset];

interface Row {
  sample: string;
  file: string;
  mate?: Mate;
  explicit: boolean;
  dataset: Dataset;
}

interface Element {
  name: string;
  src: string;
  id?: string;
  collection_type?: string;
  element_identifiers?: Element[];
}

export interface Grouping {
  structure: "list" | "list:paired";
  elements: Element[];
  items: { id?: string; history_content_type: string }[];
  leftovers: Element[];
  unmatched: string[];
  out_of_scope: string[];
  has_leftovers: boolean;
  empty: boolean;
}

/** A mate marker is its own segment. */
const EXPLICIT_MATE = /^(?:R|read)([12])$/i;
const WORD_MATE = /^(?:(forward|fwd)|(reverse|rev))$/i;
const WEAK_MATE = /^([12])$/;
const SEP = /[._\-\s]+/;
/** Extensions stripped before pairing, so sample_1.fastq.gz pairs on "sample". */
const STRIP = [".gz", ".bz2", ".zip", ".fastq", ".fq", ".fasta", ".fa", ".txt", ".tabular"];

const byCodePoint = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const contentType = (d: Dataset) =>
  "history_content_type" in d ? d.history_content_type : "dataset";

/** (directories, filename) for an archive member. */
function parts(name: unknown): [string[], string] {
  const segments = String(name)
    .replaceAll("\\", "/")
    .replace(/^\/+|\/+$/g, "")
    .split("/");
  const base = segments.pop() as string;
  return [segments, base];
}

function stem(name: string): string {
  let out = name;
  let changed = true;
  while (changed) {
    changed = false;
    for (const ext of STRIP) {
      if (out.toLowerCase().endsWith(ext)) {
        out = out.slice(0, -ext.length);
        changed = true;
      }
    }
  }
  return out;
}

/** [mate, explicit] for one path segment. */
function mateOf(segment: string): [Mate | undefined, boolean] {
  let m = EXPLICIT_MATE.exec(segment);
  if (m) {
    return [m[1] === "1" ? "forward" : "reverse", true];
  }
  m = WORD_MATE.exec(segment);
  if (m) {
    return [m[1] ? "forward" : "reverse", true];
  }
  m = WEAK_MATE.exec(segment);
  if (m) {
    return [m[1] === "1" ? "forward" : "reverse", false];
  }
  return [undefined, false];
}

/** [sample, mate, explicit] for a read name; a caller's pattern counts as explicit evidence. */
function splitMate(
  name: string,
  pattern?: RegExp,
  path?: string,
): [string, Mate | undefined, boolean] {
  const base = stem(name);
  if (pattern) {
    const found = pattern.exec(path ?? name);
    if (!found) {
      return [base, undefined, false];
    }
    const groups = found.groups ?? {};
    return [groups.sample || base, mateOf(groups.mate || "")[0], true];
  }
  const segments = base.split(SEP);
  // Never the first segment for a bare 1/2: a leading digit is a sample number.
  for (let i = segments.length - 1; i >= 0; i--) {
    const [mate, explicit] = mateOf(segments[i]);
    if (mate && (explicit || i > 0)) {
      return [[...segments.slice(0, i), ...segments.slice(i + 1)].join("_"), mate, explicit];
    }
  }
  return [base, undefined, false];
}

/** The caller's Python-style pattern as a RegExp. */
function compile(sampleRegex?: string): RegExp | undefined {
  if (!sampleRegex) {
    return undefined;
  }
  try {
    return new RegExp(sampleRegex.replaceAll("(?P<", "(?<").replace(/\(\?P=(\w+)\)/g, "\\k<$1>"));
  } catch (exc) {
    throw new Error(`sample_regex is not a valid regular expression: ${(exc as Error).message}`);
  }
}

/** Elements are named by sample or file, qualified by directory only where names collide. */
function identify(datasets: Dataset[], nameField: string, pattern?: RegExp): Row[] {
  const rows = datasets.map((d) => {
    const raw = String(d[nameField] || d.id);
    const [dirs, base] = parts(raw);
    const [sample, mate, explicit] = splitMate(base, pattern, raw.replaceAll("\\", "/"));
    return { dirs, base, sample, mate, explicit, d };
  });
  const qualify = (values: string[], keys: string[]) => {
    const unique = new Set(keys).size === keys.length;
    return values.map((v, i) => (unique ? v : [...rows[i].dirs, v].join("_")));
  };
  const samples = qualify(
    rows.map((r) => r.sample),
    rows.map((r) => JSON.stringify([r.sample, r.mate ?? null])),
  );
  const files = qualify(
    rows.map((r) => r.base),
    rows.map((r) => r.base),
  );
  return rows.map((r, i) => ({
    sample: samples[i],
    file: files[i],
    mate: r.mate,
    explicit: r.explicit,
    dataset: r.d,
  }));
}

/** Python's fnmatch: a shell glob over the whole name. */
function fnmatch(name: string, glob: string): boolean {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      out += ".*";
    } else if (c === "?") {
      out += ".";
    } else if (c === "[") {
      let start = i + 1;
      start += glob[start] === "!" ? 1 : 0;
      start += glob[start] === "]" ? 1 : 0;
      const close = glob.indexOf("]", start);
      if (close === -1) {
        out += "\\[";
        continue;
      }
      let body = glob.slice(i + 1, close).replaceAll("\\", "\\\\");
      body = body.startsWith("!") ? `^${body.slice(1)}` : body.startsWith("^") ? `\\${body}` : body;
      out += `[${body}]`;
      i = close;
    } else {
      out += c.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
    }
  }
  return new RegExp(`^${out}$`, "s").test(name);
}

const matches = (name: string, include?: string) =>
  !include || include === "*" || fnmatch(name, include);

export interface GroupOptions {
  datasets?: Dataset[];
  structure?: string | null;
  nameField?: string;
  include?: string | null;
  sampleRegex?: string | null;
}

/**
 * Partition datasets into collection elements plus whatever did not fit.
 *
 * `auto` pairs only on evidence: an explicit marker (R1/read2/forward) on its own, a bare
 * 1/2 only once a second sample shows the same convention.
 */
export function groupDatasets({
  datasets = [],
  structure,
  nameField = "name",
  include,
  sampleRegex,
}: GroupOptions = {}): Grouping {
  const shape = structure === "list:paired" ? "paired" : structure || "auto";
  if (!["auto", "paired", "list"].includes(shape)) {
    throw new Error(`structure must be "auto", "paired" or "list", not ${quote(structure)}`);
  }
  const rows = identify(datasets || [], nameField, compile(sampleRegex ?? undefined));

  // A history holding a collection lists the collection too.
  const inScope: Row[] = [];
  const outOfScope: Row[] = [];
  for (const row of rows) {
    const isDataset = contentType(row.dataset) === "dataset";
    const name = parts(row.dataset[nameField] || "")[1];
    (isDataset && matches(name, include ?? undefined) ? inScope : outOfScope).push(row);
  }

  const pairs = new Map<string, Map<Mate, [string, Dataset, boolean][]>>();
  const unpaired: Entry[] = [];
  for (const { sample, file, mate, explicit, dataset } of inScope) {
    if (!mate) {
      unpaired.push([file, dataset]);
      continue;
    }
    const mates = pairs.get(sample) ?? new Map();
    pairs.set(sample, mates);
    mates.set(mate, [...(mates.get(mate) ?? []), [file, dataset, explicit]]);
  }

  // Exactly one dataset per mate, or the marker was a run number rather than a mate.
  const complete = new Map<string, Map<Mate, [string, Dataset, boolean]>>();
  for (const [sample, mates] of pairs) {
    if (mates.size === 2 && [...mates.values()].every((r) => r.length === 1)) {
      complete.set(sample, new Map([...mates].map(([mate, r]) => [mate, r[0]])));
    }
  }
  const half: Entry[] = [];
  for (const [sample, mates] of pairs) {
    if (!complete.has(sample)) {
      for (const r of mates.values()) {
        half.push(...r.map(([file, d]): Entry => [file, d]));
      }
    }
  }
  const explicitSeen = [...complete.values()].some((m) => [...m.values()].some(([, , e]) => e));
  // Two independent guards: more than half the files sit in complete pairs, and the marker means
  // what we think.
  const majority = complete.size * 2 > inScope.length / 2;
  const evidenced = explicitSeen || complete.size >= 2;

  if (shape === "paired" || (shape === "auto" && complete.size && majority && evidenced)) {
    const elements = [...complete.keys()].sort(byCodePoint).map((sample) => ({
      name: sample,
      src: "new_collection",
      collection_type: "paired",
      element_identifiers: (["forward", "reverse"] as const).map((mate) => ({
        name: mate,
        src: "hda",
        id: complete.get(sample)!.get(mate)![1].id,
      })),
    }));
    const leftovers = [...unpaired, ...half].sort((a, b) => byCodePoint(a[0], b[0]));
    return result("list:paired", elements, leftovers, outOfScope);
  }

  const flat = inScope
    .map((r): Entry => [r.file, r.dataset])
    .sort((a, b) => byCodePoint(a[0], b[0]));
  return result("list", flatElements(flat), [], outOfScope, flat);
}

function flatElements(entries: Entry[]): Element[] {
  return entries.map(([name, d]) => ({ name: String(name), src: "hda", id: d.id }));
}

/** Dataset references the bulk history-contents operations accept. */
function items(entries: Entry[]) {
  return entries.map(([, d]) => ({ id: d.id, history_content_type: contentType(d) }));
}

/** [name, dataset-ref] for each dataset an element points at, pairs included. */
function placed(elements: Element[]): Entry[] {
  return elements.flatMap((element) =>
    (element.element_identifiers || [element]).map((inner): Entry => [
      inner.name,
      { id: inner.id },
    ]),
  );
}

function result(
  structure: Grouping["structure"],
  elements: Element[],
  leftovers: Entry[],
  outOfScope: Row[],
  inScope?: Entry[],
): Grouping {
  // `items` is everything in scope, so a datatype write reaches the leftovers too.
  const scoped = inScope ?? [...placed(elements), ...leftovers];
  return {
    structure,
    elements,
    items: items(scoped),
    leftovers: flatElements(leftovers),
    unmatched: leftovers.map(([name]) => name),
    out_of_scope: outOfScope.map((r) => r.file),
    has_leftovers: leftovers.length > 0,
    empty: elements.length === 0,
  };
}

/** Split a list into batches a single request can carry. */
export function chunkItems<T>(items: T[] = [], size = 1000): T[][] {
  const step = Math.max(1, Math.trunc(size || 1000));
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += step) {
    batches.push(items.slice(i, i + step));
  }
  return batches;
}
