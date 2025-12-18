# HIV-Trace Viewer (Galaxy Plugin)

The HIV-Trace Viewer is a Galaxy visualization plugin for interactive exploration of transmission networks inferred by **HIV-TRACE**. It renders graph-based results directly inside Galaxy, allowing users to examine connected components, cluster sizes, and metadata-linked attributes.

## Features
- Network visualization of HIV-TRACE output
- Interactive node and edge exploration
- Metadata integration for coloring and filtering
- Seamless embedding into the Galaxy visualization framework

## Installation
Place the plugin directory under Galaxy’s `config/plugins/visualizations/` and restart Galaxy.

## Usage
1. Run **HIV-TRACE** within Galaxy to generate a network file.
2. Open the dataset and select **HIV-Trace Viewer** from the visualization menu.
3. Explore the interactive network in the browser.

## Requirements
- Galaxy 25.0 or newer
- Modern web browser with JavaScript enabled
