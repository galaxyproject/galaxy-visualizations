import warcio from "../vendor/warcio.js";

const MAX_PAYLOAD_BYTES = 16 * 1024 * 1024;
const MAX_PAYLOAD_CHARS = 50000;
const BINARY_SAMPLE_SIZE = 4000;
const HEX_DUMP_BYTES = 2000;

async function* chunks(file, signal, progress) {
    for await (const chunk of file.stream({ signal })) {
        signal?.throwIfAborted();
        progress?.(chunk.length);
        yield chunk;
    }
}

async function skipRecord(record, signal) {
    // The pinned parser's skipFully() retries forever at a premature EOF.
    // Iterating the raw reader lets us detect that EOF without decoding payloads.
    const reader = record.reader;
    for await (const _chunk of reader) signal?.throwIfAborted();
    if (reader.limit > 0) throw new Error("The archive is truncated inside a WARC record.");
}

/** Upstream's header-only first pass, with validation and gzip layout detection. */
export async function indexWarcFile(file, onProgress, { signal } = {}) {
    const records = [];
    let bytes = 0;
    const input = chunks(file, signal, (length) => {
        bytes += length;
    });
    const parser = new warcio.WARCParser(input, { keepHeadersCase: true, parseHttp: false });
    try {
        for await (const record of parser) {
            signal?.throwIfAborted();
            if (
                !/^WARC\/1\.[01]$/.test(record.warcHeaders.statusline) ||
                !record.warcType ||
                !record.warcHeader("WARC-Record-ID") ||
                !/^\d+$/.test(record.warcHeader("Content-Length") || "")
            ) {
                throw new Error("This dataset does not contain valid WARC 1.0 or 1.1 records.");
            }
            await skipRecord(record, signal);
            records.push({
                index: records.length,
                type: record.warcType || "unknown",
                uri: record.warcTargetURI || "N/A",
                recordId: record.warcHeader("WARC-Record-ID") || "",
                offset: parser.offset,
                length: parser.recordLength,
            });
            if (records.length % 250 === 0) {
                onProgress?.(records.length);
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
        }
    } finally {
        await input.return();
    }
    if (!records.length) throw new Error("No WARC records were found in this dataset.");
    // Multi-record gzip members cannot be sliced at individual record boundaries.
    const sequential = records.some((r, i) => r.offset + r.length > bytes || (i && r.offset <= records[i - 1].offset));
    for (const record of records) record.sequential = sequential;
    return records;
}

/** Upstream's second pass, with a sequential fallback and bounded decoded content. */
export async function loadRecordDetail(file, meta, { signal, maxPayloadBytes = MAX_PAYLOAD_BYTES } = {}) {
    const input = chunks(meta.sequential ? file : file.slice(meta.offset, meta.offset + meta.length), signal);
    const parser = new warcio.WARCParser(input, { keepHeadersCase: true, parseHttp: true });
    try {
        let record;
        for (let i = 0; i <= (meta.sequential ? meta.index : 0); i++) {
            signal?.throwIfAborted();
            record = await parser.parse();
            if (!record) throw new Error(`Could not read record ${meta.index + 1}. The archive may be truncated.`);
            if (meta.sequential && i < meta.index) await skipRecord(record, signal);
        }
        if (record.warcHeader("WARC-Record-ID") !== meta.recordId) {
            throw new Error("The archive changed or its record offsets are invalid. Reopen the dataset.");
        }
        const parts = [];
        const rawReader = record.reader;
        let length = 0;
        let truncated = false;
        for await (const chunk of record) {
            signal?.throwIfAborted();
            const remaining = maxPayloadBytes - length;
            parts.push(chunk.subarray(0, remaining));
            length += Math.min(chunk.length, remaining);
            if (chunk.length > remaining) {
                truncated = true;
                break;
            }
        }
        if (!truncated && rawReader.limit > 0) throw new Error("The archive is truncated inside the selected record.");
        const payloadBytes = new Uint8Array(length);
        let offset = 0;
        for (const part of parts) {
            payloadBytes.set(part, offset);
            offset += part.length;
        }
        const contentType =
            (record.httpHeaders && getHeaderCI(record.httpHeaders.headers, "Content-Type")) ||
            record.warcContentType ||
            null;
        const { text, note } = decodePayload(payloadBytes, contentType);
        return {
            headerText: [...record.warcHeaders.headers].map(([name, value]) => `${name}: ${value}`).join("\n"),
            httpHeaderText: buildHttpHeaderText(record),
            payloadText:
                text + (truncated ? "\n\n[Payload exceeds the preview limit; only its beginning is shown.]" : ""),
            metaNote: `${length.toLocaleString()} bytes${truncated ? " (preview limit)" : ""} · ${contentType || "content-type unknown"} · ${note}`,
            payloadBytes: truncated ? null : payloadBytes,
            httpContentType: contentType,
        };
    } finally {
        await input.return();
    }
}

// Header presentation and payload decoding retained from upstream app.js.
function getHeaderCI(headers, name) {
    if (!headers) return null;
    let value = headers.get(name);
    if (value == null && headers instanceof Map) {
        const lower = name.toLowerCase();
        for (const key of headers.keys()) {
            if (key.toLowerCase() === lower) {
                value = headers.get(key);
                break;
            }
        }
    }
    return value ?? null;
}

// Builds the text in the "HTTP Header" pane with original casing.
function buildHttpHeaderText(record) {
    if (!record.httpHeaders) {
        return "(This record has no embedded HTTP request/response headers.)";
    }
    const lines = [];
    if (record.httpHeaders.statusline) lines.push(record.httpHeaders.statusline);
    for (const [name, value] of record.httpHeaders.headers) {
        lines.push(`${name}: ${value}`);
    }
    return lines.join("\n") || "(empty HTTP header block)";
}

function isLikelyBinaryContentType(ct) {
    if (!ct) return false;
    const t = ct.toLowerCase();
    if (
        t.includes("json") ||
        t.includes("xml") ||
        t.includes("javascript") ||
        t.includes("html") ||
        t.includes("css") ||
        t.includes("warc-fields") ||
        t.startsWith("text/")
    ) {
        return false;
    }
    return (
        t.startsWith("image/") ||
        t.startsWith("font/") ||
        t.startsWith("audio/") ||
        t.startsWith("video/") ||
        t.includes("octet-stream") ||
        t.includes("pdf") ||
        t.includes("zip") ||
        t.includes("gzip")
    );
}

function looksBinaryByContent(bytes) {
    if (!bytes.length) return false;
    const sample = bytes.subarray(0, Math.min(bytes.length, BINARY_SAMPLE_SIZE));
    let control = 0;
    for (let i = 0; i < sample.length; i++) {
        const b = sample[i];
        if ((b < 0x20 && b !== 9 && b !== 10 && b !== 13) || b === 0x7f) control++;
    }
    return control / sample.length > 0.1;
}

function toHexDump(bytes) {
    const slice = bytes.subarray(0, Math.min(bytes.length, HEX_DUMP_BYTES));
    let hex = "";
    for (let i = 0; i < slice.length; i++) hex += slice[i].toString(16).padStart(2, "0");
    let out = `Binary content (${bytes.length.toLocaleString()} bytes):\n${hex}`;
    if (bytes.length > slice.length) out += "\n... (truncated)";
    return out;
}

function decodePayload(bytes, httpContentType) {
    if (!bytes || bytes.length === 0) {
        return { text: "No content.", note: "empty" };
    }

    let text;
    let note;

    if (isLikelyBinaryContentType(httpContentType) || looksBinaryByContent(bytes)) {
        text = toHexDump(bytes);
        note = "hex dump (binary content)";
    } else {
        try {
            text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
            note = "utf-8";
        } catch {
            text = new TextDecoder("windows-1252").decode(bytes);
            note = "windows-1252 (fallback)";
        }
    }

    if (text.length > MAX_PAYLOAD_CHARS) {
        text = text.slice(0, MAX_PAYLOAD_CHARS) + "\n\n[... Content truncated at 50,000 characters ...]";
        note += ", truncated";
    }

    return { text, note };
}
