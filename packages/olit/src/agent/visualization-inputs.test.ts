import { quote } from "./quote";
import { describe, expect, it } from "vitest";

import { buildVisualizationTemplate } from "./visualization-inputs";

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
    const plugin = { settings: [{ ...SOURCE, test_param: { name: "origin", value: "builtin" } }] };
    const { settings } = buildVisualizationTemplate(plugin, TYPES);
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

  // galaxy-charts expands no case when the test default selects none, so neither does the template.
  it("leaves the case open when the declared default selects none", () => {
    expect(buildVisualizationTemplate(IGV, TYPES).settings.source).toEqual({
      origin: "<one of: builtin, igv>",
    });
    const plugin = { settings: [{ ...SOURCE, test_param: { name: "origin", value: "neither" } }] };
    expect(buildVisualizationTemplate(plugin, TYPES).settings.source).toEqual({
      origin: "<one of: builtin, igv>",
    });
  });
});

describe("quote", () => {
  it("spells values as JSON does, the way every tool result reads", () => {
    expect(quote("a")).toBe('"a"');
    expect(quote("it's")).toBe('"it\'s"');
    expect(quote(null)).toBe("null");
    expect(quote(undefined)).toBe("null");
    expect(quote({ id: "a", n: [1, true] })).toBe('{"id":"a","n":[1,true]}');
  });
});
