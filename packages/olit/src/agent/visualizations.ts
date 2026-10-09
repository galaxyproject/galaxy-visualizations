import { quote } from "./quote";
import inputs from "galaxy-charts/galaxy-charts.inputs.json";
import {
  getOptions,
  validateValues,
  type InputElementType,
  type ValueIssueType,
} from "galaxy-charts/runtime";

import { query, segment, type Galaxy, type Web } from "./galaxy";
import type { ArtifactOf } from "../artifacts/kinds";
import { fail, type Artifact, type Context, type OlitTool } from "./tool";
import * as vega from "./vega";
import * as tables from "./tables";
import {
  buildVisualizationTemplate,
  declaredPaths,
  identity,
  offeredValue,
  optionBearing,
  resolvedDefault,
  resolveConfig,
  resolveParameter,
  unresolved,
  type Types,
} from "./visualization-inputs";

type Json = Record<string, any>;

export type Envelope = { success: true; data: any } | { success: false; message: string };

/** galaxy-charts' option resolution for one tool call: built once per call, then asked per input. */
export type ResolveOptions = (
  galaxy: Galaxy,
  web: Web,
) => (input: Json, context: { datasetId?: string }) => Promise<Envelope>;

/** `ResolveOptions` with one call's `web` already given. */
type Resolve = (galaxy: Galaxy) => ReturnType<ResolveOptions>;

/** What each galaxy-charts input type stores, and where its options come from. */
const TYPES: Types = (inputs as { types: Types }).types;

const rootPath = (galaxy: Galaxy) => new URL(galaxy.root || "/", "http://localhost").pathname;

/** This agent, and a standalone plugin that defers its chart to its own LLM at view time. */
export const NOT_OFFERED = new Set(["olit", "vintent"]);

const MATCH_CAP = 5;
const ROW_CAP = 100;
const STR = { type: "string" };

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Python truthiness for a JSON value. */
function present(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.length > 0;
  }
  return isObject(value) ? Object.keys(value).length > 0 : Boolean(value);
}

/** A JSON value's type as Python names it. */
function pyType(value: unknown): string {
  if (value === null || value === undefined) {
    return "NoneType";
  }
  if (Array.isArray(value)) {
    return "list";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "int" : "float";
  }
  return { string: "str", boolean: "bool" }[typeof value as string] ?? "dict";
}

/**
 * galaxy-charts `getOptions`, reaching Galaxy through the session's client. galaxy-charts caches
 * what a client fetched for as long as that client lives, so one client per tool call shares a
 * dataset between the inputs of one save and never carries it into the next call.
 */
export const chartOptions: ResolveOptions = (galaxy, web) => {
  const client = {
    api: (path: string) => galaxy.get(path),
    url: async (target: string) => {
      const response = await web.fetch(target);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    },
  };
  return async (input, context) => {
    try {
      return {
        success: true,
        data: await getOptions((input || {}) as InputElementType, { ...context, client }),
      };
    } catch (err) {
      return { success: false, message: String((err as Error)?.message ?? err) };
    }
  };
};

function columnParameters(plugin: Json): string[] {
  return [...(plugin.tracks || []), ...(plugin.settings || [])]
    .filter((parameter: Json) => parameter.type === "data_column")
    .map((parameter: Json) => parameter.name);
}

function describePlugin(plugin: Json, preferred: Set<string>): Json {
  const columns = columnParameters(plugin);
  const described: Json = {
    name: plugin.name,
    description: plugin.description,
    tags: plugin.tags || [],
    parameters: (plugin.settings || []).length + (plugin.tracks || []).length,
  };
  if (preferred.has(plugin.name)) {
    described.preferred_for_datatype = true;
  }
  if (columns.length) {
    described.column_parameters = columns;
  }
  return described;
}

