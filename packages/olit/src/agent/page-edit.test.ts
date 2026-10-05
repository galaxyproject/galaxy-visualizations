import { describe, expect, it } from "vitest";

import { applySectionEdit, djb2Hash, malformedObjectIds } from "./page-edit";

const REAL = "a8539f6d9115ffe7";
const ALSO_REAL = "0c97fda4aafcf418";
const DOC = "## Record\n\nintro\n\n## Methods\n\nold\n\n## Results\n\nfindings\n";

describe("djb2Hash", () => {
  it("matches Galaxy's implementation", () => {
    expect(djb2Hash("hello")).toBe("0f923099");
  });

  it("hashes by code point", () => {
    expect(djb2Hash("héllo😀")).toBe("0b2edc3d");
  });
});

describe("applySectionEdit", () => {
  it("leaves other sections alone", () => {
    const written = applySectionEdit(DOC, "## Methods", "## Methods\n\nnew\n");
    expect(written).toContain("new");
    expect(written).toContain("intro");
    expect(written).toContain("findings");
    expect(written).not.toContain("old");
  });

  it("appends an unknown heading", () => {
    const written = applySectionEdit(DOC, "## Discussion", "## Discussion\n\nmore\n");
    expect(written).toContain("## Discussion");
    expect(written).toContain("findings");
  });
});

describe("malformedObjectIds", () => {
  it("flags a name where a dataset id belongs", () => {
    expect(malformedObjectIds("history_dataset_display(history_dataset_id=reads)")).toEqual([
      "history_dataset_id=reads",
    ]);
  });

  it("accepts an encoded id", () => {
    expect(malformedObjectIds(`history_dataset_display(history_dataset_id=${REAL})`)).toEqual([]);
  });

  it("leaves a plugin name beside a bad dataset id alone", () => {
    expect(
      malformedObjectIds("visualization(visualization_id=plotly, history_dataset_id=reads)"),
    ).toEqual(["history_dataset_id=reads"]);
  });

  it("accepts a plugin name in the visualization directive", () => {
    expect(
      malformedObjectIds(`visualization(visualization_id=plotly, history_dataset_id=${ALSO_REAL})`),
    ).toEqual([]);
  });

  it("checks each object argument", () => {
    for (const name of ["history_dataset_id", "history_dataset_collection_id"]) {
      expect(malformedObjectIds(`x(${name}=nope)`)).toEqual([`${name}=nope`]);
    }
  });

  it("leaves other arguments to Galaxy", () => {
    expect(malformedObjectIds('history_dataset_display(output="trimmed reads", hid=3)')).toEqual(
      [],
    );
  });

  it("reads a quoted id through its quotes", () => {
    expect(malformedObjectIds(`history_dataset_display(history_dataset_id="${REAL}")`)).toEqual([]);
  });

  it("leaves a page with no directives untouched", () => {
    expect(malformedObjectIds("## Record\n\nJust prose.")).toEqual([]);
  });

  it.each(["reads", "nope", "0c97fda4aafcf41", "0c97fda4aafcf4188", "ZZZZZZZZZZZZZZZZ"])(
    "refuses %s, which is not sixteen hex",
    (value) => {
      expect(malformedObjectIds(`visualization(history_dataset_id=${value})`)).not.toEqual([]);
    },
  );
});
