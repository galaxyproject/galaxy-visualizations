/** The resend policy for model requests, and the delay a refusing server states. */

export const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
export const RATE_LIMITED = 429;
export const ATTEMPTS = 3;
// A rate limiter states how long to wait; guessing shorter guarantees the retry fails.
export const MAX_RETRY_AFTER_S = 60;
export const RETRY_INFO_TYPE = "type.googleapis.com/google.rpc.RetryInfo";
const INITIAL_BACKOFF_S = 1;

export interface RetryInfo {
  status: number;
  wait: number;
  attempt: number;
  of: number;
}

/** RFC 9110 `Retry-After`: delta-seconds or an HTTP-date. Both are in the wild. */
function retryAfterHeader(headers: Headers): number | undefined {
  const raw = headers.get("retry-after")?.trim();
  if (!raw) {
    return undefined;
  }
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) {
    return seconds;
  }
  const when = Date.parse(raw);
  return Number.isFinite(when) ? (when - Date.now()) / 1000 : undefined;
}

/** OpenAI sends `retry-after-ms` alongside, and sometimes instead of, the seconds form. */
function retryAfterMsHeader(headers: Headers): number | undefined {
  const raw = headers.get("retry-after-ms")?.trim();
  const ms = raw ? Number(raw) : NaN;
  return Number.isFinite(ms) ? ms / 1000 : undefined;
}

/** Google states the delay in a typed RetryInfo detail and sends no header at all. */
function googleRetryInfo(body: string): number | undefined {
  let payload: unknown;
  try {
    payload = JSON.parse(body);
  } catch {
    return undefined;
  }
  if (Array.isArray(payload)) {
    payload = payload[0];
  }
  const details = (payload as { error?: { details?: unknown } } | null)?.error?.details;
  for (const detail of Array.isArray(details) ? details : []) {
    if (detail?.["@type"] === RETRY_INFO_TYPE) {
      const delay = String(detail.retryDelay ?? "");
      const seconds = delay.endsWith("s") ? Number(delay.slice(0, -1)) : NaN;
      return Number.isFinite(seconds) ? seconds : undefined;
    }
  }
  return undefined;
}

/** The delay the server asked for in seconds, sources ordered by how standard they are. */
export function retryAfter(headers: Headers, body: string): number | undefined {
  const stated = retryAfterHeader(headers) ?? retryAfterMsHeader(headers) ?? googleRetryInfo(body);
  return stated === undefined ? undefined : Math.max(0, Math.min(stated, MAX_RETRY_AFTER_S));
}

/** A wait that ends early, rejecting, when the signal aborts. */
export function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal!.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * A fetch that resends a refused request while the server allows it, and says it is waiting.
 * Only for requests whose repeat is indistinguishable from the first attempt: a completion that
 * errored produced nothing, so asking again repeats nothing.
 */
export function retrying(send: typeof fetch, onRetry?: (info: RetryInfo) => void): typeof fetch {
  return async (input, init) => {
    for (let attempt = 0; ; attempt++) {
      const response = await send(input, init);
      if (response.ok || !RETRY_STATUS.has(response.status) || attempt === ATTEMPTS - 1) {
        return response;
      }
      const body = await response.text();
      const wait = retryAfter(response.headers, body) ?? INITIAL_BACKOFF_S * 2 ** attempt;
      try {
        onRetry?.({ status: response.status, wait, attempt: attempt + 1, of: ATTEMPTS });
      } catch {
        // A listener must not break the request.
      }
      await sleep(wait * 1000, init?.signal);
    }
  };
}