async function preferredVisualizations(galaxy: Galaxy, extension: unknown): Promise<Set<string>> {
  if (!extension) {
    return new Set();
  }
  const mappings: unknown[] =
    (await galaxy.get(`api/datatypes/${segment(extension)}/visualizations`)) || [];
  return new Set(mappings.filter(isObject).map((m) => m.visualization));
}

async function listVisualizations(galaxy: Galaxy, a: Json): Promise<Json> {
  const dataset: Json = (await galaxy.get(`api/datasets/${segment(a.dataset_id)}`)) || {};
  const extension = dataset.extension;
  const numeric = tables.numericColumns(dataset);

  let matching: Json[] =
    (await galaxy.get(`api/plugins${query({ dataset_id: a.dataset_id })}`)) || [];
  matching = matching.filter((p) => !NOT_OFFERED.has(p.name));
  const preferred = await preferredVisualizations(galaxy, extension);
  matching.sort((p, q) => Number(!preferred.has(p.name)) - Number(!preferred.has(q.name)));

  const result: Json = {
    dataset_id: a.dataset_id,
    extension,
    visualizations: matching.map((p) => describePlugin(p, preferred)),
  };
  if (!matching.length) {
    result.hint =
      `No installed visualization accepts the datatype ${quote(extension)}. ` +
      "Converting the dataset to a supported datatype is the usual route.";
  } else if (matching.some((p) => columnParameters(p).length) && !numeric.length) {
    result.hint =
      "Galaxy detected no numeric columns in this dataset, so visualizations that bind a " +
      "column cannot be filled. Either re-detect the dataset's metadata so the columns are " +
      "recognised, or use vega_dataset, which reads the columns by position.";
  }
  return result;
}

/** The plugin and dataset, or a refusal naming what the server will actually render. */
async function resolveVisualization(
  galaxy: Galaxy,
  a: Json,
): Promise<{ dataset?: Json; refusal?: Json }> {
  const name = a.visualization;
  const datasetId = a.dataset_id;
  const installed: Json[] = (await galaxy.get("api/plugins")) || [];
  if (NOT_OFFERED.has(name) || !installed.some((p) => p.name === name)) {
    return {
      refusal: {
        error: `Refused: ${quote(name)} is not an installed visualization.`,
        hint: "Call list_visualizations for the dataset to see what this server offers.",
      },
    };
  }
  const dataset: Json = (await galaxy.get(`api/datasets/${segment(datasetId)}`)) || {};
  const compatible: Json[] =
    (await galaxy.get(`api/plugins${query({ dataset_id: datasetId })}`)) || [];
  if (!compatible.some((p) => p.name === name)) {
    return {
      refusal: {
        error: `Refused: ${quote(name)} cannot render the datatype ${quote(dataset.extension)}.`,
        can_render_it: compatible.map((p) => p.name).sort(),
        hint: "Call list_visualizations for this dataset for the full picture.",
      },
    };
  }
  return { dataset };
}

function visualizationConfig(a: Json): Json {
  const config: Json = { dataset_id: a.dataset_id };
  if (present(a.settings)) {
    config.settings = a.settings;
  }
  if (present(a.tracks)) {
    config.tracks = a.tracks;
  }
  return config;
}

