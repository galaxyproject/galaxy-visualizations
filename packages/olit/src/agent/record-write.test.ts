import { describe, expect, it } from "vitest";

import { HttpError, type Galaxy } from "./galaxy";
import { editRecord } from "./record-write";

/** A Galaxy holding the session's record page p1 and nothing else, recording every write. */
function galaxy(page: Record<string, unknown>, putOk = true) {
  const writes: string[] = [];
  const sources: (string | undefined)[] = [];
  const client = {
    get: async (path: string) => {
      if (path !== "api/pages/p1") {
        // The record is named by the session, never looked up.
        throw new HttpError("HTTP 404: not found", 404);
      }
      return page;
    },
    put: async (_path: string, body: { content: string; edit_source?: string }) => {
      writes.push(body.content);
      sources.push(body.edit_source);
      if (!putOk) {
        throw new HttpError("HTTP 500: refused", 500);
      }
      return {};
    },
  } as unknown as Galaxy;
  return { client, writes, sources };
}

const target = (client: Galaxy) => ({ galaxy: client, pageId: "p1" });

describe("editRecord", () => {
  it("writes as the agent", async () => {
    const { client, sources } = galaxy({ content_editor: "a" });
    await editRecord(target(client), (c) => `${c}b`);
    expect(sources).toEqual(["agent"]);
  });

  it("edits the editable source, never the embed-expanded render", async () => {
    // Galaxy returns the directive in content_editor and its expansion in content;
    // writing the render back would replace the directive with a one-time value.
    const { client, writes } = galaxy({
      content_editor: "${galaxy history_dataset_name(history_dataset_id=d1)}",
      content: "tracks.bed",
    });
    expect(await editRecord(target(client), (c) => `${c}\nmore`)).toBeUndefined();
    expect(writes).toEqual(["${galaxy history_dataset_name(history_dataset_id=d1)}\nmore"]);
  });

  it("falls back to content when the page has no editable source", async () => {
    const { client, writes } = galaxy({ content: "# Notebook" });
    await editRecord(target(client), (c) => `${c}\nmore`);
    expect(writes).toEqual(["# Notebook\nmore"]);
  });

  it("hands the edit the record's id", async () => {
    const { client, writes } = galaxy({ content_editor: "" });
    await editRecord(target(client), (_c, id) => `record: ${id}`);
    expect(writes).toEqual(["record: p1"]);
  });

  it("writes nothing when the edit changes nothing", async () => {
    const { client, writes } = galaxy({ content_editor: "# Notebook" });
    expect(await editRecord(target(client), (c) => c)).toBeUndefined();
    expect(writes).toEqual([]);
  });

  it("reports failure once the attempts are spent", async () => {
    const { client, writes } = galaxy({ content_editor: "# Notebook" }, false);
    expect(await editRecord(target(client), (c) => `${c}!`)).toContain("could not be written");
    expect(writes).toHaveLength(3);
  });

  it("gives up on a page Galaxy will not show", async () => {
    const { client, writes } = galaxy({ content_editor: "# Notebook" });
    expect(await editRecord({ galaxy: client, pageId: "gone" }, (c) => `${c}!`)).toContain(
      "would not show",
    );
    expect(writes).toEqual([]);
  });
});

describe("concurrent record writers", () => {
  it("keeps both edits when two writers do not await each other", async () => {
    // Galaxy's page PUT has no concurrency check, so interleaved reads lose an update.
    let stored = "# Notebook";
    // Both round trips take a tick, as a real one does: that is the window a second
    // writer reads in, and it is why the two edits have to be kept apart.
    const roundTrip = () => new Promise((r) => setTimeout(r, 0));
    const client = {
      get: async () => {
        await roundTrip();
        return { content_editor: stored };
      },
      put: async (_path: string, body: { content: string }) => {
        await roundTrip();
        stored = body.content;
        return {};
      },
    } as unknown as Galaxy;

    await Promise.all([
      editRecord(target(client), (c) => `${c}\njob submitted`),
      editRecord(target(client), (c) => `${c}\njob settled`),
    ]);
    expect(stored).toContain("job submitted");
    expect(stored).toContain("job settled");
  });
});
