import { describe, expect, it } from "vitest";

import * as vega from "./vega";

const TABULAR = {
  id: "d1",
  name: "prices.tabular",
  state: "ok",
  metadata_columns: 4,
  metadata_column_names: [],
  metadata_column_types: ["str", "str", "int", "str"],
  metadata_delimiter: "\t",
  metadata_comment_lines: 0,
  metadata_data_lines: 61,
  file_size: 2500,
};
const CSV = {
  ...TABULAR,
  name: "prices.csv",
  metadata_column_names: ["Transaction_date", "Product", "Price", "Country"],
  metadata_delimiter: ",",
  metadata_comment_lines: 1,
  metadata_data_lines: 60,
};
const VCF = {
  ...TABULAR,
  name: "calls.vcf",
  metadata_columns: 8,
  metadata_comment_lines: 5,
  metadata_data_lines: 6,
};
const UNMEASURED = {
  ...TABULAR,
  name: "genes.gtf",
  metadata_data_lines: null,
  metadata_comment_lines: null,
};

const SCATTER = {
  mark: "point",
  encoding: {
    x: { field: "col:3", type: "quantitative" },
    y: { field: "col:1", type: "nominal" },
  },
};

const built = (spec: unknown, details: Record<string, unknown> = TABULAR) =>
  vega.build("abc123", spec, details);

describe("the data source", () => {
  it("reads a dataset without names by position", () => {
    const { ready, refusal } = built(SCATTER);
    expect(refusal).toBeNull();
    expect(ready!.data).toEqual({
      url: "/api/datasets/abc123/display",
      format: {
        type: "dsv",
        delimiter: "\t",
        header: ["col:1", "col:2", "col:3", "col:4"],
        parse: { "col:3": "number" },
      },
    });
  });

  it("lets a csv's own header name the columns", () => {
    const spec = { mark: "point", encoding: { x: { field: "Price", type: "quantitative" } } };
    const { ready, refusal } = vega.build("abc123", spec, CSV);
    expect(refusal).toBeNull();
    expect(ready!.data.format).toEqual({ type: "csv", parse: { Price: "number" } });
  });

  it("uses the schema galaxy renders with, whatever the caller names", () => {
    expect(built(SCATTER).ready!.$schema).toBe("https://vega.github.io/schema/vega-lite/v5.json");
    const { ready } = built({
      ...SCATTER,
      $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    });
    expect(ready!.$schema.endsWith("v5.json")).toBe(true);
  });

  it("parses numeric columns as numbers and leaves text alone", () => {
    expect(built(SCATTER).ready!.data.format.parse).toEqual({ "col:3": "number" });
  });
});

describe("the data invariant", () => {
  it.each([
    { data: { values: [{ a: 1 }] }, mark: "point" },
    { data: { url: "https://example.org/x.csv" }, mark: "point" },
    { layer: [{ data: { values: [] }, mark: "line" }], mark: "point" },
    { mark: "point", transform: [{ lookup: "a", from: { data: { values: [] }, key: "a" } }] },
    { hconcat: [{ data: { url: "/elsewhere" }, mark: "bar" }] },
    { facet: { field: "col:1" }, spec: { data: { values: [] }, mark: "bar" } },
  ])("refuses a spec naming data of its own: %j", (spec) => {
    const { ready, refusal } = built(spec);
    expect(ready).toBeNull();
    expect(refusal).toContain("names its own data");
  });

  it("names where the data was", () => {
    expect(built({ layer: [{ data: { values: [] }, mark: "line" }] }).refusal).toContain(
      "layer.0.data",
    );
  });

  it("leaves a transform naming no data alone", () => {
    const spec = {
      mark: "point",
      transform: [{ calculate: 'datum["col:3"] * 2', as: "doubled" }],
      encoding: { x: { field: "doubled", type: "quantitative" } },
    };
    const { ready, refusal } = built(spec);
    expect(refusal).toBeNull();
    expect(ready!.data.url).toBeDefined();
  });
});

describe("which datasets can be referenced", () => {
  it("refuses a file whose comments vega would read as data", () => {
    const { refusal } = built(SCATTER, VCF);
    expect(refusal).toContain("first 5 line(s) are comments");
    expect(refusal).toContain("Galaxy tool");
  });

  it("accepts a csv header row, which is not a comment galaxy cannot skip", () => {
    expect(vega.unreferenceable(CSV)).toBeNull();
  });

  it("refuses a dataset galaxy never measured", () => {
    expect(built(SCATTER, UNMEASURED).refusal).toContain("has not measured");
  });

  it("refuses a dataset too large to send to every reader", () => {
    const { refusal } = built(SCATTER, { ...TABULAR, file_size: vega.SIZE_LIMIT + 1 });
    expect(refusal).toContain("sends the whole file to every reader");
  });

  it("refuses a dataset with no column count", () => {
    expect(built(SCATTER, { ...TABULAR, metadata_columns: null }).refusal).toContain(
      "no column count",
    );
  });

  it("refuses named columns with an unverified delimiter", () => {
    const { refusal } = built(SCATTER, { ...CSV, metadata_delimiter: "\t" });
    expect(refusal).toContain("has not been verified");
    expect(refusal).toContain('"\\t"');
  });
});

