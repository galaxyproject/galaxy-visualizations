# Galaxy Visualizations

This repository contains visualizations developed for the [Galaxy Project](https://galaxyproject.org/).

## Overview

Galaxy provides an interactive visualization system to help users explore, interpret, and present their data.

The **Galaxy Charts** framework and its **script-entrypoint** defines the standardized approach for visualization development in Galaxy, documented at [charts.galaxyproject.org](https://charts.galaxyproject.org).

Think of **Galaxy Charts** as the *"how-to-build"* guide and **galaxy-visualizations** as the *"actual built examples"*.

This repository houses **concrete visualization implementations** that:
- Follow the guidelines and structure defined by **Galaxy Charts**.
- Integrate seamlessly into Galaxy's interface.
- Support a variety of data types and analysis workflows.

Each visualization here is a self-contained module following Galaxy's visualization plugin system.

## Repository Structure

This is a monorepo containing 40+ individual visualization packages in the `packages/` directory. Each package is independently versioned and published to npm under the `@galaxyproject` scope.

```
galaxy-visualizations/
├── packages/
│   ├── heatmap/          # Interactive heatmap visualization
│   ├── plotly/           # Plotly-based charts
│   ├── cytoscape/        # Network/graph visualization
│   ├── igv/              # Integrative Genomics Viewer
│   ├── molstar/          # Molecular structure viewer
│   └── ...               # 35+ more visualizations
└── .github/workflows/    # Automated testing and publishing
```

## Development Setup

### Working with Individual Packages

Each visualization package can be developed independently:

```bash
# Navigate to a specific package
cd packages/heatmap

# Install dependencies
yarn install

# Start development server
yarn dev

# Build for production
yarn build

# Run tests
yarn test
```

### Common Development Commands

- **Build a package**: `cd packages/[name] && yarn build`
- **Test a package**: `cd packages/[name] && yarn test`
- **Format code**: `cd packages/[name] && yarn prettier`
- **Development server**: `cd packages/[name] && yarn dev`

## Available Packages

All packages are published to npm under the `@galaxyproject` scope. You can install any visualization package:

```bash
npm install @galaxyproject/heatmap
npm install @galaxyproject/plotly
npm install @galaxyproject/igv
# ... etc
```

For a complete list of available packages, see the [packages directory](./packages/) or search for [`@galaxyproject` on npm](https://www.npmjs.com/search?q=%40galaxyproject).

## Publishing & Distribution

- **Automatic Publishing**: When package versions are updated and merged to `main`, GitHub workflows automatically publish to npm
- **Manual Publishing**: Maintainers can use the "Manual Package Publish" workflow for specific packages
- **Testing**: All pull requests automatically run tests, builds, and formatting checks
- **Package Scope**: All packages are published under the `@galaxyproject` npm organization

## Developing and Adding Visualizations

If you want to add a third-party visualization or build your own:
- Start by reading the [Galaxy Charts Documentation](https://charts.galaxyproject.org) to understand the framework and development process.
- Use the [galaxy-charts-starter](https://github.com/guerler/galaxy-charts-starter) template to quickly scaffold a new project. It provides a Vue environment, utilities to simplify common tasks, and an automatically generated input form by parsing your Galaxy visualization XML configuration.
- Alternatively, you can follow the [Vite-only project](https://charts.galaxyproject.org/galaxy-charts/content/xml-framework.html#building-a-vite-plugin-vanilla-vue-react-and-more) guide to create a standalone plugin without using the Galaxy Charts Vue package (supports Vanilla, Vue, React, and more).

## Contributing

To contribute a new visualization or improve an existing one:

1. **Fork** this repository
2. **Create a feature branch** for your changes
3. **Develop your visualization** in the appropriate `packages/[name]` directory
4. **Test thoroughly** using `yarn test` and `yarn build`
5. **Update the package version** in `package.json` if publishing changes
6. **Submit a pull request** with a clear description of your changes

### Pull Request Guidelines

- Ensure all tests pass and code is properly formatted
- Include updates to documentation if needed
- For new packages, follow the established directory structure
- For version changes, the automated publishing workflow will handle npm publication