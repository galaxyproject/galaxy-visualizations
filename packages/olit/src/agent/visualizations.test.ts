import { describe, expect, it } from "vitest";

import { toPage, type Artifact } from "../artifacts/kinds";
import { connectWeb, type Galaxy } from "./galaxy";
import { claim, type Context, Outcome, rendered } from "./tool";
import {
  chartOptions,
  checkLevel,
  type ResolveOptions,
  visualizationTools,
} from "./visualizations";
import { resolveParameter } from "./visualization-inputs";

type Json = Record<string, any>;

/** A Galaxy answering GETs from `get`, recording what was written. */
function fakeGalaxy(get: (path: string) => unknown) {
  const g = {
    posted: undefined as [string, Json] | undefined,
    putTo: undefined as [string, Json] | undefined,
    get: async (path: string) => get(path),
    post: async (path: string, body: Json): Promise<Json> => {
      g.posted = [path, body];
      return { id: "v1" };
    },
    put: async (path: string, body: Json) => {
      g.putTo = [path, body];
      return { id: path.split("/").pop() };
    },
  };
  return g;
}

/** galaxy-charts, as far as the policy around it is concerned. */
function fakeCharts(offered: unknown[] = [], { success = true, message = "" } = {}) {
  const asked: { input: Json; context: Json }[] = [];
  const resolve: ResolveOptions = () => async (input, context) => {
    asked.push({ input, context });
    return success && !message
      ? { success: true, data: offered }
      : { success: false, message: message || "the lookup failed" };
  };
  return Object.assign(resolve, { asked });
}

const context = (galaxy: unknown) =>
  ({
    galaxy: galaxy as Galaxy,
    artifacts: { prior: [], produced: [] },
    binding: {},
  }) as unknown as Context;

function call(name: string, galaxy: unknown, args: Json, charts = fakeCharts()): Promise<any> {
  const tool = visualizationTools(charts).find((t) => t.name === name)!;
  return tool.run(args, context(galaxy));
}

