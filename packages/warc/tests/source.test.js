import { test } from "node:test";
import assert from "node:assert/strict";
import { archive } from "./fixtures.js";
import { openDataset } from "../src/source.js";
import { indexWarcFile, loadRecordDetail } from "../src/warc.js";

test("streams a dataset then fetches only selected compressed record ranges", async () => {
    const bytes = archive();
    const requests = [];
    const fetcher = async (url, options) => {
        requests.push({ url, ...options });
        const range = options.headers?.Range;
        if (!range)
            return new Response(bytes, {
                headers: { "Accept-Ranges": "bytes", "Content-Length": String(bytes.length) },
            });
        const [, start, end] = /^bytes=(\d+)-(\d+)$/.exec(range).map(Number);
        return new Response(bytes.subarray(start, end + 1), {
            status: 206,
            headers: { "Content-Range": `bytes ${start}-${end}/${bytes.length}` },
        });
    };
    const source = await openDataset("https://galaxy.example/prefix/api/datasets/id/display", { fetcher });
    const records = await indexWarcFile(source);
    const detail = await loadRecordDetail(source, records[2]);
    assert.equal(detail.payloadText, "Archived payload 3");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].headers.Range, `bytes=${records[2].offset}-${records[2].offset + records[2].length - 1}`);
    assert.ok(requests.every((request) => request.credentials === "same-origin"));
});

test("uses a local Blob when the server does not advertise ranges", async () => {
    let calls = 0;
    const source = await openDataset("https://galaxy.example/display", {
        fetcher: async () => {
            calls++;
            return new Response(archive());
        },
    });
    const records = await indexWarcFile(source);
    assert.equal((await loadRecordDetail(source, records[1])).payloadText, "Archived payload 2");
    assert.equal(calls, 1);
});

test("rejects ignored and mismatched range responses", async () => {
    for (const invalid of [
        new Response(archive()),
        new Response("short", { status: 206, headers: { "Content-Range": "bytes 1-3/999" } }),
    ]) {
        let calls = 0;
        const source = await openDataset("https://galaxy.example/display", {
            fetcher: async () =>
                ++calls === 1 ? new Response(archive(), { headers: { "Accept-Ranges": "bytes" } }) : invalid,
        });
        const records = await indexWarcFile(source);
        await assert.rejects(loadRecordDetail(source, records[0]), /invalid byte range/);
    }
});

test("reports access errors and rejects HTTP transport decompression", async () => {
    await assert.rejects(
        openDataset("https://galaxy.example/display", { fetcher: async () => new Response("", { status: 403 }) }),
        /HTTP 403/,
    );
    for (const encoding of ["gzip", "br", "deflate"]) {
        await assert.rejects(
            openDataset("https://galaxy.example/display", {
                fetcher: async () => new Response("", { headers: { "Content-Encoding": encoding } }),
            }),
            /HTTP .* encoding/,
        );
    }
});

test("reopens single-member gzip through a fresh sequential request", async () => {
    let calls = 0;
    const bytes = archive(undefined, "single");
    const source = await openDataset("https://galaxy.example/display", {
        fetcher: async (_url, options) => {
            calls++;
            assert.equal(options.headers?.Range, undefined);
            return new Response(bytes, { headers: { "Accept-Ranges": "bytes" } });
        },
    });
    const records = await indexWarcFile(source);
    assert.equal((await loadRecordDetail(source, records[2])).payloadText, "Archived payload 3");
    assert.equal(calls, 2);
});
