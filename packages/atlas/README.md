# Galaxy plugin for [Embedding Atlas](https://github.com/apple/embedding-atlas)

Interactive visualization of large embedding datasets with automatic clustering, density estimation, real-time search, and linked dashboards. The plugin loads the selected Galaxy dataset (CSV, TSV, tabular, or Parquet) into an in-browser DuckDB engine and hands it to Apple's Embedding Atlas component.

```
$ npm install
$ npm run dev
```

For dev mode the visualization either fetches `process.env.dataset_id` (set via the shared `vite.config.charts.js` env block) or falls back to a hosted CSV from `galaxy-test-data`.

## Expected dataset shape

The table must contain a 2-D projection in columns named `x` / `y` (or `UMAP_1` / `UMAP_2`). If those are absent, the first two numeric columns are used. Optional columns:

- `id` / `identifier` / `index` — stable point identifier
- `text` / `label` / `name` / `title` / `description` — tooltip + search target

Any additional columns become Atlas-side metadata for coloring, faceting, and cross-filtering.

## Architecture notes

See `~/claude/atlas-viz/README.md` for the design rationale, the column-detection heuristics, and the open questions (column-mapping XML params, Parquet loading via `read_parquet`, WebGPU requirement).
