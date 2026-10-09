import { createGalaxyContext } from "@galaxyproject/galaxy-ops/browser";
import { afterEach, describe, expect, it, vi } from "vitest";

import { connectGalaxy, connectWeb } from "./galaxy";
import { applyJobOutcome, noteSubmitted } from "./record-jobs";
import { editRecord } from "./record-write";
import { Outcome, type Context } from "./tool";
import { olitTools } from "./tools";

const ROOT = "http://galaxy.test/";
const RECORD =
  "## Record\n\nThis page is the running record for this analysis, maintained by Olit.\n";
const IMPORT = "## Data Import\n\n- Uploaded the FASTQ (dataset `d1`), queued.\n";

/** One Galaxy page, as Galaxy's pages API serves and stores it. */
function galaxyPage(content: string) {
  const page = { id: "p1", content_format: "markdown", content_editor: content, content };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(String(input), init);
    if (request.method === "PUT") {
      const body = JSON.parse(await request.text());
      if (body.content != null) page.content = page.content_editor = body.content;
    }
    return new Response(JSON.stringify(page), { headers: { "content-type": "application/json" } });
  });
  return page;
}

/** A tool call's context, as the session hosting the conversation hands it over. */
const context = (sessionId: string): Context => ({
  galaxy: connectGalaxy({ root: ROOT }),
  web: connectWeb(),
  ops: createGalaxyContext({ baseUrl: ROOT, apiKey: "" }),
  python: { run: async () => "", write: async () => {}, read: async () => undefined },
  binding: { sessionId, pageId: "p1" },
  artifacts: { prior: [], produced: [] },
});

const call = (name: string, args: Record<string, unknown>, sessionId = "s1") =>
  olitTools()
    .find((t) => t.name === name)!
    .run(args, context(sessionId)) as Promise<Outcome>;

/** A session's read of the record, and the hash it would edit against. */
async function read(sessionId = "s1"): Promise<string> {
  const out = await call("get_page", { page_id: "p1" }, sessionId);
  return JSON.parse(out.text).data.content_hash;
}

/** The watcher settling a failed upload, as it writes the record. */
const settles = (id: string) =>
  editRecord({ galaxy: connectGalaxy({ root: ROOT }), pageId: "p1" }, (content) =>
    applyJobOutcome(noteSubmitted(content, { id, kind: "dataset" }), {
      id,
      kind: "dataset",
      state: "error",
      outcome: "failed",
    }),
  );

afterEach(() => vi.unstubAllGlobals());

describe("a record edit made while the session wrote the record", () => {
  it("lands a section the session's lines did not touch, keeping those lines", async () => {
    const page = galaxyPage(RECORD);
    const hash = await read();
    await settles("d1");
    const out = await call("update_page", {
      page_id: "p1",
      section_heading: "## Data Import",
      section_content: IMPORT,
      expect_hash: hash,
    });
    expect(out.isError).toBe(false);
    expect(page.content_editor).toContain("Status: failed (error) — recorded automatically");
    expect(page.content_editor).toContain(IMPORT.trim());
  });

  it("refuses a section the session wrote into, so its line is not lost", async () => {
    const page = galaxyPage(`${RECORD}\n${IMPORT}`);
    const hash = await read();
    await settles("d1");
    const out = await call("update_page", {
      page_id: "p1",
      section_heading: "## Data Import",
      section_content: "## Data Import\n\n- Uploaded the FASTQ (dataset `d1`); retrying.\n",
      expect_hash: hash,
    });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("changed since it was read");
    expect(page.content_editor).toContain("Status: failed (error) — recorded automatically");
  });

  it("refuses an edit against another session's read of the same page and content", async () => {
    const page = galaxyPage(RECORD);
    const hash = await read("s1");
    await settles("d1");
    const out = await call(
      "update_page",
      {
        page_id: "p1",
        section_heading: "## Data Import",
        section_content: IMPORT,
        expect_hash: hash,
      },
      "s2",
    );
    expect(out.isError).toBe(true);
    expect(out.text).toContain("changed since it was read");
    expect(page.content_editor).not.toContain(IMPORT.trim());
  });

  it("refuses an edit against a read it was not shown", async () => {
    galaxyPage(RECORD);
    await settles("d1");
    const out = await call("update_page", {
      page_id: "p1",
      section_heading: "## Data Import",
      section_content: IMPORT,
      expect_hash: "0000beef",
    });
    expect(out.isError).toBe(true);
    expect(out.text).toContain("changed since it was read");
  });

  it("refuses a whole-page write against an older read", async () => {
    const page = galaxyPage(RECORD);
    const hash = await read();
    await settles("d1");
    const out = await call("update_page", {
      page_id: "p1",
      content: `${RECORD}\n${IMPORT}`,
      expect_hash: hash,
    });
    expect(out.isError).toBe(true);
    expect(page.content_editor).toContain("recorded automatically");
  });
});