/** The payload of a call the tool refused, asserting it was recorded as a failure. */
function refused(out: unknown): any {
  expect(out).toBeInstanceOf(Outcome);
  expect((out as Outcome).isError).toBe(true);
  const text = (out as Outcome).text;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

describe("list_visualizations", () => {
  it("is described as where showing a dataset starts, viewer named or not", () => {
    const { description } = visualizationTools().find((t) => t.name === "list_visualizations")!;
    expect(description).toContain("structure viewers");
    expect(description).toContain("open or view a dataset in a viewer");
    expect(description).not.toMatch(/chart|plot/i);
    expect(description).toContain("no tool search lists them");
  });

  const COMPATIBLE = [
    {
      name: "plotly",
      description: "based on Plotly",
      tags: ["Plotly"],
      tracks: [{ name: "x", type: "data_column" }],
      settings: [],
    },
    { name: "atlas", description: "table browser", tags: [] },
  ];

  function list(dataset: Json, compatible: Json[] = COMPATIBLE, preferred: string[] = []) {
    const g = fakeGalaxy((path) => {
      if (path.startsWith("api/datasets/")) return dataset;
      if (path.startsWith("api/plugins")) return compatible;
      if (path.endsWith("/visualizations"))
        return preferred.map((name) => ({ visualization: name }));
      return [];
    });
    return call("list_visualizations", g, { dataset_id: "d1" });
  }

  it("lets the server decide what is compatible", async () => {
    const out = await list({
      extension: "tabular",
      metadata_columns: 3,
      metadata_column_types: ["int", "float", "str"],
    });
    expect(out.visualizations.map((v: Json) => v.name)).toEqual(["plotly", "atlas"]);
  });

  it("marks the datatype preference and ranks it first", async () => {
    const out = await list(
      { extension: "tabular", metadata_columns: 2, metadata_column_types: ["int", "int"] },
      COMPATIBLE,
      ["atlas"],
    );
    expect(out.visualizations[0].name).toBe("atlas");
    expect(out.visualizations[0].preferred_for_datatype).toBe(true);
    expect(out.visualizations[1]).not.toHaveProperty("preferred_for_datatype");
  });

  it("tells a dataset without numeric columns why and what else to try", async () => {
    const out = await list({
      extension: "tabular",
      metadata_columns: 1,
      metadata_column_types: ["list"],
    });
    expect(out.hint).toContain("no numeric columns");
    expect(out.hint).toContain("vega_dataset");
  });

  it("answers what can render this and proposes no route", async () => {
    const out = await list({
      extension: "tabular",
      metadata_columns: 2,
      metadata_column_types: ["int", "float"],
    });
    expect(out).not.toHaveProperty("charting");
    expect(out).not.toHaveProperty("hint");
  });

  it("says so when nothing can render a datatype", async () => {
    const out = await list(
      { extension: "bam", metadata_columns: null, metadata_column_types: [] },
      [],
    );
    expect(out.visualizations).toEqual([]);
    expect(out.hint).toContain("No installed visualization accepts");
  });

  it("reports column parameters so the agent knows what must be filled", async () => {
    const out = await list({
      extension: "tabular",
      metadata_columns: 2,
      metadata_column_types: ["int", "int"],
    });
    const plotly = out.visualizations.find((v: Json) => v.name === "plotly");
    expect(plotly.column_parameters).toEqual(["x"]);
  });

  it("answers only what can render the dataset", async () => {
    const out = await list({
      extension: "tabular",
      metadata_columns: 3,
      metadata_column_types: ["int", "float", "str"],
    });
    expect(out).not.toHaveProperty("columns");
    expect(out).not.toHaveProperty("column_types");
    for (const key of Object.keys(out)) {
      expect(["dataset_id", "extension", "visualizations", "hint", "charting"]).toContain(key);
    }
  });

  it("offers neither olit nor the standalone vintent plugin", async () => {
    const out = await list(
      { extension: "tabular", metadata_columns: 2, metadata_column_types: ["int", "float"] },
      ["plotly", "olit", "vintent", "tabulator"].map((n) => ({
        name: n,
        description: n,
        tags: [],
      })),
    );
    expect(out.visualizations.map((v: Json) => v.name)).toEqual(["plotly", "tabulator"]);
  });
});

describe("get_visualization_details", () => {
  const IGV = {
    name: "igv",
    description: "Explore Genomic Data",
    settings: [
      { name: "locus", type: "text", value: "all" },
      {
        name: "source",
        type: "conditional",
        test_param: {
          name: "origin",
          type: "select",
          data: [
            { label: "IGV", value: "igv" },
            { label: "History", value: "history" },
          ],
        },
        cases: [
          {
            value: "igv",
            inputs: [{ name: "genome", type: "data_json", url: "https://x/g.json" }],
          },
          {
            value: "history",
            inputs: [{ name: "genome", type: "data", extension: "fasta,twobit" }],
          },
        ],
      },
    ],
    tracks: [{ name: "urlDataset", type: "data", extension: "bam,bed" }],
  };

  const details = (plugin: Json = IGV) =>
    call(
      "get_visualization_details",
      fakeGalaxy(() => plugin),
      { visualization: "igv" },
    );

  it("states the object a dataset input stores", async () => {
    const track = (await details()).tracks[0];
    expect(track.stores.type).toBe("object");
    expect(track.stores.required).toEqual(["id"]);
  });

  it("states the datatypes a dataset input accepts", async () => {
    expect((await details()).tracks[0].options).toEqual({
      kind: "history_dataset",
      extension: "bam,bed",
      resolve: "get_visualization_options",
      chosen_by: "an option's id, as get_visualization_options lists it",
    });
  });

  it("expands a conditional into its cases", async () => {
    const source = (await details()).settings[1];
    expect(source.cases.map((c: Json) => c.when)).toEqual(["igv", "history"]);
    expect(source.chosen_by.name).toBe("origin");
    const historyGenome = source.cases[1].inputs[0];
    expect(historyGenome.options.extension).toBe("fasta,twobit");
    expect(historyGenome.stores.required).toEqual(["id"]);
  });

  it("names where a remote option source is fetched", async () => {
    expect((await details()).settings[1].cases[0].inputs[0].options).toEqual({
      kind: "data_json",
      url: "https://x/g.json",
      resolve: "get_visualization_options",
      chosen_by: "an option's id, as get_visualization_options lists it",
    });
  });

  it("names no call for a declared source", async () => {
    expect((await details()).settings[1].chosen_by.options).not.toHaveProperty("resolve");
  });

  it("states a string for a plain text input and claims nothing else", async () => {
    const locus = (await details()).settings[0];
    expect(locus.stores).toEqual({
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "string",
    });
    expect(locus).not.toHaveProperty("options");
  });

  it("refuses an unknown visualization", async () => {
    expect(refused(await details({}))).toContain("not an installed visualization");
  });

  it("publishes a declared default", async () => {
    expect((await details()).settings[0].default).toBe("all");
  });

  it("publishes the default that chooses a conditional's case", async () => {
    const source = {
      ...IGV.settings[1],
      test_param: { name: "origin", type: "select", value: "igv" },
    };
    const published = (await details({ name: "igv", settings: [source] })).settings[0];
    expect(published.chosen_by.default).toBe("igv");
  });

  it("coerces a default by what the contract declares", async () => {
    const plugin = {
      name: "igv",
      settings: [
        { name: "show_legend", type: "boolean", value: "true" },
        { name: "width", type: "integer", value: "800" },
        { name: "ratio", type: "float", value: "1.5" },
        { name: "title", type: "text", value: "800" },
      ],
    };
    const published = Object.fromEntries(
      (await details(plugin)).settings.map((p: Json) => [p.name, p.default]),
    );
    expect(published).toEqual({ show_legend: true, width: 800, ratio: 1.5, title: "800" });
  });

  it("publishes an unset switch as off, as galaxy-charts reads it", async () => {
    const plugin = { name: "igv", settings: [{ name: "legend", type: "boolean" }] };
    expect((await details(plugin)).settings[0].default).toBe(false);
  });

  it("does not publish a numeric default that is not a number", async () => {
    const plugin = { name: "igv", settings: [{ name: "width", type: "integer", value: "wide" }] };
    expect((await details(plugin)).settings[0]).not.toHaveProperty("default");
  });
});

describe("get_visualization_options", () => {
  const IGV = {
    name: "igv",
    settings: [
      {
        name: "source",
        type: "conditional",
        test_param: {
          name: "origin",
          type: "select",
          data: [
            { label: "IGV", value: "igv" },
            { label: "Built in", value: "builtin" },
          ],
        },
        cases: [
          {
            value: "igv",
            inputs: [{ name: "genome", type: "data_json", url: "https://x/g.json" }],
          },
          {
            value: "builtin",
            inputs: [{ name: "genome", type: "data_table", tables: ["fasta_indexes"] }],
          },
        ],
      },
      { name: "locus", type: "text" },
    ],
    tracks: [
      { name: "displayMode", type: "select", data: [{ label: "Expanded", value: "EXPANDED" }] },
    ],
  };

  const axis = (name: string) => ({
    name,
    type: "conditional",
    test_param: { name: "type", type: "select", data: [{ label: "Date", value: "d" }] },
    cases: [
      { value: "auto", inputs: [] },
      {
        value: "d",
        inputs: [{ name: "precision", type: "select", data: [{ label: "Day", value: "day" }] }],
      },
      { value: "f", inputs: [{ name: "precision", type: "integer" }] },
    ],
  });

  const HEATMAP = { name: "heatmap", settings: [axis("x_axis_type"), axis("y_axis_type")] };

  const NESTED = {
    name: "deep",
    settings: [
      {
        name: "outer",
        type: "conditional",
        test_param: { name: "outer_mode", type: "select", data: [{ label: "A", value: "a" }] },
        cases: [
          {
            value: "a",
            inputs: [
              {
                name: "middle",
                type: "conditional",
                test_param: { name: "middle_mode", type: "select", data: [] },
                cases: [
                  {
                    value: "m",
                    inputs: [
                      {
                        name: "inner",
                        type: "conditional",
                        test_param: { name: "inner_mode", type: "select", data: [] },
                        cases: [
                          {
                            value: "p",
                            inputs: [{ name: "leaf", type: "data_table", tables: ["p"] }],
                          },
                          {
                            value: "q",
                            inputs: [{ name: "leaf", type: "data_json", url: "https://q" }],
                          },
                        ],
                      },
                    ],
                  },
                  {
                    value: "n",
                    inputs: [{ name: "leaf", type: "data_json", url: "https://n" }],
                  },
                ],
              },
            ],
          },
          { value: "b", inputs: [{ name: "middle", type: "text" }] },
        ],
      },
    ],
  };

  const HG19 = {
    label: "Human hg19",
    value: {
      id: "hg19",
      columns: ["value", "name"],
      row: ["hg19", "Human hg19"],
      table: "fasta_indexes",
    },
  };

  function options(args: Json, charts = fakeCharts([HG19]), plugin: Json = IGV) {
    return call(
      "get_visualization_options",
      fakeGalaxy(() => plugin),
      { visualization: plugin.name, ...args },
      charts,
    );
  }

  const builtin = { settings: { source: { origin: "builtin" } } };

  it("refuses a name declared in several cases rather than guessing", async () => {
    const out = refused(await options({ parameter: "settings.source.genome" }));
    expect(out).toContain('"settings.source" selects its inputs by "origin"');
    expect(out).toContain('"igv"');
    expect(out).toContain('"builtin"');
  });

  it("names each case as the form names it", async () => {
    const out = refused(await options({ parameter: "settings.source.genome" }));
    expect(out).toContain('"igv" (IGV)');
    expect(out).toContain('"builtin" (Built in)');
  });

  it("shows the config to send, not only its values", async () => {
    const out = refused(await options({ parameter: "settings.source.genome" }));
    expect(out).toContain('config={"settings":{"source":{"origin":"<value>"}}}');
  });

  it("names a path once however many cases declare it", async () => {
    const out: string = refused(await options({ parameter: "genome" }));
    expect(out.split("settings.source.genome").length - 1).toBe(1);
  });

  it("lets the config select the case and so the source", async () => {
    const out = await options({ parameter: "settings.source.genome", config: builtin });
    expect(out.source).toBe("data_table");
    expect(out.parameter).toBe("settings.source.genome");
  });

  it("refuses a path not rooted at a group", async () => {
    expect(refused(await options({ parameter: "source.genome", config: builtin }))).toContain(
      "is not a parameter path",
    );
  });

  it("lists each option by the id that chooses it, without its entry", async () => {
    const out = await options({ parameter: "settings.source.genome", config: builtin });
    expect(out.options[0]).toEqual({ id: "hg19", name: HG19.label });
  });

  it("lists the scalar itself as the value of a select over scalars", async () => {
    const out = await options(
      { parameter: "tracks.displayMode" },
      fakeCharts([{ label: "Expanded", value: "EXPANDED" }]),
    );
    expect(out.options[0]).toEqual({ id: "EXPANDED", name: "Expanded" });
    expect(out.source).toBe("declared");
    expect(out.total).toBe(1);
  });

  it("answers a search with its matches alone", async () => {
    const out = await options({
      parameter: "settings.source.genome",
      config: builtin,
      search: "hg19",
    });
    expect(out.matches).toEqual([{ id: "hg19", name: HG19.label }]);
    expect(out).not.toHaveProperty("options");
  });

  it("asks the resolver for the declared input it found", async () => {
    const charts = fakeCharts([HG19]);
    await options({ parameter: "settings.source.genome", config: builtin }, charts);
    const { input, context: asked } = charts.asked[0];
    expect(input.type).toBe("data_table");
    expect(input.tables).toEqual(["fasta_indexes"]);
    expect(asked).toHaveProperty("datasetId");
  });

  it("names the other cases when this one holds nothing", async () => {
    const out = await options(
      { parameter: "settings.source.genome", config: builtin },
      fakeCharts([]),
    );
    expect(out.other_cases).toEqual(["igv"]);
    expect(out.total).toBe(0);
    expect(out.hint).toContain("try one of those");
  });

  it("resolves a test parameter without a branch", async () => {
    const out = await options(
      { parameter: "settings.source.origin" },
      fakeCharts([{ label: "Built in", value: "builtin" }]),
    );
    expect(out.source).toBe("declared");
    expect(out.options[0].id).toBe("builtin");
  });

  it("holds nothing deeper than a test parameter", async () => {
    expect(refused(await options({ parameter: "settings.source.origin.nope" }))).toContain(
      "holds nothing named",
    );
  });

  it("tells sibling conditionals apart by the path", async () => {
    const charts = fakeCharts([{ label: "Day", value: "day" }]);
    for (const axisName of ["x_axis_type", "y_axis_type"]) {
      const out = await options(
        {
          parameter: `settings.${axisName}.precision`,
          config: { settings: { [axisName]: { type: "d" } } },
        },
        charts,
        HEATMAP,
      );
      expect(out.parameter).toBe(`settings.${axisName}.precision`);
      expect(out.source).toBe("declared");
    }
  });

  it("keeps the same case value in both siblings unambiguous", async () => {
    const charts = fakeCharts([]);
    const config = { settings: { x_axis_type: { type: "f" }, y_axis_type: { type: "d" } } };
    await options({ parameter: "settings.x_axis_type.precision", config }, charts, HEATMAP);
    const y = await options(
      { parameter: "settings.y_axis_type.precision", config },
      charts,
      HEATMAP,
    );
    expect(charts.asked[0].input.type).toBe("integer");
    expect(charts.asked[1].input.type).toBe("select");
    expect(y.parameter).toBe("settings.y_axis_type.precision");
  });

  it("refuses a leaf name under two conditionals with both paths", async () => {
    const out = refused(await options({ parameter: "precision" }, fakeCharts(), HEATMAP));
    expect(out).toContain("is not a parameter path");
    expect(out).toContain("settings.x_axis_type.precision");
    expect(out).toContain("settings.y_axis_type.precision");
  });

  it("reads a branch at every level of a nested path", async () => {
    const charts = fakeCharts([HG19]);
    const out = await options(
      {
        parameter: "settings.outer.middle.leaf",
        config: { settings: { outer: { outer_mode: "a", middle: { middle_mode: "n" } } } },
      },
      charts,
      NESTED,
    );
    expect(out.parameter).toBe("settings.outer.middle.leaf");
    expect(charts.asked[0].input.type).toBe("data_json");
  });

  it("refuses a nested path missing the inner branch", async () => {
    const out = refused(
      await options(
        {
          parameter: "settings.outer.middle.leaf",
          config: { settings: { outer: { outer_mode: "a" } } },
        },
        fakeCharts(),
        NESTED,
      ),
    );
    expect(out).toContain('"settings.outer.middle" selects its inputs by "middle_mode"');
    expect(out).toContain('"m"');
    expect(out).toContain('"n"');
  });

  it("resolves three conditional levels by the same recursion", async () => {
    const charts = fakeCharts([HG19]);
    const out = await options(
      {
        parameter: "settings.outer.middle.inner.leaf",
        config: {
          settings: {
            outer: { outer_mode: "a", middle: { middle_mode: "m", inner: { inner_mode: "q" } } },
          },
        },
      },
      charts,
      NESTED,
    );
    expect(out.parameter).toBe("settings.outer.middle.inner.leaf");
    expect(charts.asked[0].input.url).toBe("https://q");
  });

  it("names the innermost missing selector", async () => {
    const out = refused(
      await options(
        {
          parameter: "settings.outer.middle.inner.leaf",
          config: { settings: { outer: { outer_mode: "a", middle: { middle_mode: "m" } } } },
        },
        fakeCharts(),
        NESTED,
      ),
    );
    expect(out).toContain('"settings.outer.middle.inner" selects its inputs by "inner_mode"');
    expect(out).toContain('"p"');
    expect(out).toContain('"q"');
  });

  it("reaches a deep test parameter", async () => {
    const out = await options(
      {
        parameter: "settings.outer.middle.inner.inner_mode",
        config: { settings: { outer: { outer_mode: "a", middle: { middle_mode: "m" } } } },
      },
      fakeCharts([{ label: "Q", value: "q" }]),
      NESTED,
    );
    expect(out.parameter).toBe("settings.outer.middle.inner.inner_mode");
    expect(out.source).toBe("declared");
  });

  it("reaches a plain input an outer branch declares", async () => {
    const out = await options(
      { parameter: "settings.outer.middle", config: { settings: { outer: { outer_mode: "b" } } } },
      fakeCharts([]),
      NESTED,
    );
    expect(out.parameter).toBe("settings.outer.middle");
  });

  it("refuses a parameter the plugin does not declare", async () => {
    expect(refused(await options({ parameter: "nonsense" }))).toContain("is not a parameter path");
    expect(refused(await options({ parameter: "settings" }))).toContain("is not a parameter path");
  });

  it("refuses a path naming an input the group lacks", async () => {
    expect(refused(await options({ parameter: "settings.nonsense" }))).toContain(
      'declares nothing named "nonsense"',
    );
  });

  it("holds nothing deeper than a plain input", async () => {
    expect(refused(await options({ parameter: "settings.locus.inner" }))).toContain(
      "holds nothing named",
    );
  });

  it("says what to name instead of a conditional named alone", async () => {
    const out = refused(await options({ parameter: "settings.source" }));
    expect(out).toContain("is a conditional");
    expect(out).toContain("origin");
  });

  it("reports a failed lookup rather than showing no options", async () => {
    const out = refused(
      await options(
        { parameter: "settings.source.genome", config: builtin },
        fakeCharts([], { message: "no route to host" }),
      ),
    );
    expect(out).toContain("Could not resolve");
    expect(out).toContain("no route to host");
  });

  it("says how to narrow the list when browsing", async () => {
    const out = await options({ parameter: "settings.source.genome", config: builtin });
    expect(out.hint).toContain("search");
  });

  it("says nothing about siblings when a case has options", async () => {
    const out = await options({ parameter: "settings.source.genome", config: builtin });
    expect(out.total).toBe(1);
    expect(out).not.toHaveProperty("other_cases");
  });

  const BOOLEAN_CASE = {
    name: "mode",
    type: "conditional",
    test_param: { name: "advanced", type: "boolean" },
    cases: [
      {
        value: "true",
        inputs: [{ name: "depth", type: "select", data: [{ label: "Deep", value: "d" }] }],
      },
      { value: "false", inputs: [] },
    ],
  };
  const BOOLEAN = { name: "b", settings: [BOOLEAN_CASE] };
  const TYPES = {
    boolean: { stores: { type: "boolean" } },
    select: { stores: { type: "string" } },
  };

  it("selects a boolean case by either representation", async () => {
    for (const stored of ["true", true]) {
      const out = await options(
        {
          parameter: "settings.mode.depth",
          config: { settings: { mode: { advanced: stored } } },
        },
        fakeCharts([{ label: "Deep", value: "d" }]),
        BOOLEAN,
      );
      expect(out.parameter).toBe("settings.mode.depth");
    }
  });

  it("reads a case value the same way in the save validator", () => {
    const entry = { mode: { advanced: true, depth: "d" } };
    const { hit, problem } = resolveParameter(BOOLEAN, "settings.mode.depth", { settings: entry });
    expect(hit).toBeTruthy();
    expect(problem).toBeNull();
    expect(checkLevel(entry, [BOOLEAN_CASE], "settings")).toBeNull();
  });

  it("validates a test parameter as a case label", () => {
    for (const stored of ["true", true, "false"]) {
      const entry = { mode: { advanced: stored, ...(stored !== "false" ? { depth: "d" } : {}) } };
      expect(checkLevel(entry, [BOOLEAN_CASE], "settings")).toBeNull();
    }
  });

  it("refuses a test parameter holding no declared label", () => {
    const bad = checkLevel({ mode: { advanced: "maybe" } }, [BOOLEAN_CASE], "settings");
    expect(bad?.error).toContain("selects the case");
    expect(bad?.error).toContain('"true"');
    expect(bad?.error).toContain('"false"');
  });
});

describe("get_visualization", () => {
  const SAVED = {
    id: "v1",
    type: "igv",
    title: "Peptide tracks",
    latest_revision: {
      config: {
        dataset_id: "d1",
        settings: { locus: "chr1:100-200" },
        tracks: [{ urlDataset: { id: "d1" }, name: "genes" }],
      },
    },
  };

  const read = (saved: Json) =>
    call(
      "get_visualization",
      fakeGalaxy(() => saved),
      { visualization_id: "v1" },
    );

  it("returns the current settings and tracks", async () => {
    const out = await read(SAVED);
    expect(out.visualization).toBe("igv");
    expect(out.dataset_id).toBe("d1");
    expect(out.settings).toEqual({ locus: "chr1:100-200" });
    expect(out.tracks).toEqual([{ urlDataset: { id: "d1" }, name: "genes" }]);
  });

  it("says a write replaces rather than merges", async () => {
    expect((await read(SAVED)).hint).toContain("dropped");
  });

  it("reads a visualization with no config yet as empty, not missing", async () => {
    const out = await read({ id: "v1", type: "igv", latest_revision: {} });
    expect(out.settings).toEqual({});
    expect(out.tracks).toEqual([]);
    expect(out).not.toHaveProperty("error");
  });

  it("refuses an unknown visualization", async () => {
    expect(refused(await read({}))).toContain("No saved visualization");
  });
});

describe("show_visualization and save_visualization", () => {
  const INSTALLED = [{ name: "atlas" }, { name: "aladin" }];

  /** A server holding atlas and aladin, with `plugins` answering per-plugin declarations. */
  function server(compatible = ["atlas"], plugins: Record<string, Json> = {}) {
    return fakeGalaxy((path) => {
      if (path.startsWith("api/datasets/")) return { extension: "tabular", name: "sample.tabular" };
      if (path === "api/visualizations/v9")
        return {
          id: "v9",
          type: "atlas",
          title: "Atlas of samples",
          latest_revision: {
            config: { dataset_id: "d1", settings: { old: 1 }, transcripts: [{ role: "user" }] },
          },
        };
      if (path === "api/visualizations/s1") return { id: "s1", type: "olit" };
      if (path === "api/visualizations/p9")
        return {
          id: "p9",
          type: "plotly",
          title: "Amino Acids Plotly",
          latest_revision: {
            config: {
              dataset_id: "d1",
              tracks: [{ name: "Hydrophobicity", label: "auto", x: "0", y: "1" }],
              transcripts: [{ role: "user" }],
            },
          },
        };
      const declared = path.match(/^api\/plugins\/(.+)$/);
      if (declared) return plugins[declared[1]] ?? [];
      if (path.startsWith("api/plugins?")) return compatible.map((n) => ({ name: n }));
      if (path === "api/plugins")
        return [...INSTALLED, ...compatible.filter((n) => n !== "atlas").map((n) => ({ name: n }))];
      return [];
    });
  }

  type Server = ReturnType<typeof server>;

  const show = (g: Server, args: Json, charts = fakeCharts()) =>
    call("show_visualization", g, { dataset_id: "d1", ...args }, charts);
  const save = (g: Server, args: Json, charts = fakeCharts()) =>
    call("save_visualization", g, { dataset_id: "d1", ...args }, charts);

  it("puts nothing in galaxy when showing", async () => {
    const g = server();
    expect((await show(g, { visualization: "atlas" })).shown).toBe(true);
    expect(g.posted).toBeUndefined();
  });

  const PLOTLY = {
    name: "plotly",
    tracks: [
      { name: "x", type: "data_column", is_auto: "true" },
      { name: "y", type: "data_column", is_number: "true" },
    ],
  };
  const plotly = () => server(["plotly"], { plotly: PLOTLY });
  const columns = () =>
    fakeCharts([
      { label: "Column: 1", value: "0" },
      { label: "Column: 2", value: "1" },
    ]);
  const both = [
    [show, "shown"],
    [save, "saved"],
  ] as const;

  it("shows and saves the same config, saving only adding where it is kept", async () => {
    const config = { visualization: "plotly", title: "Hydrophobicity", tracks: [{ y: "1" }] };
    const shown = await show(plotly(), config, columns());
    const g = plotly();
    const saved = await save(g, config, columns());
    expect(shown.artifact).toEqual({
      kind: "visualization",
      title: "Hydrophobicity",
      visualization: "plotly",
      dataset_id: "d1",
      tracks: [{ x: "auto", y: "1" }],
    });
    expect(saved.artifact).toEqual({ ...shown.artifact, visualization_id: "v1" });
    expect(g.posted![1].config).toEqual({ dataset_id: "d1", tracks: [{ x: "auto", y: "1" }] });
  });

  describe("a config stored as galaxy-charts resolves it", () => {
    // Galaxy's /api/plugins/plotly, as the plotly plugin declares its inputs.
    const DEPLOYED = {
      name: "plotly",
      settings: [
        { name: "stack_bar", type: "boolean", value: "false" },
        { name: "stack_lines", type: "boolean", value: "false" },
        { name: "x_axis_label", type: "text", value: "X-axis" },
        { name: "y_axis_label", type: "text", value: "Y-axis" },
      ],
      tracks: [
        { name: "color", type: "color" },
        {
          name: "type",
          type: "select",
          value: "bar",
          data: [
            { label: "Bar", value: "bar" },
            { label: "Lines", value: "lines" },
            { label: "Scatter", value: "scatter" },
          ],
        },
        { name: "name", type: "text", value: "Track label" },
        { name: "label", type: "data_column", is_auto: "true" },
        { name: "x", type: "data_column", is_auto: "true" },
        { name: "y", type: "data_column", is_number: "true" },
      ],
    };
    const deployed = () => server(["plotly"], { plotly: DEPLOYED });
    const aminos = () =>
      fakeCharts([
        { label: "Column: Default", value: "auto" },
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ label: `Column: ${i + 1}`, value: String(i) })),
      ]);
    /** What each tool stored: the artifact shown, and for a save the config Galaxy was sent. */
    async function stored(args: Json) {
      const shown = (await show(deployed(), { visualization: "plotly", ...args }, aminos()))
        .artifact;
      const g = deployed();
      const saved = (await save(g, { visualization: "plotly", ...args }, aminos())).artifact;
      return { shown, saved, sent: g.posted![1].config };
    }

    it("fills a default the config leaves out, the same when shown and saved", async () => {
      const { shown, saved, sent } = await stored({
        tracks: [{ name: "Buried", type: "bar", x: "0", y: "5" }],
      });
      const track = { name: "Buried", type: "bar", label: "auto", x: "0", y: "5" };
      const settings = {
        stack_bar: false,
        stack_lines: false,
        x_axis_label: "X-axis",
        y_axis_label: "Y-axis",
      };
      for (const config of [shown, saved, sent]) {
        expect(config.tracks).toEqual([track]);
        expect(config.settings).toEqual(settings);
      }
    });

    it("keeps every value the config gives, the same when shown and saved", async () => {
      const track = {
        color: "#ED8282",
        type: "lines",
        name: "Flexibility",
        label: "0",
        x: "0",
        y: "3",
      };
      const settings = {
        stack_bar: true,
        stack_lines: false,
        x_axis_label: "Aminoacid",
        y_axis_label: "Property",
      };
      const { shown, saved, sent } = await stored({ settings, tracks: [track] });
      for (const config of [shown, saved, sent]) {
        expect(config.tracks).toEqual([track]);
        expect(config.settings).toEqual(settings);
      }
    });

    it("keeps what the plugin stored outside settings and tracks when revising", async () => {
      const g = deployed();
      await save(
        g,
        {
          visualization: "plotly",
          visualization_id: "p9",
          tracks: [
            { name: "Hydrophobicity", label: "auto", x: "0", y: "1" },
            { name: "Buried", x: "0", y: "5" },
          ],
        },
        aminos(),
      );
      const [, body] = g.putTo!;
      expect(body.config.transcripts).toEqual([{ role: "user" }]);
      expect(body.config.dataset_id).toBe("d1");
      expect(body.config.tracks[1]).toEqual({
        name: "Buried",
        type: "bar",
        label: "auto",
        x: "0",
        y: "5",
      });
      expect(body.title).toBe("Amino Acids Plotly");
    });

    it("names every column the published plotly reads before it plots anything", async () => {
      // Plotly 0.0.30's galaxy-charts fills no defaults: a track missing one of these plots nothing.
      const { saved, sent } = await stored({
        tracks: [
          { name: "Hydrophobicity", label: "auto", x: "0", y: "1" },
          { name: "Buried", x: "0", y: "5" },
          { name: "Helix", y: "6" },
        ],
      });
      for (const config of [saved, sent]) {
        for (const track of config.tracks) {
          for (const column of ["label", "x", "y"]) {
            expect(typeof track[column] === "string" && track[column].trim() !== "").toBe(true);
          }
        }
      }
    });
  });

  it("refuses either way a config that leaves the viewer to pick a column", async () => {
    for (const [run, key] of both) {
      for (const args of [{}, { tracks: [{ x: "0" }] }, { tracks: [{ y: "1" }, {}] }]) {
        const g = plotly();
        const out = refused(await run(g, { visualization: "plotly", ...args }, columns()));
        expect(out[key]).toBe(false);
        expect(out.error).toMatch(/needs tracks\[\d\]\.y/);
        expect(out.hint).toContain("get_visualization_options");
        expect(g.posted).toBeUndefined();
      }
    }
  });

  it("validates a shown config as a saved one is", async () => {
    const out = refused(
      await show(igv(), { visualization: "igv", tracks: [{ dataset_id: "d1" }] }),
    );
    expect(out.shown).toBe(false);
    expect(out.declared).toContain("urlDataset");
    const unoffered = refused(
      await show(plotly(), { visualization: "plotly", tracks: [{ y: "9" }] }, columns()),
    );
    expect(unoffered.shown).toBe(false);
    expect(unoffered.error).toContain("which this server does not offer");
  });

  it("refuses a visualization the server does not have either way", async () => {
    for (const [run, key] of [
      [show, "shown"],
      [save, "saved"],
    ] as const) {
      const g = server();
      const out = await run(g, { visualization: "not_installed" });
      expect(out[key]).toBe(false);
      expect(g.posted).toBeUndefined();
      expect(out.error).toContain("not an installed visualization");
    }
  });

  it("refuses an installed visualization that cannot render the dataset either way", async () => {
    for (const [run, key] of [
      [show, "shown"],
      [save, "saved"],
    ] as const) {
      const g = server(["atlas"]);
      const out = await run(g, { visualization: "aladin" });
      expect(out[key]).toBe(false);
      expect(g.posted).toBeUndefined();
      expect(out.can_render_it).toEqual(["atlas"]);
    }
  });

  it("records the dataset in the saved config", async () => {
    const g = server();
    expect((await save(g, { visualization: "atlas", title: "A table" })).saved).toBe(true);
    const [path, body] = g.posted!;
    expect(path).toBe("api/visualizations");
    expect(body.type).toBe("atlas");
    expect(body.title).toBe("A table");
    expect(body.config).toEqual({ dataset_id: "d1" });
  });

  it("falls back to the dataset name for a missing title", async () => {
    const g = server();
    await save(g, { visualization: "atlas" });
    expect(g.posted![1].title).toBe("atlas of sample.tabular");
    expect((await show(server(), { visualization: "atlas" })).title).toBe(
      "atlas of sample.tabular",
    );
  });

  it("carries settings and tracks into the saved config", async () => {
    const g = server();
    await save(g, {
      visualization: "atlas",
      settings: { x_axis_label: "Time" },
      tracks: [{ x: "1" }],
    });
    expect(g.posted![1].config.settings).toEqual({ x_axis_label: "Time" });
    expect(g.posted![1].config.tracks).toEqual([{ x: "1" }]);
  });

  it("revises a saved visualization rather than duplicating it", async () => {
    const g = server();
    const out = await save(g, {
      visualization: "atlas",
      visualization_id: "v9",
      settings: { x_axis_label: "Time" },
    });
    expect(g.posted).toBeUndefined();
    const [path, body] = g.putTo!;
    expect(path).toBe("api/visualizations/v9");
    expect(body.config.settings).toEqual({ x_axis_label: "Time" });
    expect(out.visualization_id).toBe("v9");
    expect(out.artifact).toMatchObject({ visualization: "atlas", visualization_id: "v9" });
  });

  it("keeps what the plugin stored and the title when revising, replacing only settings and tracks", async () => {
    const g = server();
    const out = await save(g, {
      visualization: "atlas",
      visualization_id: "v9",
      settings: { x_axis_label: "Time" },
    });
    const [, body] = g.putTo!;
    expect(body.config).toEqual({
      dataset_id: "d1",
      settings: { x_axis_label: "Time" },
      transcripts: [{ role: "user" }],
    });
    expect(body.title).toBe("Atlas of samples");
    expect(out.artifact.title).toBe("Atlas of samples");
  });

  it("refuses to overwrite a visualization of another type, such as a saved Olit session", async () => {
    const g = server();
    const out = await save(g, { visualization: "atlas", visualization_id: "s1" });
    expect(refused(out)).toContain('is a "olit", not a "atlas"');
    expect(g.putTo).toBeUndefined();
  });

  it("refuses to save Olit itself", async () => {
    const out = await save(server(), { visualization: "olit" });
    expect(out).toMatchObject({ saved: false });
    expect(out.error).toContain("not an installed visualization");
  });

  it("hands back a config, leaving the address to whoever renders it", async () => {
    const out = await save(server(), { visualization: "atlas" });
    expect(out.artifact).not.toHaveProperty("url");
  });

  it("refuses when galaxy returns no id for a new visualization", async () => {
    const g = server();
    g.post = async () => ({});
    expect(refused(await save(g, { visualization: "atlas" }))).toContain("returned no id");
  });

  const IGV = {
    name: "igv",
    settings: [{ name: "locus", type: "text" }],
    tracks: [
      { name: "urlDataset", type: "data" },
      { name: "displayMode", type: "select" },
    ],
  };
  const igv = (plugin: Json = IGV) => server(["igv"], { igv: plugin });

  it("refuses a track key the plugin does not declare", async () => {
    const g = igv();
    const out = refused(await save(g, { visualization: "igv", tracks: [{ dataset_id: "d1" }] }));
    expect(out.saved).toBe(false);
    expect(g.posted).toBeUndefined();
    expect(out.error).toContain("dataset_id");
    expect(out.declared).toContain("urlDataset");
    expect(out.hint).toContain("get_visualization_details");
  });

  it("accepts the declared track key", async () => {
    const g = igv();
    const out = await save(
      g,
      { visualization: "igv", tracks: [{ urlDataset: { id: "d1" }, displayMode: "EXPANDED" }] },
      fakeCharts([{ label: "d1", value: { id: "d1" } }]),
    );
    expect(out.saved).toBe(true);
    expect(g.posted).toBeDefined();
  });

  it("does not treat a plugin declaring nothing as allowing nothing", async () => {
    expect(
      (await save(server(), { visualization: "atlas", settings: { anything: 1 } })).saved,
    ).toBe(true);
  });

  it("refuses settings sent as a list", async () => {
    const g = igv();
    const out = refused(
      await save(g, { visualization: "igv", settings: [{ locus: "chr1:1-100" }] }),
    );
    expect(out.saved).toBe(false);
    expect(g.posted).toBeUndefined();
    expect(out.error).toContain("one object keyed by parameter name");
  });

  it("refuses a bare id for an object-valued parameter", async () => {
    const g = igv({ ...IGV, settings: [{ name: "genome", type: "data" }] });
    const out = refused(await save(g, { visualization: "igv", settings: { genome: "hg38" } }));
    expect(out.saved).toBe(false);
    expect(g.posted).toBeUndefined();
    expect(out.error).toContain('takes an entry, {"id": ...}');
    expect(out.expected.required).toEqual(["id"]);
    expect(out.hint).toContain("get_visualization_options");
  });

  const CONDITIONAL = {
    name: "igv",
    settings: [
      { name: "locus", type: "text" },
      {
        name: "source",
        type: "conditional",
        test_param: { name: "origin", type: "select" },
        cases: [
          { value: "igv", inputs: [{ name: "genome", type: "data_json" }] },
          { value: "builtin", inputs: [{ name: "dbkey", type: "data_table" }] },
        ],
      },
    ],
  };

  it("refuses a conditional's parameters flattened beside it", async () => {
    const g = igv(CONDITIONAL);
    const out = refused(
      await save(g, {
        visualization: "igv",
        settings: { locus: "chr1:1-2", origin: "igv", genome: { id: "hg38" } },
      }),
    );
    expect(out.saved).toBe(false);
    expect(g.posted).toBeUndefined();
    expect(out.error).toContain("declares no parameter");
    expect(out.declared).toEqual(["locus", "source"]);
  });

  it("accepts the nested form", async () => {
    const g = igv(CONDITIONAL);
    const out = await save(
      g,
      {
        visualization: "igv",
        settings: { locus: "chr1:1-2", source: { origin: "igv", genome: { id: "hg38" } } },
      },
      fakeCharts([{ label: "hg38", value: { id: "hg38" } }]),
    );
    expect(out.saved).toBe(true);
    expect(g.posted![1].config.settings.source.genome).toEqual({ id: "hg38" });
  });

  it("allows a case parameter only for the chosen case", async () => {
    const out = refused(
      await save(igv(CONDITIONAL), {
        visualization: "igv",
        settings: { source: { origin: "builtin", genome: { id: "hg19" } } },
      }),
    );
    expect(out.saved).toBe(false);
    expect(out.error).toContain("genome");
  });

  it("refuses a case label the conditional does not declare", async () => {
    const out = refused(
      await save(igv(CONDITIONAL), {
        visualization: "igv",
        settings: { source: { origin: "remote" } },
      }),
    );
    expect(out.saved).toBe(false);
    expect(out.error).toContain("selects the case");
    expect(out.error).toContain('"igv"');
    expect(out.error).toContain('"builtin"');
  });

  it("hands back the config a page embeds, from both tools", async () => {
    const g = server();
    const shown = (await show(g, { visualization: "atlas" })).artifact as Artifact;
    expect(shown).toEqual({
      kind: "visualization",
      title: shown.title,
      visualization: "atlas",
      dataset_id: "d1",
    });
    const saved = await save(g, { visualization: "atlas" });
    expect(saved.artifact).toMatchObject({
      visualization: "atlas",
      dataset_id: "d1",
      visualization_id: saved.visualization_id,
    });
    const page = JSON.parse(
      toPage(saved.artifact)!.slice("```visualization\n".length, -"\n```".length),
    );
    expect(page).toEqual({
      visualization_name: "atlas",
      visualization_title: saved.title,
      dataset_id: "d1",
    });
  });

  it("refuses the entry a scalar parameter was chosen from", async () => {
    const g = igv({
      name: "igv",
      tracks: [
        { name: "type", type: "select" },
        { name: "x", type: "data_column" },
      ],
    });
    const out = refused(
      await save(g, { visualization: "igv", tracks: [{ type: { value: "scatter" } }] }),
    );
    expect(out.saved).toBe(false);
    expect(g.posted).toBeUndefined();
    expect(out.error).toContain("stores string");
    expect(out.error).toContain("not an entry");

    const column = refused(
      await save(g, { visualization: "igv", tracks: [{ x: { column: "col2", src: "hda" } }] }),
    );
    expect(column.saved).toBe(false);

    const charts = fakeCharts([{ label: "c2", value: "2" }]);
    expect(
      (await save(g, { visualization: "igv", tracks: [{ type: "scatter", x: "2" }] }, charts))
        .saved,
    ).toBe(true);
  });

  it("refuses a column value outside the pattern its type stores", async () => {
    const g = igv({ name: "igv", tracks: [{ name: "x", type: "data_column" }] });
    const out = refused(await save(g, { visualization: "igv", tracks: [{ x: "col2" }] }));
    expect(out.error).toContain('"x" stores string:');
  });

  it("refuses a select value the plugin does not declare", async () => {
    const g = igv({
      name: "igv",
      tracks: [{ name: "type", type: "select", data: [{ label: "Bar", value: "bar" }] }],
    });
    const out = refused(await save(g, { visualization: "igv", tracks: [{ type: "scatter" }] }));
    expect(out.error).toBe('Refused: "type" takes one of "bar", not "scatter".');
    expect(g.posted).toBeUndefined();
    expect((await save(g, { visualization: "igv", tracks: [{ type: "bar" }] })).saved).toBe(true);
  });

  it("refuses a number outside the bounds the plugin declares", async () => {
    const g = igv({
      name: "igv",
      settings: [{ name: "width", type: "integer", min: "1", max: "9" }],
    });
    const out = refused(await save(g, { visualization: "igv", settings: { width: 12 } }));
    expect(out.error).toBe('Refused: "width" takes a number from 1 to 9; got 12.');
    expect((await save(g, { visualization: "igv", settings: { width: 9 } })).saved).toBe(true);
  });

  it("names the conditional a misplaced parameter belongs beside", async () => {
    const g = igv({
      name: "igv",
      settings: [
        {
          name: "mode",
          type: "conditional",
          test_param: { name: "kind", type: "select", value: "a" },
          cases: [{ value: "a", inputs: [] }],
        },
      ],
    });
    const out = refused(
      await save(g, { visualization: "igv", settings: { mode: { kind: "a", depth: 1 } } }),
    );
    expect(out.error).toBe('Refused: mode declares no parameter "depth".');
  });

  const OFFERED_MM10 = {
    id: "mm10",
    name: "Mouse (GRCm38/mm10)",
    fastaURL: "https://s3.amazonaws.com/igv.broadinstitute.org/genomes/seq/mm10/mm10.fa",
    tracks: [{ name: "Refseq Genes", format: "refgene" }],
  };
  const INVENTED_MM10 = {
    id: "mm10",
    name: "Mouse (GRCm38/mm10)",
    fastaURL: "https://igv-genepattern-org.s3.amazonaws.com/genomes/seq/mm10/mm10.fa",
    tracks: [],
  };

  const igvGenome = (g: Server, charts: ReturnType<typeof fakeCharts>, genome: Json) =>
    save(g, { visualization: "igv", settings: { source: { origin: "igv", genome } } }, charts);

  it("saves a genome the server offers", async () => {
    const g = igv(CONDITIONAL);
    const out = await igvGenome(
      g,
      fakeCharts([{ label: "mm10", value: OFFERED_MM10 }]),
      OFFERED_MM10,
    );
    expect(out.saved).toBe(true);
    expect(g.posted![1].config.settings.source.genome).toEqual(OFFERED_MM10);
  });

  it("stores the offered entry for a genome written from memory, as the form would", async () => {
    const g = igv(CONDITIONAL);
    const out = await igvGenome(
      g,
      fakeCharts([{ label: "mm10", value: OFFERED_MM10 }]),
      INVENTED_MM10,
    );
    expect(out.saved).toBe(true);
    expect(g.posted![1].config.settings.source.genome).toEqual(OFFERED_MM10);
  });

  it("stores the whole entry an id alone chooses", async () => {
    const g = igv(CONDITIONAL);
    const out = await igvGenome(g, fakeCharts([{ label: "mm10", value: OFFERED_MM10 }]), {
      id: "mm10",
    });
    expect(out.saved).toBe(true);
    expect(g.posted![1].config.settings.source.genome).toEqual(OFFERED_MM10);
  });

  it("shows the whole entry an id alone chooses", async () => {
    const out = await show(
      igv(CONDITIONAL),
      { visualization: "igv", settings: { source: { origin: "igv", genome: { id: "mm10" } } } },
      fakeCharts([{ label: "mm10", value: OFFERED_MM10 }]),
    );
    expect(out.shown).toBe(true);
    expect(out.artifact.settings.source.genome).toEqual(OFFERED_MM10);
  });

  it("refuses a genome the server does not offer, naming it", async () => {
    const g = igv(CONDITIONAL);
    const out = refused(
      await igvGenome(g, fakeCharts([{ label: "mm10", value: OFFERED_MM10 }]), { id: "mm99" }),
    );
    expect(out.saved).toBe(false);
    expect(g.posted).toBeUndefined();
    expect(out.error).toBe(
      'Refused: source.genome names "mm99", which this server does not offer.',
    );
    expect(out.hint).toContain("get_visualization_options");
  });

  it("names the cases that might hold a value when this one offers nothing", async () => {
    const g = igv(CONDITIONAL);
    const out = refused(await igvGenome(g, fakeCharts([]), OFFERED_MM10));
    expect(out.saved).toBe(false);
    expect(g.posted).toBeUndefined();
    expect(out.error).toContain('origin="igv"');
    expect(out.hint).toContain("builtin");
    expect(out.other_cases).toEqual(["builtin"]);
  });

  it("refuses to save a value its options could not be read to check", async () => {
    const g = igv(CONDITIONAL);
    const out = refused(
      await igvGenome(g, fakeCharts([], { message: "no route to host" }), INVENTED_MM10),
    );
    expect(out.saved).toBe(false);
    expect(g.posted).toBeUndefined();
    expect(out.error).toBe(
      "Refused: source.genome could not be checked, because this server's options for it could " +
        "not be read (no route to host).",
    );
    expect(out.hint).toContain("unavailable, not the value wrong");
  });

  it("refuses to show it too, since showing renders the same config", async () => {
    const out = refused(
      await show(
        igv(CONDITIONAL),
        { visualization: "igv", settings: { source: { origin: "igv", genome: { id: "mm10" } } } },
        fakeCharts([], { message: "no route to host" }),
      ),
    );
    expect(out.shown).toBe(false);
    expect(out.error).toContain("could not be checked");
  });

  it("accepts the value an input holds by default", async () => {
    const g = igv({ name: "igv", tracks: [{ name: "x", type: "data_column", is_auto: "true" }] });
    const out = await save(
      g,
      { visualization: "igv", tracks: [{ x: "auto" }] },
      fakeCharts([{ label: "c1", value: "1" }]),
    );
    expect(out.saved).toBe(true);
  });

  it("drives the guard by the type contract, not by the plugin", async () => {
    const g = server(["atlas"], {
      atlas: {
        name: "atlas",
        settings: [{ name: "table", type: "data_table", tables: ["anything"] }],
      },
    });
    const offered = fakeCharts([{ label: "a", value: { id: "a", columns: ["path"] } }]);
    const stored = { table: { id: "a", columns: ["path"] } };
    expect((await save(g, { visualization: "atlas", settings: stored }, offered)).saved).toBe(true);
    const invented = refused(
      await save(g, { visualization: "atlas", settings: { table: { id: "b" } } }, offered),
    );
    expect(invented.saved).toBe(false);
    expect(offered.asked.map((a) => a.input.name)).toEqual(["table", "table"]);
  });

  const DEFAULTED = {
    name: "atlas",
    settings: [
      {
        name: "source",
        type: "conditional",
        test_param: { name: "origin", type: "select", value: "hosted" },
        cases: [
          { value: "hosted", inputs: [{ name: "entry", type: "data_table", tables: ["t"] }] },
          { value: "history", inputs: [{ name: "entry", type: "data", tables: [] }] },
        ],
      },
    ],
  };

  it("reads a config naming no case against the declared default", async () => {
    const offered = fakeCharts([{ label: "a", value: { id: "a" } }]);
    const out = await save(
      server(["atlas"], { atlas: DEFAULTED }),
      { visualization: "atlas", settings: { source: { entry: { id: "a" } } } },
      offered,
    );
    expect(out.saved).toBe(true);
    expect(offered.asked.map((a) => a.input.name)).toEqual(["entry"]);
  });

  it("still refuses a value outside the default case's options", async () => {
    const out = refused(
      await save(
        server(["atlas"], { atlas: DEFAULTED }),
        { visualization: "atlas", settings: { source: { entry: { id: "b" } } } },
        fakeCharts([{ label: "a", value: { id: "a" } }]),
      ),
    );
    expect(out.saved).toBe(false);
  });

  it("names the dataset a refusal's options were resolved with", async () => {
    const offered = [{ label: "tracks.bed", value: { id: "d1", name: "tracks.bed" } }];
    const asked: unknown[] = [];
    const charts: ResolveOptions = () => async (_input, ctx) => {
      asked.push(ctx.datasetId);
      return { success: true, data: ctx.datasetId ? offered : [] };
    };
    const g = igv({ name: "igv", tracks: [{ name: "urlDataset", type: "data" }] });
    const out = refused(
      await call(
        "save_visualization",
        g,
        { dataset_id: "d1", visualization: "igv", tracks: [{ urlDataset: { id: "d2" } }] },
        Object.assign(charts, { asked: [] }),
      ),
    );
    expect(asked).toEqual(["d1"]);
    expect(out.saved).toBe(false);
    expect(out.hint).toContain("1 value(s) are offered");
    expect(out.hint).toContain('dataset_id="d1"');
  });
});

