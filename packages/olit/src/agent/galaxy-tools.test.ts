import { describe, expect, it } from "vitest";
import { createGalaxyContext } from "@galaxyproject/galaxy-ops/browser";
import { Watch } from "./watch";

import type { Galaxy } from "./galaxy";
import {
  annotate,
  OPS_POLICY,
  galaxyTools,
  hdaInputs,
  MAX_DOWNLOAD_BYTES,
  PREVIEW_LINES,
} from "./galaxy-tools";
import { ELIDED } from "./notebook";
import { olitTools } from "./session";
import { Outcome, traitsOf, type Context, type Python } from "./tool";

type Fake = Partial<
  Record<"get" | "post" | "put" | "bytes", (path: string, body?: any) => Promise<any>>
>;

function files(): Python & { fs: Map<string, Uint8Array> } {
  const fs = new Map<string, Uint8Array>();
  return {
    fs,
    run: async () => "",
    write: async (path, data) => void fs.set(path, data),
    read: async (path) => fs.get(path),
  };
}

function context(galaxy: Fake, extra: Partial<Context> = {}): Context {
  return {
    galaxy: galaxy as unknown as Galaxy,
    ops: createGalaxyContext({ baseUrl: "http://galaxy.test/", apiKey: "" }),
    python: files(),
    binding: {},
    artifacts: { prior: [], produced: [] },
    watch: new Watch(async () => undefined),
    ...extra,
  };
}

const tool = (name: string) => galaxyTools().find((t) => t.name === name)!;

const run = (name: string, args: Record<string, unknown>, ctx: Context) =>
  tool(name).run(args, ctx) as Promise<any>;

/** The text of a refusal, asserting it was recorded as a failure. */
function refused(out: unknown): string {
  expect(out).toBeInstanceOf(Outcome);
  expect((out as Outcome).isError).toBe(true);
  return (out as Outcome).text;
}

describe("tool surface", () => {
  it("uses galaxy-mcp's docstrings as descriptions", () => {
    for (const t of galaxyTools()) {
      expect(t.description, t.name).toBeTruthy();
    }
  });

  it("reads what each tool says of itself off galaxy-ops, Olit's policy and its own tools", () => {
    const tools = new Map(olitTools().map((t) => [t.name, traitsOf(t)]));
    const settledOnes = [...tools].filter(([, t]) => t.settled).map(([name]) => name);
    expect(settledOnes.sort()).toEqual([
      "get_visualization_details",
      "search_tools_by_keywords",
      "search_tools_by_name",
    ]);
    expect(tools.get("get_job_details")?.polls).toBe("dataset_id");
    expect(tools.get("get_dataset_details")?.polls).toBe("dataset_id");
    expect(tools.get("get_invocations")?.polls).toBe("invocation_id");
    expect(tools.get("update_history")?.destroys({ history_id: "h1", deleted: true })).toBe(true);
    expect(tools.get("update_history")?.destroys({ history_id: "h1", name: "x" })).toBe(false);
    expect(tools.get("delete_user_tool")?.destroys({ uuid: "u1" })).toBe(true);
  });
});

