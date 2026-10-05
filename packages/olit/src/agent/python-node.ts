import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

import { REALM, realmPython, type Channel } from "./python";
import type { Python } from "./tool";

/**
 * Where Pyodide lives. A directory path, not a file: URL -- under Node Pyodide reads its index as
 * a path, and a URL there resolves against the working directory.
 */
export const pyodideDir = () =>
  dirname(createRequire(import.meta.url).resolve("pyodide/pyodide.mjs"));

/**
 * The realm headless: a Node child with an empty environment, allowed to read Pyodide and the
 * wheels the browser build ships (`npm run build:pyodide`) and nothing else, so it holds no key
 * and no file of the host's. Network is not restricted, as in the browser.
 */
export function nodePython(dir = pyodideDir()): Python {
  const packageCacheDir = join(dir, "..", "..", "temp", "pyodide");
  const open = (): Channel => {
    const child = spawn(
      process.execPath,
      [
        "--permission",
        `--allow-fs-read=${dir}`,
        `--allow-fs-read=${packageCacheDir}`,
        "--input-type=module",
        "--eval",
        REALM,
      ],
      // The child's stdout goes to stderr: a session's stdout carries its protocol only.
      { env: {}, stdio: ["ignore", 2, 2, "ipc"], serialization: "advanced" },
    );
    child.send({
      op: "boot",
      indexURL: `${dir}/`,
      moduleURL: pathToFileURL(join(dir, "pyodide.mjs")).href,
      packageCacheDir,
    });
    let stopping = false;
    // The realm must not outlive its session.
    process.once("exit", () => child.kill());
    return {
      send: (message) => child.send(message as object),
      listen: (onMessage, onExit) => {
        child.on("message", onMessage);
        child.on("exit", (code, signal) =>
          onExit(stopping ? "was stopped" : `exited (${signal ?? code})`),
        );
      },
      close: () => {
        stopping = true;
        child.kill();
      },
    };
  };
  return realmPython(open);
}