/** One declared input, joined with what galaxy-charts stores for its type. */
function describeParameter(param: Json, types: Types, path: string[] = []): Json {
  const kind = param.type;
  const spec = types[kind] || {};
  const described: Json = { name: param.name, type: kind };
  if (path.length) {
    described.path = [...path, param.name || "?"].join(".");
  }
  for (const key of ["label", "help"]) {
    if (param[key]) {
      described[key] = param[key];
    }
  }
  const fallback = resolvedDefault(param);
  if (fallback !== null) {
    described.default = fallback;
  }
  if (present(spec.stores)) {
    described.stores = spec.stores;
  }
  for (const bound of spec.bounds || []) {
    if (param[bound] !== null && param[bound] !== undefined) {
      described[bound] = param[bound];
    }
  }

  const source = spec.options;
  if (present(source)) {
    const options: Json = { kind: source.kind };
    const declared = param[source.from || ""];
    if (present(declared)) {
      options[source.kind === "declared" ? "values" : source.from] = declared;
    }
    for (const f of source.filters || []) {
      if (param[f] !== null && param[f] !== undefined) {
        options[f] = param[f];
      }
    }
    if (source.kind !== "declared") {
      options.resolve = "get_visualization_options";
      options.chosen_by = "an option's id, as get_visualization_options lists it";
    }
    described.options = options;
  }

  const test = param.test_param;
  if (present(test)) {
    const inside = path.length ? [...path, param.name || "?"] : [];
    described.chosen_by = describeParameter(test, types, inside);
    described.cases = ((param.cases as Json[]) || []).map((c) => ({
      when: c.value,
      inputs: ((c.inputs as Json[]) || []).map((i) => describeParameter(i, types, inside)),
    }));
  }
  return described;
}

async function getVisualizationDetails(galaxy: Galaxy, a: Json): Promise<unknown> {
  const name = a.visualization;
  const plugin: Json = (await galaxy.get(`api/plugins/${segment(name)}`)) || {};
  if (!plugin.name) {
    return fail(
      `Refused: ${quote(name)} is not an installed visualization. Call list_visualizations ` +
        "for a dataset to see what this server offers.",
    );
  }
  return {
    name: plugin.name,
    description: plugin.description,
    config_template: buildVisualizationTemplate(plugin, TYPES),
    settings: ((plugin.settings as Json[]) || []).map((p) =>
      describeParameter(p, TYPES, ["settings"]),
    ),
    tracks: ((plugin.tracks as Json[]) || []).map((p) => describeParameter(p, TYPES, ["tracks"])),
    hint:
      "`stores` is the schema a value is validated against. For an input naming `chosen_by`, " +
      'resolve its options and pass the chosen id, as {"id": ...} where it stores an object; ' +
      "the server stores the whole entry. Build `settings` and `tracks` and pass them to " +
      "show_visualization or save_visualization; both take the same config.",
  };
}

function matches(entry: Json, search: string | undefined): boolean {
  if (!search) {
    return false;
  }
  const hay = `${entry.id ?? ""} ${entry.name ?? ""}`.toLowerCase();
  return hay.includes(search.toLowerCase());
}

async function getVisualizationOptions(
  galaxy: Galaxy,
  resolveOptions: Resolve,
  a: Json,
): Promise<unknown> {
  const name = a.visualization;
  const asked = a.parameter;
  const plugin = (await galaxy.get(`api/plugins/${segment(name)}`)) || {};
  if (!isObject(plugin) || !plugin.name) {
    return fail(`Refused: ${quote(name)} is not an installed visualization.`);
  }

  const { hit, problem } = resolveParameter(plugin, asked, a.config);
  if (problem || !hit) {
    const leaf = String(asked).split(".").pop()!;
    const elsewhere = declaredPaths(plugin, leaf).filter((path) => path !== asked);
    const where = elsewhere.length ? ` ${quote(leaf)} is declared at ${elsewhere.join(", ")}.` : "";
    return fail(`Refused: ${problem}${where}`);
  }
  const { declared, path: wanted, otherCases: siblings, case: when } = hit;
  const kind = TYPES[declared.type]?.options?.kind;
  const search = a.search;

  const envelope = await resolveOptions(galaxy)(declared, { datasetId: a.dataset_id });
  if (!envelope.success) {
    return fail(`Could not resolve ${quote(wanted)}: ${envelope.message || "the lookup failed"}.`);
  }
  const offered: Json[] = envelope.data || [];
  if (!kind) {
    return {
      parameter: wanted,
      source: declared.type,
      hint:
        "This parameter's options are not a list to browse; " +
        "get_visualization_details says what it accepts.",
    };
  }
  const entries = offered.map((o) => ({ id: identity(o.value), name: o.label }));

  const result: Json = { parameter: wanted, source: kind, total: entries.length };
  if (!entries.length && siblings.length) {
    result.other_cases = siblings;
    result.hint =
      `This server lists no ${quote(wanted)} for ${quote(when)}. The same parameter is ` +
      `declared for ${siblings.map(quote).join(", ")}; try one of those.`;
    return result;
  }
  if (search) {
    result.matches = entries.filter((e) => matches(e, search)).slice(0, MATCH_CAP);
  } else {
    result.options = entries.slice(0, ROW_CAP);
  }
  result.hint =
    'An option is chosen by its id: pass {"id": ...} for an input that stores an object, ' +
    "the id itself otherwise, and the server stores the entry it names." +
    (search ? "" : " `search` narrows a long list.");
  return result;
}

