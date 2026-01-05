let loadPyodide = null;
let pyodide = null;
let running = false;

function parseCode(code) {
    if (Array.isArray(code)) {
        return code.join("\n");
    } else {
        return code;
    }
}

self.onmessage = async (e) => {
    const { type, payload, id } = e.data;
    if (type === "initialize") {
        try {
            if (!loadPyodide) {
                const mod = await import(`${payload.indexURL}/pyodide.mjs`);
                loadPyodide = mod.loadPyodide;
            }
            pyodide = await loadPyodide({ indexURL: payload.indexURL });
            const pyodidePackages = payload.packages;
            if (pyodidePackages) {
                console.debug("[pyodide-worker] Installing packages:", pyodidePackages);
                await pyodide.loadPackage(pyodidePackages);
            }
            for (const whl of payload.extraPackages || []) {
                await pyodide.runPythonAsync(
                    parseCode([
                        `print("Loading ${whl}")`,
                        "import micropip",
                        `await micropip.install("${whl}")`,
                        `print("Loaded ${whl}")`,
                    ]),
                );
            }
            self.postMessage({ type: "ready" });
        } catch (err) {
            self.postMessage({ type: "error", error: String(err) });
        }
    } else {
        if (pyodide) {
            if (type === "fsWrite") {
                try {
                    const fs = pyodide.FS;
                    const dir = payload.dest.substring(0, payload.dest.lastIndexOf("/"));
                    if (dir) {
                        fs.mkdirTree(dir);
                    }
                    fs.writeFile(payload.dest, payload.content);
                    self.postMessage({ id, result: true });
                } catch (err) {
                    self.postMessage({ id, error: String(err) });
                }
            } else {
                if (type === "runPythonAsync") {
                    running = true;
                    try {
                        const result = await pyodide.runPythonAsync(parseCode(payload.code));
                        self.postMessage({ id, result });
                    } catch (err) {
                        self.postMessage({ id, error: String(err) });
                    } finally {
                        running = false;
                    }
                } else {
                    self.postMessage({ id, error: `Unknown message type: ${type}` });
                }
            }
        } else {
            self.postMessage({ id, error: "Pyodide not initialized" });
        }
    }
};
