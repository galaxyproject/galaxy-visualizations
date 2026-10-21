function checkResponse(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
  const encoding = response.headers.get("content-encoding")?.toLowerCase();
  if (encoding && encoding !== "identity") {
    throw new Error(`The server applied HTTP ${encoding} encoding to the archive. Compressed byte offsets would be invalid.`);
  }
}

/** Fetch once for indexing; keep compressed offsets stable for later range requests. */
export async function openDataset(url, { signal, fetcher = fetch } = {}) {
  let initial = await fetcher(url, { signal, credentials: "same-origin" });
  checkResponse(initial);
  if (initial.headers.get("accept-ranges") !== "bytes") {
    // Servers without range support still work, with a complete local Blob.
    return initial.blob();
  }
  const size = Number(initial.headers.get("content-length")) || undefined;

  function source(start, end) {
    return {
      size,
      stream({ signal: readSignal } = {}) {
        const signals = [signal, readSignal].filter(Boolean);
        const combined = signals.length ? AbortSignal.any(signals) : undefined;
        return (async function* () {
          let response;
          if (start === undefined && initial) {
            response = initial;
            initial = null;
          } else {
            response = await fetcher(url, {
              signal: combined,
              credentials: "same-origin",
              headers: start === undefined ? {} : { Range: `bytes=${start}-${end - 1}` },
            });
          }
          try {
            checkResponse(response);
            if (start !== undefined) {
              const range = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get("content-range") || "");
              if (response.status !== 206 || !range || Number(range[1]) !== start || Number(range[2]) !== end - 1 ||
                  (size && Number(range[3]) !== size)) {
                throw new Error("The server returned an invalid byte range. Reopen the dataset to try again.");
              }
            }
            let length = 0;
            for await (const chunk of response.body) {
              combined?.throwIfAborted();
              length += chunk.length;
              if (start !== undefined && length > end - start) throw new Error("The server returned too many record bytes.");
              yield chunk;
            }
            if (start !== undefined && length !== end - start) throw new Error("The record download was truncated.");
          } finally {
            // A selected record may consume only a prefix of a sequential scan.
            if (!response.body?.locked) await response.body?.cancel().catch(() => {});
          }
        })();
      },
      slice(nextStart, nextEnd) {
        return source(nextStart, nextEnd);
      },
    };
  }
  return source();
}