async function getVisualization(galaxy: Galaxy, a: Json): Promise<unknown> {
  const saved: Json = (await galaxy.get(`api/visualizations/${segment(a.visualization_id)}`)) || {};
  if (!saved.id) {
    return fail(
      `No saved visualization ${quote(a.visualization_id)}. Pass the visualization_id ` +
        "that save_visualization returned.",
    );
  }
  const config: Json = saved.latest_revision?.config || {};
  return {
    visualization_id: saved.id,
    visualization: saved.type,
    title: saved.title,
    dataset_id: config.dataset_id,
    settings: config.settings || {},
    tracks: config.tracks || [],
    hint:
      "Change what needs changing and pass it all back to save_visualization with this " +
      "visualization_id. Anything left out is dropped, so send the settings and tracks " +
      "you want to keep, not only the new ones.",
  };
}

/**
 * The visualization both tools accept, as its artifact: a plugin that renders the dataset, with
 * settings and tracks that leave nothing for the viewer to choose. Saving only adds where it is kept.
 */
async function checked(
  galaxy: Galaxy,
  resolveOptions: Resolve,
  a: Json,
): Promise<{ artifact?: ArtifactOf<"visualization">; refusal?: Json; rejected?: Json }> {
  const { dataset, refusal } = await resolveVisualization(galaxy, a);
  if (refusal) {
    return { refusal };
  }
  const plugin: Json = (await galaxy.get(`api/plugins/${segment(a.visualization)}`)) || {};
  const chosen = { ...a, settings: structuredClone(a.settings), tracks: structuredClone(a.tracks) };
  // The values as sent are checked before galaxy-charts' coercion could hide a wrong one; from
  // then on, checks and the stored config are the one resolved config.
  let rejected = rejectUndeclared(plugin, chosen);
  if (!rejected) {
    Object.assign(chosen, resolveConfig(plugin, chosen));
    rejected =
      (await selectOffered(resolveOptions(galaxy), plugin, chosen)) ??
      rejectIncomplete(plugin, chosen);
  }
  if (rejected) {
    return { rejected };
  }
  return {
    artifact: {
      kind: "visualization",
      title: a.title || `${a.visualization} of ${dataset!.name || a.dataset_id}`,
      visualization: a.visualization,
      dataset_id: a.dataset_id,
      ...(present(chosen.settings) ? { settings: chosen.settings } : {}),
      ...(present(chosen.tracks) ? { tracks: chosen.tracks } : {}),
    },
  };
}

/** Refuse a config that leaves an input only the dataset can fill, which the viewer would pick. */
function rejectIncomplete(plugin: Json, a: Json): Json | null {
  const missing = isObject(plugin) ? unresolved(plugin, a, TYPES) : [];
  if (!missing.length) {
    return null;
  }
  return {
    error:
      `Refused: ${quote(a.visualization)} needs ${missing.join(", ")}, which only the ` +
      "dataset can supply, so the config is not complete without it.",
    hint:
      "Call get_visualization_options for each and pass the chosen option's id in " +
      "settings or tracks, the same config for showing or saving.",
  };
}

