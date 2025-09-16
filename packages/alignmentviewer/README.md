# Galaxy Visualization: Alignment Viewer

This repository provides a Galaxy visualization plugin for **Sequence Alignment Viewer 2.0**, built directly from the official GitHub source code.

## Overview

The visualization integrates the Sequence Alignment Viewer into the Galaxy platform, allowing users to explore sequence alignments interactively within Galaxy workflows.

## Notes on Build

The published **npm package** and the corresponding example provided by the original group did not build successfully in this environment due to reliance on **expected global variables** that were not defined at runtime.  

To work around this, the visualization was rebuilt directly from the GitHub source, using a custom Webpack configuration to correctly provide globals and to package the assets in a form usable by Galaxy.

## Build

Install dependencies and build the visualization assets:

```bash
yarn install
yarn build
