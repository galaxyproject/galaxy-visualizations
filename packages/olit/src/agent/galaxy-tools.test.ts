import { describe, expect, it } from "vitest";
import { createGalaxyContext } from "@galaxyproject/galaxy-ops/browser";
import { Watch } from "./watch";

import type { Galaxy } from "./galaxy";
import {
  annotate,
  galaxyTools,
  hdaInputs,
  JOB_LOG_BYTES,
  MAX_DOWNLOAD_BYTES,
  PREVIEW_LINES,
  settled,
} from "./galaxy-tools";
import { ROLLUP_LIMIT } from "./invocation-outcome";
import { djb2Hash } from "./page-edit";
import { Outcome, type Context, type Python } from "./tool";

type Fake = Partial<
  Record<"get" | "post" | "put" | "bytes", (path: string, body?: any) => Promise<any>>
>;

const MAX_TOOL_RESULT_BYTES = 256 * 1024;

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

  it("treats only catalog lookups as settled", () => {
    expect(settled("search_tools_by_name")).toBe(true);
    expect(settled("get_job_details")).toBe(false);
    expect(settled("update_page")).toBe(false);
  });
});

describe("get_history_contents", () => {
  function contents(args: Record<string, unknown>, rows: unknown = [{ id: "d1", hid: 1 }]) {
    const paths: string[] = [];
    const ctx = context({
      get: async (path) => {
        paths.push(path);
        return rows;
      },
    });
    return { paths, out: run("get_history_contents", { history_id: "h1", ...args }, ctx) };
  }

  it("sends an order with what makes it count", async () => {
    const { paths, out } = contents({ order: "hid-dsc" });
    await out;
    expect(paths[0]).toContain("order=hid-dsc");
    expect(paths[0]).toContain("v=dev");
  });

  it("still states the default order", async () => {
    const { paths, out } = contents({});
    await out;
    expect(paths[0]).toContain("order=hid-asc");
  });

  it("passes a create-time order through unchanged", async () => {
    const { paths, out } = contents({ order: "create_time-dsc" });
    await out;
    expect(paths[0]).toContain("order=create_time-dsc");
  });

  it("leaves out hidden and deleted items by default", async () => {
    const { paths, out } = contents({});
    await out;
    expect(paths[0]).toContain("q=deleted&q=visible");
    expect(paths[0]).toContain("qv=False&qv=True");
  });

  it("stops filtering on visible when hidden items are asked for", async () => {
    const { paths, out } = contents({ visible: false });
    await out;
    expect(paths[0]).not.toContain("q=visible");
    expect(paths[0]).toContain("q=deleted&qv=False");
  });

  it("stops filtering on deleted when deleted items are asked for", async () => {
    const { paths, out } = contents({ deleted: true });
    await out;
    expect(paths[0]).not.toContain("q=deleted");
    expect(paths[0]).toContain("q=visible&qv=True");
  });

  it("offers one identifier per dataset", async () => {
    const { out } = contents({}, [
      { id: "hda1", dataset_id: "underlying1", name: "x.tabular", hid: 1 },
    ]);
    const [item] = JSON.parse(await out).data;
    expect(item).toEqual({ id: "hda1", name: "x.tabular", hid: 1 });
  });

  it("says that more exist beyond a bounded page", async () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ id: `d${i}`, hid: i }));
    const { paths, out } = contents({}, rows);
    const got = JSON.parse(await out);
    expect(paths[0]).toContain("limit=101");
    expect(got.data).toHaveLength(100);
    expect(got.pagination).toMatchObject({ has_next: true, next_offset: 100 });
  });

  it("appends fetch-failure triage to a result it produced itself", async () => {
    const failure = {
      id: "d1",
      state: "error",
      misc_info:
        "Failed to fetch url https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR390728/001/SRR390728_1.fastq.gz. 404",
    };
    const { out } = contents({}, failure);
    const [payload, appended] = textOf(await out).split("\n\n");
    expect(JSON.parse(payload).data.state).toBe("error");
    expect(appended).toContain("ena_runs");
  });
});

function textOf(out: unknown): string {
  expect(out).toBeInstanceOf(Outcome);
  expect((out as Outcome).isError).toBe(false);
  return (out as Outcome).text;
}

