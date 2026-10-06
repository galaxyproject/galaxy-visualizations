import { quote } from "./quote";
import { segment } from "./galaxy";
import { compile } from "vega-lite";

type Json = Record<string, any>;

/** The vega-lite major Olit renders with. */
export const SCHEMA = "https://vega.github.io/schema/vega-lite/v6.json";
export const SIZE_LIMIT = 25_000_000;

const displayUrl = (datasetId: string, root: string) =>
  `${root}api/datasets/${segment(datasetId)}/display`;

/** Galaxy column types Vega reads as numbers. */
const NUMERIC = ["int", "float"];

/** The one state in which a dataset's content is final. */
const READABLE = "ok";

/** Output names a transform uses when given no explicit `as`. */
const TRANSFORM_DEFAULTS: Record<string, string[]> = {
  density: ["value", "density"],
  quantile: ["prob", "value"],
  fold: ["key", "value"],
};
/** Transforms whose output columns come from the data. */
const OPAQUE_TRANSFORMS = ["pivot", "flatten"];

const DATUM = /datum(?:\.([A-Za-z_]\w*)|\[\s*['"]([^'"]+)['"]\s*\])/g;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const named = (details: Json): string[] =>
  ((details.metadata_column_names as unknown[]) || []).filter(Boolean) as string[];

const isInt = (value: unknown): value is number => Number.isInteger(value);

/** The names a spec may encode: Galaxy's own where it has them, else `col:N` by position. */
export function columnNames(details: Json): string[] {
  const names = named(details);
  if (names.length) {
    return names;
  }
  const count = details.metadata_columns;
  return isInt(count) && count > 0 ? Array.from({ length: count }, (_, i) => `col:${i + 1}`) : [];
}

/** Why Vega cannot read this dataset directly, or null when it can. */
export function unreferenceable(details: Json): string | null {
  const name = details.name || "this dataset";
  if (details.purged) {
    return `${name} is purged, so its content is gone and nothing can read it.`;
  }
  const state = details.state;
  if (state !== READABLE) {
    if (state === "error") {
      return `${name} is in state 'error', so the job producing it failed and it holds nothing to chart.`;
    }
    return (
      `${name} is in state ${quote(state)}, so it holds no readable content yet. A dataset reaches ` +
      "'ok' when the job producing it finishes; wait for it and chart it again rather than " +
      "converting it or changing its datatype."
    );
  }
  const columns = details.metadata_columns;
  if (!isInt(columns) || columns < 1) {
    return "Galaxy reports no column count for this dataset, so Vega cannot be told how to read it.";
  }
  if (!isInt(details.metadata_data_lines)) {
    return "Galaxy has not measured this dataset's lines, so how Vega should read it is unknown.";
  }
  const size = details.file_size;
  if (isInt(size) && size > SIZE_LIMIT) {
    return (
      `this dataset is ${size} bytes and a referenced chart sends the whole file to every ` +
      `reader; ${SIZE_LIMIT} is the most one may carry. Summarise it with a Galaxy tool and ` +
      "chart the result."
    );
  }
  const comments = details.metadata_comment_lines || 0;
  const hasNames = named(details).length > 0;
  if (comments && !hasNames) {
    return (
      `the first ${comments} line(s) are comments, which Vega reads as data rather than ` +
      "skipping. Produce a dataset without them with a Galaxy tool and chart that."
    );
  }
  const delimiter = details.metadata_delimiter;
  if (hasNames && delimiter !== ",") {
    return (
      `Galaxy names this dataset's columns and separates them with ${quote(delimiter)}, a ` +
      "combination Vega's reader has not been verified against here."
    );
  }
  return null;
}

/** The one data source a spec gets: this dataset's bytes, described from its metadata. */
export function dataBlock(datasetId: string, details: Json, root = "/"): Json {
  const format: Json = named(details).length
    ? { type: "csv" }
    : {
        type: "dsv",
        delimiter: details.metadata_delimiter || "\t",
        header: columnNames(details),
      };
  const types: unknown[] = details.metadata_column_types || [];
  const parse: Record<string, string> = {};
  columnNames(details).forEach((name, i) => {
    if (i < types.length && NUMERIC.includes(types[i] as string)) {
      parse[name] = "number";
    }
  });
  if (Object.keys(parse).length) {
    format.parse = parse;
  }
  return { url: displayUrl(datasetId, root), format };
}

/** Every place a spec names data of its own. */
export function dataPaths(node: unknown, path: string[] = []): string[] {
  const found: string[] = [];
  if (isObject(node)) {
    for (const [key, value] of Object.entries(node)) {
      if (key === "data") {
        found.push([...path, key].join("."));
      }
      found.push(...dataPaths(value, [...path, key]));
    }
  } else if (Array.isArray(node)) {
    node.forEach((item, index) => found.push(...dataPaths(item, [...path, String(index)])));
  }
  return found;
}