describe("field names", () => {
  it("refuses a field the dataset does not hold", () => {
    const { refusal } = built({
      mark: "point",
      encoding: { x: { field: "Glucose", type: "quantitative" } },
    });
    expect(refusal).toContain("does not hold");
    expect(refusal).toContain('"col:1"');
  });

  it("accepts a field a transform produces", () => {
    const spec = {
      mark: "bar",
      transform: [{ aggregate: [{ op: "mean", field: "col:3", as: "avg" }], groupby: ["col:1"] }],
      encoding: {
        x: { field: "col:1", type: "nominal" },
        y: { field: "avg", type: "quantitative" },
      },
    };
    expect(built(spec).refusal).toBeNull();
  });

  it("accepts the default names of a transform", () => {
    const spec = {
      mark: "area",
      transform: [{ density: "col:3" }],
      encoding: {
        x: { field: "value", type: "quantitative" },
        y: { field: "density", type: "quantitative" },
      },
    };
    expect(built(spec).refusal).toBeNull();
  });

  it("names both edges of a bin transform", () => {
    const spec = {
      mark: "bar",
      transform: [{ bin: true, field: "col:3", as: "b" }],
      encoding: { x: { field: "col:3_start", type: "quantitative" } },
    };
    expect(built(spec).refusal).toBeNull();
  });

  it("checks a field named only in a filter", () => {
    const spec = { mark: "point", transform: [{ filter: 'datum["nope"] > 1' }], encoding: {} };
    expect(built(spec).refusal).toContain('"nope"');
  });

  it("does not check names a pivot makes unknowable", () => {
    const spec = {
      mark: "bar",
      transform: [{ pivot: "col:1", value: "col:3" }],
      encoding: { x: { field: "whatever_the_data_said", type: "quantitative" } },
    };
    expect(built(spec).refusal).toBeNull();
  });
});

describe("what reaches the page", () => {
  it("renders the artifact as the fence galaxy parses", () => {
    const text = vega.fence(built(SCATTER).ready!);
    expect(text.startsWith("```vega\n") && text.endsWith("\n```")).toBe(true);
    expect(text).toContain('"url": "/api/datasets/abc123/display"');
  });

  it("refuses an empty spec", () => {
    for (const spec of [{}, null, [], "mark: point"]) {
      const { ready, refusal } = built(spec);
      expect(ready).toBeNull();
      expect(refusal).toContain("Vega-Lite specification");
    }
  });

  it("compiles a built spec with vega-lite and reports a broken one", () => {
    expect(vega.compiled(built(SCATTER).ready!)).toEqual({ compiles: true, problems: [] });
    const broken = vega.compiled({ mark: "nonsense", encoding: {} });
    expect(broken.compiles).toBe(false);
    expect(broken.problems.length).toBeGreaterThan(0);
  });
});

describe("the dataset has to be readable", () => {
  it("names an unfinished job rather than blaming the datatype", () => {
    const { refusal } = built(SCATTER, { ...TABULAR, state: "running", metadata_data_lines: null });
    expect(refusal).toContain('state "running"');
    expect(refusal).toContain("wait for it and chart it again");
    expect(refusal).not.toContain("column count");
  });

  it("does not ask to wait for a failed dataset", () => {
    const { refusal } = built(SCATTER, { ...TABULAR, state: "error", metadata_data_lines: null });
    expect(refusal).toContain("the job producing it failed");
    expect(refusal).not.toContain("wait for it");
  });

  it("refuses a purged dataset before anything else", () => {
    expect(built(SCATTER, { ...TABULAR, purged: true, state: "ok" }).refusal).toContain("purged");
  });

  it("names the state before questioning the metadata", () => {
    const queued = {
      ...TABULAR,
      state: "queued",
      metadata_columns: null,
      metadata_data_lines: null,
    };
    expect(built(SCATTER, queued).refusal).toContain('state "queued"');
  });
});

describe("an encoding the column cannot satisfy", () => {
  it("reports a quantitative encoding on a text column without refusing", () => {
    const { ready, refusal } = built({
      mark: "point",
      encoding: { x: { field: "col:1", type: "quantitative" } },
    });
    expect(refusal).toBeNull();
    expect(vega.unsatisfiableTypes(ready!, TABULAR)).toEqual(["col:1"]);
  });

  it("does not report a quantitative encoding on a numeric column", () => {
    const { ready } = built({
      mark: "point",
      encoding: { x: { field: "col:3", type: "quantitative" } },
    });
    expect(vega.unsatisfiableTypes(ready!, TABULAR)).toEqual([]);
  });

  it("does not report a nominal encoding on a text column", () => {
    const { ready } = built({ mark: "bar", encoding: { x: { field: "col:1", type: "nominal" } } });
    expect(vega.unsatisfiableTypes(ready!, TABULAR)).toEqual([]);
  });
});