async function showVisualization(
  galaxy: Galaxy,
  resolveOptions: Resolve,
  a: Json,
): Promise<unknown> {
  const { artifact, refusal, rejected } = await checked(galaxy, resolveOptions, a);
  if (refusal) {
    return { shown: false, ...refusal };
  }
  if (rejected) {
    return fail(JSON.stringify({ shown: false, ...rejected }));
  }
  return {
    shown: true,
    title: artifact!.title,
    artifact,
    hint:
      "The visualization is displayed to the user. Nothing was added to Galaxy, so " +
      "call save_visualization if they ask to keep it. Writing it into the record " +
      "means putting {{artifact}} where it belongs in the page content. Say what it " +
      "shows and finish.",
  };
}

/** The value at a dotted path under `entry`, as `validateValues` names it. */
function valueAt(entry: unknown, path: string): unknown {
  return path
    .split(".")
    .filter(Boolean)
    .reduce((held: unknown, step) => (isObject(held) ? held[step] : undefined), entry);
}

/** The bounds a number has to fall within, in words. */
function range(min?: number, max?: number): string {
  if (min !== undefined && max !== undefined) {
    return `a number from ${min} to ${max}`;
  }
  return min !== undefined ? `a number of at least ${min}` : `a number of at most ${max}`;
}

/** One departure galaxy-charts reports, in the wording the model is refused with. */
function issueRefusal(issue: ValueIssueType, entry: unknown, where: string): Json {
  const steps = issue.path.split(".").filter(Boolean);
  const value = valueAt(entry, issue.path);
  // The object the issue sits in: the level itself, or the conditional it names.
  const level = (depth: number) => (depth > 0 ? steps[depth - 1] : where);
  switch (issue.code) {
    case "not_object":
      return {
        error: `Refused: ${level(steps.length)} is an object keyed by parameter name; got ${pyType(value)}.`,
        declared: issue.declared,
      };
    case "undeclared":
      return {
        error: `Refused: ${level(steps.length - 1)} declares no parameter ${quote(issue.name)}.`,
        declared: issue.declared,
        hint:
          "Parameters inside a conditional belong in that conditional's object, " +
          "not beside it. get_visualization_details shows the nesting.",
      };
    case "no_case":
      return {
        error:
          `Refused: ${issue.path} selects the case, so it takes one of ` +
          `${issue.cases.map(quote).join(", ")}.`,
      };
    case "wrong_shape": {
      const wanted = (issue.stores as Json)?.type;
      let error: string;
      if (wanted === "object") {
        error = `Refused: ${quote(issue.name)} takes an entry, {"id": ...}, not ${quote(value)}.`;
      } else if (typeof value === "object") {
        error = `Refused: ${quote(issue.name)} stores ${wanted}, the option's id, not an entry.`;
      } else {
        error = `Refused: ${quote(issue.name)} stores ${wanted}: ${issue.message}`;
      }
      return {
        error,
        expected: issue.stores,
        hint:
          "Call get_visualization_options with `search` for the id to choose: pass it as " +
          '{"id": ...} for an input that takes an entry and bare for one that takes a string.',
      };
    }
    case "not_offered":
      return {
        error:
          `Refused: ${quote(issue.name)} takes one of ${issue.offered.map(quote).join(", ")}, ` +
          `not ${quote(value)}.`,
        hint: "get_visualization_details lists the values a select declares.",
      };
    case "out_of_bounds":
      return {
        error: `Refused: ${quote(issue.name)} takes ${range(issue.min, issue.max)}; got ${quote(value)}.`,
      };
  }
}

/** The first way one object departs from what galaxy-charts' form writes for `declared`. */
export function checkLevel(entry: unknown, declared: unknown, where: string): Json | null {
  const [issue] = validateValues(declared as InputElementType[] | undefined, entry);
  return issue ? issueRefusal(issue, entry, where) : null;
}

