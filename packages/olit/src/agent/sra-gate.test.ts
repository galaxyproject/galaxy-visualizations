import { beforeEach, describe, expect, it } from "vitest";

import { SraImportGate } from "./sra-gate";

const TOOL = "toolshed.g2.bx.psu.edu/repos/iuc/sra_tools/fasterq_dump/3.1.1+galaxy1";

type Args = Record<string, unknown> & { inputs: Record<string, unknown> | string };
type Call = { id: string; name: string; arguments: Args };

function call(id: string, accession: string, overrides: Record<string, unknown> = {}): Call {
  return {
    id,
    name: "run_tool",
    arguments: {
      history_id: "history-1",
      tool_id: TOOL,
      inputs: {
        "input|input_select": "accession_number",
        "input|accession": accession,
        "adv|seq_defline": "@$ac.$si/$ri",
        "adv|minlen": 0,
        "adv|split": "--split-3",
        "adv|skip_technical": true,
      },
      ...overrides,
    },
  };
}

/** A turn: a reply's calls are observed, then each is checked before it runs. */
class Turn {
  gate = new SraImportGate();
  assistant(calls: Call[]) {
    this.gate.observe(calls);
  }
  check(c: Call) {
    return this.gate.check(c.id, c.name, c.arguments);
  }
}

