// The untrusted side of `run_python`: Pyodide in a realm that holds no Olit or Galaxy authority.
//
// python.ts starts this file from its text. In the browser it is a data: URL worker, whose origin
// is opaque: no Galaxy cookie is same-origin to it, it has no storage, and the agent's state and
// model key live in another worker it cannot reach. Headless it is a Node child with an empty
// environment, under the permission model, reading only Pyodide's own files. Network stays: what
// a browser lets any page read under CORS, Python can read here too.
//
// One protocol either way, and nothing that comes back from here is trusted by the other side.

const NODE = typeof process === "object" && !!process.versions?.node;
const send = NODE ? (message) => process.send(message) : (message) => postMessage(message);

const HARNESS = `
from pyodide.code import eval_code_async
from pyodide.http import pyfetch

_ns = {"pyfetch": pyfetch}

async def _run(code):
    value = await eval_code_async(code, globals=_ns, filename="<olit>")
    return None if value is None else repr(value)

_run
`;

const assets = new Map();
let nextAsset = 0;

/** Pyodide's own files, which Galaxy serves without CORS headers: the trusted side fetches them. */
function asset(url) {
  return new Promise((resolve, reject) => {
    const id = nextAsset++;
    assets.set(id, { resolve, reject });
    send({ op: "asset", id, url });
  });
}

/** Replace `name` wherever the global or its prototypes define it, so the original is gone. */
function lock(name, value) {
  const owners = [];
  for (let o = self; o; o = Object.getPrototypeOf(o)) {
    if (Object.getOwnPropertyDescriptor(o, name)) {
      owners.push(o);
    }
  }
  for (const owner of owners.includes(self) ? owners : [self, ...owners]) {
    Object.defineProperty(owner, name, { value, writable: false, configurable: false });
  }
}

const refuse = (name) =>
  function () {
    throw new Error(`${name} is not available to run_python`);
  };

/**
 * No request from here carries credentials. Chromium already sends Galaxy's session cookie to no
 * opaque origin, but Firefox and WebKit attach it to a credentialed request, because Galaxy sets
 * no SameSite; the response stays unreadable, a blind write would not. So every route that could
 * attach a cookie goes without one, or is gone.
 */
function withoutCredentials(indexURL) {
  const nativeFetch = self.fetch;
  lock("fetch", function (input, init) {
    const url = typeof input === "string" || input instanceof URL ? String(input) : input?.url;
    if (typeof url === "string" && url.startsWith(indexURL)) {
      return asset(url);
    }
    return nativeFetch.call(self, input, { ...init, credentials: "omit" });
  });
  Object.defineProperty(XMLHttpRequest.prototype, "withCredentials", {
    get: () => false,
    set: () => undefined,
    configurable: false,
  });
  const NativeEventSource = self.EventSource;
  lock("EventSource", function (url) {
    return new NativeEventSource(url);
  });
  // A WebSocket handshake carries cookies and has no way to omit them; a nested worker would be
  // a fresh realm with none of this in place.
  lock("WebSocket", refuse("WebSocket"));
  lock("Worker", refuse("Worker"));
}

async function boot(options) {
  if (NODE) {
    const { constants } = await import("node:fs");
    // Pyodide reads file flags through process.binding, which the permission model refuses.
    process.binding = (name) => {
      if (name !== "constants") {
        throw new Error(`process.binding(${name}) is not available`);
      }
      return { fs: constants };
    };
    const { loadPyodide } = await import(options.moduleURL);
    return loadPyodide({ indexURL: options.indexURL, packageCacheDir: options.packageCacheDir });
  }
  withoutCredentials(options.indexURL);
  // Pyodide's scripts come the same way as its other files, and run as importScripts would run
  // them, at global scope: a script request from an opaque origin is one a server may refuse, as
  // vite does, and WebKit will not load a blob URL of an opaque origin.
  const scripts = new Map();
  for (const name of ["pyodide.js", "pyodide.asm.js"]) {
    const url = `${options.indexURL}${name}`;
    scripts.set(url, `${await (await asset(url)).text()}\n//# sourceURL=${url}`);
  }
  const nativeImportScripts = self.importScripts;
  self.importScripts = (...urls) => {
    for (const url of urls) {
      const text = scripts.get(String(url));
      if (text === undefined) {
        nativeImportScripts.call(self, url);
      } else {
        (0, eval)(text);
      }
    }
  };
  importScripts(`${options.indexURL}pyodide.js`);
  const pyodide = await self.loadPyodide({ indexURL: options.indexURL });
  lock("importScripts", refuse("importScripts"));
  return pyodide;
}

async function execute({ py, run }, code) {
  // Package-loading chatter is noise to the user and the model; a failure is not.
  await py.loadPackagesFromImports(code, {
    messageCallback: () => undefined,
    errorCallback: (message) => console.warn(message),
  });
  const out = [];
  py.setStdout({ batched: (line) => out.push(line) });
  try {
    const value = await run(code);
    if (value !== undefined) {
      out.push(value);
    }
  } catch (err) {
    throw new Error([...out, err.message].join("\n\n"));
  }
  return out.join("\n") || "(no output)";
}

let ready;

async function handle(message) {
  if (message.op === "boot") {
    ready = boot(message).then(async (py) => ({ py, run: await py.runPythonAsync(HARNESS) }));
    ready.catch(() => undefined);
    return;
  }
  if (message.op === "asset") {
    const pending = assets.get(message.id);
    assets.delete(message.id);
    if (message.ok) {
      const headers = message.type ? { "content-type": message.type } : {};
      pending?.resolve(new Response(message.body, { status: message.status, headers }));
    } else {
      pending?.reject(new TypeError(`${message.error}`));
    }
    return;
  }
  const { id } = message;
  try {
    const realm = await ready;
    let value;
    if (message.op === "run") {
      value = await execute(realm, message.code);
    } else if (message.op === "write") {
      const dir = message.path.slice(0, message.path.lastIndexOf("/")) || "/";
      realm.py.FS.mkdirTree(dir);
      realm.py.FS.writeFile(message.path, message.data);
    } else if (message.op === "read") {
      value = realm.py.FS.analyzePath(message.path).exists
        ? realm.py.FS.readFile(message.path)
        : null;
    }
    send({ id, ok: true, value });
  } catch (err) {
    send({ id, ok: false, error: String(err?.message ?? err) });
  }
}

if (NODE) {
  process.on("message", handle);
  // The session that started it is gone.
  process.on("disconnect", () => process.exit(0));
} else {
  self.onmessage = ({ data }) => handle(data);
}