describe("artifact claim", () => {
  const DATASET = "0f74b56904a59856";
  const galaxy = fakeGalaxy((path) => {
    if (path.startsWith("api/plugins")) return [{ name: "ngl", settings: [], tracks: [] }];
    if (path.startsWith("api/datasets/"))
      return { id: DATASET, name: "peptide.pdb", extension: "pdb" };
    return [];
  });

  async function dispatch(name: string, args: Json) {
    const ctx = context(galaxy);
    const tool = visualizationTools(fakeCharts()).find((t) => t.name === name)!;
    const text = rendered({ data: claim(await tool.run(args, ctx), ctx) });
    return { produced: ctx.artifacts.produced, data: JSON.parse(text).data };
  }

  it("routes a renderable artifact to the shell and only a reference to the model", async () => {
    const { produced, data } = await dispatch("show_visualization", {
      dataset_id: DATASET,
      visualization: "ngl",
    });
    expect(produced).toHaveLength(1);
    expect(produced[0].kind).toBe("visualization");
    expect(produced[0]).toMatchObject({ visualization: "ngl", dataset_id: DATASET });
    expect(data.artifact).toEqual({ kind: "visualization", title: data.title });
  });

  it("leaves a tool without an artifact untouched", async () => {
    const { produced, data } = await dispatch("list_visualizations", { dataset_id: DATASET });
    expect(produced).toEqual([]);
    expect(data).toHaveProperty("visualizations");
  });
});

