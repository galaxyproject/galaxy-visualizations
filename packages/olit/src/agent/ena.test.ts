import { afterEach, describe, expect, it, vi } from "vitest";

import { enaTools, RUNS_MAX } from "./ena";
import { connectWeb, ERROR_MAX } from "./galaxy";
import type { Context, Outcome } from "./tool";

const HEADER =
  "run_accession\tlibrary_layout\tfastq_ftp\tfastq_md5\tfastq_bytes\tread_count\tscientific_name\n";

const PAIRED =
  HEADER +
  "SRR390728\tPAIRED\t" +
  "ftp.sra.ebi.ac.uk/vol1/fastq/SRR390/SRR390728/SRR390728_1.fastq.gz;" +
  "ftp.sra.ebi.ac.uk/vol1/fastq/SRR390/SRR390728/SRR390728_2.fastq.gz\t" +
  "aaa;bbb\t101304405;101858469\t7156186\tHomo sapiens\n";

const SINGLE =
  HEADER +
  "SRR1031972\tSINGLE\t" +
  "ftp.sra.ebi.ac.uk/vol1/fastq/SRR103/002/SRR1031972/SRR1031972.fastq.gz\t" +
  "ccc\t770792599\t12000000\tMus musculus\n";

const STUDY =
  HEADER +
  [0, 1, 2, 3]
    .map(
      (i) =>
        `SRR1168499${i}\tPAIRED\t` +
        `ftp.sra.ebi.ac.uk/vol1/fastq/SRR116/09${i}/SRR1168499${i}/SRR1168499${i}_1.fastq.gz;` +
        `ftp.sra.ebi.ac.uk/vol1/fastq/SRR116/09${i}/SRR1168499${i}/SRR1168499${i}_2.fastq.gz\t` +
        `m${i};n${i}\t100;200\t21521133\tMus musculus\n`,
    )
    .join("");

const EMPTY = "run_accession\tlibrary_layout\tfastq_ftp\n";

/** Answers every request with `body`, or with `status` when given. */
function net(body: string, status = 200) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL) => {
    calls.push(input instanceof Request ? input.url : String(input));
    return new Response(body, { status });
  });
  return calls;
}

const [tool] = enaTools();

async function call(args: Record<string, unknown>) {
  const outcome = (await tool.run(args, { web: connectWeb() } as Context)) as Outcome;
  return { outcome, out: JSON.parse(outcome.text) };
}

