function toDict(payload: any) {
    return `json.loads(${JSON.stringify(JSON.stringify(payload))})`;
}

export async function runVintent(pyodide: any, config: any, transcripts: any, dataset_name: string) {
    const inputs = { transcripts };
    const raw = await pyodide.runPythonAsync([
        "import json",
        "from vintent import run",
        `config = ${toDict(config)}`,
        `inputs = ${toDict(inputs)}`,
        `result = await run(config, inputs, '${dataset_name}')`,
        "json.dumps(result)",
    ]);
    if (typeof raw !== "string") {
        throw new Error("Did not return JSON.");
    }
    return JSON.parse(raw);
}