describe("run_tool history guard", () => {
  const HERE = "aaaaaaaaaaaaaaaa";
  const ELSEWHERE = "bbbbbbbbbbbbbbbb";

  /** Olit's check over galaxy-ops' run_tool, against datasets owned as `owners` says. */
  function owned(owners: Record<string, string>) {
    const ctx = context({
      get: async (path) => {
        const id = path.split("/").pop()!;
        return { id, name: `ds-${id}`, history_id: owners[id] };
      },
    });
    return (historyId: string, inputs: unknown) =>
      OPS_POLICY.run_tool.check!({ history_id: historyId, tool_id: "cat1", inputs }, ctx);
  }

  it("allows a dataset in the target history", async () => {
    expect(await owned({ d1: HERE })(HERE, { input: { src: "hda", id: "d1" } })).toBeUndefined();
  });

  it("refuses a dataset from another history", async () => {
    const out = refused(await owned({ d1: ELSEWHERE })(HERE, { input: { src: "hda", id: "d1" } }));
    expect(out).toContain("do not identify a dataset in history");
    expect(out).toContain("d1");
    expect(out).toContain(ELSEWHERE);
    expect(out).toContain(HERE);
  });

  it("allows working in a newly created history", async () => {
    const fresh = "cccccccccccccccc";
    expect(await owned({ d1: fresh })(fresh, { input: { src: "hda", id: "d1" } })).toBeUndefined();
  });

  it("refuses the whole submission for one bad input among several", async () => {
    const check = owned({ d1: HERE, d2: ELSEWHERE, d3: HERE });
    const out = refused(
      await check(HERE, {
        a: { src: "hda", id: "d1" },
        b: { src: "hda", id: "d2" },
        c: { src: "hda", id: "d3" },
      }),
    );
    expect(out).toContain("d2");
  });

  it("inspects nested and repeated inputs", async () => {
    const check = owned({ d1: HERE, d2: ELSEWHERE });
    const out = refused(
      await check(HERE, {
        queries: [{ input2: { src: "hda", id: "d1" } }, { input2: { src: "hda", id: "d2" } }],
      }),
    );
    expect(out).toContain("d2");
  });

  it("leaves non-dataset parameters alone", async () => {
    const check = owned({ d1: HERE });
    expect(
      await check(HERE, { input: { src: "hda", id: "d1" }, cond: 'c3=="Gold"', lines: 5 }),
    ).toBeUndefined();
  });

  it("finds references in nested structures", () => {
    const found = hdaInputs({
      a: { src: "hda", id: "x" },
      r: [{ b: { src: "hda", id: "y" } }],
      plain: 3,
    });
    expect(found.map(([, id]) => id).sort()).toEqual(["x", "y"]);
  });

  it("takes collections and leaves library datasets", () => {
    const found = hdaInputs({
      c: { src: "hdca", id: "c1" },
      lib: { src: "ldda", id: "l1" },
      ld: { src: "ld", id: "l2" },
    });
    expect(found.map(([, id, src]) => [id, src])).toEqual([["c1", "hdca"]]);
  });
});

