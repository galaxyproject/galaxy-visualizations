import type { JupyterFrontEnd, JupyterFrontEndPlugin } from "@jupyterlab/application";
import { InputDialog } from "@jupyterlab/apputils";
import axios from "axios";

const EXTENSION = "ipynb";
const TIMEOUT = 100;

function getPayload(name: string, history_id: string, content: string) {
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
                        ext: EXTENSION,
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

async function waitFor(condition: () => boolean | Promise<boolean>): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const check = async () => {
            const result = await condition();
            if (result) {
                resolve();
            } else if (Date.now() - start > TIMEOUT * TIMEOUT) {
                reject(new Error("Timeout waiting for condition"));
            } else {
                setTimeout(check, TIMEOUT);
            }
        };
        check();
    });
}

const plugin: JupyterFrontEndPlugin<void> = {
    id: "jl-galaxy:plugin",
    autoStart: true,
    activate: async (app: JupyterFrontEnd) => {
        console.log("Activating jl-galaxy...", app);
        await waitFor(() => !!app.shell && !!app.docRegistry.getWidgetFactory("Notebook"));
        const params = new URLSearchParams(window.location.search);
        const datasetId = params.get("dataset_id");
        const notebookName = getTimestamp();
        const root = params.get("root");
        if (datasetId) {
            try {
                // load notebook
                const { data: details } = await axios.get(`${root}api/datasets/${datasetId}`);
                const historyId = details.history_id;
                const datasetUrl = `${root}api/datasets/${datasetId}/display`;
                console.log("📥 Loading notebook from:", datasetUrl);
                try {
                    const res = await fetch(datasetUrl);
                    if (res.ok) {
                        const nbContent = await res.json();
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
                    } else {
                        throw new Error(`Failed to fetch notebook: ${res.statusText}`);
                    }
                } catch (err) {
                    console.error("❌ Could not load dataset notebook:", err);
                }

                // open and save notebooks
                app.commands.commandExecuted.connect(async (_: any, args: any) => {
                    if (args.id === "docmanager:open") {
                        args.result.then(async (widget: any) => {
                            const model = widget?.content?.model;
                            const context = widget?.context;
                            if (context && model?.toJSON) {
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
                            const model = (widget as any)?.content?.model;
                            const context = (widget as any)?.context;
                            if (context && model?.toJSON) {
                                let path = context.path || "";
                                let name = path.split("/").pop() || getTimestamp();
                                const input = await InputDialog.getText({
                                    title: "💾 Save to Galaxy?",
                                    label: "Provide a name to save to source history:",
                                    text: name,
                                });
                                if (input.button.accept && input.value) {
                                    name = input.value;
                                    const content = JSON.stringify(model.toJSON(), null, 2);
                                    const payload = getPayload(name, historyId, content);
                                    axios
                                        .post(`${root}api/tools/fetch`, payload)
                                        .then(() => {
                                            console.log(`✅ Notebook "${name}" saved to history`);
                                        })
                                        .catch((err) => {
                                            console.error(`❌ Could not save "${name}" to history:`, err);
                                        });
                                } else {
                                    console.log("🚫 Export to Galaxy canceled by user");
                                }
                            }
                        });
                    }
                });
            } catch (err) {
                console.error("❌ Could not load dataset details:", err);
            }
        } else {
            console.error("❌ Dataset identifer missing from query");
        }
    },
};

export default [plugin];
