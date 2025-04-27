
# Galaxy Visualizations

This repository **galaxy-visualizations** contains visualizations developed for the [Galaxy Project](https://galaxyproject.org/).

## Overview

Galaxy provides an interactive visualization system to help users explore, interpret, and present their data.  
The **Galaxy Charts** framework and its **script-entrypoint** defines the standardized approach for visualization development in Galaxy, documented at [charts.galaxyproject.org](https://charts.galaxyproject.org).

This repository houses **concrete visualization implementations** that:
- Follow the guidelines and structure defined by **Galaxy Charts**.
- Integrate seamlessly into Galaxy's interface.
- Support a variety of data types and analysis workflows.

Each visualization here is a self-contained module following Galaxy’s visualization plugin system.

Think of **Galaxy Charts** as the *"how-to-build"* guide and **galaxy-visualizations** as the *"actual built examples"*.

## Developing and Adding Visualizations

If you want to add a third-party visualization or build your own:
- Start by reading the [Galaxy Charts Documentation](https://charts.galaxyproject.org) to understand the framework and development process.
- Use the [galaxy-charts-starter](https://github.com/guerler/galaxy-charts-starter) template to quickly scaffold a new project. It provides a Vue environment, utilities to simplify common tasks, and an automatically generated input form by parsing your Galaxy visualization XML configuration.
- Alternatively, you can follow the [Vite-only project](https://charts.galaxyproject.org/galaxy-charts/content/xml-framework.html#building-a-vite-plugin-vanilla-vue-react-and-more) guide to create a standalone plugin without using the Galaxy Charts Vue package (supports Vanilla, Vue, React, and more).
- Once your visualization is ready, you can contribute it to this repository by following Galaxy’s plugin submission guidelines.
