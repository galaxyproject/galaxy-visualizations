import { describe, expect, it } from "vitest";
import { createGalaxyContext } from "@galaxyproject/galaxy-ops/browser";

import { connectWeb, HttpError, type Galaxy } from "./galaxy";
import {
  annotate,
  OPS_POLICY,
  galaxyTools,
  hdaInputs,
  MAX_DOWNLOAD_BYTES,
  PREVIEW_LINES,
} from "./galaxy-tools";
import { ELIDED } from "./notebook";
import { olitTools } from "./tools";
import { Outcome, submittedBy, traitsOf, type Context, type Python } from "./tool";

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
    web: connectWeb(),
    ops: createGalaxyContext({ baseUrl: "http://galaxy.test/", apiKey: "" }),
    python: files(),
    binding: {},
    artifacts: { prior: [], produced: [] },
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

describe("run_tool input keys", () => {
  const CAT1 = {
    id: "cat1",
    inputs: [
      { name: "input1", type: "data" },
      { name: "queries", type: "repeat", inputs: [{ name: "input2", type: "data" }] },
      {
        name: "mode",
        type: "conditional",
        test_param: { name: "kind", type: "select" },
        cases: [
          { value: "a", inputs: [{ name: "depth", type: "integer" }] },
          { value: "b", inputs: [] },
        ],
      },
      { name: "advanced", type: "section", inputs: [{ name: "lines", type: "integer" }] },
    ],
  };
  const TP_CAT = { id: "tp_cat", inputs: [{ name: "inputs", type: "data", multiple: true }] };

  function check(
    schema: unknown,
    inputs: unknown,
    run: { tool_id?: string; tool_version?: string } = {},
  ) {
    const ctx = context({
      get: async (path) => (path.startsWith("api/tools/") ? schema : { id: "d", history_id: "h1" }),
    });
    const tool_id = run.tool_id ?? (schema as { id?: string } | null)?.id ?? "cat1";
    return OPS_POLICY.run_tool.check!({ history_id: "h1", inputs, ...run, tool_id }, ctx);
  }

  it("allows every key Galaxy's legacy tool state reads", async () => {
    const out = await check(CAT1, {
      input1: { src: "hda", id: "d" },
      "queries_0|input2": { src: "hda", id: "d" },
      "queries_1|input2": { src: "hda", id: "d" },
      "mode|kind": "a",
      "mode|depth": 3,
      "advanced|lines": 5,
      "input1|__identifier__": "x",
    });
    expect(out).toBeUndefined();
  });

  it("refuses a repeat member named without its instance, listing the tool's keys", async () => {
    const out = refused(
      await check(CAT1, {
        input1: { src: "hda", id: "d" },
        "queries|input2": { src: "hda", id: "d" },
      }),
    );
    expect(out).toContain('has no parameter at "queries|input2"');
    expect(out).toContain('"queries_0|input2"');
    expect(out).toContain('"mode|kind"');
  });

  it("refuses indexing a parameter that takes several datasets", async () => {
    const out = refused(
      await check(TP_CAT, {
        "inputs|0": { src: "hda", id: "d" },
        "inputs|1": { src: "hda", id: "d" },
      }),
    );
    expect(out).toContain('"inputs|0", "inputs|1"');
    expect(out).toContain('{"values": [...]}');
  });

  it("refuses a nested object Galaxy's legacy format does not read", async () => {
    const out = refused(await check(CAT1, { queries: [{ input2: { src: "hda", id: "d" } }] }));
    expect(out).toContain('"queries"');
  });

  it("checks the schema Galaxy expands an unversioned id to", async () => {
    const shed = { ...CAT1, id: "toolshed.example/repos/iuc/cat1/cat1/1.0", version: "1.0" };
    const out = await check(
      shed,
      { nonsense: 1 },
      { tool_id: "toolshed.example/repos/iuc/cat1/cat1" },
    );
    expect(refused(out)).toContain('"nonsense"');
  });

  it("leaves the keys to Galaxy when the schema describes another tool", async () => {
    expect(
      await check({ ...CAT1, id: "cat2" }, { nonsense: 1 }, { tool_id: "cat1" }),
    ).toBeUndefined();
    expect(
      await check({ ...CAT1, id: "cat10" }, { nonsense: 1 }, { tool_id: "cat1" }),
    ).toBeUndefined();
  });

  it("leaves the keys to Galaxy when the schema is of another version than the run's", async () => {
    const served = { ...CAT1, version: "2.0" };
    expect(await check(served, { nonsense: 1 }, { tool_version: "1.0" })).toBeUndefined();
    expect(await check(CAT1, { nonsense: 1 }, { tool_version: "1.0" })).toBeUndefined();
    expect(refused(await check(served, { nonsense: 1 }, { tool_version: "2.0" }))).toContain(
      '"nonsense"',
    );
  });

  it("leaves the keys unchecked when the tool's parameters cannot be read", async () => {
    expect(await check(null, { anything: 1 })).toBeUndefined();
    expect(await check({ id: "cat1" }, { anything: 1 })).toBeUndefined();
  });
});

