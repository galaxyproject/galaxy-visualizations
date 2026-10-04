import type { PyodideInterface } from "pyodide";

const HARNESS = `
from pyodide.code import eval_code_async
from pyodide.http import pyfetch

_ns = {"pyfetch": pyfetch}

async def _run(code):
    value = await eval_code_async(code, globals=_ns, filename="<olit>")
    return None if value is None else repr(value)

_run
`;

/** Pyodide behind one function, loaded on its first call. */
export function localPython(indexURL: string): (code: string) => Promise<string> {
  let runner: Promise<{ py: PyodideInterface; run: (code: string) => Promise<string | undefined> }>;
  const boot = async () => {
    const { loadPyodide } = await import(/* @vite-ignore */ `${indexURL}/pyodide.mjs`);
    const py: PyodideInterface = await loadPyodide({ indexURL });
    return { py, run: await py.runPythonAsync(HARNESS) };
  };
  return async (code) => {
    runner ??= boot();
    const { py, run } = await runner;
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
  };
}
