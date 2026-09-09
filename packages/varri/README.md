# @galaxyproject/varri

Galaxy visualization plugin for [vaRRI-js](https://www.npmjs.com/package/varri-js) —
visual annotation of RNA-RNA interactions.

The plugin renders a Galaxy dataset (JSON with `sequence` and `structure`) using the
`varri-js` library: interactive zoom/pan, region/subsequence/mutation annotations,
probability profiles, and SVG/PNG export.

## How it works

This package follows the same [Galaxy Charts](https://charts.galaxyproject.org/) Vite
convention used by the other packages in this repository (see e.g. `packages/aladin`):

- `main.js` — Galaxy glue: reads the `data-incoming` attribute, fetches the dataset from
  the Galaxy API, and embeds the vendored upstream viewer in an `<iframe>` with the
  dataset parameters forwarded as URL query strings.
- `main.css` — minimal layout/toolbar styling.
- `index.html` — the Vite entry HTML page.
- `vite.config.js` / `vite.config.charts.js` — build configuration; `vite build` bundles
  `main.js` into `static/index.js` and `main.css` into `static/index.css`.
- `public/varri.xml` — the Galaxy plugin descriptor (`entry_point` points at the bundled
  `index.js`/`index.css`).
- `public/logo.svg` — plugin icon.

### Why the upstream viewer is vendored wholesale, and how

This plugin does not reimplement any part of the [vaRRI-js](https://backofenlab.github.io/vaRRI-js/)
UI (settings panel, highlight/mutation editors, SVG/PNG export, help, citation page, ...).
Instead, `main.js` embeds the complete, unmodified upstream viewer in an `<iframe>`, and
drives it purely through the URL parameters it already supports for sharing/embedding (see
"URL Parameters & Sharing" in its README). This means no button/label duplication and no
dependency on the vaRRI-js JS API to maintain here — if upstream adds, renames, or removes
settings, this plugin keeps working unchanged; only a `varri-js` version bump is needed.

The `vite-plugin-static-copy` plugin (configured in `vite.config.js`) copies the entire
`varri-js` npm package from `node_modules/varri-js` into `static/vendor/varri-js/` at build
time, unmodified — the same approach used by this repo's `polaris` and `vintent` packages to
vendor `pyodide`. Unlike a custom `predev`/`prebuild` script, `vite-plugin-static-copy` also
serves these files during `vite dev`/`vite preview`, not just `vite build`. This never
downloads anything from GitHub or any other external source — only files already published
in the `varri-js` npm package.

## Build

```sh
npm install     # installs varri-js (devDependency) among others
npm run build   # runs `vite build` into static/, vendoring the varri-js viewer as it goes
npm run dev     # local development server (vendor assets served directly, not copied)
npm test        # sanity-checks the built static/ output
```

## Dataset format

The dataset must be a `json` Galaxy dataset containing a flat object of
[vaRRI-js URL parameters](https://backofenlab.github.io/vaRRI-js/README.html#url-parameters--sharing).
All keys are optional except `sequence` and `structure`:

```json
{
    "sequence": "AACUCGCGAAAGCCAUAAAAACCAGGGAGACA&UUCCCUGGUGUUGGCGCAGUAUUCGCGCA",
    "structure": "....((((((.((((.....((((((((....&.))))))))..))))......))))))..",
    "startIndex1": -35,
    "startIndex2": 2,
    "subsequenceHighlights": [{ "sequence": 1, "range": "-12--6", "color": "#0dec3f", "alpha": 0.9 }],
    "pointMutations": [{ "sequence": 1, "position": -14, "replacement": "G", "color": "#fb0bcb" }],
    "forceLayout": false
}
```

A plain-text query string or a full shareable URL (as produced by vaRRI-js's own
"Share Link" button) is also accepted. Note that `subsequenceHighlights`,
`regionHighlights`, and `pointMutations` are arrays of structured objects matching the
library's own schema — not the comma-separated mini-language used by the upstream
vaRRI-js editor GUI's input fields (see below).

## How the upstream editor UI is embedded

The `varri-js` npm package ships a complete viewer/editor web page (`index.html`,
`index.js`, `style.css`, ...) — the same page served at
<https://backofenlab.github.io/vaRRI-js/>. This plugin **does** embed that page,
unmodified, in an `<iframe>`: the entire editing UI (settings panel, annotation
controls, export buttons, citation page, ...) is available inside the iframe, just
like the standalone page. The only tweak is the `hideFooterAndHeader` URL
parameter, which removes the page's header and footer but keeps the controls
panel visible — exactly as documented by upstream, so users can still tweak
parameters and re-render after loading. Galaxy supplies the dataset parameters as
a query string and the upstream page handles all the rendering, so this plugin
contains no duplicated UI or rendering code. This is similar to how
`packages/aladin` embeds `aladin-lite` — the difference is that `varri-js`
bundles its own HTML page while `aladin-lite` exposes a JavaScript API.

## Testing locally

```sh
npm run dev
```

Then open the printed local URL; a mock `data-incoming` dataset id (from the
`GALAXY_DATASET_ID` environment variable) is injected automatically in dev mode.

## Installing into a Galaxy instance (for development)

Galaxy discovers plugins in `config/plugins/visualizations/<name>/static/` and stages them
into `static/plugins/visualizations/` during the client build:

```sh
GALAXY_ROOT=/path/to/galaxy
npm run build
mkdir -p "$GALAXY_ROOT/config/plugins/visualizations/varri"
cp -r static "$GALAXY_ROOT/config/plugins/visualizations/varri/"
cp public/varri.xml "$GALAXY_ROOT/config/plugins/visualizations/varri/static/varri.xml"
# then (re)build the Galaxy client so the plugin gets staged
```

## License

`varri-js` (vendored under `static/vendor/varri-js/` after a build) is MIT licensed —
see `static/vendor/varri-js/LICENSE`. The glue code in this package is MIT licensed as
well.

