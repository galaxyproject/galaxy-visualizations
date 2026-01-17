function toDict(payload: any) {
    return `json.loads(${JSON.stringify(JSON.stringify(payload))})`;
}

export async function runDatasetReport(pyodide: any, config: any, inputs: any) {
    const raw = await pyodide.runPythonAsync([
        "import json",
        "from js import emitProgress",
        "from pyodide.ffi import to_js",
        "from polaris_dataset_report import run",
        "",
        "# Create progress callback that calls JS",
        "def on_progress(data):",
        "    emitProgress(to_js(data))",
        "",
        `config = ${toDict(config)}`,
        `inputs = ${toDict(inputs)}`,
        "result = await run(config, inputs, on_progress=on_progress)",
        "json.dumps(result)",
    ]);
    if (typeof raw !== "string") {
        throw new Error("Agent did not return JSON");
    }
    return JSON.parse(raw);
}
