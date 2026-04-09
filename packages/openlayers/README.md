# Galaxy OpenLayers

Galaxy OpenLayers is a visualization that implements features of [OL10](https://github.com/openlayers) within [Galaxy Charts](https://galaxyproject.github.io/galaxy-charts/) JavaScript-based library for the [Galaxy Project](https://github.com/galaxyproject/galaxy) platform.

## Make Targets

Run all commands from `packages/openlayers`.

- `make deps` installs package dependencies with Yarn.
- `make deps-update` bumps dependencies to the latest releases tracked in `package.json` and `yarn.lock`.
- `make test` runs the Vitest suite.
- `make build` builds the production bundle into `static/`.
- `make check` runs tests and then builds.
- `make dev` starts a local smoke-test server using a direct dataset URL.
- `make dev-galaxy` starts a local server against a real Galaxy dataset ID.

## Local Dev Modes

`make dev` is the default local smoke-test path. It does not require a running Galaxy server and uses the sample GeoJSON URL `http://cdn.jsdelivr.net/gh/galaxyproject/galaxy-test-data/1.geojson` unless you override `DATASET_URL`.

```bash
cd packages/openlayers
make dev
```

Override the direct dataset URL or port when needed:

```bash
make dev DATASET_URL=https://example.org/data.geojson
make dev PORT=4174
```

`make dev-galaxy` is for testing the full Galaxy-backed flow. It requires `GALAXY_DATASET_ID` and can optionally take `GALAXY_ROOT` and `GALAXY_KEY`.

```bash
make dev-galaxy GALAXY_DATASET_ID=<dataset-id>
make dev-galaxy GALAXY_DATASET_ID=<dataset-id> GALAXY_ROOT=http://127.0.0.1:8080
make dev-galaxy GALAXY_DATASET_ID=<dataset-id> GALAXY_ROOT=https://usegalaxy.org GALAXY_KEY=<api-key>
```