describe("run_tool history guard", () => {
  const HERE = "aaaaaaaaaaaaaaaa";
  const ELSEWHERE = "bbbbbbbbbbbbbbbb";

  /** What the check asked Galaxy, and the most it asked at once. */
  const asked: string[] = [];
  let inFlight = 0;
  let mostInFlight = 0;

  /**
   * Olit's check over galaxy-ops' run_tool, against datasets owned as `owners` says; an id it does
   * not list is one Galaxy will not show, and `failing` makes every lookup fail some other way.
   */
  function owned(owners: Record<string, string>, failing?: Error) {
    asked.length = 0;
    mostInFlight = 0;
    const ctx = context({
      get: async (path) => {
        asked.push(path);
        inFlight++;
        mostInFlight = Math.max(mostInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 1));
        inFlight--;
        if (failing) throw failing;
        const id = path.split("?")[0].split("/").pop()!;
        if (!(id in owners)) throw new HttpError("HTTP 404: History dataset not found", 404);
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
    expect(out).toContain("are in another history");
    expect(out).toContain("d1");
    expect(out).toContain("ds-d1");
    expect(out).toContain(ELSEWHERE);
    expect(out).toContain(HERE);
  });

  it("says what to do without naming an operation Olit does not have", async () => {
    const out = refused(await owned({ d1: ELSEWHERE })(HERE, { input: { src: "hda", id: "d1" } }));
    expect(out).toContain("get_history_contents");
    expect(out).toContain("ask them to copy it into this one in Galaxy");
    expect(out).not.toContain("copy it into this history first");
  });

  it("leaves an id Galaxy will not resolve for the run to report", async () => {
    const check = owned({ d2: ELSEWHERE });
    expect(await check(HERE, { a: { src: "hda", id: "nope" } })).toBeUndefined();
    const out = refused(
      await check(HERE, { a: { src: "hda", id: "nope" }, b: { src: "hda", id: "d2" } }),
    );
    expect(out).toContain("d2");
    expect(out).not.toContain("nope");
  });

  it("still ends when the call does", async () => {
    const stopped = new Error("stopped");
    await expect(
      owned({ d1: HERE }, stopped)(HERE, { input: { src: "hda", id: "d1" } }),
    ).rejects.toThrow("stopped");
  });

  it("asks once per reference, for no more than where it lives, a few at a time", async () => {
    const owners = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`d${i}`, HERE]));
    const values = [...Object.keys(owners), "d0", "d1"].map((id) => ({ src: "hda", id }));
    expect(
      await owned({ ...owners, c1: HERE })(HERE, {
        list: { values },
        coll: { src: "hdca", id: "c1" },
      }),
    ).toBeUndefined();
    expect(asked.filter((p) => !p.startsWith("api/tools/"))).toHaveLength(13);
    expect(asked.filter((p) => p.startsWith("api/datasets/"))).toSatisfy((ps: string[]) =>
      ps.every((p) => p.endsWith("?keys=history_id,name")),
    );
    expect(asked).toContain("api/dataset_collections/c1?view=collection");
    expect(mostInFlight).toBeLessThanOrEqual(4);
    expect(mostInFlight).toBeGreaterThan(1);
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
            // Galaxy's tabular datatypes, and only they, carry column metadata.
            ...(chunkable ? { metadata_column_types: ["str", "int"] } : {}),
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

  it("refuses an oversized dataset Galaxy cannot serve in parts, before fetching any of it", async () => {
    const d = dataset(BINARY, {
      size: MAX_DOWNLOAD_BYTES + 1,
      chunkable: false,
      details: { extension: "bam" },
    });
    expect(refused(await d.download("bigbam"))).toContain('cannot serve "bam" data in parts');
    expect(d.fetched.some((path) => path.includes("display"))).toBe(false);
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
      "No Galaxy tool matched 'plotly'",
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

  it("refuses a section edit that would drop its heading", async () => {
    const check = OPS_POLICY.update_page.check!;
    const section = (section_heading: string, section_content: string) =>
      check({ page_id: "p1", section_heading, section_content }, {} as never);
    const bare = await section("## Results", "Counted 3 teams.");
    expect(bare?.isError).toBe(true);
    expect(bare?.text).toContain('starts with "## Results"');
    const title = await section("Results", "## Results\n\nCounted 3 teams.");
    expect(title?.isError).toBe(true);
    expect(title?.text).toContain('"## Results"');
    expect(await section("## Results", "## Results\n\nCounted 3 teams.")).toBeUndefined();
    expect(await section("## Results", "## Findings\n\nRenamed.")).toBeUndefined();
  });
});

describe("a galaxy-ops failure, as the model reads it", () => {
  it("names the page Galaxy answered with, not the page itself", async () => {
    const page =
      "<html><head><title>500 Internal Server Error</title></head><body>" + "x".repeat(50_000);
    const fetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(page, { status: 500, headers: { "content-type": "text/html" } });
    try {
      const details = olitTools().find((t) => t.name === "get_history_details")!;
      const text = refused(await details.run({ history_id: "h1" }, context({})));
      expect(text).toContain("500 Internal Server Error");
      expect(text).not.toContain("<html");
      expect(text.length).toBeLessThan(200);
    } finally {
      globalThis.fetch = fetch;
    }
  });
});

describe("the work a call submitted", () => {
  const queued = { id: "o1", state: "queued" };

  /** An upload of /data/x.txt to a Galaxy answering the fetch with `outputs`. */
  async function upload(outputs: unknown[]) {
    const python = files();
    python.fs.set("/data/x.txt", new TextEncoder().encode("a\tb\n"));
    const ctx = context({ post: async () => ({ outputs, jobs: [] }) }, { python });
    return run("upload_file", { path: "/data/x.txt", history_id: "h1" }, ctx);
  }

  it("is read from a plain result", async () => {
    const out = await upload([queued]);
    expect(out).not.toBeInstanceOf(Outcome);
    expect(submittedBy("upload_file", out)).toEqual([
      { kind: "dataset", id: "o1", label: "upload_file", state: "queued" },
    ]);
  });

  it("is read from a result wrapped with a hint, as from a plain one", async () => {
    const failed = {
      id: "o2",
      state: "error",
      misc_info: "Failed to fetch url https://example.org/x.fastq",
    };
    const out = await upload([failed, queued]);
    expect(out).toBeInstanceOf(Outcome);
    expect(out.text).toContain("[olit]");
    expect(submittedBy("upload_file", out)).toEqual([
      { kind: "dataset", id: "o1", label: "upload_file", state: "queued" },
    ]);
  });

  it("is read from what galaxy-ops answered, not from its rendering", async () => {
    const fetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = input instanceof Request ? input : new Request(String(input), init);
      return new Response(
        JSON.stringify(
          request.method === "POST" && request.url.endsWith("/api/tools")
            ? { jobs: [{ id: "j1", state: "queued" }], outputs: [{ id: "o1" }] }
            : {},
        ),
        { headers: { "content-type": "application/json" } },
      );
    };
    try {
      const runTool = olitTools().find((t) => t.name === "run_tool")!;
      const out = await runTool.run(
        { history_id: "h1", tool_id: "cat1", inputs: {} },
        context({ get: async () => null }),
      );
      expect(out).toBeInstanceOf(Outcome);
      expect(submittedBy("run_tool", out)).toEqual([
        { kind: "job", id: "j1", label: "run_tool", state: "queued", outputs: ["o1"] },
      ]);
    } finally {
      globalThis.fetch = fetch;
    }
  });

  it("is nothing for a refusal", () => {
    expect(submittedBy("run_tool", new Outcome("Refused: no", true))).toEqual([]);
  });
});
