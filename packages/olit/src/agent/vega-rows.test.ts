import { parse, View } from "vega";
import { compile } from "vega-lite";
import { describe, expect, it } from "vitest";

import * as tables from "./tables";
import { build } from "./vega";

type Json = Record<string, any>;

/** A dataset's details with the metadata Galaxy set for these bytes on upload. */
const galaxy = (
  extension: string,
  bytes: string,
  types: string[],
  comments: number,
  names: string[] = [],
): Json => ({
  name: `${extension} fixture`,
  state: "ok",
  extension,
  file_size: bytes.length,
  metadata_columns: types.length,
  metadata_column_types: types,
  metadata_column_names: names,
  metadata_comment_lines: comments,
  metadata_data_lines: 3,
  metadata_delimiter: extension === "csv" ? "," : "\t",
});

/**
 * The rows of the one source every view of `spec`, bound to `details`, reads from, once Vega has
 * loaded `bytes`: what vega_dataset hands Vega, before any mark's own handling of invalid values.
 */
async function sourced(spec: Json, details: Json, bytes: string): Promise<unknown[][]> {
  const { ready, refusal } = build("d1", spec, details);
  expect(refusal).toBeNull();
  const runtime = compile(ready as never).spec as Json;
  const sources = (runtime.data as Json[]).filter((d) => d.url);
  expect(sources).toHaveLength(1);
  const loader = { load: async () => bytes, sanitize: async (href: string) => ({ href }) };
  const view = new View(parse(runtime as never), { renderer: "none", loader: loader as never });
  await view.runAsync();
  const names = tables.columnNames(details);
  return (view.data(sources[0].name) as Json[]).map((row) => names.map((name) => row[name]));
}

/** Two layers and a facet, over nominal fields, so no mark leaves rows out of its own accord. */
const layered = (names: string[]) => ({
  layer: [
    { mark: "text", encoding: { text: { field: names[0] } } },
    { mark: "text", encoding: { text: { field: names[1] } } },
  ],
});

const faceted = (names: string[]) => ({
  facet: { row: { field: names[0], type: "nominal" } },
  spec: { mark: "text", encoding: { text: { field: names[1] } } },
});

const THREE = [
  ["alpha", 1, 1.5],
  ["beta", 2, 2.5],
  ["gamma", 3, 3.5],
];

/** Each as Galaxy stored and described it on upload. */
const CASES: [string, string, Json, unknown[][]][] = [
  [
    "a tabular file with a # header line",
    "# name\tvalue\tscore\nalpha\t1\t1.5\nbeta\t2\t2.5\ngamma\t3\t3.5\n",
    { extension: "tabular", types: ["str", "int", "float"], comments: 1 },
    THREE,
  ],
  [
    "a tabular file with a blank line between its rows",
    "alpha\t1\t1.5\n\nbeta\t2\t2.5\ngamma\t3\t3.5\n",
    { extension: "tabular", types: ["str", "int", "float"], comments: 1 },
    THREE,
  ],
  [
    "a tabular file whose # header sits over a numeric first column",
    "# id\tvalue\n1\t10\n2\t20\n3\t30\n",
    { extension: "tabular", types: ["int", "int"], comments: 1 },
    [
      [1, 10],
      [2, 20],
      [3, 30],
    ],
  ],
  [
    "a csv with a blank line, which Galaxy counts as a data line",
    "name,value,score\nalpha,1,1.5\n\nbeta,2,2.5\ngamma,3,3.5\n",
    {
      extension: "csv",
      types: ["str", "int", "float"],
      comments: 1,
      names: ["name", "value", "score"],
    },
    THREE,
  ],
  [
    "a csv whose data starts with #, which a csv never treats as a comment",
    "tag,value\n#a,1\nb,2\nc,3\n",
    { extension: "csv", types: ["str", "int"], comments: 1, names: ["tag", "value"] },
    [
      ["#a", 1],
      ["b", 2],
      ["c", 3],
    ],
  ],
  [
    "a tabular row with an empty field, which is data",
    "alpha\t\t1.5\nbeta\t2\t2.5\ngamma\t3\t3.5\n",
    { extension: "tabular", types: ["str", "int", "float"], comments: 0 },
    [
      ["alpha", null, 1.5],
      ["beta", 2, 2.5],
      ["gamma", 3, 3.5],
    ],
  ],
];

describe("the rows a vega_dataset chart reads, as Vega parses the file", () => {
  for (const [what, bytes, meta, rows] of CASES) {
    const details = galaxy(meta.extension, bytes, meta.types, meta.comments, meta.names);
    const names = tables.columnNames(details);

    it(`are Galaxy's data lines in ${what}, layered`, async () => {
      expect(await sourced(layered(names), details, bytes)).toEqual(rows);
    });

    it(`are Galaxy's data lines in ${what}, faceted`, async () => {
      expect(await sourced(faceted(names), details, bytes)).toEqual(rows);
    });
  }
});
