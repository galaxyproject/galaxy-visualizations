import { JupyterFrontEnd, JupyterFrontEndPlugin } from "@jupyterlab/application";

const plugin: JupyterFrontEndPlugin<void> = {
    id: "jl-galaxy:plugin",
    autoStart: true,
    activate: async (app: JupyterFrontEnd) => {
        console.log("Activated jl-galaxy!", app);

        const params = new URLSearchParams(window.location.search);
        const datasetUrl = params.get("dataset_url");

        if (datasetUrl) {
            console.log("📥 Loading notebook from:", datasetUrl);
            try {
                const res = await fetch(datasetUrl);
                if (!res.ok) {
                    throw new Error(`Failed to fetch notebook: ${res.statusText}`);
                }

                const nbContent = await res.json();
                const filename = datasetUrl.split("/").pop() || "imported.ipynb";

                // Save the notebook to the in-memory filesystem
                await app.serviceManager.contents.save(filename, {
                    type: "notebook",
                    format: "json",
                    content: nbContent,
                });

                // Open it in the notebook UI
                await app.commands.execute("docmanager:open", {
                    path: filename,
                    factory: "Notebook",
                });

                console.log("📂 Notebook opened:", filename);
            } catch (err) {
                console.error("❌ Could not load dataset notebook:", err);
            }
        }

        // Still listen for save events
        app.commands.commandExecuted.connect((_, args) => {
            if (args.id === "docmanager:save") {
                console.log("🧭 Detected save");

                const widget = app.shell.currentWidget;
                const model = (widget as any)?.content?.model;
                if (model?.toJSON) {
                    const content = model.toJSON();
                    console.log("📝 Notebook content:", content);
                }
            }
        });
    },
};

export default [plugin];
