import inputs from "galaxy-charts/galaxy-charts.inputs.json";
import { getOptions } from "galaxy-charts/runtime";
import { Value } from "typebox/value";

import { type Galaxy, query } from "./galaxy";
import { fail, type OlitTool } from "./tool";
import * as vega from "./vega";
import {
  activeCase,
  buildVisualizationTemplate,
  declaredPaths,
  effectiveDefault,
  isOffered,
  optionBearing,
  pyJson,
  repr,
  resolveParameter,
  type Types,
} from "./visualization-inputs";

type Json = Record<string, any>;

export type Envelope = { success: true; data: any } | { success: false; message: string };

/** galaxy-charts' option resolution for one declared input. */
export type ResolveOptions = (
  galaxy: Galaxy,
  input: Json,
  context: { datasetId?: string },
) => Promise<Envelope>;

/** What each galaxy-charts input type stores, and where its options come from. */
const TYPES: Types = (inputs as { types: Types }).types;

/** This agent, and a standalone plugin that defers its chart to its own LLM at view time. */
const NOT_OFFERED = new Set(["olit", "vintent"]);

const NUMERIC_COLUMNS = new Set(["int", "float"]);
const MATCH_CAP = 5;
const ROW_CAP = 100;
const EMBED = { hide_panels: "true", hide_masthead: "true" };
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

/** galaxy-charts `getOptions`, reaching Galaxy through the session's client. */
export const chartOptions: ResolveOptions = async (galaxy, input, context) => {
  const client = {
    api: (path: string) => galaxy.get(path),
    url: async (target: string) => {
      const response = await fetch(target);
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    },
  };
  try {
    return { success: true, data: await getOptions(input || {}, { ...context, client }) };
  } catch (err) {
    return { success: false, message: String((err as Error)?.message ?? err) };
  }
};

/** The installed visualization this query names, if the tool catalog is the wrong one. */
export async function aVisualizationNamed(
  galaxy: Galaxy,
  search: string | undefined,
): Promise<string | undefined> {
  const wanted = (search || "").trim().toLowerCase();
  const installed: Json[] = (await galaxy.get("api/plugins")) || [];
  return installed
    .map((p) => p.name)
    .filter((n) => !NOT_OFFERED.has(n))
    .find((n) => n && n.toLowerCase() === wanted);
}

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
  const mappings: unknown[] = (await galaxy.get(`api/datatypes/${extension}/visualizations`)) || [];
  return new Set(mappings.filter(isObject).map((m) => m.visualization));
}

