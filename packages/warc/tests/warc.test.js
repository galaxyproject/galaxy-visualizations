import { test } from "node:test";
import assert from "node:assert/strict";
import { archive, warcRecord } from "./fixtures.js";
import { indexWarcFile, loadRecordDetail } from "../src/warc.js";

for (const layout of ["plain", "members", "single"]) {
  test(`indexes and reopens every record in ${layout} archives`, async () => {
    const file = new Blob([archive(undefined, layout)]);
    const records = await indexWarcFile(file);
    assert.equal(records.length, 3);
    assert.deepEqual(records.map(record => record.type), ["response", "metadata", "response"]);
    assert.equal(records.every(record => record.sequential), layout === "single");
    for (const record of records) {
      const detail = await loadRecordDetail(file, record);
      assert.equal(detail.payloadText, `Archived payload ${record.index + 1}`);
      assert.match(detail.headerText, new RegExp(`record-${record.index + 1}`));
    }
  });
}

test("decodes HTTP gzip and uses the WARC content type for resource records", async () => {
  const file = new Blob([archive([
    warcRecord({ httpEncoding: "gzip", payload: "Decoded HTTP content" }),
    warcRecord({ index: 2, type: "resource", contentType: "image/png", payload: Buffer.from([137, 80, 78, 71]) }),
  ])]);
  const records = await indexWarcFile(file);
  assert.equal((await loadRecordDetail(file, records[0])).payloadText, "Decoded HTTP content");
  const image = await loadRecordDetail(file, records[1]);
  assert.equal(image.httpContentType, "image/png");
  assert.match(image.payloadText, /hex dump|Binary content/);
});

test("bounds decoded payloads, including compressed HTTP payloads", async () => {
  const file = new Blob([archive([warcRecord({ httpEncoding: "gzip", payload: "a".repeat(100_000) })])]);
  const records = await indexWarcFile(file);
  const detail = await loadRecordDetail(file, records[0], { maxPayloadBytes: 1024 });
  assert.equal(detail.payloadBytes, null);
  assert.match(detail.payloadText, /preview limit/);
  assert.match(detail.metaNote, /1,024 bytes/);
});

test("rejects invalid and empty input", async () => {
  for (const data of ["", "<html>Not a WARC</html>"]) {
    await assert.rejects(indexWarcFile(new Blob([data])), /valid WARC|No WARC/);
  }
});

test("rejects premature EOF inside a record instead of hanging", async () => {
  const bytes = warcRecord({ payload: "x".repeat(500) });
  await assert.rejects(indexWarcFile(new Blob([bytes.subarray(0, bytes.length - 200)])), /truncated/);
});

test("does not display a different record when offsets are wrong", async () => {
  const file = new Blob([archive()]);
  const records = await indexWarcFile(file);
  await assert.rejects(loadRecordDetail(file, { ...records[1], offset: records[0].offset, length: records[0].length }), /changed|offsets/);
});

test("honors cancellation before indexing and reading a selected record", async () => {
  const file = new Blob([archive()]);
  const records = await indexWarcFile(file);
  const signal = AbortSignal.abort();
  await assert.rejects(indexWarcFile(file, null, { signal }), { name: "AbortError" });
  await assert.rejects(loadRecordDetail(file, records[0], { signal }), { name: "AbortError" });
});
