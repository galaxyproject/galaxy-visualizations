import { parseValues, selectCase, type InputElementType } from "galaxy-charts/runtime";
import { quote } from "./quote";
type Json = Record<string, any>;

export type Types = Record<string, Json>;

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** What a value looks like before the model replaces it, by what the type stores. */
const SCALAR_PLACEHOLDER: Record<string, unknown> = {
  boolean: false,
  integer: 0,
  number: 0.0,
  string: "<value>",
};

/** The choices a `declared` options source lists, if this input has any. */
function declaredValues(param: Json, spec: Json | undefined): unknown[] {
  const source = spec?.options || {};
  if (source.kind !== "declared") {
    return [];
  }
  const values: unknown[] = param[source.from || ""] || [];
  return values
    .filter((v): v is Json => isObject(v) && v.value !== undefined && v.value !== null)
    .map((v) => v.value);
}

/** What an input holds when no config sets it, as galaxy-charts resolves it; null for nothing. */
export const resolvedDefault = (param: Json): unknown =>
  parseValues([param as InputElementType], {})[param.name] ?? null;

/** The case a conditional's stored values select, as galaxy-charts selects it. */
const caseFor = (param: Json, values: unknown) =>
  selectCase(param as InputElementType, isObject(values) ? values : {});

function placeholder(param: Json, types: Types): unknown {
  const spec = types[param.type] || {};
  const stores = spec.stores || {};
  if (stores.type === "object") {
    return { "<from get_visualization_options>": true };
  }
  const fallback = resolvedDefault(param);
  if (fallback !== null) {
    return fallback;
  }
  const choices = declaredValues(param, spec);
  if (choices.length) {
    return choices[0];
  }
  return SCALAR_PLACEHOLDER[stores.type] ?? "<value>";
}

function fill(param: Json, types: Types, out: Json) {
  const name = param.name;
  if (!name) {
    return;
  }
  if (param.type !== "conditional") {
    out[name] = placeholder(param, types);
    return;
  }
  const test = param.test_param || {};
  const cases: Json[] = param.cases || [];
  // The case the test parameter's default selects. When it selects none, galaxy-charts expands
  // none, so the template leaves the choice open instead of inventing one.
  const chosen = caseFor(param, {});
  const nested: Json = {};
  if (test.name) {
    nested[test.name] = chosen ? chosen.value : `<one of: ${cases.map((c) => c.value).join(", ")}>`;
  }
  for (const child of chosen?.inputs || []) {
    fill(child, types, nested);
  }
  out[name] = nested;
}

/** A ready-to-fill `settings` object and `tracks` entry for one plugin. */
export function buildVisualizationTemplate(plugin: Json | undefined, types: Types): Json {
  const settings: Json = {};
  const track: Json = {};
  for (const param of plugin?.settings || []) {
    fill(param, types, settings);
  }
  for (const param of plugin?.tracks || []) {
    fill(param, types, track);
  }
  const out: Json = { settings };
  if (Object.keys(track).length) {
    out.tracks = [track];
  }
  return out;
}

const GROUPS = ["settings", "tracks"];

function pathsDeclaring(params: unknown, name: string, path: string[]): string[] {
  const out: string[] = [];
  for (const param of (params as unknown[]) || []) {
    if (!isObject(param)) {
      continue;
    }
    const own = param.name || "?";
    if (param.type === "conditional") {
      if (param.test_param?.name === name) {
        out.push([...path, own, name].join("."));
      }
      for (const c of param.cases || []) {
        out.push(...pathsDeclaring(c.inputs, name, [...path, own]));
      }
    } else if (own === name) {
      out.push([...path, own].join("."));
    }
  }
  return out;
}

/** Every canonical path under which `plugin` declares `name`, each named once. */
export function declaredPaths(plugin: Json | undefined, name: string): string[] {
  const found = GROUPS.flatMap((group) => pathsDeclaring(plugin?.[group], name, [group]));
  return [...new Set(found)];
}

/** The stored state a group's walk reads its cases from. */
function state(config: Json | undefined, group: string): Json {
  let held = config?.[group];
  if (group === "tracks" && Array.isArray(held)) {
    held = held.length ? held[0] : null;
  }
  return isObject(held) ? held : {};
}

