import { JupyterFrontEnd, JupyterFrontEndPlugin } from "@jupyterlab/application";
import axios from "axios";

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
                        ext: "ipynb",
                        name: `${name} (jl-export)`,
                        paste_content: content,
                        src: "pasted",
                    },
                ],
            },
        ],
    };
}

async function waitFor(condition: () => boolean, interval = 50, timeout = 5000): Promise<void> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
        const check = () => {
            if (condition()) {
                resolve();
            } else if (Date.now() - start > timeout) {
                reject(new Error("Timeout waiting for condition"));
            } else {
                setTimeout(check, interval);
            }
        };
        check();
    });
}

const plugin: JupyterFrontEndPlugin<void> = {
    id: "jl-galaxy:plugin",
    autoStart: true,
    activate: async (app: JupyterFrontEnd) => {
        console.log("Activated jl-galaxy!", app);
        await waitFor(() => !!app.shell && !!app.docRegistry.getWidgetFactory("Notebook"));
        const params = new URLSearchParams(window.location.search);
        const datasetId = params.get("dataset_id");
        const root = params.get("root");
        const datasetUrl = `${root}api/datasets/${datasetId}/display`;
        try {
            const { data: details } = await axios.get(`${root}api/datasets/${datasetId}`);
            const historyId = details.history_id;
            const datasetName = details.name;

            // load dataset
            console.log("📥 Loading notebook from:", datasetUrl);
            try {
                const res = await fetch(datasetUrl);
                if (!res.ok) {
                    throw new Error(`Failed to fetch notebook: ${res.statusText}`);
                }
                const nbContent = await res.json();
                await app.serviceManager.contents.save(datasetName, {
                    type: "notebook",
                    format: "json",
                    content: nbContent,
                });
                await app.commands.execute("docmanager:open", {
                    path: datasetName,
                    factory: "Notebook",
                });
                console.log("📂 Notebook opened:", datasetName);
            } catch (err) {
                console.error("❌ Could not load dataset notebook:", err);
            }

            // save dataset
            app.commands.commandExecuted.connect((_, args) => {
                if (args.id === "docmanager:save") {
                    console.log("🧭 Detected save");
                    const widget = app.shell.currentWidget;
                    const model = (widget as any)?.content?.model;
                    if (model?.toJSON) {
                        const content = JSON.stringify(model.toJSON(), null, 2);
                        const payload = getPayload(datasetName, historyId, content);
                        axios
                            .post(`${root}api/tools/fetch`, payload)
                            .then(() => {
                                console.log("📝 Notebook saved to history");
                            })
                            .catch((err) => {
                                console.error("❌ Could not save dataset notebook:", err);
                            });
                    }
                }
            });
        } catch (err) {
            console.error("❌ Could not load dataset details:", err);
        }
    },
};

export default [plugin];
