import type { Artifact } from "./artifacts";
import type { PyodideManager } from "./pyodide/pyodide-manager";

export interface Message {
    role: string;
    content: string;
}

/** What the brain returns for one turn; `error` is a failed turn, never a thrown one. */
export interface TurnResult {
    logs: string[];
    messages: Message[];
    new_messages: Message[];
    done?: boolean;
    aborted?: boolean;
    exhausted?: boolean;
    artifacts?: Artifact[];
    usage?: { input?: number; output?: number; cost?: number | null };
    steps?: number;
    max_steps?: number;
    diagnostics?: { catalog?: { loaded?: boolean; op_count?: number; error?: string | null } };
    error?: { message?: string; status_code?: number };
}

function toDict(payload: unknown) {
    return `json.loads(${JSON.stringify(JSON.stringify(payload))})`;
}

export async function runOlite(
    pyodide: PyodideManager,
    config: Record<string, unknown>,
    transcripts: Message[],
    onEvent?: (event: any) => void,
): Promise<TurnResult> {
    pyodide.onEvent = onEvent;
    try {
        const code = [
            "import json",
            "from js import oliteEmit",
            "from olite import run",
            `config = ${toDict(config)}`,
            `inputs = ${toDict({ transcripts })}`,
            "def _on_event(ev):",
            "    oliteEmit(json.dumps(ev))",
            "result = await run(config, inputs, _on_event)",
            "json.dumps(result)",
        ].join("\n");
        const raw = await pyodide.runPythonAsync(code);
        if (typeof raw !== "string") {
            throw new Error("Did not return JSON.");
        }
        return JSON.parse(raw) as TurnResult;
    } finally {
        pyodide.onEvent = undefined;
    }
}
