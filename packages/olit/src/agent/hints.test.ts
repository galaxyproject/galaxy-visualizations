import { describe, expect, it } from "vitest";

import type { Galaxy } from "./galaxy";
import {
  catalogMissHint,
  fetchFailureHint,
  invocationOutcomeHint,
  iwcCandidatesHint,
} from "./hints";

const ENA_FAILURE = {
  id: "d1",
  name: "SRR390728_1.fastq.gz",
  state: "error",
  misc_info:
    "Failed to fetch url https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR390728/001/" +
    "SRR390728_1.fastq.gz. 404 Client Error: Not Found for url: " +
    "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR390728/001/SRR390728_1.fastq.gz",
};

const OTHER_FAILURE = {
  id: "d2",
  name: "1.fastq.gz",
  state: "error",
  misc_info:
    "Failed to fetch url https://raw.githubusercontent.com/galaxyproject/training-data/" +
    "master/short-read/fastq/1.fastq.gz. 404 Client Error: Not Found",
};

const RUNNING = { id: "d3", name: "SRR390728_1.fastq.gz", state: "running", misc_info: null };

describe("fetchFailureHint", () => {
  it("names the lookup for an archive fetch failure", () => {
    const out = fetchFailureHint(ENA_FAILURE)!;
    expect(out).toContain("ena_runs");
    expect(out).toContain("not derivable");
    expect(out).not.toMatch(/fastq_dump|fasterq_dump/);
  });

  it("refuses a second guess for any other fetch failure", () => {
    const out = fetchFailureHint(OTHER_FAILURE)!;
    expect(out).toContain("from memory");
    expect(out).not.toContain("ena_runs");
  });

  it("recognises an archive by an accession in the url", () => {
    const mirrored = {
      ...ENA_FAILURE,
      misc_info: "Failed to fetch url https://mirror.invalid/SRR390728_1.fastq.gz. 404",
    };
    expect(fetchFailureHint(mirrored)).toContain("ena_runs");
  });

  it("gives a healthy result nothing", () => {
    expect(fetchFailureHint(RUNNING)).toBeUndefined();
    expect(fetchFailureHint({ id: "d4", state: "ok" })).toBeUndefined();
    expect(fetchFailureHint([])).toBeUndefined();
  });

  it("gives an error that is not a fetch failure nothing", () => {
    expect(
      fetchFailureHint({ id: "d5", state: "error", misc_info: "Job was killed by the cluster" }),
    ).toBeUndefined();
  });

  it.each(["outputs", "datasets"])("finds a dataset nested under %s", (key) => {
    expect(fetchFailureHint({ [key]: [RUNNING, ENA_FAILURE] })).toContain("ena_runs");
  });

  it("searches a history listing too", () => {
    expect(fetchFailureHint([RUNNING, ENA_FAILURE])).toContain("ena_runs");
  });
});

function plugins(installed: { name: string; html?: string; tags?: string[] }[]) {
  const asked: string[] = [];
  const galaxy = {
    get: async (path: string) => {
      asked.push(path);
      return installed;
    },
  } as unknown as Galaxy;
  return { galaxy, asked };
}

const VIEWERS = [
  { name: "ngl", html: "NGL Viewer" },
  { name: "molstar", html: "Molstar Viewer" },
  { name: "plotly", html: "Bar, Line and Scatter", tags: ["Plotly", "Chart"] },
  { name: "plotly_box", html: "Box Plot", tags: ["Plotly"] },
  { name: "phylocanvas", html: "Phylogenetic Tree Visualization", tags: ["Tree", "FASTA"] },
  { name: "olit", html: "AI Research Assistant" },
];

