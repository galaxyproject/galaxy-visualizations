import { describe, expect, it } from "vitest";

import { buildVisualizationTemplate, pyJson, repr } from "./visualization-inputs";

const TYPES = {
  text: { stores: { type: "string" } },
  boolean: { stores: { type: "boolean" } },
  integer: { stores: { type: "integer" } },
  data_column: { stores: { type: "string" } },
  select: { stores: { type: "string" }, options: { kind: "declared", from: "options" } },
  data: { stores: { type: "object", required: ["id"] } },
  data_json: { stores: { type: "object", required: ["id"] } },
  conditional: { stores: { type: "object" } },
};

const PLOTLY = {
  settings: [
    { name: "stack_bar", type: "boolean" },
    { name: "x_axis_label", type: "text" },
  ],
  tracks: [
    {
      name: "type",
      type: "select",
      options: [
        { label: "Bar", value: "bar" },
        { label: "Lines", value: "lines" },
      ],
    },
    { name: "x", type: "data_column" },
  ],
};

const SOURCE = {
  name: "source",
  type: "conditional",
  test_param: { name: "origin", type: "select" },
  cases: [
    { value: "builtin", inputs: [{ name: "genome", type: "data" }] },
    { value: "igv", inputs: [{ name: "genome", type: "data_json" }] },
  ],
};

const IGV = {
  settings: [{ name: "locus", type: "text" }, SOURCE],
  tracks: [{ name: "urlDataset", type: "data" }],
};

const ENTRY = { "<from get_visualization_options>": true };

describe("a visualization config template", () => {
  it("gives a scalar input a bare placeholder, not an entry", () => {
    const template = buildVisualizationTemplate(PLOTLY, TYPES);
    expect(template.tracks[0].type).toBe("bar");
    expect(template.tracks[0].x).toBe("<value>");
    expect(template.settings).toEqual({ stack_bar: false, x_axis_label: "<value>" });
  });

  it("marks an entry-valued input as one", () => {
    expect(buildVisualizationTemplate(IGV, TYPES).tracks[0].urlDataset).toEqual(ENTRY);
  });

  it("nests a conditional's case rather than flattening it", () => {
    const { settings } = buildVisualizationTemplate(IGV, TYPES);
    expect(settings.source.origin).toBe("builtin");
    expect(settings.source.genome).toEqual(ENTRY);
    expect(settings).not.toHaveProperty(["source.origin"]);
    expect(settings).not.toHaveProperty("origin");
  });

  it("gives a plugin with no tracks no tracks key", () => {
    expect(buildVisualizationTemplate({ settings: [] }, TYPES)).not.toHaveProperty("tracks");
  });

  it("selects the case by the declared test value", () => {
    const plugin = { settings: [{ ...SOURCE, test_param: { name: "origin", value: "igv" } }] };
    const { source } = buildVisualizationTemplate(plugin, TYPES).settings;
    expect(source.origin).toBe("igv");
    expect(source.genome).toEqual(ENTRY);
  });

  it("lets case order decide only when nothing is declared", () => {
    expect(buildVisualizationTemplate(IGV, TYPES).settings.source.origin).toBe("builtin");
  });
});

describe("python spellings", () => {
  it("writes values as repr does", () => {
    expect(repr("a")).toBe("'a'");
    expect(repr("it's")).toBe(`"it's"`);
    expect(repr("\t")).toBe("'\\t'");
    expect(repr(null)).toBe("None");
    expect(repr({ id: "a", n: [1, true] })).toBe("{'id': 'a', 'n': [1, True]}");
  });

  it("writes json as json.dumps does", () => {
    expect(pyJson({ settings: { source: { origin: "<value>" } }, n: [1, 2] })).toBe(
      '{"settings": {"source": {"origin": "<value>"}}, "n": [1, 2]}',
    );
  });
});
