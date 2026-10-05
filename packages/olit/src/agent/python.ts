import type { PyodideInterface } from "pyodide";

import { fail, Outcome, type OlitTool, type Python } from "./tool";

const HARNESS = `
from pyodide.code import eval_code_async
from pyodide.http import pyfetch

_ns = {"pyfetch": pyfetch}

async def _run(code):
    value = await eval_code_async(code, globals=_ns, filename="<olit>")
    return None if value is None else repr(value)

_run
`;

/** Pyodide behind the `Python` interface, loaded on first use. */
export function localPython(indexURL: string): Python {
  let runner: Promise<{ py: PyodideInterface; run: (code: string) => Promise<string | undefined> }>;
  const boot = () =>
    (runner ??= (async () => {
      const { loadPyodide } = await import(/* @vite-ignore */ `${indexURL}/pyodide.mjs`);
      const py: PyodideInterface = await loadPyodide({ indexURL });
      return { py, run: await py.runPythonAsync(HARNESS) };
    })());
  return {
    async run(code) {
      const { py, run } = await boot();
      await py.loadPackagesFromImports(code);
      const out: string[] = [];
      py.setStdout({ batched: (line) => out.push(line) });
      try {
        const value = await run(code);
        if (value !== undefined) {
          out.push(value);
        }
      } catch (err) {
        throw new Error([...out, (err as Error).message].join("\n\n"));
      }
      return out.join("\n") || "(no output)";
    },
    async write(path, data) {
      const { py } = await boot();
      py.FS.mkdirTree(path.slice(0, path.lastIndexOf("/")) || "/");
      py.FS.writeFile(path, data);
    },
    async read(path) {
      const { py } = await boot();
      return py.FS.analyzePath(path).exists ? (py.FS.readFile(path) as Uint8Array) : undefined;
    },
  };
}

export function pythonTool(): OlitTool {
  return {
    name: "run_python",
    description:
      "Run Python locally in the browser (Pyodide). numpy and pandas are available; state persists " +
      "across calls. Returns the last expression value and stdout. Top-level `await` works, and " +
      "`pyfetch(url)` performs a browser fetch, so an HTTP API can be read directly - but only from " +
      "hosts that send CORS headers, which many do not. This runs in the browser, NOT on Galaxy - it " +
      "cannot import galaxy, and real compute belongs in a Galaxy job.",
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