describe("SraImportGate", () => {
  let g: Turn;
  beforeEach(() => {
    g = new Turn();
  });

  it("blocks same-settings singletons before any of them runs", () => {
    const calls = Array.from({ length: 7 }, (_, i) => call(`c${i}`, `SRR${17449121 - i}`));
    g.assistant(calls);
    const reasons = calls.map((c) => g.check(c));
    expect(reasons.every(Boolean)).toBe(true);
    expect(reasons[0]).toContain(
      "SRR17449121,SRR17449120,SRR17449119,SRR17449118,SRR17449117,SRR17449116,SRR17449115",
    );
    const batch = call(
      "batch",
      calls.map((c) => (c.arguments.inputs as Record<string, string>)["input|accession"]).join(","),
    );
    g.assistant([batch]);
    expect(g.check(batch)).toBeUndefined();
  });

  it("passes a corrected subset and releases the batch", () => {
    g.assistant([call("a", "SRR1"), call("b", "SRR2"), call("c", "SRR3")]);
    const corrected = call("remaining", "SRR2,SRR3");
    g.assistant([corrected]);
    expect(g.check(corrected)).toBeUndefined();
    const later = call("later", "SRR2");
    g.assistant([later]);
    expect(g.check(later)).toBeUndefined();
  });

  it("does not force unrelated later accessions into a rejected batch", () => {
    g.assistant([call("a", "SRR1"), call("b", "SRR2")]);
    const unrelated = call("unrelated", "ERR10");
    g.assistant([unrelated]);
    expect(g.check(unrelated)).toBeUndefined();
  });

  it("cannot serialize a rejected batch across replies", () => {
    g.assistant([call("a", "SRR1"), call("b", "SRR2"), call("c", "SRR3")]);
    expect(g.check(call("a", "SRR1"))).toBeTruthy();
    const first = call("first", "SRR1");
    g.assistant([first]);
    expect(g.check(first)).toBeUndefined();
    const second = call("second", "SRR2");
    g.assistant([second]);
    expect(g.check(second)).toContain('"SRR2,SRR3"');
  });

  it("passes the one accession a preflight left missing", () => {
    g.assistant([call("a", "SRR1"), call("b", "SRR2")]);
    const missing = call("missing", "SRR2");
    g.assistant([missing]);
    expect(g.check(missing)).toBeUndefined();
  });

  it("lets a submitted batch be split to recover from its failure", () => {
    const batch = call("batch", "SRR1,SRR2");
    g.assistant([batch]);
    expect(g.check(batch)).toBeUndefined();
    const split = [call("a", "SRR1"), call("b", "SRR2")];
    g.assistant(split);
    expect(split.map((c) => g.check(c))).toEqual([undefined, undefined]);
  });

  it("passes a genuine single accession", () => {
    const single = call("only", "SRR1");
    g.assistant([single]);
    expect(g.check(single)).toBeUndefined();
  });

  it("does not let a batch outlive its turn", () => {
    g.assistant([call("a", "SRR1"), call("b", "SRR2")]);
    expect(new Turn().check(call("next", "SRR1"))).toBeUndefined();
  });

  it.each(["history", "settings", "version", "storage"])(
    "keeps imports with a different %s separate",
    (difference) => {
      const a = call("a", "SRR1");
      const b = call("b", "SRR2");
      const args = b.arguments;
      const inputs = args.inputs as Record<string, unknown>;
      if (difference === "history") args.history_id = "history-2";
      if (difference === "settings") inputs["adv|minlen"] = 100;
      if (difference === "version") args.tool_id = TOOL.replace("3.1.1", "3.0.0");
      if (difference === "storage") args.preferred_object_store_id = "archive";
      g.assistant([a, b]);
      expect(g.check(a)).toBeUndefined();
      expect(g.check(b)).toBeUndefined();
    },
  );

  it("treats nested and flat input encodings as the same settings", () => {
    const a = call("a", "SRR1");
    const b = call("b", "SRR2", {
      inputs: {
        input: { input_select: "accession_number", accession: "SRR2", __current_case__: 0 },
        adv: { seq_defline: "@$ac.$si/$ri", minlen: 0, split: "--split-3", skip_technical: true },
      },
    });
    g.assistant([a, b]);
    expect(g.check(a)).toBeTruthy();
    expect(g.check(b)).toBeTruthy();
  });

  it.each(["fastq_dump", "fasterq_dump"])("recognizes the bare wrapper id %s", (toolId) => {
    const calls = [call("a", "ERR1", { tool_id: toolId }), call("b", "DRR2", { tool_id: toolId })];
    g.assistant(calls);
    expect(calls.every((c) => g.check(c))).toBe(true);
  });

  it("treats a prefixed tool name as the same tool", () => {
    const calls = [call("a", "SRR1"), call("b", "SRR2")].map((c) => ({
      ...c,
      name: "galaxy_run_tool",
    }));
    g.assistant(calls);
    expect(calls.every((c) => g.check(c))).toBe(true);
  });

  it("accepts one list-file HDA as the correction of a rejected batch", () => {
    g.assistant([call("a", "SRR1"), call("b", "SRR2")]);
    const corrected = call("file", "unused");
    const inputs = corrected.arguments.inputs as Record<string, unknown>;
    delete inputs["input|accession"];
    inputs["input|input_select"] = "file_list";
    inputs["input|file_list"] = { src: "hda", id: "manifest-1" };
    g.assistant([corrected]);
    expect(g.check(corrected)).toBeUndefined();
  });

  it.each([
    { __class__: "Batch", values: ["SRR1", "SRR2"] },
    { batch: true, values: ["SRR1", "SRR2"] },
    { src: "hdca", id: "mapped-manifests" },
  ])("refuses Galaxy mapping %#", (value) => {
    const mapped = call("mapped", "unused", {
      inputs: { "input|input_select": "file_list", "input|file_list": value },
    });
    g.assistant([mapped]);
    expect(g.check(mapped)).toBeTruthy();
  });

  it("refuses duplicate accessions in one call and across siblings", () => {
    const duplicate = call("duplicate", "SRR1,SRR1");
    g.assistant([duplicate]);
    expect(g.check(duplicate)).toBeTruthy();
    const siblings = [call("a", "SRR1"), call("b", "SRR1")];
    g.assistant(siblings);
    expect(siblings.every((c) => g.check(c))).toBe(true);
    const corrected = call("deduplicated", "SRR1");
    g.assistant([corrected]);
    expect(g.check(corrected)).toBeUndefined();
  });

  it("leaves other tools, custom wrappers and malformed inputs alone", () => {
    const custom = TOOL.replace("/iuc/", "/custom/");
    const calls = [
      call("a", "SRR1", { tool_id: "fastp" }),
      call("b", "SRR2", { tool_id: "fastp" }),
      call("c", "SRR1", { tool_id: custom }),
      call("d", "SRR2", { tool_id: custom }),
      call("e", "SRR1", {
        inputs: {
          "input|input_select": "sra_file",
          "input|sra_file": { src: "hdca", id: "archives" },
        },
      }),
      call("f", "SRR1", { inputs: "not JSON" }),
    ];
    g.assistant(calls);
    expect(calls.map((c) => g.check(c))).toEqual(calls.map(() => undefined));
  });

  it("reads arguments delivered as a JSON string", () => {
    const calls = [call("a", "SRR1"), call("b", "SRR2")].map((c) => ({
      ...c,
      arguments: JSON.stringify(c.arguments) as unknown as Args,
    }));
    g.assistant(calls);
    expect(calls.every((c) => g.check(c))).toBe(true);
  });
});
