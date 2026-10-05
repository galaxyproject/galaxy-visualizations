import REALM from "./python-realm.js?raw";
import { fail, Outcome, type OlitTool, type Python } from "./tool";

export { REALM };

/** The trusted side's line to a realm: messages both ways, and an end. */
export interface Channel {
  send(message: unknown, transfer?: Transferable[]): void;
  /** `onExit` when the realm is gone; the next call starts a new one. */
  listen(onMessage: (message: unknown) => void, onExit: (reason: string) => void): void;
  close(): void;
}

type Reply = { id: number; ok: boolean; value?: unknown; error?: unknown };
type AssetRequest = { op: "asset"; id: unknown; url: unknown };

const isReply = (m: unknown): m is Reply =>
  typeof m === "object" && m !== null && typeof (m as Reply).id === "number" && "ok" in m;

const isAssetRequest = (m: unknown): m is AssetRequest =>
  typeof m === "object" && m !== null && (m as AssetRequest).op === "asset";

/**
 * `Python` over a realm that holds no authority, started on first use. Its replies are data: one
 * answers only the request it names, and a value of the wrong shape is an error, not a result.
 */
export function realmPython(
  open: () => Channel,
  onAsset?: (request: AssetRequest, channel: Channel) => void,
): Python {
  let channel: Channel | undefined;
  const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  let nextId = 0;

  const start = () => {
    const c = open();
    c.listen(
      (message) => {
        if (isReply(message)) {
          const waiting = pending.get(message.id);
          pending.delete(message.id);
          if (message.ok) {
            waiting?.resolve(message.value);
          } else {
            waiting?.reject(new Error(String(message.error)));
          }
        } else if (isAssetRequest(message)) {
          onAsset?.(message, c);
        }
      },
      (reason) => {
        if (channel === c) {
          channel = undefined;
        }
        const stopped = new Error(`Python ${reason}; its state was reset.`);
        pending.forEach(({ reject }) => reject(stopped));
        pending.clear();
      },
    );
    return c;
  };

  const request = (message: object, transfer?: Transferable[]) =>
    new Promise<unknown>((resolve, reject) => {
      channel ??= start();
      const id = nextId++;
      pending.set(id, { resolve, reject });
      channel.send({ ...message, id }, transfer);
    });

  return {
    async run(code, signal) {
      signal?.throwIfAborted();
      // Python cannot be interrupted, only ended: Stop takes the realm and its state with it.
      const stop = () => channel?.close();
      signal?.addEventListener("abort", stop, { once: true });
      let value: unknown;
      try {
        value = await request({ op: "run", code });
      } finally {
        signal?.removeEventListener("abort", stop);
      }
      if (typeof value !== "string") {
        throw new Error("Python sent back something that is not its output.");
      }
      return value;
    },
    async write(path, data) {
      await request({ op: "write", path, data });
    },
    async read(path) {
      const value = await request({ op: "read", path });
      if (value === null) {
        return undefined;
      }
      if (!(value instanceof Uint8Array)) {
        throw new Error(`Python sent back something that is not the bytes of ${path}.`);
      }
      return value;
    },
  };
}

/**
 * The realm as a data: URL worker, whose origin is opaque. Pyodide's own files come from Galaxy,
 * which serves them without CORS headers, so this side fetches them for it, and nothing else.
 */
export function browserPython(pyodideURL: string): Python {
  const indexURL = pyodideURL.endsWith("/") ? pyodideURL : `${pyodideURL}/`;
  const open = (): Channel => {
    const worker = new Worker(`data:text/javascript,${encodeURIComponent(REALM)}`);
    worker.postMessage({ op: "boot", indexURL });
    let exit: (reason: string) => void = () => undefined;
    return {
      send: (message, transfer = []) => worker.postMessage(message, transfer),
      listen: (onMessage, onExit) => {
        exit = onExit;
        worker.onmessage = ({ data }) => onMessage(data);
      },
      close: () => {
        worker.terminate();
        exit("was stopped");
      },
    };
  };
  return realmPython(open, (request, channel) => void serveAsset(indexURL, request, channel));
}

/** A file under Pyodide's own directory, fetched without credentials, or a refusal. */
export async function serveAsset(
  indexURL: string,
  { id, url }: { id: unknown; url: unknown },
  channel: Pick<Channel, "send">,
): Promise<void> {
  let href: string | undefined;
  try {
    href = typeof url === "string" ? new URL(url).href : undefined;
  } catch {
    href = undefined;
  }
  if (href === undefined || !href.startsWith(indexURL)) {
    channel.send({
      op: "asset",
      id,
      ok: false,
      error: `${String(url)} is not one of Pyodide's files`,
    });
    return;
  }
  try {
    const response = await fetch(href, { credentials: "omit" });
    const body = await response.arrayBuffer();
    const type = response.headers.get("content-type");
    channel.send({ op: "asset", id, ok: true, status: response.status, type, body }, [body]);
  } catch (err) {
    channel.send({ op: "asset", id, ok: false, error: String((err as Error)?.message ?? err) });
  }
}

export function pythonTool(): OlitTool {
  return {
    name: "run_python",
    description:
      "Run Python locally in the browser (Pyodide). numpy and pandas are available; state persists " +
      "across calls. Returns the last expression value and stdout. Top-level `await` works, and " +
      "`pyfetch(url)` performs a browser fetch, so a public HTTP API can be read directly - but only " +
      "from hosts that send CORS headers, which many do not. Python is isolated from Olit: its " +
      "requests carry no Galaxy login, so Galaxy is reached through the Galaxy tools, not from " +
      "Python. This runs in the browser, NOT on Galaxy - it cannot import galaxy, and real compute " +
      "belongs in a Galaxy job.",
    parameters: { type: "object", properties: { code: { type: "string" } }, required: ["code"] },
    capability: "local",
    run: async ({ code }: { code: string }, ctx) => {
      try {
        return new Outcome(await ctx.python.run(code ?? ""));
      } catch (err) {
        return fail((err as Error).message);
      }
    },
  };
}