describe("catalogMissHint", () => {
  const search = (galaxy: Galaxy, query: string, found: unknown[] = []) =>
    catalogMissHint(galaxy, "search_tools_by_name", { query }, found);

  it("redirects an empty search that names a visualization", async () => {
    const { galaxy } = plugins(VIEWERS);
    for (const query of ["ngl", "molstar structure", "plotly scatter", "plotly box chart"]) {
      const hint = await search(galaxy, query);
      expect(hint, query).toContain(`No Galaxy tool matched '${query}'`);
      expect(hint, query).toContain("list_visualizations");
    }
  });

  it("does not take a title's or a tag's words for a visualization's name", async () => {
    const { galaxy } = plugins(VIEWERS);
    for (const query of [
      "structure viewer",
      "filter fasta by length",
      "build a phylogenetic tree",
      "merge files and count",
    ]) {
      expect(await search(galaxy, query), query).toBeUndefined();
    }
  });

  it("leaves an empty search as it is when Galaxy will not list its plugins", async () => {
    const galaxy = {
      get: async () => {
        throw new Error("HTTP 502: 502 Bad Gateway");
      },
    } as unknown as Galaxy;
    expect(await search(galaxy, "plotly")).toBeUndefined();
  });

  it("redirects a search for a visualization's exact name, whatever tools it matched", async () => {
    const { galaxy } = plugins(VIEWERS);
    const fuzzy = [{ id: "createInterval", name: "Create single interval" }];
    for (const query of ["ngl", "NGL", "plotly_box"]) {
      const hint = await search(galaxy, query, fuzzy);
      expect(hint, query).toContain(`'${query}' is an installed visualization`);
      expect(hint, query).toContain("list_visualizations");
    }
  });

  it("leaves a search that found tools alone unless it is a visualization's exact name", async () => {
    const { galaxy } = plugins(VIEWERS);
    const found = [{ id: "some_tool" }];
    for (const query of ["structure viewer", "plotly scatter", "ngl viewer", "olit", "mol"]) {
      expect(await search(galaxy, query, found), query).toBeUndefined();
    }
  });

  it("never asks about plugins when a search of several words found tools", async () => {
    const { galaxy, asked } = plugins(VIEWERS);
    expect(await search(galaxy, "heatmap viewer", [{ id: "heatmap2" }])).toBeUndefined();
    expect(asked).toEqual([]);
  });

  it("says nothing when no visualization is named, nor for this agent", async () => {
    const { galaxy } = plugins(VIEWERS);
    expect(await search(galaxy, "bowtie2")).toBeUndefined();
    expect(await search(galaxy, "research assistant")).toBeUndefined();
  });

  it("reads a keyword search the same way", async () => {
    const { galaxy } = plugins(VIEWERS);
    const hint = await catalogMissHint(
      galaxy,
      "search_tools_by_keywords",
      { keywords: ["plotly"] },
      [],
    );
    expect(hint).toContain("No Galaxy tool matched 'plotly'");
  });

  it("gives a tool that is not a catalog search no hint", async () => {
    const { galaxy, asked } = plugins(VIEWERS);
    expect(await catalogMissHint(galaxy, "get_histories", { query: "plotly" }, [])).toBeUndefined();
    expect(asked).toEqual([]);
  });
});

describe("iwcCandidatesHint", () => {
  it("follows both IWC listings, as loom's iwc-candidates trigger does", () => {
    expect(iwcCandidatesHint("recommend_iwc_workflows")).toContain("get_iwc_workflow_details");
    expect(iwcCandidatesHint("search_iwc_workflows")).toBe(
      iwcCandidatesHint("recommend_iwc_workflows"),
    );
    expect(iwcCandidatesHint("get_iwc_workflow_details")).toBeUndefined();
  });
});

describe("invocationOutcomeHint", () => {
  /** Galaxy answering jobs_summary from `summaries`, by invocation id. */
  function jobs(summaries: Record<string, Record<string, number>>) {
    const asked: string[] = [];
    const galaxy = {
      get: async (path: string) => {
        asked.push(path);
        const id = path.match(/^api\/invocations\/([^/]+)\/jobs_summary$/)?.[1];
        return id && summaries[id] ? { states: summaries[id] } : {};
      },
    } as unknown as Galaxy;
    return { galaxy, asked };
  }

  it("names a listed invocation whose jobs failed while Galaxy reads it as scheduled", async () => {
    const { galaxy } = jobs({ i1: { error: 1, ok: 2 }, i2: { ok: 3 } });
    const hint = await invocationOutcomeHint(galaxy, "get_invocations", [
      { id: "i1", state: "scheduled" },
      { id: "i2", state: "completed" },
    ]);
    expect(hint).toContain('Invocation i1: outcome "failed"');
    expect(hint).toContain("get_job_details");
    expect(hint).not.toContain("i2");
  });

  it("says nothing of a listing whose jobs agree with Galaxy", async () => {
    const { galaxy } = jobs({ i2: { ok: 3 } });
    expect(
      await invocationOutcomeHint(galaxy, "get_invocations", [{ id: "i2", state: "completed" }]),
    ).toBeUndefined();
  });

  it("rolls up no more of a listing than galaxy-ops' page, and says which it left unchecked", async () => {
    const summaries = Object.fromEntries(
      Array.from({ length: 20 }, (_, i) => [`i${i}`, { ok: 1 }]),
    );
    const { galaxy, asked } = jobs(summaries);
    const listed = Array.from({ length: 25 }, (_, i) => ({ id: `i${i}`, state: "completed" }));
    const hint = await invocationOutcomeHint(galaxy, "get_invocations", listed);
    expect(asked).toHaveLength(20);
    expect(hint).toContain("the 5 listed after the first 20");
  });

  it("says which invocations' jobs could not be read", async () => {
    const { galaxy } = jobs({ i2: { ok: 1 } });
    const hint = await invocationOutcomeHint(galaxy, "get_invocations", [
      { id: "i1", state: "scheduled" },
      { id: "i2", state: "completed" },
    ]);
    expect(hint).toContain("i1 (their jobs could not be read)");
  });

  it("adds the note to an invocation read by id, whose outcome galaxy-ops gives", async () => {
    const { galaxy, asked } = jobs({});
    const one = { id: "i1", state: "scheduled", outcome: "failing" };
    expect(await invocationOutcomeHint(galaxy, "get_invocations", one)).toContain("not over");
    expect(asked).toEqual([]);
  });

  it("leaves other tools alone", async () => {
    const { galaxy } = jobs({});
    expect(await invocationOutcomeHint(galaxy, "get_histories", [{ id: "h1" }])).toBeUndefined();
  });
});