describe("vega_dataset", () => {
  const DATASET = {
    id: "d1",
    name: "prices.tabular",
    state: "ok",
    metadata_columns: 2,
    metadata_column_names: [],
    metadata_column_types: ["str", "int"],
    metadata_delimiter: "\t",
    metadata_comment_lines: 0,
    metadata_data_lines: 10,
    file_size: 100,
  };
  const chart = (spec: unknown, dataset: Json = DATASET) =>
    call(
      "vega_dataset",
      fakeGalaxy(() => dataset),
      { dataset_id: "d1", spec },
    );

  it("charts a spec vega-lite compiles, carrying it as an artifact", async () => {
    const out = await chart({
      mark: "bar",
      encoding: {
        x: { field: "col:1", type: "nominal" },
        y: { field: "col:2", type: "quantitative" },
      },
    });
    expect(out.charted).toBe(true);
    expect(out.title).toBe("prices.tabular");
    expect(out.columns).toEqual(["col:1", "col:2"]);
    expect(out.artifact.kind).toBe("vega-lite");
    expect(out.artifact.spec.data.url).toBe("/api/datasets/d1/display");
    expect(out).not.toHaveProperty("note");
  });

  it("refuses a spec vega-lite rejects", async () => {
    const out = await chart({ mark: "nonsense" });
    expect(out.charted).toBe(false);
    expect(out.error).toContain("Refused: vega-lite rejects this spec");
  });

  it("refuses a spec the build refuses", async () => {
    const out = await chart({ mark: "point", data: { values: [] } });
    expect(out.charted).toBe(false);
    expect(out.error).toContain("Refused: the spec names its own data");
  });

  it("notes a quantitative encoding on a text column", async () => {
    const out = await chart({
      mark: "point",
      encoding: { x: { field: "col:1", type: "quantitative" } },
    });
    expect(out.charted).toBe(true);
    expect(out.note).toContain('Galaxy types "col:1" as text');
  });

  it("says how a chart goes into the record", async () => {
    const out = await chart({ mark: "point", encoding: { x: { field: "col:2" } } });
    expect(out.charted).toBe(true);
    expect(out.hint).toContain("{{artifact}}");
  });

  it("refuses a dataset galaxy cannot read", async () => {
    const out = await chart({ mark: "point" }, {});
    expect(out).toEqual({ charted: false, error: 'No dataset "d1" is readable.' });
  });
});

