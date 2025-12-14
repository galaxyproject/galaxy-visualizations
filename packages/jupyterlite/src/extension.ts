import type { JupyterFrontEnd, JupyterFrontEndPlugin } from "@jupyterlab/application";
import { InputDialog } from "@jupyterlab/apputils";
import axios from "axios";

import TEMPLATE from "./template.json";

const EXTENSION = "ipynb";
const PROVIDER_ID = "jnaut";
const PROVIDER_MODEL = "generic";
const PROVIDER_URL = "jupyternaut";

async function configureAIProvider(app: JupyterFrontEnd, root: string) {
    const settingManager = app.serviceManager.settings;
    const PLUGIN_ID = "@jupyterlite/ai:settings-model";
    const PROVIDER_JSON = {
        id: PROVIDER_ID,
        name: PROVIDER_ID,
        provider: PROVIDER_MODEL,
        model: PROVIDER_ID,
        apiKey: PROVIDER_ID,
        baseURL: `${root}${PROVIDER_URL}`,
    };
    try {
        const newSettings = { defaultProvider: PROVIDER_ID, providers: [PROVIDER_JSON] };
        await settingManager.save(PLUGIN_ID, JSON.stringify(newSettings, null, 2));
        console.log("✅ AI provider configured: Galaxy");
    } catch (err) {
        console.error("❌ Failed to configure AI provider", err);
    }
}

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

            // configure ai provider
            await configureAIProvider(app, root);

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
                                    if (historyId) {
                                        const payload = getPayload(name, historyId, content);
                                        axios
                                            .post(`${root}api/tools/fetch`, payload)
                                            .then(() => {
                                                console.log(`✅ Notebook "${name}" saved to history`);
                                            })
                                            .catch((err: any) => {
                                                console.error(`❌ Could not save "${name}" to history:`, err);
                                            });
                                    } else {
                                        console.error("❌ Could not load history identifier.");
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
