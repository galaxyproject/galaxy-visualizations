import { describe, expect, it } from "vitest";

import type { Galaxy } from "../galaxy";
import { BATCH, compressionLost, organizeDatasets, summarizeState } from "./organize-datasets";

type Dataset = Record<string, any>;
interface Call {
  op: "contents" | "bulk" | "collection";
  body: Record<string, any>;
  url: string;
}

/** What a history item is when it says nothing: shown, and not deleted. */
const ITEM_DEFAULTS: Record<string, unknown> = { visible: true, deleted: false };
const pyStr = (value: unknown) =>
  typeof value === "boolean" ? (value ? "True" : "False") : String(value);

/** Answers the three requests the process makes, filtering contents through q/qv as Galaxy does. */
function fakeGalaxy(contents: Dataset[]) {
  const calls: Call[] = [];
  const galaxy = {
    get: async (path: string) => {
      calls.push({ op: "contents", body: {}, url: path });
      const search = new URL(path, "http://galaxy.test/").searchParams;
      const qv = search.getAll("qv");
      const wanted = search.getAll("q").map((field, i) => [field, qv[i]] as const);
      return contents.filter((d) =>
        wanted.every(([f, v]) => pyStr(d[f] ?? ITEM_DEFAULTS[f]) === v),
      );
    },
    post: async (path: string, body: Record<string, any>) => {
      expect(path).toBe("api/dataset_collections");
      calls.push({ op: "collection", body, url: path });
      return { id: "hdca1", name: body.name };
    },
    put: async (path: string, body: Record<string, any>) => {
      expect(path).toBe("api/histories/h1/contents/bulk");
      calls.push({ op: "bulk", body, url: path });
      return { success_count: (body.items || []).length, errors: [] };
    },
  } as unknown as Galaxy;
  return { galaxy, calls };
}

async function run(contents: Dataset[], inputs: Record<string, unknown> = {}) {
  const { galaxy, calls } = fakeGalaxy(contents);
  const args = {
    history_id: "h1",
    collection_name: "reads",
    structure: "auto",
    include: "*",
    tags: [],
    ...inputs,
  };
  const state = await organizeDatasets.run(galaxy, args);
  return { calls, state };
}

const ops = (calls: Call[]) => calls.map((c) => c.op);
const built = (calls: Call[]) => calls.filter((c) => c.op === "collection").map((c) => c.body);
const bulks = (calls: Call[], operation: string) =>
  calls.filter((c) => c.op === "bulk" && c.body.operation === operation).map((c) => c.body);

const SRA = [1, 2]
  .flatMap((n) => [1, 2].map((m) => [n, m]))
  .map(([n, m], i) => ({
    id: `ds${i}`,
    name: `SRR100${n}_${m}.fastq.gz`,
    history_content_type: "dataset",
  }));
/** Files as they arrive from an unzipped archive: no mate markers. */
const ZIPPED = [3, 4, 5, 6].map((i) => ({
  id: `z${i}`,
  name: `run_${i}.txt`,
  history_content_type: "dataset",
}));

describe("organize_datasets", () => {
  it("makes paired reads a list:paired collection", async () => {
    const body = built((await run(SRA)).calls)[0];
    expect(body.collection_type).toBe("list:paired");
    expect(body.element_identifiers.map((e: any) => e.name)).toEqual(["SRR1001", "SRR1002"]);
  });

  it("makes unzipped files a flat list", async () => {
    const body = built((await run(ZIPPED)).calls)[0];
    expect(body.collection_type).toBe("list");
    expect(body.element_identifiers).toHaveLength(4);
  });

  it("tags the new collection", async () => {
    const [body] = bulks((await run(SRA, { tags: ["sra", "paired"] })).calls, "add_tags");
    expect(body.items).toEqual([{ id: "hdca1", history_content_type: "dataset_collection" }]);
    expect(body.params).toEqual({ type: "add_tags", tags: ["sra", "paired"] });
  });

  it("makes no tag call without tags", async () => {
    expect(bulks((await run(SRA)).calls, "add_tags")).toEqual([]);
  });

  it("only reads the history, writes bulk changes and builds collections", async () => {
    const { calls } = await run(SRA, { tags: ["sra"], datatype: "fastqsanger.gz" });
    expect(new Set(calls.map((c) => c.url.split("?")[0]))).toEqual(
      new Set([
        "api/histories/h1/contents",
        "api/histories/h1/contents/bulk",
        "api/dataset_collections",
      ]),
    );
    expect(calls[0].url).toBe(
      "api/histories/h1/contents?v=dev&q=visible&q=deleted&qv=True&qv=False",
    );
  });

  it("retypes every dataset in one call", async () => {
    const [body] = bulks((await run(SRA, { datatype: "fastqsanger.gz" })).calls, "change_datatype");
    expect(body.params).toEqual({ type: "change_datatype", datatype: "fastqsanger.gz" });
    expect(body.items.map((i: any) => i.id)).toEqual(SRA.map((d) => d.id));
  });

  it("writes nothing without a datatype", async () => {
    expect(ops((await run(SRA)).calls)).not.toContain("bulk");
  });

  it("sets the datatype before building the collection", async () => {
    const order = ops((await run(SRA, { datatype: "fastqsanger.gz" })).calls);
    expect(order.indexOf("bulk")).toBeLessThan(order.indexOf("collection"));
  });
});