async function refused(args: Record<string, unknown>) {
  const { outcome, out } = await call(args);
  expect(outcome.isError).toBe(true);
  return out;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ena_runs", () => {
  it("returns both mates of a paired run as fetchable urls", async () => {
    net(PAIRED);
    const { out } = await call({ accession: "SRR390728" });
    expect(out.count).toBe(1);
    const only = out.runs[0];
    expect(only.paired).toBe(true);
    expect(only.urls).toEqual([
      "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR390/SRR390728/SRR390728_1.fastq.gz",
      "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR390/SRR390728/SRR390728_2.fastq.gz",
    ]);
    expect(only.md5).toEqual(["aaa", "bbb"]);
    expect(only.bytes).toEqual([101304405, 101858469]);
    expect(only.mate1).toBe(only.urls[0]);
    expect(only.mate2).toBe(only.urls[1]);
    expect(only.unpaired).toBeUndefined();
  });

  /** One run as ENA reports it: its layout and its files, by name. */
  const run = (layout: string, files: string[]) =>
    HEADER +
    `SRR001\t${layout}\t` +
    files.map((f) => `ftp.sra.ebi.ac.uk/vol1/fastq/SRR001/${f}`).join(";") +
    "\t\t\t1\tHomo sapiens\n";

  it("names a paired run's mates by their file names, whatever the order", async () => {
    net(run("PAIRED", ["SRR001.fastq.gz", "SRR001_1.fastq.gz", "SRR001_2.fastq.gz"]));
    const only = (await call({ accession: "SRR001" })).out.runs[0];
    expect(only.paired).toBe(true);
    expect(only.mate1).toMatch(/SRR001_1\.fastq\.gz$/);
    expect(only.mate2).toMatch(/SRR001_2\.fastq\.gz$/);
    expect(only.unpaired).toEqual([expect.stringMatching(/SRR001\.fastq\.gz$/)]);
  });

  it("names no mates when the file names do not say which is which", async () => {
    for (const files of [["SRR001.fastq.gz"], ["SRR001_a.fastq.gz", "SRR001_b.fastq.gz"]]) {
      net(run("PAIRED", files));
      const only = (await call({ accession: "SRR001" })).out.runs[0];
      expect(only.paired, files.join()).toBe(true);
      expect(only.mate1, files.join()).toBeUndefined();
      expect(only.note, files.join()).toContain("do not say which file is which mate");
    }
  });

  it("takes pairing from ENA's layout, not from the number of files", async () => {
    net(run("SINGLE", ["SRR001_1.fastq.gz", "SRR001_2.fastq.gz"]));
    const only = (await call({ accession: "SRR001" })).out.runs[0];
    expect(only.paired).toBe(false);
    expect(only.mate1).toBeUndefined();
  });

  it("reports a single-end run as one file", async () => {
    net(SINGLE);
    const only = (await call({ accession: "SRR1031972" })).out.runs[0];
    expect(only.paired).toBe(false);
    expect(only.layout).toBe("SINGLE");
    expect(only.urls).toHaveLength(1);
    expect(only.urls.some((u: string) => u.endsWith("_1.fastq.gz"))).toBe(false);
  });

  it("returns every run under a study", async () => {
    net(STUDY);
    const { out } = await call({ accession: "PRJNA630239" });
    expect(out.count).toBe(4);
    expect(out.runs.map((r: { run: string }) => r.run)).toEqual(
      [0, 1, 2, 3].map((i) => `SRR1168499${i}`),
    );
    expect(out.runs.every((r: { paired: boolean }) => r.paired)).toBe(true);
  });

  it("caps a long study and says so", async () => {
    net(STUDY);
    const { out } = await call({ accession: "PRJNA630239", limit: 2 });
    expect(out.count).toBe(2);
    expect(out.truncated).toBe(true);
    expect(out.note).toContain("limit");
  });

  it("clamps the limit rather than trusting it", async () => {
    const calls = net(STUDY);
    await call({ accession: "PRJNA630239", limit: 10 ** 6 });
    expect(calls[0]).toContain(`limit=${RUNS_MAX + 1}`);
  });

  it("keeps the accession from rewriting the query", async () => {
    const calls = net(EMPTY);
    await call({ accession: "SRR1&result=analysis" });
    expect(calls[0].split("result=")).toHaveLength(2);
  });

  it("reports what ENA said about a rejected accession", async () => {
    net("Accession(s) NOPE not valid for search requests", 400);
    const out = await refused({ accession: "NOPE" });
    expect(out.error).toContain("not valid");
    expect(out.runs).toBeUndefined();
  });

  it("trims a long error", async () => {
    net("x".repeat(5000), 400);
    const out = await refused({ accession: "NOPE" });
    expect(out.error.length).toBeLessThanOrEqual(ERROR_MAX + 60);
  });

  it("says so when an accession has no runs", async () => {
    net(EMPTY);
    const { out } = await call({ accession: "SAMN00000000" });
    expect(out.count).toBe(0);
    expect(out.runs).toEqual([]);
    expect(out.hint).toContain("no sequencing runs");
  });

  it("refuses a missing accession before any fetch", async () => {
    const calls = net(PAIRED);
    const out = await refused({});
    expect(out.error).toContain("required");
    expect(calls).toEqual([]);
  });

  it("says what its urls are for, and leaves the route to the prompt", async () => {
    net(PAIRED);
    const { out } = await call({ accession: "SRR390728" });
    expect(out.hint).toContain("never edit or construct one");
    expect(out.hint).not.toMatch(/fastq_dump|fasterq_dump/);
  });

  it("is declared without a capability", () => {
    expect(tool.name).toBe("ena_runs");
    expect(tool.capability).toBeUndefined();
  });

  it("tells the model not to construct urls", () => {
    expect(tool.description).toContain("cannot be derived");
    expect(tool.description).toContain("guessing");
  });
});
