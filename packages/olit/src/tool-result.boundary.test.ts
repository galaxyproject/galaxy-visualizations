/** The contract between the brain and the shell, tested across the real boundary.
 *
 * The shell reads tool content structurally, and for a while it read a shape the brain had
 * stopped producing: `rendered()` put every Galaxy payload under `data`, the readers kept
 * looking at the top level, and both suites stayed green because each built its own fixture.
 * The watcher silently watched nothing.
 *
 * So the samples here are not written by hand. They are dispatched through the real tool
 * surface by `brain/tests/tool_result_samples.py` and read by the real functions the shell
 * uses. A one-sided change to either side fails this test.
 */
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { extractWatched } from "./invocations";
import { historyFromResult, recordPageFromResult } from "./working-history";
import { galaxyData, galaxyObject, toolPayload } from "./tool-result";

const BRAIN = resolve(__dirname, "../brain");

/** What the brain actually hands the shell, produced by the brain. */
function samples(): Record<string, string> {
  // No try/catch and no skip: the suite already requires this interpreter, and a boundary
  // test that quietly does not run is how the drift it guards against got in.
  const out = execFileSync("python3", ["tests/tool_result_samples.py"], {
    cwd: BRAIN,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return JSON.parse(out);
}

const real = samples();
const sample = (name: string) => {
  const content = real[name];
  expect(content, `brain produced no sample for ${name}`).toBeTypeOf("string");
  return content;
};

describe("what the brain hands the shell", () => {
  it("puts every Galaxy payload under data", () => {
    for (const name of ["run_tool", "upload_file_from_url", "invoke_workflow", "create_history"]) {
      expect(toolPayload(sample(name)), `${name} is not an object`).toBeTypeOf("object");
      expect(galaxyData(sample(name)), `${name} carries no data`).toBeTypeOf("object");
    }
  });

  it("answers an Olit tool with its own object rather than an envelope", () => {
    // notebook_resume is the record, not a Galaxy operation, and the shell reads it directly.
    expect(galaxyData(sample("notebook_resume"))).toBeUndefined();
    expect(toolPayload(sample("notebook_resume"))?.page_id).toBe("p9");
  });

  it("may append a hint after the JSON, so the payload is not the whole string", () => {
    const content = sample("upload_file_from_url_failed_fetch");
    expect(content).toContain("\n\n");
    expect(content).toMatch(/ena_runs/);
    expect(galaxyObject(content)?.outputs).toHaveLength(1);
  });
});

describe("the watcher, against what the brain really returns", () => {
  it("watches the jobs run_tool queued", () => {
    expect(extractWatched("run_tool", sample("run_tool"))).toEqual([
      { kind: "job", id: "j1", label: "run_tool", state: "new" },
    ]);
  });

  it("watches the datasets an upload created", () => {
    expect(extractWatched("upload_file_from_url", sample("upload_file_from_url"))).toEqual([
      { kind: "dataset", id: "d2", label: "upload_file_from_url", state: "queued" },
    ]);
  });

  it("watches the invocation a workflow run started", () => {
    expect(extractWatched("invoke_workflow", sample("invoke_workflow"))).toEqual([
      { kind: "invocation", id: "i1", label: "invoke_workflow", state: "new" },
    ]);
  });

  it("does not wait on work that already ended", () => {
    // The failed upload's dataset is in `error`, which it will not leave.
    expect(
      extractWatched("upload_file_from_url", sample("upload_file_from_url_failed_fetch")),
    ).toEqual([]);
  });
});

describe("the working history, against what the brain really returns", () => {
  it("is the one a created history names as its own id", () => {
    expect(historyFromResult("create_history", sample("create_history"))).toBe("h-new");
  });

  it("is the one an invocation says it ran in", () => {
    expect(historyFromResult("invoke_workflow", sample("invoke_workflow"))).toBe("h-inv");
  });

  it("is the one an upload's outputs landed in", () => {
    expect(historyFromResult("upload_file_from_url", sample("upload_file_from_url"))).toBe("h1");
  });

  it("is the one a listing of contents was read from", () => {
    expect(historyFromResult("get_history_contents", sample("get_history_contents"))).toBe("h1");
  });
});

describe("the record page, against what the brain really returns", () => {
  it("is the one notebook_resume answered with", () => {
    expect(recordPageFromResult("notebook_resume", sample("notebook_resume"))).toBe("p9");
  });

  it("is not read from any other tool", () => {
    expect(
      recordPageFromResult("get_history_contents", sample("get_history_contents")),
    ).toBeUndefined();
  });
});
