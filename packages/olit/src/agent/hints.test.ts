import { describe, expect, it } from "vitest";

import type { Galaxy } from "./galaxy";
import { catalogMissHint, fetchFailureHint, iwcCandidatesHint } from "./hints";

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
    expect(out).toContain("fasterq_dump");
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

function plugins(installed: { name: string }[]) {
  const asked: string[] = [];
  const galaxy = {
    get: async (path: string) => {
      asked.push(path);
      return installed;
    },
  } as unknown as Galaxy;
  return { galaxy, asked };
}

describe("catalogMissHint", () => {
  it("answers a visualization name with where it lives", async () => {
    const { galaxy } = plugins([{ name: "plotly" }, { name: "igv" }]);
    const hint = await catalogMissHint(galaxy, "search_tools_by_name", { query: "plotly" }, []);
    expect(hint).toContain("'plotly' is a visualization");
    expect(hint).toContain("list_visualizations");
  });

  it("names neither this agent nor the frozen plugin", async () => {
    const { galaxy } = plugins([{ name: "olit" }]);
    expect(
      await catalogMissHint(galaxy, "search_tools_by_name", { query: "olit" }, []),
    ).toBeUndefined();
  });

  it("never asks about plugins when the search matched a real tool", async () => {
    const { galaxy, asked } = plugins([{ name: "plotly" }]);
    expect(
      await catalogMissHint(galaxy, "search_tools_by_name", { query: "bowtie2" }, [
        { id: "bowtie2" },
      ]),
    ).toBeUndefined();
    expect(asked).toEqual([]);
  });

  it("reads a keyword search the same way", async () => {
    const { galaxy } = plugins([{ name: "plotly" }]);
    const hint = await catalogMissHint(
      galaxy,
      "search_tools_by_keywords",
      { keywords: ["plotly"] },
      [],
    );
    expect(hint).toContain("'plotly' is a visualization");
  });

  it("gives a tool that is not a catalog search no hint", async () => {
    const { galaxy, asked } = plugins([{ name: "plotly" }]);
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