const MESSY = [
  ...SRA,
  { id: "half", name: "SRR200099_1.fastq.gz", history_content_type: "dataset" },
  { id: "notes", name: "README.txt", history_content_type: "dataset" },
];

describe("leftovers and scope", () => {
  it("gives leftovers their own collection instead of dropping them", async () => {
    const collections = built((await run(MESSY)).calls);
    expect(collections.map((b) => b.collection_type)).toEqual(["list:paired", "list"]);
    expect(collections[1].element_identifiers.map((e: any) => e.name)).toEqual([
      "README.txt",
      "SRR200099_1.fastq.gz",
    ]);
  });

  it("keeps a non-read file out of the datatype write with include", async () => {
    const [body] = bulks(
      (await run(MESSY, { include: "*.fastq.gz", datatype: "fastqsanger.gz" })).calls,
      "change_datatype",
    );
    expect(body.items.map((i: any) => i.id)).not.toContain("notes");
    expect(body.items).toHaveLength(5);
  });

  it("writes nothing for an empty history", async () => {
    expect(ops((await run([], { datatype: "fastqsanger.gz", tags: ["sra"] })).calls)).toEqual([
      "contents",
    ]);
  });

  it("batches the datatype write", async () => {
    const many = Array.from({ length: 2500 }, (_, i) => ({
      id: `d${i}`,
      name: `S${String(Math.floor(i / 2)).padStart(5, "0")}_${(i % 2) + 1}.fastq.gz`,
      history_content_type: "dataset",
    }));
    const writes = bulks(
      (await run(many, { datatype: "fastqsanger.gz" })).calls,
      "change_datatype",
    );
    expect(writes.map((w) => w.items.length)).toEqual([1000, 1000, 500]);
  });

  it("does not treat a collection already in the history as a file", async () => {
    const withCollection = [
      {
        id: "c1",
        name: "reads",
        history_content_type: "dataset_collection",
        collection_type: "list",
        element_count: 4,
      },
      ...SRA,
    ];
    const { calls } = await run(withCollection, { datatype: "fastqsanger.gz" });
    expect(bulks(calls, "change_datatype")[0].items.map((i: any) => i.id)).not.toContain("c1");
    for (const element of built(calls)[0].element_identifiers) {
      for (const inner of element.element_identifiers ?? [element]) {
        expect(inner.id).not.toBe("c1");
      }
    }
  });
});

describe("datatype", () => {
  it("does not retype datasets already at the datatype", async () => {
    const typed = SRA.map((d) => ({ ...d, extension: "fastqsanger.gz" }));
    const { calls, state } = await run(typed, { datatype: "fastqsanger.gz" });
    expect(bulks(calls, "change_datatype")).toEqual([]);
    expect(state.datatype_already_set).toBe(typed.length);
  });

  it("retypes only what needs it in a mixed history", async () => {
    const half = SRA.map((d, n) => (n < 2 ? { ...d, extension: "fastqsanger.gz" } : d));
    const [body] = bulks(
      (await run(half, { datatype: "fastqsanger.gz" })).calls,
      "change_datatype",
    );
    expect(body.items).toHaveLength(SRA.length - 2);
  });

  it("refuses an uncompressed datatype for gzipped reads before writing", async () => {
    const { calls, state } = await run(SRA, { datatype: "fastqsanger" });
    const summary = summarizeState(state)!;
    expect(summary.ok).toBe(false);
    expect(summary.use).toBe("fastqsanger.gz");
    expect(summary.datasets[0].endsWith(".fastq.gz")).toBe(true);
    expect(summary.error).toBe(
      'Refused: "fastqsanger" would relabel 4 compressed dataset(s) as uncompressed.',
    );
    expect(ops(calls)).toEqual(["contents"]);
  });

  it("accepts the compressed datatype itself", async () => {
    expect(ops((await run(SRA, { datatype: "fastqsanger.gz" })).calls)).toContain("collection");
  });

  it("accepts an uncompressed datatype for uncompressed files", async () => {
    expect(ops((await run(ZIPPED, { datatype: "tabular" })).calls)).toContain("collection");
  });

  it("counts Galaxy's detected extension as compressed", () => {
    const detected = [{ id: "d1", name: "reads_1", extension: "fastqsanger.gz" }];
    expect(compressionLost("fastqsanger", detected)).toEqual(["reads_1"]);
    expect(compressionLost("fastqsanger.gz", detected)).toEqual([]);
    expect(compressionLost(undefined, detected)).toEqual([]);
  });
});