/** Every transform step anywhere in the spec, layers included. */
function steps(node: unknown): Json[] {
  const out: Json[] = [];
  if (isObject(node)) {
    for (const step of node.transform || []) {
      if (isObject(step)) {
        out.push(step);
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (key !== "transform") {
        out.push(...steps(value));
      }
    }
  } else if (Array.isArray(node)) {
    for (const item of node) {
      out.push(...steps(item));
    }
  }
  return out;
}

/** Names a transform creates, which the file itself does not contain. */
export function producedFields(node: unknown): Set<string> {
  const made = new Set<string>();
  for (const step of steps(node)) {
    const alias = step.as;
    if (typeof alias === "string") {
      made.add(alias);
    } else if (Array.isArray(alias)) {
      alias.filter((a) => typeof a === "string").forEach((a) => made.add(a));
    }
    for (const [kind, defaults] of Object.entries(TRANSFORM_DEFAULTS)) {
      if (kind in step && !("as" in step)) {
        defaults.forEach((d) => made.add(d));
      }
    }
    for (const nested of ["aggregate", "joinaggregate", "window"]) {
      for (const item of step[nested] || []) {
        if (isObject(item) && typeof item.as === "string") {
          made.add(item.as);
        }
      }
    }
    if ("bin" in step && typeof step.field === "string") {
      made.add(`${step.field}_start`);
      made.add(`${step.field}_end`);
    }
  }
  return made;
}

/** Whether a transform makes the readable field names unknowable. */
export function namesAreOpaque(spec: unknown): boolean {
  return steps(spec).some((step) => OPAQUE_TRANSFORMS.some((kind) => kind in step));
}

/** Every field name a spec reads, from `field` entries and from filter expressions. */
export function readFields(node: unknown): Set<string> {
  const found = new Set<string>();
  if (isObject(node)) {
    if (typeof node.field === "string") {
      found.add(node.field);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "filter" && typeof value === "string") {
        for (const match of value.matchAll(DATUM)) {
          found.add(match[1] || match[2]);
        }
      }
      readFields(value).forEach((f) => found.add(f));
    }
  } else if (Array.isArray(node)) {
    node.forEach((item) => readFields(item).forEach((f) => found.add(f)));
  }
  return found;
}

/** Quantitative encodings on columns Galaxy typed as text, which plot nothing. */
export function unsatisfiableTypes(spec: Json, details: Json): string[] {
  const types: unknown[] = details.metadata_column_types || [];
  const typed = new Map<string, unknown>();
  columnNames(details).forEach((name, i) => {
    if (i < types.length) {
      typed.set(name, types[i]);
    }
  });
  const suspect = new Set<string>();
  for (const channel of Object.values(spec.encoding || {})) {
    for (const entry of Array.isArray(channel) ? channel : [channel]) {
      if (!isObject(entry) || entry.type !== "quantitative") {
        continue;
      }
      const field = entry.field;
      if (typed.has(field) && !NUMERIC.includes(typed.get(field) as string)) {
        suspect.add(field);
      }
    }
  }
  return [...suspect].sort();
}

/** The spec Olit will render, or a sentence saying why it will not. */
export function build(
  datasetId: string,
  spec: unknown,
  details: Json,
  root = "/",
): { ready: Json | null; refusal: string | null } {
  if (!isObject(spec) || !Object.keys(spec).length) {
    return { ready: null, refusal: "`spec` has to be a Vega-Lite specification object." };
  }
  const owned = dataPaths(spec);
  if (owned.length) {
    return {
      ready: null,
      refusal:
        `the spec names its own data at ${owned.sort().join(", ")}. Leave \`data\` out ` +
        "entirely: this tool points the spec at the dataset, and a chart of anything else " +
        "has to become a Galaxy dataset first.",
    };
  }
  const refusal = unreferenceable(details);
  if (refusal) {
    return { ready: null, refusal };
  }
  const available = columnNames(details);
  if (!namesAreOpaque(spec)) {
    const produced = producedFields(spec);
    const unknown = [...readFields(spec)]
      .filter((f) => !available.includes(f) && !produced.has(f))
      .sort();
    if (unknown.length) {
      return {
        ready: null,
        refusal:
          `the spec reads ${unknown.map(quote).join(", ")}, which this dataset does ` +
          `not hold. Its columns are ${available.map(quote).join(", ")}.`,
      };
    }
  }
  const { $schema: _, ...rest } = spec;
  return {
    ready: { $schema: SCHEMA, ...rest, data: dataBlock(datasetId, details, root) },
    refusal: null,
  };
}

/** vega-lite's verdict on a spec, with every error it logs. */
export function compiled(spec: Json): { compiles: boolean; problems: string[] } {
  const problems: string[] = [];
  const logger: any = {
    level: () => logger,
    error: (...parts: unknown[]) => problems.push(parts.join(" ")),
    warn: () => logger,
    info: () => logger,
    debug: () => logger,
  };
  try {
    compile(spec as any, { logger });
  } catch (err) {
    problems.push(String((err as Error)?.message ?? err));
  }
  return { compiles: problems.length === 0, problems };
}

/** The spec as the markdown a Galaxy page holds. */
