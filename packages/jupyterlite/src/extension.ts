import type { JupyterFrontEnd, JupyterFrontEndPlugin } from "@jupyterlab/application";
import { InputDialog } from "@jupyterlab/apputils";

import TEMPLATE from "./template.json";

const EXTENSION_FILE = "txt";
const EXTENSION_NOTEBOOK = "ipynb";

function getPayload(name: string, history_id: string, content: string, ext: string) {
    return {
        auto_decompress: true,
        files: [],
        history_id: history_id,
        targets: [
            {
                destination: { type: "hdas" },
                elements: [
                    {
                        dbkey: "?",
                        ext: ext,
                        name: `${name}`,
                        paste_content: content,
                        src: "pasted",
                    },
                ],
            },
        ],
    };
}

function getTimestamp() {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, "0");
    return (
        "jl-" +
        now.getFullYear().toString() +
        pad(now.getMonth() + 1) +
        pad(now.getDate()) +
        "-" +
        pad(now.getHours()) +
        pad(now.getMinutes()) +
        pad(now.getSeconds())
    );
}

const plugin: JupyterFrontEndPlugin<void> = {
    id: "jl-galaxy:plugin",
    autoStart: true,
    activate: async (app: JupyterFrontEnd) => {
        console.log("Activating jl-galaxy...", app);
        app.restored.then(async () => {
            // collect props
            const params = new URLSearchParams(window.location.search);
            const datasetId = params.get("dataset_id");
            const historyId = params.get("history_id");
            const notebookName = getTimestamp();
            const root = params.get("root") || "/";

            // load notebook
            let nbContent = null;
            if (datasetId) {
                const datasetUrl = `${root}api/datasets/${datasetId}/display`;
                console.log("📥 Loading notebook from:", datasetUrl);
                try {
                    const res = await fetch(datasetUrl);
                    if (res.ok) {
                        nbContent = await res.json();
                    } else {
                        throw new Error(`Failed to fetch notebook: ${res.statusText}`);
                    }
                } catch (err) {
                    console.error("❌ Could not load dataset details:", err);
                }
            } else {
                nbContent = TEMPLATE;
                console.log("✅ Dataset identifer not available, loading default notebook");
            }

            // hide file browser
            await app.commands.execute("filebrowser:hide-main");

            // open notebook
            try {
                await app.serviceManager.contents.save(notebookName, {
                    type: "notebook",
                    format: "json",
                    content: nbContent,
                });
                await app.commands.execute("docmanager:open", {
                    path: notebookName,
                    factory: "Notebook",
                });
                console.log("✅ Notebook opened:", notebookName);
            } catch (err) {
                console.error("❌ Could not load dataset notebook:", err);
            }

            // open and save notebooks
            try {
                // attach commands
                app.commands.commandExecuted.connect(async (_: any, args: any) => {
                    if (args.id === "docmanager:open") {
                        args.result.then(async (widget: any) => {
                            const context = widget?.context;
                            if (context) {
                                if (context.path?.startsWith("Untitled")) {
                                    const name = getTimestamp();
                                    await context.rename(name);
                                    console.log(`✅ Renamed new notebook to: ${name}`);
                                }
                            }
                        });
                    } else if (args.id === "docmanager:save") {
                        args.result.then(async () => {
                            const widget = app.shell.currentWidget;
                            const context = (widget as any)?.context;
                            if (context) {
                                let path = context.path || "";
                                let name = path.split("/").pop() || getTimestamp();
                                const input = await InputDialog.getText({
                                    title: "💾 Save to Galaxy?",
                                    label: "Provide a name to save to source history:",
                                    text: name,
                                });
                                if (input.button.accept && input.value) {
                                    name = input.value;
                                    const item = await app.serviceManager.contents.get(path, { content: true });
                                    const content =
                                        typeof item.content === "string"
                                            ? item.content
                                            : JSON.stringify(item.content, null, 2);
                                    const ext = item.type === "notebook" ? EXTENSION_NOTEBOOK : EXTENSION_FILE;
                                    if (content && historyId) {
                                        const payload = getPayload(name, historyId, content, ext);
                                        fetch(`${root}api/tools/fetch`, {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify(payload),
                                        })
                                            .then((res) => {
                                                if (!res.ok) {
                                                    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
                                                }
                                                console.log(`✅ Notebook "${name}" saved to history`);
                                            })
                                            .catch((err: any) => {
                                                console.error(`❌ Could not save "${name}" to history:`, err);
                                            });
                                    } else {
                                        console.error("❌ Could not load content or history identifier.");
                                    }
                                } else {
                                    console.log("🚫 Export to Galaxy canceled by user");
                                }
                            }
                        });
                    }
                });
            } catch (err) {
                console.error("❌ Failed to attach commands");
            }
        });
    },
};

export default [plugin];
