const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const IDEMPOTENT = new Set(["GET", "HEAD", "PUT", "DELETE"]);
const ATTEMPTS = 3;
const MAX_RETRY_AFTER_S = 60;

/** RFC 9110 `Retry-After` in seconds: delta-seconds or an HTTP-date. */
function retryAfter(headers: Headers): number | undefined {
  const raw = headers.get("retry-after")?.trim();
  if (!raw) {
    return undefined;
  }
  const seconds = Number.isFinite(Number(raw))
    ? Number(raw)
    : (Date.parse(raw) - Date.now()) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.min(seconds, MAX_RETRY_AFTER_S)) : undefined;
}

/** A wait that ends early, rejecting, when the signal aborts. */
function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
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

/** A value placed in a Galaxy path, encoded: an id the model wrote must not add a segment,
 * a query or a fragment to the request it names. Encoding leaves dots alone, and a URL reads
 * `..` (or `%2e%2e`) as the parent, so those are refused outright. */
/** A value that cannot be one path segment, so no Galaxy id. */
export class NotAnId extends Error {}

export function segment(value: unknown): string {
  const text = String(value);
  if (/^(\.|%2e){0,2}$/i.test(text)) {
    throw new NotAnId(`${JSON.stringify(text)} is not a Galaxy id`);
  }
  return encodeURIComponent(text);
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export interface GalaxyOptions {
  root: string;
  /** Headless only; in the browser the user's session authenticates. */
  key?: string;
  credentials?: RequestCredentials;
  /** Ends every request, and any wait between retries, when it aborts. */
  signal?: AbortSignal;
}

export interface Galaxy {
  root: string;
  get<T = any>(path: string): Promise<T>;
  bytes(path: string): Promise<Uint8Array>;
  post<T = any>(path: string, body?: unknown): Promise<T>;
  put<T = any>(path: string, body?: unknown): Promise<T>;
  delete<T = any>(path: string): Promise<T>;
  /** The fetch every Galaxy request goes through, for clients built on it. */
  fetch: typeof fetch;
}

/**
 * The one transport every Galaxy request takes, Olit's own and galaxy-ops' alike: the user's
 * session or key, never a cached answer, and a refused request resent while that is safe.
 */
export function galaxyFetch({ key, credentials = "include", signal }: GalaxyOptions): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, { ...init, signal: init?.signal ?? signal });
    const headers = new Headers(request.headers);
    headers.delete("x-api-key");
    if (key) {
      headers.set("x-api-key", key);
    }
    const method = request.method.toUpperCase();
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(
        new Request(request.clone(), {
          headers,
          credentials: key ? "omit" : credentials,
          cache: "no-store",
        }),
      );
      // A POST Galaxy already applied would run twice; a rate limit applied nothing.
      const retryable =
        response.status === 429 || (IDEMPOTENT.has(method) && RETRY_STATUS.has(response.status));
      if (response.ok || !retryable || attempt === ATTEMPTS - 1) {
        return response;
      }
      // An absent header is not a stated zero: back off unless Galaxy named the wait.
      await sleep((retryAfter(response.headers) ?? 2 ** attempt) * 1000, request.signal);
    }
  };
}

/** The most of an error a message carries: the model reads every one, some every turn. */
export const ERROR_MAX = 1000;

/**
 * An error as one short line: Galaxy's own `err_msg`, an HTML page by its title (whatever a proxy
 * answered with), and anything longer cut at `ERROR_MAX`.
 */
export function briefly(text: string): string {
  let said = text.trim();
  try {
    const own = JSON.parse(said)?.err_msg;
    if (typeof own === "string") said = own;
  } catch {
    // Not JSON: said as it stands.
  }
  const html = said.search(/<!doctype html|<html[\s>]/i);
  if (html >= 0) {
    const page = said.slice(html);
    const title = (page.match(/<title[^>]*>([^<]*)</i) ?? page.match(/<h1[^>]*>([^<]*)</i))?.[1];
    said = `${said.slice(0, html).replace(/b?['"]$/, "")}${title?.trim() || "an HTML page"}`;
  }
  said = said.replace(/\s+/g, " ").trim();
  return said.length > ERROR_MAX
    ? `${said.slice(0, ERROR_MAX)}… (${said.length - ERROR_MAX} more characters)`
    : said;
}

export function connectGalaxy(options: GalaxyOptions): Galaxy {
  const root = options.root.replace(/\/*$/, "/");
  const send = galaxyFetch(options);

  async function request(method: string, path: string, body?: unknown): Promise<Response> {
    const init: RequestInit = { method };
    if (body !== undefined) {
      init.body = JSON.stringify(body);
      init.headers = { "Content-Type": "application/json" };
    }
    const response = await send(`${root}${path.replace(/^\//, "")}`, init);
    if (!response.ok) {
      throw new HttpError(
        `HTTP ${response.status}: ${briefly(await response.text())}`,
        response.status,
      );
    }
    return response;
  }

  async function json(method: string, path: string, body?: unknown) {
    const text = await (await request(method, path, body)).text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  return {
    root,
    get: (path) => json("GET", path),
    bytes: async (path) => new Uint8Array(await (await request("GET", path)).arrayBuffer()),
    post: (path, body = {}) => json("POST", path, body),
    put: (path, body = {}) => json("PUT", path, body),
    delete: (path) => json("DELETE", path),
    fetch: send,
  };
}

/** The longest one tool call waits on hosts other than Galaxy, retries included. */
export const WEB_TIMEOUT_MS = 30_000;

/**
 * Hosts other than Galaxy, for one tool call: reached as Galaxy is, retried and with short errors,
 * but never with Galaxy's login, and ended by the call's abort or once its time is up.
 */
export interface Web {
  connect(root: string): Galaxy;
  fetch: typeof fetch;
}

export function connectWeb(signal?: AbortSignal, timeoutMs = WEB_TIMEOUT_MS): Web {
  const ended = new AbortController();
  const end = (reason: unknown) => ended.abort(reason);
  if (signal?.aborted) end(signal.reason);
  signal?.addEventListener("abort", () => end(signal.reason), { once: true });
  // A timeout signal keeps no process alive, as a timer would; its own reason says less.
  AbortSignal.timeout(timeoutMs).addEventListener(
    "abort",
    () => end(new Error(`no answer within ${timeoutMs / 1000} s`)),
    { once: true },
  );
  return {
    connect: (root) => connectGalaxy({ root, credentials: "omit", signal: ended.signal }),
    fetch: (input, init) => fetch(input, { ...init, credentials: "omit", signal: ended.signal }),
  };
}

/** A query string without undefined values, booleans lowercased, a key repeated per list item. */
export function query(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(key, String(item));
    }
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}
