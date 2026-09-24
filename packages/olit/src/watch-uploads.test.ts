import { describe, expect, it } from "vitest";

import { extractWatched, isFailure, isTerminal } from "./invocations";

const UPLOAD = JSON.stringify({
    outputs: [{ id: "d1", hda_ldda: "hda", state: "queued" }, { id: "d2", hda_ldda: "hda" }],
});

describe("a fetched dataset is watched work", () => {
    it("watches what an upload created, because the receipt is not an outcome", () => {
        expect(extractWatched("upload_file_from_url", UPLOAD)).toEqual([
            { kind: "dataset", id: "d1", label: "upload_file_from_url", state: "queued" },
            { kind: "dataset", id: "d2", label: "upload_file_from_url", state: undefined },
        ]);
    });

    it("calls an errored dataset a failure, which its __DATA_FETCH__ job does not", () => {
        expect(isTerminal("dataset", "error")).toBe(true);
        expect(isFailure("dataset", "error")).toBe(true);
        expect(isFailure("job", "ok")).toBe(false);
    });

    it("keeps waiting while the fetch is still running", () => {
        expect(isTerminal("dataset", "running")).toBe(false);
        expect(isTerminal("dataset", "queued")).toBe(false);
        expect(isTerminal("dataset", "ok")).toBe(true);
    });
});