describe("run_tool history guard", () => {
  const HERE = "aaaaaaaaaaaaaaaa";
  const ELSEWHERE = "bbbbbbbbbbbbbbbb";

  function owned(owners: Record<string, string>) {
    const posted: any[] = [];
    const ctx = context({
      get: async (path) => {
        const id = path.split("/").pop()!;
        return { id, name: `ds-${id}`, history_id: owners[id] };
      },
      post: async (_path, body) => {
        posted.push(body);
        return { jobs: [{ id: "j1", state: "new" }] };
      },
    });
    const submit = (historyId: string, inputs: unknown) =>
      run("run_tool", { history_id: historyId, tool_id: "cat1", inputs }, ctx);
    return { posted, submit };
  }

  it("allows a dataset in the target history", async () => {
    const { posted, submit } = owned({ d1: HERE });
    const out = await submit(HERE, { input: { src: "hda", id: "d1" } });
    expect(posted).toHaveLength(1);
    expect(out.jobs[0].state).toBe("new");
  });

  it("asks Galaxy for the tool version the model named, and only then", async () => {
    const { posted } = owned({ d1: HERE });
    const ctx = context({
      get: async () => ({ id: "d1", history_id: HERE }),
      post: async (_path, body) => {
        posted.push(body);
        return { jobs: [] };
      },
    });
    await run(
      "run_tool",
      { history_id: HERE, tool_id: "cat1", inputs: {}, tool_version: "1.1" },
      ctx,
    );
    await run("run_tool", { history_id: HERE, tool_id: "cat1", inputs: {} }, ctx);
    expect(posted[0].tool_version).toBe("1.1");
    expect(posted[1]).not.toHaveProperty("tool_version");
  });

  it("refuses a dataset from another history before submission", async () => {
    const { posted, submit } = owned({ d1: ELSEWHERE });
    const out = refused(await submit(HERE, { input: { src: "hda", id: "d1" } }));
    expect(posted).toEqual([]);
    expect(out).toContain("d1");
    expect(out).toContain(ELSEWHERE);
    expect(out).toContain(HERE);
  });

  it("allows working in a newly created history", async () => {
    const fresh = "cccccccccccccccc";
    const { posted, submit } = owned({ d1: fresh });
    await submit(fresh, { input: { src: "hda", id: "d1" } });
    expect(posted).toHaveLength(1);
  });

  it("refuses the whole submission for one bad input among several", async () => {
    const { posted, submit } = owned({ d1: HERE, d2: ELSEWHERE, d3: HERE });
    const out = refused(
      await submit(HERE, {
        a: { src: "hda", id: "d1" },
        b: { src: "hda", id: "d2" },
        c: { src: "hda", id: "d3" },
      }),
    );
    expect(posted).toEqual([]);
    expect(out).toContain("d2");
  });

  it("inspects nested and repeated inputs", async () => {
    const { posted, submit } = owned({ d1: HERE, d2: ELSEWHERE });
    const out = refused(
      await submit(HERE, {
        queries: [{ input2: { src: "hda", id: "d1" } }, { input2: { src: "hda", id: "d2" } }],
      }),
    );
    expect(posted).toEqual([]);
    expect(out).toContain("d2");
  });

  it("leaves non-dataset parameters alone", async () => {
    const { posted, submit } = owned({ d1: HERE });
    await submit(HERE, { input: { src: "hda", id: "d1" }, cond: "c3=='Gold'", lines: 5 });
    expect(posted[0].inputs.cond).toBe("c3=='Gold'");
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

describe("run_tool parameter help", () => {
  const REJECTION = "HTTP 400: Parameter '0|other_column' has an invalid key structure.";

  function rejecting(error: Error, toolAnswer?: unknown) {
    const asked: string[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(
        (input instanceof Request ? input : new Request(String(input), init)).url,
      );
      asked.push(url.pathname);
      if (url.pathname.endsWith("/version")) {
        return Response.json({ version_major: "26.1", version_minor: "0" });
      }
      return toolAnswer === undefined
        ? new Response("no such tool", { status: 404 })
        : Response.json(toolAnswer);
    };
    const ctx = context(
      {
        get: async () => ({}),
        post: async () => {
          throw error;
        },
      },
      { ops: createGalaxyContext({ baseUrl: "http://galaxy.test/", apiKey: "", fetchImpl }) },
    );
    return { asked, out: run("run_tool", { history_id: "h1", tool_id: "sort1", inputs: {} }, ctx) };
  }

  const TOOL = { id: "sort1", inputs: [{ name: "column", type: "text", value: "" }] };

  it("attaches the template galaxy-ops builds", async () => {
    const out = refused(await rejecting(new Error(REJECTION), TOOL).out);
    expect(out).toContain("invalid key structure");
    expect(out).toContain("Fill this template");
    expect(out).toContain('"column"');
  });

  it("still reports the rejection without a template", async () => {
    const out = refused(await rejecting(new Error(REJECTION)).out);
    expect(out).toContain("invalid key structure");
    expect(out).not.toContain("Fill this template");
  });

  it("asks for the template of the tool that was rejected", async () => {
    const { asked, out } = rejecting(new Error(REJECTION), TOOL);
    await out;
    expect(asked).toContain("/api/tools/sort1");
  });

  it("leaves an unrelated failure alone", async () => {
    await expect(rejecting(new Error("HTTP 500: upstream exploded")).out).rejects.toThrow(
      "upstream exploded",
    );
  });
});

describe("get_job_details", () => {
  function job(record: Record<string, unknown>) {
    const paths: string[] = [];
    const ctx = context({
      get: async (path) => {
        paths.push(path);
        return path.startsWith("api/datasets/") ? { id: "d1", creating_job: "j1" } : record;
      },
    });
    return { paths, out: run("get_job_details", { dataset_id: "d1" }, ctx) };
  }

  it("keeps a chatty job under the result cap", async () => {
    const noisy = Array.from({ length: 30000 }, (_, i) => `line ${i} of warnings`).join("\n");
    const out = await job({ id: "j1", state: "error", tool_stderr: noisy, stderr: noisy }).out;
    expect(new TextEncoder().encode(JSON.stringify(out)).length).toBeLessThan(
      MAX_TOOL_RESULT_BYTES,
    );
  });

  it("keeps the first line through a flood of warnings", async () => {
    const noise = Array(600)
      .fill("Invalid bed line (skipped): @SQ SN:chr1 LN:248956422")
      .join("\n");
    const out = await job({
      id: "j1",
      tool_stderr: "Reading reference bed file: ref.dat\n" + noise,
    }).out;
    expect(out.tool_stderr.startsWith("Reading reference bed file: ref.dat")).toBe(true);
    expect(out.tool_stderr).toContain("bytes omitted");
  });

  it("keeps the end of the log", async () => {
    const noisy = Array.from({ length: 2000 }, (_, i) => `warning number ${i}`).join("\n");
    const out = await job({ id: "j1", tool_stderr: noisy + "\nRuntimeError: the real cause" }).out;
    expect(out.tool_stderr.endsWith("RuntimeError: the real cause")).toBe(true);
    expect(new TextEncoder().encode(out.tool_stderr).length).toBeLessThanOrEqual(
      JOB_LOG_BYTES + "[... x of y bytes omitted ...]\n".length,
    );
  });

  it("keeps whole lines at both cuts", async () => {
    const noisy = Array.from({ length: 2000 }, (_, i) => `warning number ${i}`).join("\n");
    const out = await job({ id: "j1", tool_stderr: noisy }).out;
    const lines: string[] = out.tool_stderr.split("\n");
    expect(lines[0]).toBe("warning number 0");
    expect(lines[lines.length - 1]).toBe("warning number 1999");
    expect(lines.find((line) => line.includes("omitted"))).toMatch(
      new RegExp(`of ${noisy.length} bytes omitted \\.\\.\\.\\]$`),
    );
  });

  it("returns a short log whole", async () => {
    const out = await job({ id: "j1", tool_stderr: "Traceback: boom" }).out;
    expect(out.tool_stderr).toBe("Traceback: boom");
  });

  it("leaves the rest of the job untouched", async () => {
    const { paths, out } = job({ id: "j1", state: "error", params: { input: "d0" } });
    const got = await out;
    expect(got.params).toEqual({ input: "d0" });
    expect(got.state).toBe("error");
    expect(paths[paths.length - 1]).toBe("api/jobs/j1?full=true");
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
    expect(out).toContain("not 'ok'");
    expect(out).toContain("running");
    expect(d.fs.size).toBe(0);
  });

  it("refuses an errored dataset", async () => {
    expect(refused(await dataset(TABLE, { state: "error" }).download("abc123"))).toContain(
      "not 'ok'",
    );
  });

  it("refuses a dataset that states no state", async () => {
    expect(refused(await dataset(TABLE, { state: null }).download("abc123"))).toContain(
      "state None",
    );
  });

  it("downloads an ok dataset", async () => {
    const out = await dataset(TABLE).download("abc123");
    expect(out.path).toBe("/data/abc123.dat");
    expect(out.lines).toBe(120);
  });
});

describe("get_invocations", () => {
  const SCHEDULED = { id: "i1", state: "completed", history_id: "h1" };

  function invocations(listed?: unknown[], failing = false) {
    const paths: string[] = [];
    const ctx = context({
      get: async (path) => {
        paths.push(path);
        if (path.endsWith("jobs_summary")) {
          if (failing) {
            throw new Error("HTTP 500");
          }
          return { states: { error: 1, ok: 1 } };
        }
        if (listed && path.startsWith("api/invocations?")) {
          return listed;
        }
        return { ...SCHEDULED };
      },
    });
    return { paths, ask: (args: Record<string, unknown>) => run("get_invocations", args, ctx) };
  }

  it("rolls up one invocation", async () => {
    const { paths, ask } = invocations();
    const out = await ask({ invocation_id: "i1" });
    expect(out.outcome).toBe("failed");
    expect(paths.some((p) => p.endsWith("jobs_summary"))).toBe(true);
  });

  it("rolls up a listing too", async () => {
    const out = await invocations([{ ...SCHEDULED }, { ...SCHEDULED, id: "i2" }]).ask({
      history_id: "h1",
    });
    expect(out.map((i: any) => i.outcome)).toEqual(["failed", "failed"]);
  });

  it("stops rolling up a long listing", async () => {
    const many = Array.from({ length: ROLLUP_LIMIT + 3 }, (_, n) => ({
      ...SCHEDULED,
      id: `i${n}`,
    }));
    const { paths, ask } = invocations(many);
    const out = await ask({ history_id: "h1" });
    expect(out.filter((i: any) => "outcome" in i)).toHaveLength(ROLLUP_LIMIT);
    expect(paths.filter((p) => p.endsWith("jobs_summary"))).toHaveLength(ROLLUP_LIMIT);
  });

  it("survives a jobs summary that fails", async () => {
    const out = await invocations(undefined, true).ask({ invocation_id: "i1" });
    expect(out.outcome).toBe("completed");
    expect(out.job_states).toEqual({});
  });
});

describe("recommend_biocontainer", () => {
  it("refuses an invalid package list in prose", async () => {
    expect(refused(await run("recommend_biocontainer", { packages: [] }, context({})))).toContain(
      "at least one",
    );
  });
});

describe("update_page", () => {
  const DOC = "## Record\n\nintro\n\n## Methods\n\nold\n\n## Results\n\nfindings\n";
  const ALSO_REAL = "0c97fda4aafcf418";

  function page(content = DOC) {
    const puts: any[] = [];
    const ctx = context({
      get: async () => ({ id: "p1", content_editor: content }),
      put: async (_path, body) => {
        puts.push(body);
        return { id: "p1", content_editor: body.content ?? content };
      },
    });
    return {
      puts,
      update: (args: Record<string, unknown>) =>
        run("update_page", { page_id: "p1", ...args }, ctx),
    };
  }

  it("leaves other sections alone in a section edit", async () => {
    const p = page();
    await p.update({ section_heading: "## Methods", section_content: "## Methods\n\nnew\n" });
    expect(p.puts[0].content).toContain("new");
    expect(p.puts[0].content).toContain("findings");
    expect(p.puts[0].content).not.toContain("old");
  });

  it("refuses a write against a stale hash", async () => {
    const p = page();
    const out = await p.update({ content: "clobber", expect_hash: "deadbeef" });
    expect(out.written).toBe(false);
    expect(p.puts).toEqual([]);
    expect(out.content_hash).toBe(djb2Hash(DOC));
    expect(out.content).toBe(DOC);
  });

  it("allows a write against the current hash", async () => {
    const p = page();
    await p.update({ content: "fresh", expect_hash: djb2Hash(DOC) });
    expect(p.puts[0].content).toBe("fresh");
  });

  it("reports the new hash", async () => {
    expect((await page().update({ content: "fresh" })).content_hash).toBe(djb2Hash("fresh"));
  });

  it("marks every write as an agent edit", async () => {
    const p = page();
    await p.update({ content: "x" });
    expect(p.puts[0].edit_source).toBe("agent");
  });

  it("refuses a malformed id before Galaxy sees it, in prose that points at the artifact token", async () => {
    const p = page("## Record\n");
    const out = await p.update({
      content: "```galaxy\nhistory_dataset_display(history_dataset_id=reads)\n```",
    });
    expect(out).toBeInstanceOf(Outcome);
    expect(out.guard).toBe("malformed-object-id");
    const text = refused(out);
    expect(text.trimStart().startsWith("{")).toBe(false);
    expect(text).toContain("{{artifact}}");
    expect(text).toContain("history_dataset_id=reads");
    expect(p.puts).toEqual([]);
  });

  it("accepts an encoded id written by hand", async () => {
    const p = page("## Record\n");
    const out = await p.update({
      content: `\`\`\`galaxy\nhistory_dataset_display(history_dataset_id=${ALSO_REAL})\n\`\`\``,
    });
    expect(out).not.toBeInstanceOf(Outcome);
    expect(p.puts[0].content.endsWith("```")).toBe(true);
  });

  it("checks a section edit too", async () => {
    const out = await page().update({
      content: null,
      section_heading: "## Chart",
      section_content: "visualization(history_dataset_id=reads)",
    });
    expect(out.guard).toBe("malformed-object-id");
  });
});

describe("get_page", () => {
  it("adds the content hash and withholds the rendered content", async () => {
    const ctx = context({
      get: async () => ({ id: "p1", content_editor: "## A", content: "<h2>A</h2>" }),
    });
    const out = await run("get_page", { page_id: "p1" }, ctx);
    expect(out.content_hash).toBe(djb2Hash("## A"));
    expect(out).not.toHaveProperty("content");
    expect((await run("get_page", { page_id: "p1", include_rendered: true }, ctx)).content).toBe(
      "<h2>A</h2>",
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
