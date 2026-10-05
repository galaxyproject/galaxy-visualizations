import { retryAfter, sleep } from "./retry";

const RETRY_STATUS = new Set([429, 500, 502, 503, 504]);
const IDEMPOTENT = new Set(["GET", "HEAD", "PUT", "DELETE"]);
const ATTEMPTS = 3;

/** A value placed in a Galaxy path, encoded: an id the model wrote must not add a segment,
 * a query or a fragment to the request it names. Encoding leaves dots alone, and a URL reads
 * `..` (or `%2e%2e`) as the parent, so those are refused outright. */
export function segment(value: unknown): string {
  const text = String(value);
  if (/^(\.|%2e){0,2}$/i.test(text)) {
    throw new Error(`${JSON.stringify(text)} is not a Galaxy id`);
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
      await sleep((retryAfter(response.headers, "") ?? 2 ** attempt) * 1000, request.signal);
    }
  };
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
      throw new HttpError(`HTTP ${response.status}: ${await response.text()}`, response.status);
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