/** Galaxy keeps a hidden copy per element of a collection, under the dataset's own name. */
const WITH_HIDDEN = [
  { id: "v1", name: "contigs_A.fasta.gz", history_content_type: "dataset" },
  { id: "v2", name: "contigs_B.fasta.gz", history_content_type: "dataset" },
  { id: "h1", name: "contigs_A.fasta.gz", history_content_type: "dataset", visible: false },
  { id: "h2", name: "contigs_B.fasta.gz", history_content_type: "dataset", visible: false },
  { id: "d1", name: "contigs_C.fasta.gz", history_content_type: "dataset", deleted: true },
];

describe("hidden and deleted items", () => {
  it("does not collect a hidden copy beside the dataset it copies", async () => {
    const body = built((await run(WITH_HIDDEN, { structure: "list" })).calls)[0];
    expect(body.element_identifiers.map((e: any) => e.id)).toEqual(["v1", "v2"]);
  });

  it("leaves a deleted dataset out", async () => {
    const body = built((await run(WITH_HIDDEN, { structure: "list" })).calls)[0];
    expect(body.element_identifiers.map((e: any) => e.id)).not.toContain("d1");
  });

  it("retypes only what the user can see", async () => {
    const [body] = bulks(
      (await run(WITH_HIDDEN, { structure: "list", datatype: "fasta.gz" })).calls,
      "change_datatype",
    );
    expect(body.items.map((i: any) => i.id)).toEqual(["v1", "v2"]);
  });
});

/** `ext` is what Galaxy currently holds, which is not always what the user wants. */
const history = (pairs: number, ext = "fasta.gz") =>
  Array.from({ length: pairs }, (_, i) =>
    [1, 2].map((mate) => ({
      name: `SRR${String(i).padStart(6, "0")}_${mate}.fasta.gz`,
      id: `${i}_${mate}`,
      extension: ext,
      history_content_type: "dataset",
    })),
  ).flat();

const runScale = (pairs: number, inputs: Record<string, unknown>, ext = "fasta.gz") =>
  run(history(pairs, ext), { include: "*", structure: "auto", ...inputs });

describe("scale", () => {
  it("brings every pair to the collection exactly once", async () => {
    const elements = built((await runScale(5000, { datatype: "fasta.gz" })).calls)[0]
      .element_identifiers;
    expect(elements).toHaveLength(5000);
    expect(new Set(elements.map((e: any) => e.name)).size).toBe(5000);
  });

  it("does not rewrite a datatype that is already correct", async () => {
    expect(ops((await runScale(5000, { datatype: "fasta.gz" })).calls)).not.toContain("bulk");
  });

  it("batches datatype changes", async () => {
    const batches = bulks(
      (await runScale(5000, { datatype: "fasta.gz" }, "data")).calls,
      "change_datatype",
    );
    expect(batches).toHaveLength(10000 / BATCH);
    expect(batches.every((b) => b.items.length <= BATCH)).toBe(true);
    expect(batches.reduce((n, b) => n + b.items.length, 0)).toBe(10000);
  });

  it("reads the history once however large it is", async () => {
    expect(
      ops((await runScale(5000, { datatype: "fasta.gz" })).calls).filter((o) => o === "contents"),
    ).toHaveLength(1);
  });

  it("keeps what the model sees from growing with the history", async () => {
    const small = summarizeState((await runScale(10, { datatype: "fasta.gz" })).state)!;
    const large = summarizeState((await runScale(5000, { datatype: "fasta.gz" })).state)!;
    expect(large.collection.elements).toBe(5000);
    expect(Object.keys(large).sort()).toEqual(Object.keys(small).sort());
    expect(JSON.stringify(large).length).toBeLessThan(2 * JSON.stringify(small).length);
    expect(JSON.stringify(large).length).toBeLessThan(1000);
  });

  it("refuses a datatype that would drop compression before writing anything", async () => {
    const { calls, state } = await runScale(5000, { datatype: "fasta" });
    expect(state.compression_lost).toBeDefined();
    expect(ops(calls)).toEqual(["contents"]);
    expect(summarizeState(state)!.ok).toBe(false);
  });

  it("tags the collection rather than every dataset", async () => {
    const tagging = bulks(
      (await runScale(2000, { datatype: "fasta.gz", tags: ["sra"] })).calls,
      "add_tags",
    );
    expect(tagging).toHaveLength(1);
    expect(tagging[0].items).toHaveLength(1);
    expect(tagging[0].items[0].history_content_type).toBe("dataset_collection");
  });

  it("builds the collection in one request of bounded size per element", async () => {
    const posts = built((await runScale(5000, { datatype: "fasta.gz" })).calls);
    expect(posts).toHaveLength(1);
    expect(JSON.stringify(posts[0]).length / posts[0].element_identifiers.length).toBeLessThan(300);
  });

  it("grows requests with batches rather than with datasets", async () => {
    const small = (await runScale(500, { datatype: "fasta.gz" }, "data")).calls;
    const large = (await runScale(5000, { datatype: "fasta.gz" }, "data")).calls;
    expect(large.length - small.length).toBe((10000 - 1000) / BATCH);
  });
});