async function listVisualizations(galaxy: Galaxy, a: Json): Promise<Json> {
  const dataset: Json = (await galaxy.get(`api/datasets/${a.dataset_id}`)) || {};
  const extension = dataset.extension;
  const numeric = ((dataset.metadata_column_types as string[]) || []).filter((t) =>
    NUMERIC_COLUMNS.has(t),
  );

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
      `No installed visualization accepts the datatype ${repr(extension)}. ` +
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
  if (!installed.some((p) => p.name === name)) {
    return {
      refusal: {
        error: `Refused: ${repr(name)} is not an installed visualization.`,
        hint: "Call list_visualizations for the dataset to see what this server offers.",
      },
    };
  }
  const dataset: Json = (await galaxy.get(`api/datasets/${datasetId}`)) || {};
  const compatible: Json[] =
    (await galaxy.get(`api/plugins${query({ dataset_id: datasetId })}`)) || [];
  if (!compatible.some((p) => p.name === name)) {
    return {
      refusal: {
        error: `Refused: ${repr(name)} cannot render the datatype ${repr(dataset.extension)}.`,
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
  const fallback = effectiveDefault(param, spec);
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
      options.pass_through = "the resolved option's `value`, unchanged";
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
  const plugin: Json = (await galaxy.get(`api/plugins/${name}`)) || {};
  if (!plugin.name) {
    return fail(
      `Refused: ${repr(name)} is not an installed visualization. Call list_visualizations ` +
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
      "`stores` is the schema a value is validated against; for an input naming " +
      "`pass_through`, resolve its options and send the chosen option's `value` rather than " +
      "building one to that schema. Build `settings` and `tracks` and pass them to " +
      "save_visualization: settings cannot ride in a displayed visualization, only in a saved one.",
  };
}

/** What names an option: an object's id, or the value itself when it is a scalar. */
const identity = (value: unknown) => (isObject(value) ? value.id : value);

function matches(entry: Json, search: string | undefined): boolean {
  if (!search) {
    return false;
  }
  const hay = ["id", "name", "label", "value"]
    .map((k) => (!entry[k] ? "" : typeof entry[k] === "object" ? repr(entry[k]) : String(entry[k])))
    .join(" ")
    .toLowerCase();
  return hay.includes(search.toLowerCase());
}

async function getVisualizationOptions(
  galaxy: Galaxy,
  resolveOptions: ResolveOptions,
  a: Json,
): Promise<unknown> {
  const name = a.visualization;
  const asked = a.parameter;
  const plugin = (await galaxy.get(`api/plugins/${name}`)) || {};
  if (!isObject(plugin) || !plugin.name) {
    return fail(`Refused: ${repr(name)} is not an installed visualization.`);
  }

  const { hit, problem } = resolveParameter(plugin, asked, a.config);
  if (problem || !hit) {
    const leaf = String(asked).split(".").pop()!;
    const elsewhere = declaredPaths(plugin, leaf).filter((path) => path !== asked);
    const where = elsewhere.length ? ` ${repr(leaf)} is declared at ${elsewhere.join(", ")}.` : "";
    return fail(`Refused: ${problem}${where}`);
  }
  const { declared, path: wanted, otherCases: siblings, case: when } = hit;
  const kind = TYPES[declared.type]?.options?.kind;
  const search = a.search;

  const envelope = await resolveOptions(galaxy, declared, { datasetId: a.dataset_id });
  if (!envelope.success) {
    return fail(`Could not resolve ${repr(wanted)}: ${envelope.message || "the lookup failed"}.`);
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
  const entries = offered.map((o) => ({
    id: identity(o.value),
    name: o.label,
    value: o.value,
  }));

  const result: Json = {
    parameter: wanted,
    source: kind,
    total: entries.length,
    options: entries.slice(0, ROW_CAP),
  };
  if (!entries.length && siblings.length) {
    result.other_cases = siblings;
    result.hint =
      `This server lists no ${repr(wanted)} for ${repr(when)}. The same parameter is ` +
      `declared for ${siblings.map(repr).join(", ")}; try one of those.`;
    return result;
  }
  if (search) {
    result.matches = entries.filter((e) => matches(e, search)).slice(0, MATCH_CAP);
    result.hint =
      "`matches` holds the values to store as given; pass one through unchanged rather than rebuilding it.";
  } else {
    result.hint =
      "Store an option's `value` as given rather than rebuilding it from its id; `search` narrows a long list.";
  }
  return result;
}

async function getVisualization(galaxy: Galaxy, a: Json): Promise<unknown> {
  const saved: Json = (await galaxy.get(`api/visualizations/${a.visualization_id}`)) || {};
  if (!saved.id) {
    return fail(
      `No saved visualization ${repr(a.visualization_id)}. Pass the visualization_id ` +
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

async function showVisualization(galaxy: Galaxy, a: Json): Promise<Json> {
  const { dataset, refusal } = await resolveVisualization(galaxy, a);
  if (refusal) {
    return { shown: false, ...refusal };
  }
  const name = a.visualization;
  const title = a.title || `${name} of ${dataset!.name || a.dataset_id}`;
  const params = { visualization: name, dataset_id: a.dataset_id, ...EMBED };
  return {
    shown: true,
    title,
    artifact: {
      kind: "visualization",
      title,
      visualization: name,
      dataset_id: a.dataset_id,
      url: `/visualizations/display${query(params)}`,
    },
    hint:
      "The visualization is displayed to the user. Nothing was added to Galaxy, so " +
      "call save_visualization if they ask to keep it. Writing it into the record " +
      "means putting {{artifact}} where it belongs in the page content. Say what it " +
      "shows and finish.",
  };
}

/** Names valid at this level; a conditional contributes its own name, not its inputs. */
function levelNames(declared: unknown): Set<string> {
  return new Set(
    ((declared as unknown[]) || [])
      .filter((p) => isObject(p) && p.name)
      .map((p) => (p as Json).name),
  );
}

/** Validate one object against the inputs declared for it, as galaxy-charts `parseValues` reads it. */
export function checkLevel(
  entry: unknown,
  declared: unknown,
  types: Types,
  where: string,
): Json | null {
  const allowed = levelNames(declared);
  if (!allowed.size) {
    return null;
  }
  const sortedAllowed = [...allowed].sort();
  if (!isObject(entry)) {
    return {
      error: `Refused: ${where} is an object keyed by parameter name; got ${pyType(entry)}.`,
      declared: sortedAllowed,
    };
  }
  const unknown = Object.keys(entry)
    .filter((k) => !allowed.has(k))
    .sort();
  if (unknown.length) {
    return {
      error: `Refused: ${where} declares no parameter ${repr(unknown[0])}.`,
      declared: sortedAllowed,
      hint:
        "Parameters inside a conditional belong in that conditional's object, " +
        "not beside it. get_visualization_details shows the nesting.",
    };
  }

  for (const param of (declared as unknown[]) || []) {
    if (!isObject(param) || !Object.hasOwn(entry, param.name)) {
      continue;
    }
    const value = entry[param.name];
    if (param.type === "conditional") {
      const test = param.test_param?.name;
      const cases: Json[] = param.cases || [];
      const active = activeCase(param, entry);
      if (!active) {
        const labels = cases.map((c) => repr(c.value)).join(", ");
        return {
          error: `Refused: ${param.name}.${test} selects the case, so it takes one of ${labels}.`,
          declared: sortedAllowed,
        };
      }
      const nested = checkLevel(
        value,
        [{ name: test }, ...(active.inputs || [])],
        types,
        param.name,
      );
      if (nested) {
        return nested;
      }
      continue;
    }
    const bad = wrongShape(param.name, value, types[param.type]?.stores);
    if (bad) {
      return bad;
    }
  }
  return null;
}

/** The value against the schema galaxy-charts publishes for the input's type. */
function wrongShape(name: string, value: unknown, spec: Json | undefined): Json | null {
  if (!present(spec) || value === null || value === undefined) {
    return null;
  }
  const failure = Value.Errors(spec!, value)[0];
  if (!failure) {
    return null;
  }
  const wanted = spec!.type;
  let error: string;
  if (wanted === "object") {
    error = `Refused: ${repr(name)} takes the whole entry it was chosen from, not ${repr(value)}.`;
  } else if (typeof value === "object") {
    error = `Refused: ${repr(name)} stores ${wanted}, not the entry it was chosen from.`;
  } else {
    error = `Refused: ${repr(name)} stores ${wanted}: ${failure.message}`;
  }
  return {
    error,
    expected: spec,
    hint:
      "Call get_visualization_options with `search`: it returns the value to store, " +
      "whole for an input that takes an entry and bare for one that takes a string.",
  };
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
      saved: false,
      error: "Refused: settings is one object keyed by parameter name.",
      hint: 'Send {"locus": "chr1:1-100"}, not a list.',
    };
  }
  if (tracks !== null && !Array.isArray(tracks)) {
    return {
      saved: false,
      error: "Refused: tracks is a list, one object per track.",
      hint: "Send [{...}], one entry for each track.",
    };
  }
  if (settings !== null) {
    const bad = checkLevel(settings, plugin.settings, TYPES, "settings");
    if (bad) {
      return { saved: false, ...bad };
    }
  }
  for (const track of tracks || []) {
    const bad = checkLevel(track, plugin.tracks, TYPES, "a track");
    if (bad) {
      return { saved: false, ...bad };
    }
  }
  return null;
}

/** Refuse a value the server does not offer, resolving the options again at the write. */
async function rejectUnoffered(
  galaxy: Galaxy,
  resolveOptions: ResolveOptions,
  plugin: Json,
  a: Json,
): Promise<Json | null> {
  const levels: [unknown, unknown][] = [
    [a.settings, plugin.settings],
    ...((a.tracks as unknown[]) || []).map((track): [unknown, unknown] => [track, plugin.tracks]),
  ];
  for (const [entry, declared] of levels) {
    for (const { path, param, spec, value, branch } of optionBearing(entry, declared, TYPES)) {
      const envelope = await resolveOptions(galaxy, param, { datasetId: a.dataset_id });
      if (!envelope.success) {
        continue;
      }
      const offered: Json[] = envelope.data || [];
      if (isOffered(value, offered, param, spec)) {
        continue;
      }
      if (!offered.length && branch) {
        return {
          saved: false,
          error: `Refused: this server lists no ${path} for ${branch.test}=${repr(branch.value)}.`,
          other_cases: branch.siblings,
          hint:
            "The same parameter is declared for " +
            branch.siblings.map(repr).join(", ") +
            "; a value resolved under one of those does not become valid by " +
            `leaving ${branch.test} as ${repr(branch.value)}.`,
        };
      }
      const names = offered
        .slice(0, MATCH_CAP)
        .map((o) => repr(identity(o.value)))
        .join(", ");
      return {
        saved: false,
        error: `Refused: ${path} does not exactly match a value this server offers.`,
        hint:
          `${offered.length} value(s) are offered` +
          (names ? `, including ${names}` : " for this case") +
          ". These were resolved with " +
          (a.dataset_id ? `dataset_id=${repr(a.dataset_id)}` : "no dataset") +
          "; call get_visualization_options the same way and store the option's " +
          "complete `value` unchanged, since a value naming the right entry with " +
          "different or fewer fields is not it.",
      };
    }
  }
  return null;
}

async function saveVisualization(
  galaxy: Galaxy,
  resolveOptions: ResolveOptions,
  a: Json,
): Promise<unknown> {
  const { dataset, refusal } = await resolveVisualization(galaxy, a);
  if (refusal) {
    return { saved: false, ...refusal };
  }

  if (present(a.settings) || present(a.tracks)) {
    const plugin: Json = (await galaxy.get(`api/plugins/${a.visualization}`)) || {};
    const undeclared = rejectUndeclared(plugin, a);
    if (undeclared) {
      return fail(JSON.stringify(undeclared));
    }
    const unoffered = await rejectUnoffered(galaxy, resolveOptions, plugin, a);
    if (unoffered) {
      return fail(JSON.stringify(unoffered));
    }
  }

  const name = a.visualization;
  const title = a.title || `${name} of ${dataset!.name || a.dataset_id}`;
  const config = visualizationConfig(a);

  let visualizationId = a.visualization_id;
  if (visualizationId) {
    await galaxy.put(`api/visualizations/${visualizationId}`, { title, config });
  } else {
    const created = await galaxy.post("api/visualizations", { type: name, title, config });
    visualizationId = created?.id;
    if (!visualizationId) {
      return fail(
        "Galaxy accepted the visualization but returned no id, so there is nothing " +
          `to display or revise. It answered: ${pyJson(created)}`,
      );
    }
  }
  const params = { visualization: name, visualization_id: visualizationId, ...EMBED };
  const artifact: Json = {
    kind: "visualization",
    title,
    visualization: name,
    dataset_id: a.dataset_id,
    url: `/visualizations/display${query(params)}`,
  };
  for (const key of ["settings", "tracks"]) {
    if (present(a[key])) {
      artifact[key] = a[key];
    }
  }
  return {
    saved: true,
    visualization_id: visualizationId,
    title,
    artifact,
    hint:
      "Saved to the user's visualizations and displayed. It is not a history dataset. " +
      "Writing it into the record means putting {{artifact}} where it belongs in the " +
      "page content; visualization_id above identifies the saved object and renders " +
      "nothing in a page. Say what it shows and finish.",
  };
}

/** A Vega-Lite chart of one dataset, rendered inline and placeable in the record. */
async function vegaDataset(galaxy: Galaxy, a: Json): Promise<Json> {
  const datasetId = a.dataset_id;
  if (!datasetId) {
    return { charted: false, error: "dataset_id is required." };
  }
  const details: Json = (await galaxy.get(`api/datasets/${datasetId}`)) || {};
  if (!details.id) {
    return { charted: false, error: `No dataset ${repr(datasetId)} is readable.` };
  }
  const { ready, refusal } = vega.build(datasetId, a.spec, details);
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
    columns: vega.columnNames(details),
    artifact: { kind: "vega-lite", title, spec: ready },
  };
  const suspect = vega.unsatisfiableTypes(ready, details);
  if (suspect.length) {
    result.note =
      `Galaxy types ${suspect.map(repr).join(", ")} as text, so a quantitative ` +
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
  return [
    {
      name: "get_visualization_options",
      capability: "read",
      description:
        "Resolve a visualization parameter's selectable options from wherever the plugin says " +
        "they live. `parameter` is the `path` get_visualization_details publishes. Where a name is " +
        "declared in several cases of a conditional, pass `config` in the shape save_visualization " +
        "takes, so the test parameter in it says which case. Use `search` to get the value to store.",
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
      run: (args, ctx) => getVisualizationOptions(ctx.galaxy, resolveOptions, args),
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
        "Display a dataset with an installed visualization. Renders only; saves nothing. Takes the " +
        "plugin's defaults -- use save_visualization to bind settings or tracks.",
      parameters: schema({ dataset_id: STR, visualization: STR, title: STR }, [
        "dataset_id",
        "visualization",
      ]),
      run: (args, ctx) => showVisualization(ctx.galaxy, args),
    },
    {
      name: "save_visualization",
      capability: "write",
      description:
        "Save a Galaxy visualization of a dataset, the durable kind the user keeps. Needed to " +
        "bind settings or tracks, which a displayed visualization cannot carry. Pass " +
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
      run: (args, ctx) => saveVisualization(ctx.galaxy, resolveOptions, args),
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
      description: "List the Galaxy visualizations that can display a dataset.",
      parameters: schema({ dataset_id: STR }, ["dataset_id"]),
      run: (args, ctx) => listVisualizations(ctx.galaxy, args),
    },
  ];
}
