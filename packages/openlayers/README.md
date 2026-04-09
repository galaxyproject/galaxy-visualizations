# Galaxy OpenLayers

Galaxy OpenLayers is a visualization that implements features of [OL10](https://github.com/openlayers) within [Galaxy Charts](https://galaxyproject.github.io/galaxy-charts/) JavaScript-based library for the [Galaxy Project](https://github.com/galaxyproject/galaxy) platform.

## Make Targets

Run all commands from `packages/openlayers`.

- `make deps` installs package dependencies with npm.
- `make deps-update` bumps dependencies to the latest releases tracked in `package.json` and `package-lock.json`.
- `make test` runs the Vitest suite.
- `make build` builds the production bundle into `static/`.
- `make check` runs tests and then builds.
- `make dev` starts the Vite dev server.

## Local Dev

`make dev` runs the Vite dev server. With no arguments it serves the visualization with a `__test__` dataset id, which `Plugin.vue` resolves to a sample GeoJSON file (`http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.geojson`) so you can iterate without a running Galaxy.

```bash
cd packages/openlayers
make dev
```

To test against a real Galaxy dataset, pass `GALAXY_DATASET_ID` (and optionally `GALAXY_ROOT` / `GALAXY_KEY`):

```bash
make dev GALAXY_DATASET_ID=<dataset-id>
make dev GALAXY_DATASET_ID=<dataset-id> GALAXY_ROOT=http://127.0.0.1:8080
make dev GALAXY_DATASET_ID=<dataset-id> GALAXY_ROOT=https://usegalaxy.org GALAXY_KEY=<api-key>
```