describe("dataset filesystem", () => {
  const TABLE =
    "Latitude\tLongitude\n" +
    Array.from({ length: 119 }, (_, i) => `${i + 1}.5\t-${i + 1}.25`).join("\n");
  const BINARY = new Uint8Array([
    0x1f, 0x8b, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xde, 0xad, 0xbe, 0xef, 0x00, 0x80,
    0x81,
  ]);
  const encode = (text: string) => new TextEncoder().encode(text);

  function dataset(
    content: string | Uint8Array,
    {
      state = "ok" as string | null,
      size,
      details,
      chunkable = true,
    }: {
      state?: string | null;
      size?: number;
      details?: Record<string, unknown>;
      chunkable?: boolean;
    } = {},
  ) {
    const fetched: string[] = [];
    const posted: [string, any][] = [];
    const python = files();
    const ctx = context(
      {
        get: async (path) => {
          fetched.push(path);
          if (path.includes("ck_size=")) {
            if (!chunkable) {
              throw new Error("Dataset appears to contain binary data");
            }
            const text = typeof content === "string" ? content : "";
            const cut = text.slice(0, Number(path.split("ck_size=")[1]));
            const aligned = cut.slice(0, cut.lastIndexOf("\n") + 1) || cut;
            return { ck_data: aligned, offset: aligned.length };
          }
          return {
            id: "d",
            state,
            ...(details ?? {}),
            ...(size === undefined ? {} : { file_size: size }),
          };
        },
        bytes: async (path) => {
          fetched.push(path);
          return typeof content === "string" ? encode(content) : content;
        },
        post: async (path, body) => {
          posted.push([path, body]);
          return { ok: true };
        },
      },
      { python },
    );
    const download = (id: string) => run("download_dataset", { dataset_id: id }, ctx);
    const upload = (args: Record<string, unknown>) => run("upload_file", args, ctx);
    return { fetched, posted, fs: python.fs, download, upload };
  }

  it("writes a dataset to the filesystem rather than returning it inline", async () => {
    const d = dataset(TABLE);
    const out = await d.download("abc123");
    expect(out.path).toBe("/data/abc123.dat");
    expect(new TextDecoder().decode(d.fs.get(out.path))).toBe(TABLE);
    expect(out).not.toHaveProperty("content");
  });

  it("reads the whole file, however much the preview shows", async () => {
    // A sum over the preview is quietly wrong; run_python has to see every row.
    const d = dataset(TABLE, { size: encode(TABLE).length });
    const out = await d.download("whole");
    expect(new TextDecoder().decode(d.fs.get(out.path))).toBe(TABLE);
    expect(out.partial).toBeFalsy();
  });

  it("caps the preview and says so", async () => {
    const out = await dataset(TABLE).download("capped");
    expect(out.preview.split("\n")).toHaveLength(PREVIEW_LINES);
    expect(out.truncated).toBe(true);
    expect(out.lines).toBe(TABLE.split("\n").length);
    expect(out.bytes).toBe(encode(TABLE).length);
  });

  it("does not mark a short dataset truncated", async () => {
    const out = await dataset("a\tb\n1\t2").download("short");
    expect(out.truncated).toBe(false);
    expect(out.preview).toBe("a\tb\n1\t2");
  });

  it("uploads a locally written file back", async () => {
    const d = dataset(TABLE);
    const downloaded = await d.download("roundtrip");
    const result = await d.upload({ path: downloaded.path, history_id: "h1" });
    expect(result).toEqual({ ok: true });
    const [path, payload] = d.posted[0];
    expect(path).toBe("api/tools/fetch");
    const element = payload.targets[0].elements[0];
    expect(element.src).toBe("pasted");
    expect(element.paste_content).toBe(TABLE);
    expect(element.name).toBe("roundtrip.dat");
    expect(payload.history_id).toBe("h1");
  });

  it("reports a missing path as an error, not a crash", async () => {
    const d = dataset("");
    expect(refused(await d.upload({ path: "/data/does-not-exist.dat" }))).toContain("No such file");
    expect(d.posted).toEqual([]);
  });

  it("keeps binary content byte-identical on disk", async () => {
    const d = dataset(BINARY);
    const out = await d.download("bam1");
    expect(out.binary).toBe(true);
    expect(out.preview).toBeNull();
    expect(out.lines).toBeNull();
    expect(out.bytes).toBe(BINARY.length);
    expect(d.fs.get(out.path)).toEqual(BINARY);
  });

  it("still reports a text dataset as text", async () => {
    const out = await dataset(TABLE).download("txt1");
    expect(out.binary).toBe(false);
    expect(out.preview.startsWith("Latitude\tLongitude")).toBe(true);
  });

  it("refuses to upload binary rather than corrupting it", async () => {
    const d = dataset(BINARY);
    const downloaded = await d.download("bam2");
    expect(refused(await d.upload({ path: downloaded.path })).toLowerCase()).toContain("binary");
    expect(d.posted).toEqual([]);
  });

  it("returns an oversized dataset as a flagged prefix", async () => {
    const d = dataset(TABLE, { size: MAX_DOWNLOAD_BYTES + 1 });
    const out = await d.download("huge");
    expect(out.partial).toBe(true);
    expect(out.bytes_total).toBe(MAX_DOWNLOAD_BYTES + 1);
    expect(out.bytes).toBeLessThan(out.bytes_total);
    expect(d.fetched.some((path) => path.endsWith("/display"))).toBe(false);
  });

  it("aligns a prefix on lines", async () => {
    const d = dataset(TABLE, { size: MAX_DOWNLOAD_BYTES + 1 });
    const out = await d.download("aligned");
    const body = new TextDecoder().decode(d.fs.get(out.path));
    expect(body.endsWith("\n")).toBe(true);
    for (const row of body.split("\n").slice(1).filter(Boolean)) {
      expect(row.split("\t")).toHaveLength(2);
    }
  });

  it("refuses an unchunkable oversized dataset", async () => {
    const d = dataset(BINARY, { size: MAX_DOWNLOAD_BYTES + 1, chunkable: false });
    expect(refused(await d.download("bigbam"))).toContain("cannot be read in chunks");
  });

  it("still downloads a dataset at the limit", async () => {
    const out = await dataset(TABLE, { size: MAX_DOWNLOAD_BYTES }).download("atlimit");
    expect(out.path).toBeTruthy();
    expect(out).not.toHaveProperty("partial");
  });

  it("states the format Galaxy parsed", async () => {
    const out = await dataset(TABLE, {
      details: { extension: "tabular", metadata_delimiter: "\t" },
    }).download("abc123");
    expect(out.extension).toBe("tabular");
    expect(out.delimiter).toBe("\t");
  });

  it("states a comma delimiter", async () => {
    const out = await dataset("a,b\n1,2\n", {
      details: { extension: "csv", metadata_delimiter: "," },
    }).download("abc123");
    expect(out.delimiter).toBe(",");
  });

  it("reports no delimiter for a format without one", async () => {
    const out = await dataset(">seq\nACGT\n", { details: { extension: "fasta" } }).download(
      "abc123",
    );
    expect(out.extension).toBe("fasta");
    expect(out).not.toHaveProperty("delimiter");
  });

  it("downloads a record without metadata", async () => {
    const out = await dataset(TABLE).download("abc123");
    expect(out).not.toHaveProperty("extension");
    expect(out).not.toHaveProperty("delimiter");
  });

  it("refuses a dataset still running rather than reading it", async () => {
    const d = dataset(TABLE, { state: "running" });
    const out = refused(await d.download("abc123"));
    expect(out).toContain('not "ok"');
    expect(out).toContain("running");
    expect(d.fs.size).toBe(0);
  });

  it("refuses an errored dataset", async () => {
    expect(refused(await dataset(TABLE, { state: "error" }).download("abc123"))).toContain(
      'not "ok"',
    );
  });

  it("refuses a dataset that states no state", async () => {
    expect(refused(await dataset(TABLE, { state: null }).download("abc123"))).toContain(
      "state null",
    );
  });

  it("downloads an ok dataset", async () => {
    const out = await dataset(TABLE).download("abc123");
    expect(out.path).toBe("/data/abc123.dat");
    expect(out.lines).toBe(120);
  });
});

describe("recommend_biocontainer", () => {
  it("refuses an invalid package list in prose", async () => {
    expect(refused(await run("recommend_biocontainer", { packages: [] }, context({})))).toContain(
      "at least one",
    );
  });
});

describe("annotate", () => {
  it("prefers a catalog miss and falls back to fetch-failure triage", async () => {
    const ctx = context({ get: async () => [{ name: "plotly" }] });
    expect(await annotate("search_tools_by_name", { query: "plotly" }, [], ctx)).toContain(
      "is a visualization",
    );
    const failure = {
      state: "error",
      misc_info: "Failed to fetch url https://example.org/x.fastq.gz. 404",
    };
    expect(await annotate("get_dataset_details", {}, failure, ctx)).toContain("from memory");
  });
});

describe("update_page policy", () => {
  it("refuses content built from an elided record excerpt", async () => {
    const check = OPS_POLICY.update_page.check!;
    const refused = await check({ page_id: "p1", content: `# A\n\n${ELIDED}\n\n# Z` }, {} as never);
    expect(refused?.isError).toBe(true);
    expect(await check({ page_id: "p1", content: "# A" }, {} as never)).toBeUndefined();
  });
});