/** A case value with the label the form shows for it, where the test parameter declares one. */
export function namedCase(test: Json | undefined, value: unknown): string {
  const labels = new Map<unknown, unknown>();
  for (const d of test?.data || []) {
    if (isObject(d)) {
      labels.set(d.value, d.label);
    }
  }
  const label = labels.get(value);
  return label ? `${quote(value)} (${label})` : quote(value);
}

/** The config a caller has to send, written the way the template writes an unfilled value. */
function shape(trail: string[], testName: string): string {
  let nested: Json = { [testName]: "<value>" };
  for (const step of [...trail].reverse()) {
    nested = { [step]: nested };
  }
  return JSON.stringify(nested ?? null);
}

export interface Hit {
  declared: Json;
  path: string;
  case: unknown;
  otherCases: unknown[];
}

type Resolution = { hit: Hit | null; problem: string | null };

const hit = (declared: Json, path: string): Resolution => ({
  hit: { declared, path, case: undefined, otherCases: [] },
  problem: null,
});

const problem = (text: string): Resolution => ({ hit: null, problem: text });

function resolve(params: unknown, segments: string[], held: unknown, trail: string[]): Resolution {
  const [name, ...rest] = segments;
  const here = [...trail, name].join(".");
  const param = ((params as unknown[]) || []).find(
    (p): p is Json => isObject(p) && p.name === name,
  );
  if (!param) {
    return problem(`${quote(trail.join("."))} declares nothing named ${quote(name)}.`);
  }
  if (param.type !== "conditional") {
    if (rest.length) {
      return problem(
        `${quote(here)} is a ${quote(param.type)} input and holds nothing named ${quote(rest[0])}.`,
      );
    }
    return hit(param, here);
  }

  const test = param.test_param || {};
  const cases: Json[] = param.cases || [];
  if (!rest.length) {
    return problem(
      `${quote(here)} is a conditional. Name an input inside it, or its test parameter ${quote(test.name)}.`,
    );
  }
  if (rest[0] === test.name) {
    if (rest.length > 1) {
      return problem(
        `${here}.${quote(rest[0])} is a test parameter and holds nothing named ${quote(rest[1])}.`,
      );
    }
    return hit(test, `${here}.${rest[0]}`);
  }

  const nested = isObject(held) ? held[name] : undefined;
  const active = caseFor(param, nested);
  if (!active) {
    const offered = cases.map((c) => namedCase(test, c.value)).join(", ");
    return problem(
      `${quote(here)} selects its inputs by ${quote(test.name)}. Pass ` +
        `config=${shape([...trail, name], test.name)} with ${quote(test.name)} as one of ${offered}.`,
    );
  }
  const found = resolve(active.inputs, rest, nested, [...trail, name]);
  if (found.hit && found.hit.case === undefined) {
    found.hit.case = active.value;
    found.hit.otherCases = cases
      .filter((c) => c !== active && ((c.inputs as Json[]) || []).some((i) => i.name === rest[0]))
      .map((c) => c.value);
  }
  return found;
}

/** The input a published path names, with `config` selecting each conditional's case. */
export function resolveParameter(
  plugin: Json | undefined,
  parameter: unknown,
  config?: Json,
): Resolution {
  const segments = String(parameter ?? "")
    .split(".")
    .filter(Boolean);
  if (segments.length < 2 || !GROUPS.includes(segments[0])) {
    return problem(
      `${quote(parameter)} is not a parameter path. Name one as get_visualization_details ` +
        `publishes it, rooted at ${GROUPS.join(" or ")}.`,
    );
  }
  const group = segments[0];
  return resolve(plugin?.[group], segments.slice(1), state(config, group), [group]);
}

export interface Branch {
  test: string;
  value: unknown;
  siblings: unknown[];
}

export interface Bearing {
  path: string;
  param: Json;
  spec: Json;
  value: unknown;
  branch?: Branch;
}

