import type { Artifact } from "./artifacts";
import type { PyodideManager } from "./pyodide/pyodide-manager";

export interface ToolCall {
    id: string;
    function?: { name?: string; arguments?: string };
}

export interface Message {
    role: string;
    content: string | null;
    tool_calls?: ToolCall[];
    tool_call_id?: string;
    name?: string;
}

/** What the loop reports while a turn runs. */
export type LoopEvent =
    | { type: "tool_start"; id: string; name: string }
    | { type: "tool_end"; id: string; name: string; content: string; is_error: boolean; refused: boolean }
    | { type: "llm_retry"; status: number; wait: number; attempt: number; of: number }
    | { type: "compacted" }
    | { type: "context_overflow" };

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

/** One turn's inputs. Named rather than positional: the list grew past what order survives. */
export interface TurnRequest {
    config: Record<string, unknown>;
    transcripts: Message[];
    /** What earlier turns produced, held by the shell because the brain is rebuilt on a config change. */
    artifacts: Artifact[];
    onEvent?: (event: LoopEvent) => void;
}

export async function runOlit(
    pyodide: PyodideManager,
    { config, transcripts, artifacts, onEvent }: TurnRequest,
): Promise<TurnResult> {
    pyodide.onEvent = onEvent;
    try {
        const code = [
            "import json",
            "from js import olitEmit",
            "from olit import run",
            `config = ${toDict(config)}`,
            `inputs = ${toDict({ transcripts, artifacts })}`,
            "def _on_event(ev):",
            "    olitEmit(json.dumps(ev))",
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