/** Refuse a config the plugin would not produce, naming what it declares. */
function rejectUndeclared(plugin: unknown, a: Json): Json | null {
  if (!isObject(plugin)) {
    return null;
  }
  const settings = a.settings ?? null;
  const tracks = a.tracks ?? null;
  if (settings !== null && !isObject(settings)) {
    return {
      error: "Refused: settings is one object keyed by parameter name.",
      hint: 'Send {"locus": "chr1:1-100"}, not a list.',
    };
  }
  if (tracks !== null && !Array.isArray(tracks)) {
    return {
      error: "Refused: tracks is a list, one object per track.",
      hint: "Send [{...}], one entry for each track.",
    };
  }
  if (settings !== null) {
    const bad = checkLevel(settings, plugin.settings, "settings");
    if (bad) {
      return bad;
    }
  }
  for (const track of tracks || []) {
    const bad = checkLevel(track, plugin.tracks, "a track");
    if (bad) {
      return bad;
    }
  }
  return null;
}

/** Write the offered entry each option-bearing value names, or refuse one naming none. */
async function selectOffered(
  lookup: ReturnType<ResolveOptions>,
  plugin: Json,
  a: Json,
): Promise<Json | null> {
  const levels: [unknown, unknown][] = [
    [a.settings, plugin.settings],
    ...((a.tracks as unknown[]) || []).map((track): [unknown, unknown] => [track, plugin.tracks]),
  ];
  for (const [entry, declared] of levels) {
    for (const { path, param, value, branch } of optionBearing(entry, declared, TYPES)) {
      const envelope = await lookup(param, { datasetId: a.dataset_id });
      // A value nobody could check is not stored: an option is kept as the whole entry offered.
      if (!envelope.success) {
        return {
          error:
            `Refused: ${path} could not be checked, because this server's options for it ` +
            `could not be read (${envelope.message}).`,
          hint:
            "The options are unavailable, not the value wrong: try again, or use a case whose " +
            "options can be read.",
        };
      }
      const offered: Json[] = envelope.data || [];
      const stored = offeredValue(value, offered, param);
      if (stored !== undefined) {
        const steps = path.split(".");
        const parent = steps.slice(0, -1).reduce((held: Json, step) => held[step], entry as Json);
        parent[steps.at(-1)!] = stored;
        continue;
      }
      if (!offered.length && branch) {
        return {
          error: `Refused: this server lists no ${path} for ${branch.test}=${quote(branch.value)}.`,
          other_cases: branch.siblings,
          hint:
            "The same parameter is declared for " +
            branch.siblings.map(quote).join(", ") +
            "; a value resolved under one of those does not become valid by " +
            `leaving ${branch.test} as ${quote(branch.value)}.`,
        };
      }
      const names = offered
        .slice(0, MATCH_CAP)
        .map((o) => quote(identity(o.value)))
        .join(", ");
      return {
        error: `Refused: ${path} names ${quote(identity(value))}, which this server does not offer.`,
        hint:
          `${offered.length} value(s) are offered` +
          (names ? `, including ${names}` : " for this case") +
          ". These were resolved with " +
          (a.dataset_id ? `dataset_id=${quote(a.dataset_id)}` : "no dataset") +
          "; call get_visualization_options the same way and choose one by its id.",
      };
    }
  }
  return null;
}

