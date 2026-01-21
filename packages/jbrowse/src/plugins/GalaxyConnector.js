import Plugin from "@jbrowse/core/Plugin";

export default class FieldSelectionPlugin extends Plugin {
    name = "FieldSelectionPlugin";

    install(pluginManager) {
        console.log("Installing FieldSelectionPlugin...");

        // Add a custom menu item to the "Add Track" menu
        pluginManager.addToExtensionPoint("TrackMenu", {
            label: "Add Track with Field Selection",
            onClick: () => this.handleAddTrack(pluginManager),
        });
    }

    async handleAddTrack(pluginManager) {
        // Example field selection workflow
        const fields = ["Field1", "Field2", "Field3"]; // Replace with actual fields
        const selectedField = await this.showFieldSelectionForm(fields);

        if (selectedField) {
            const trackType = prompt('Enter track type (e.g., "FeatureTrack")');
            if (trackType) {
                const newTrackConfig = {
                    type: trackType,
                    name: `New ${trackType} with field ${selectedField}`,
                    field: selectedField, // Include the selected field in the configuration
                };

                // Adding the track to the JBrowse configuration
                const rootStore = pluginManager.rootModel;
                rootStore.addTrackConf(newTrackConfig);
            }
        }
    }

    async showFieldSelectionForm(fields) {
        const field = window.prompt("Please select a field for the new track:\n" + fields.join("\n"));
        return fields.includes(field) ? field : null;
    }
}
