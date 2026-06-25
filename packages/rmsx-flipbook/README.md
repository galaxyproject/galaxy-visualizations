# RMSX Flipbook

RMSX Flipbook is a Galaxy visualization package for RMSX `rmsx.json` viewer manifests rendered with bundled Molstar.

The initial npm package is published under `@finn2400/rmsx-flipbook`.

It follows the Galaxy visualization XML framework:

- `public/rmsx-flipbook.xml` declares the visualization, compatible `rmsx.json` datatype, params, and script entry point.
- `src/main.js` reads Galaxy's `data-incoming` payload from `#app`.
- The selected manifest is fetched from `${root}api/datasets/${dataset_id}/display`.
- Molstar 5.4.2 is bundled under `public/vendor/molstar/5.4.2`.

## Development

```bash
npm install
GALAXY_ROOT=http://127.0.0.1:8080 GALAXY_DATASET_ID=<dataset-id> npm run dev
```

## Build

```bash
npm run build
```

The build writes Galaxy-ready static assets to `static/`.

## Publish

```bash
npm login
npm run build
npm publish --access public
```

This workspace also works with `pnpm login` and `pnpm publish --access public`.
The package runs `vite build` before packing so the published tarball contains
the Galaxy-ready `static/` assets. After publishing, Galaxy can reference the
package from `client/visualizations.yml`.