async function saveVisualization(
  galaxy: Galaxy,
  resolveOptions: Resolve,
  a: Json,
): Promise<unknown> {
  const { artifact, refusal, rejected } = await checked(galaxy, resolveOptions, a);
  if (refusal) {
    return { saved: false, ...refusal };
  }
  if (rejected) {
    return fail(JSON.stringify({ saved: false, ...rejected }));
  }
  const name = a.visualization;
  let title = artifact!.title;
  let config = visualizationConfig(artifact!);

  let visualizationId = a.visualization_id;
  if (visualizationId) {
    const existing: Json =
      (await galaxy.get(`api/visualizations/${segment(visualizationId)}`)) || {};
    if (existing.type !== name) {
      return fail(
        `Refused: visualization ${quote(visualizationId)} is a ${quote(existing.type)}, not a ` +
          `${quote(name)}. Leave visualization_id out to save a new one.`,
      );
    }
    // Galaxy replaces a revision's config and title whole, so what Olit does not own -- the
    // plugin's own keys, such as galaxy-charts' transcripts -- and an unchanged title carry over.
    const {
      dataset_id: _d,
      settings: _s,
      tracks: _t,
      ...kept
    } = (existing.latest_revision?.config as Json | undefined) ?? {};
    config = { ...kept, ...config };
    title = a.title || existing.title || title;
    await galaxy.put(`api/visualizations/${segment(visualizationId)}`, { title, config });
  } else {
    const created = await galaxy.post("api/visualizations", { type: name, title, config });
    visualizationId = created?.id;
    if (!visualizationId) {
      return fail(
        "Galaxy accepted the visualization but returned no id, so there is nothing " +
          `to display or revise. It answered: ${JSON.stringify(created ?? null)}`,
      );
    }
  }
  return {
    saved: true,
    visualization_id: visualizationId,
    title,
    artifact: { ...artifact!, title, visualization_id: visualizationId },
    hint:
      "Saved to the user's visualizations and displayed. It is not a history dataset. " +
      "Writing it into the record means putting {{artifact}} where it belongs in the " +
      "page content, which places it with these settings and tracks. Say what it shows " +
      "and finish.",
  };
}

/** A Vega-Lite chart of one dataset, rendered inline and placeable in the record. */
async function vegaDataset(galaxy: Galaxy, a: Json): Promise<Json> {
  const datasetId = a.dataset_id;
  if (!datasetId) {
    return { charted: false, error: "dataset_id is required." };
  }
  const details: Json = (await galaxy.get(`api/datasets/${segment(datasetId)}`)) || {};
  if (!details.id) {
    return { charted: false, error: `No dataset ${quote(datasetId)} is readable.` };
  }
  const { ready, refusal } = vega.build(datasetId, a.spec, details, rootPath(galaxy));
  if (refusal || !ready) {
    return { charted: false, error: `Refused: ${refusal}` };
  }
  const { problems } = vega.compiled(ready);
  if (problems.length) {
    return {
      charted: false,
      error: "Refused: vega-lite rejects this spec: " + problems.slice(0, 3).join("; "),
    };
  }
  const title = a.title || details.name || "Chart";
  const result: Json = {
    charted: true,
    title,
    columns: tables.columnNames(details),
    artifact: { kind: "vega-lite", title, spec: ready } satisfies Artifact,
    hint:
      "The chart is displayed to the user. Writing it into the record means putting " +
      "{{artifact}} where it belongs in the page content. Say what it shows and finish.",
  };
  const suspect = vega.unsatisfiableTypes(ready, details);
  if (suspect.length) {
    result.note =
      `Galaxy types ${suspect.map(quote).join(", ")} as text, so a quantitative ` +
      "encoding on it plots only the rows that parse as numbers, and none if it holds no " +
      "numbers at all. Check the chart says what you meant.";
  }
  return result;
}

function schema(properties: Json, required: string[]): Json {
  return { type: "object", properties, required };
}

