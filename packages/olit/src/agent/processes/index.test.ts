import { describe, expect, it } from "vitest";

import { Outcome, type Context, type OlitTool } from "../tool";
import { ARTIFACT_HINT, PROCESSES, processTools, type Process } from "./index";

function context(galaxy: Record<string, unknown> = {}) {
  return { galaxy, artifacts: { prior: [], produced: [] } } as unknown as Context;
}

const tools = () => Object.fromEntries(processTools().map((t) => [t.name, t]));
const params = (tool: OlitTool) =>
  tool.parameters as { properties: Record<string, any>; required: string[] };

async function call(tool: OlitTool, args: Record<string, unknown>, ctx = context()) {
  const out = await tool.run(args, ctx);
  expect(out).toBeInstanceOf(Outcome);
  return out as Outcome;
}

const plain = (overrides: Partial<Process>): Process => ({
  name: "plain",
  description: "A process with no summary of its own.",
  whenToUse: "",
  capabilities: ["read"],
  inputs: { value: { type: "string", default: "x" } },
  run: async (_galaxy, { value }) => ({ grouping: { structure: "list" }, value }),
  ...overrides,
});

describe("process tools", () => {
  it("advertises every process exactly once, sorted by name", () => {
    expect(processTools().map((t) => t.name)).toEqual(["lineage_report", "organize_datasets"]);
  });

  it("requires a process's declared inputs", () => {
    const fn = params(tools().organize_datasets);
    expect(fn.required).toEqual(["history_id"]);
    expect(fn.properties).toHaveProperty("collection_name");
  });

  it("keeps lineage's optional numbers optional", () => {
    const fn = params(tools().lineage_report);
    expect([...fn.required].sort()).toEqual(["dataset_id", "history_id"]);
    expect(fn.properties.depth.type).toBe("integer");
    expect(fn.properties.limit.type).toBe("integer");
  });

  it("makes an array input an array of strings", () => {
    expect(params(tools().organize_datasets).properties.tags).toEqual({
      type: "array",
      items: { type: "string" },
    });
  });

  it("shows a default to the model", () => {
    const props = params(tools().organize_datasets).properties;
    expect(props.structure.description).toContain('Defaults to "auto".');
    expect(props.collection_name.description).toBe('Defaults to "Collection".');
    expect(params(tools().lineage_report).properties.depth.description).toBe("Defaults to 4.");
  });

  it("carries when_to_use in the description", () => {
    for (const process of PROCESSES) {
      expect(tools()[process.name].description).toBe(
        `${process.description} Use ${process.whenToUse}.`,
      );
    }
  });

  it("carries per-input help to the model", () => {
    const description = params(tools().organize_datasets).properties.sample_regex.description;
    expect(description).toContain("sample");
    expect(description).toContain("mate");
  });

  it("returns a result as is when the process has no summary", async () => {
    const [tool] = processTools([plain({})]);
    expect(JSON.parse((await call(tool, { value: "kept" })).text)).toEqual({
      grouping: { structure: "list" },
      value: "kept",
    });
  });

  it("applies a declared default the caller left out", async () => {
    const [tool] = processTools([plain({})]);
    expect(JSON.parse((await call(tool, {})).text).value).toBe("x");
  });

  it("hears a refusal from a process's summary", async () => {
    const [tool] = processTools([
      plain({ summarize: () => ({ ok: false, error: "Refused: nope." }) }),
    ]);
    const out = await call(tool, {});
    expect(out.isError).toBe(true);
    expect(out.guard).toBe("process-refusal");
    expect(out.text).toContain("Refused: nope.");
  });

  it("returns a summary in place of the state", async () => {
    const [tool] = processTools([plain({ summarize: () => ({ ok: true, count: 1 }) })]);
    expect((await call(tool, {})).text).toBe('{"ok":true,"count":1}');
  });
});

describe("least privilege", () => {
  // Processes allowed to write. Adding a name here is a deliberate act.
  const WRITERS = ["organize_datasets"];

  it("declares read for every process, and write only for a listed one", () => {
    for (const process of PROCESSES) {
      expect(process.capabilities).toContain("read");
      if (!WRITERS.includes(process.name)) {
        expect(process.capabilities).not.toContain("write");
      }
    }
  });

  it("gives each tool the strongest capability its process declares", () => {
    expect(tools().organize_datasets.capability).toBe("write");
    expect(tools().lineage_report.capability).toBe("read");
    expect(
      processTools()
        .filter((t) => t.capability === "write")
        .map((t) => t.name),
    ).toEqual(WRITERS);
  });
});

describe("organize_datasets as a tool", () => {
  const SRA = [1, 2].flatMap((n) =>
    [1, 2].map((m) => ({
      id: `ds${n}${m}`,
      name: `SRR100${n}_${m}.fastq.gz`,
      history_content_type: "dataset",
    })),
  );

  it("pairs for a caller who names neither structure nor collection", async () => {
    const posted: any[] = [];
    const galaxy = {
      get: async () => SRA,
      post: async (_path: string, body: any) => (
        posted.push(body),
        { id: "hdca1", name: body.name }
      ),
    };
    const out = JSON.parse(
      (await call(tools().organize_datasets, { history_id: "h1" }, context(galaxy))).text,
    );
    expect(posted[0].collection_type).toBe("list:paired");
    expect(posted[0].name).toBe("Collection");
    expect(out.collection).toEqual({
      id: "hdca1",
      name: "Collection",
      type: "list:paired",
      elements: 2,
    });
  });

  it("refuses a compression-dropping datatype as a process refusal", async () => {
    const out = await call(
      tools().organize_datasets,
      { history_id: "h1", datatype: "fastqsanger" },
      context({ get: async () => SRA }),
    );
    expect(out.isError).toBe(true);
    expect(out.guard).toBe("process-refusal");
  });
});

describe("lineage_report as a tool", () => {
  it("routes its diagram to the shell and leaves a reference with the hint", async () => {
    const paths: string[] = [];
    const graph = { nodes: [{ src: "hda", id: "d1", name: "out" }], edges: [], truncated: {} };
    const ctx = context({ get: async (path: string) => (paths.push(path), graph) });
    const out = JSON.parse(
      (await call(tools().lineage_report, { history_id: "h1", dataset_id: "d1" }, ctx)).text,
    );
    expect(paths).toEqual([
      "api/histories/h1/graph?seed_src=hda&seed_id=d1&direction=backward&depth=4&limit=200",
    ]);
    expect(out.artifact).toEqual({ kind: "mermaid", title: "Dataset lineage" });
    expect(out.hint).toBe(ARTIFACT_HINT);
    expect(out.ok).toBe(true);
    expect(ctx.artifacts.produced[0].diagram).toContain('hda_d1["*out"]');
  });
});
