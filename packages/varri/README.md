# @galaxyproject/varri

Galaxy visualization plugin for [vaRRI-js](https://github.com/BackofenLab/vaRRI-js) —
visual annotation of RNA-RNA interactions.

The plugin renders a Galaxy dataset (JSON with `sequence` and `structure`) in
the upstream vaRRI-js GUI: interactive zoom/pan/rotation, region/subsequence/
mutation annotations, probability profiles, and SVG/PNG export.

## How it works

```
Galaxy dataset (JSON)                    Galaxy static server
┌────────────────────────┐               ┌───────────────────────────────┐
│ {"sequence": "...&...",│  varri.js    │ static/plugins/visualizations/ │
│  "structure": "...&..."}│ ──fetch────▶ │ varri/static/                  │
└────────────────────────┘  (API)        │  ├─ varri.xml  (Galaxy glue)  │
                                        │  ├─ varri.js   (Galaxy glue)  │
                                        │  └─ index.html (upstream,     │
                                        │     index.js, style.css,      │
                                        │     dist/, src/, fornac/)     │
                                        └───────────────────────────────┘
```

- `public/` — the only files maintained here: `varri.xml` (Galaxy plugin
  config), `varri.js` (small glue script), `logo.svg`.
- `scripts/fetch_upstream.mjs` — fetches the upstream vaRRI-js assets into
  `static/` (which is gitignored and published to npm via `files: ["static"]`).
- `static/` — build output: upstream GUI + library + Fornac dependencies plus
  the glue files. Never edit by hand.
- The only modification of upstream code is a single `<style>` rule injected
  into the staged `index.html` by `fetch_upstream.mjs` that hides the upstream
  page header and footer, so the plugin view is clean. It is re-applied on
  every fetch and verified by a test.

## Updating the upstream assets

vaRRI-js has no npm package yet, so `static/` is populated from the latest
commit of the upstream `main` branch:

```sh
npm run fetch-upstream     # or: make fetch-upstream
```

The exact upstream commit is recorded in `static/SOURCE.txt`.

Once [vaRRI-js](https://www.npmjs.com/package/varri-js) is published to npm:

1. `npm install varri-js` in this package directory (then
   `npm run fetch-upstream` will copy from `node_modules/varri-js` instead of
   GitHub), or
2. drop the fetch script entirely — Galaxy's `client/visualizations.yml` can
   then install the published `@galaxyproject/varri` package directly:

```yaml
varri:
    package: "@galaxyproject/varri"
    version: 0.0.0
```

No changes to the plugin itself are needed for the transition.

## Build

```sh
npm run build   # fetch upstream assets and stage public/ into static/
npm test        # build + verify the staged output
```

## Dataset format

The dataset must be a `json` Galaxy dataset containing a flat object of vaRRI
URL parameters (the same format used by the upstream `examples.js`). All keys
are optional except `sequence` and `structure`:

```json
{
    "sequence": "AACUCGCGAAAGCCAUAAAAACCAGGGAGACA&UUCCCUGGUGUUGGCGCAGUAUUCGCGCA",
    "structure": "....((((((.((((.....((((((((....&.))))))))..))))......))))))..",
    "startIndex1": -35,
    "startIndex2": 2,
    "subseqHighlights": "1:-12--6:0dec3f:0.9",
    "mutations": "1:-14G:fb0bcb,1:-13G:fb0bcb,2:8C:fb0bcb,2:9C:fb0bcb",
    "forceLayout": "off"
}
```

A wrapper object `{"vaRRIParams": {...}}` is also accepted. See the
[upstream README](https://github.com/BackofenLab/vaRRI-js) for the full list
of parameters (URL parameter names = JSON keys).

## Testing locally

Serve the package and open the upstream GUI with sample parameters:

```sh
cd static
python3 -m http.server 4173
```

Then open e.g.
`http://127.0.0.1:4173/index.html?showRenderingOnly=true&sequence=GCAUGGCGGGCAA%26CCCGCAU&structure=((...))..%3C%3C..%26%3E%3E..`

## Installing into a Galaxy instance (for development)

Galaxy discovers plugins in `config/plugins/visualizations/<name>/static/` and
stages them into `static/plugins/visualizations/` during the client build:

```sh
GALAXY_ROOT=/path/to/galaxy
mkdir -p "$GALAXY_ROOT/config/plugins/visualizations/varri"
cp -r static "$GALAXY_ROOT/config/plugins/visualizations/varri/"
# then (re)build the Galaxy client so the plugin gets staged
```

Once `@galaxyproject/varri` is published to npm, this manual copy is replaced
by adding the entry to `client/visualizations.yml` in the Galaxy distribution.

## License

The vaRRI-js upstream assets (index.html, index.js, style.css, dist/, src/,
fornac/) are MIT licensed, see `static/LICENSE` and `static/fornac/*.LICENSE.txt`.
The glue code in `public/` is MIT licensed as well.