describe("galaxy-charts option resolution", () => {
  it("reaches galaxy through the session's client", async () => {
    const seen: string[] = [];
    const g = fakeGalaxy((path) => {
      seen.push(path);
      return { columns: ["name", "value"], fields: [["hg38", "hg38.fa"]] };
    });
    const out = await chartOptions(g as unknown as Galaxy, connectWeb())(
      { type: "data_table", tables: ["t1"] },
      {},
    );
    expect(seen).toEqual(["api/tool_data/t1"]);
    expect(out).toEqual({
      success: true,
      data: [{ label: "hg38", value: expect.objectContaining({ id: "hg38.fa" }) }],
    });
  });

  it("reports a request that could not be read", async () => {
    const g = fakeGalaxy(() => ({ history_id: null }));
    const out = await chartOptions(g as unknown as Galaxy, connectWeb())(
      { type: "data" },
      { datasetId: "d9" },
    );
    expect(out.success).toBe(false);
    expect(!out.success && out.message).toContain("d9");
  });

  it("reads a dataset once per tool call, and again in the next call", async () => {
    let reads = 0;
    const g = fakeGalaxy(() => {
      reads += 1;
      return { metadata_column_types: { 0: "int" } };
    });
    const call = chartOptions(g as unknown as Galaxy, connectWeb());
    await call({ type: "data_column" }, { datasetId: "d9" });
    await call({ type: "data_column", is_number: "true" }, { datasetId: "d9" });
    expect(reads).toBe(1);
    await chartOptions(g as unknown as Galaxy, connectWeb())(
      { type: "data_column" },
      { datasetId: "d9" },
    );
    expect(reads).toBe(2);
  });
});