/** Every value in a config whose input draws its options from a server-resolved set. */
export function* optionBearing(
  entry: unknown,
  declared: unknown,
  types: Types,
  path: string[] = [],
  branch?: Branch,
): Generator<Bearing> {
  if (!isObject(entry)) {
    return;
  }
  for (const param of (declared as unknown[]) || []) {
    const name = isObject(param) ? param.name : undefined;
    if (!isObject(param) || !name || !Object.hasOwn(entry, name)) {
      continue;
    }
    const value = entry[name];
    if (param.type === "conditional") {
      const active = caseFor(param, value);
      if (active) {
        const under: Branch = {
          test: param.test_param?.name,
          value: active.value,
          siblings: ((param.cases as Json[]) || []).filter((c) => c !== active).map((c) => c.value),
        };
        yield* optionBearing(value, active.inputs, types, [...path, name], under);
      }
      continue;
    }
    const spec = types[param.type] || {};
    const kind = spec.options?.kind;
    if (kind && kind !== "declared" && value !== null && value !== undefined) {
      yield { path: [...path, name].join("."), param, spec, value, branch };
    }
  }
}

/** Deep equality over JSON values. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => same(item, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((k) => k in b && same(a[k], b[k]));
  }
  return false;
}

/** What names an option: an object's id, or the value itself when it is a scalar. */
export const identity = (value: unknown) => (isObject(value) ? value.id : value);

/**
 * The value stored for `value`: the offered entry it names, as galaxy-charts' select picks an
 * entry by id and writes the whole of it, or the input's default. Undefined when neither.
 */
export function offeredValue(value: unknown, options: Json[] | undefined, param: Json): unknown {
  const id = identity(value);
  const named = id == null ? undefined : (options || []).find((o) => same(identity(o.value), id));
  if (named) {
    return named.value;
  }
  const fallback = resolvedDefault(param);
  return fallback !== null && same(value, fallback) ? fallback : undefined;
}

/**
 * The settings and tracks as galaxy-charts' loader resolves a config: each declared input takes
 * its value, else its default, and anything the plugin does not declare is kept. A plugin with
 * tracks gets one empty track when the config holds none. Stored resolved, a config renders the
 * same in a viewer built with a galaxy-charts that fills no defaults.
 */
export function resolveConfig(plugin: Json, config: Json): { settings?: Json; tracks?: Json[] } {
  const declares = (level: unknown) => Array.isArray(level) && level.length > 0;
  const settings = declares(plugin.settings)
    ? parseValues(plugin.settings, isObject(config.settings) ? config.settings : {})
    : config.settings;
  const tracks = declares(plugin.tracks)
    ? (Array.isArray(config.tracks) && config.tracks.length ? config.tracks : [{}]).map(
        (track: unknown) => parseValues(plugin.tracks, isObject(track) ? track : {}),
      )
    : config.tracks;
  return { settings, tracks };
}

/**
 * What a config leaves the viewer to choose: inputs still unset once galaxy-charts' defaults
 * apply, whose options only the server can offer, such as a dataset's columns. An input the
 * plugin declares optional may stay unset, as galaxy-charts' form lets it.
 */
export function unresolved(plugin: Json, config: Json, types: Types): string[] {
  const missing: string[] = [];
  const walk = (declared: unknown, values: Json, path: string) => {
    for (const param of (declared as unknown[]) || []) {
      if (!isObject(param) || !param.name || String(param.optional).toLowerCase() === "true") {
        continue;
      }
      const value = values[param.name];
      if (param.type === "conditional") {
        const inner = isObject(value) ? value : {};
        walk(caseFor(param, inner)?.inputs, inner, `${path}${param.name}.`);
      } else if (value == null && (types[param.type]?.options?.kind ?? "declared") !== "declared") {
        missing.push(path + param.name);
      }
    }
  };
  const { settings, tracks } = resolveConfig(plugin, config);
  walk(plugin.settings, isObject(settings) ? settings : {}, "settings.");
  if (Array.isArray(plugin.tracks) && plugin.tracks.length) {
    (tracks || []).forEach((track, i) => walk(plugin.tracks, track, `tracks[${i}].`));
  }
  return missing;
}