/** The visualization tools, in the order the catalogue lists them. */
export function visualizationTools(resolveOptions: ResolveOptions = chartOptions): OlitTool[] {
  /** Options resolved for this call, its requests to other hosts ended with it. */
  const withWeb =
    (ctx: Context): Resolve =>
    (galaxy) =>
      resolveOptions(galaxy, ctx.web);
  return [
    {
      name: "get_visualization_options",
      capability: "read",
      description:
        "Resolve a visualization parameter's selectable options from wherever the plugin says " +
        "they live. `parameter` is the `path` get_visualization_details publishes. Where a name is " +
        "declared in several cases of a conditional, pass `config` in the shape save_visualization " +
        "takes, so the test parameter in it says which case. Use `search` to find the id to choose.",
      parameters: schema(
        {
          visualization: STR,
          parameter: STR,
          search: STR,
          config: { type: "object" },
          dataset_id: STR,
        },
        ["visualization", "parameter"],
      ),
      run: (args, ctx) => getVisualizationOptions(ctx.galaxy, withWeb(ctx), args),
    },
    {
      name: "get_visualization",
      capability: "read",
      description:
        "Get a saved visualization's current settings and tracks. Read before revising it: " +
        "save_visualization replaces the config rather than merging into it.",
      parameters: schema({ visualization_id: STR }, ["visualization_id"]),
      run: (args, ctx) => getVisualization(ctx.galaxy, args),
    },
    {
      name: "get_visualization_details",
      capability: "read",
      // A plugin's parameters change only when an administrator installs another version.
      settled: true,
      description:
        "Get one visualization's parameters, including the schema its settings and tracks must " +
        "match. Call before binding settings or tracks.",
      parameters: schema({ visualization: STR }, ["visualization"]),
      run: (args, ctx) => getVisualizationDetails(ctx.galaxy, args),
    },
    {
      name: "show_visualization",
      capability: "read",
      description:
        "Display a dataset with an installed visualization, with the settings and tracks it needs. " +
        "Renders only; saves nothing. Takes the same config as save_visualization.",
      parameters: schema(
        {
          dataset_id: STR,
          visualization: STR,
          title: STR,
          settings: { type: "object" },
          tracks: { type: "array", items: { type: "object" } },
        },
        ["dataset_id", "visualization"],
      ),
      run: (args, ctx) => showVisualization(ctx.galaxy, withWeb(ctx), args),
    },
    {
      name: "save_visualization",
      capability: "write",
      description:
        "Save a Galaxy visualization of a dataset, the durable kind the user keeps. Takes the " +
        "same config as show_visualization and displays it the same way. Pass " +
        "visualization_id to revise one already saved instead of adding another.",
      parameters: schema(
        {
          dataset_id: STR,
          visualization: STR,
          title: STR,
          visualization_id: STR,
          settings: { type: "object" },
          tracks: { type: "array", items: { type: "object" } },
        },
        ["dataset_id", "visualization"],
      ),
      run: (args, ctx) => saveVisualization(ctx.galaxy, withWeb(ctx), args),
    },
    {
      name: "vega_dataset",
      capability: "read",
      description:
        "Chart one tabular Galaxy dataset with a Vega-Lite specification you write, rendered " +
        "inline and placeable in the record with {{artifact}}. Leave `data` out of the spec: it " +
        "is pointed at the dataset here, so the chart reads the file rather than carrying a copy " +
        "of it. Refer to columns as this dataset names them, `col:1`, `col:2` and so on where it " +
        "names none. For a chart of something the dataset does not hold, make a derived dataset " +
        "with a Galaxy tool and chart that. Where an installed visualization fits, " +
        "save_visualization keeps a Galaxy object instead.",
      parameters: schema({ dataset_id: STR, spec: { type: "object" }, title: STR }, [
        "dataset_id",
        "spec",
      ]),
      run: (args, ctx) => vegaDataset(ctx.galaxy, args),
    },
    {
      name: "list_visualizations",
      capability: "read",
      description:
        "List the Galaxy visualizations that can display a dataset, such as genome browsers and " +
        "structure viewers. Start here when the user wants to open or view a dataset in a viewer, " +
        "whether or not they name one. Visualizations are not tools, so no tool search lists them.",
      parameters: schema({ dataset_id: STR }, ["dataset_id"]),
      run: (args, ctx) => listVisualizations(ctx.galaxy, args),
    },
  ];
}
