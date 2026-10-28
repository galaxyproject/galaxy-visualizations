**WARC Explorer for Galaxy**

A Galaxy visualization based on the [National Library of Norway's WARC Explorer](https://github.com/NationalLibraryOfNorway/webdata-warc-explorer). It retains the upstream three-pane interface, record-type filters, URI/record-ID search, virtualized list, header viewers, text/hex payload display, keyboard navigation, and pane resizers.

The selected Galaxy `warc.gz` history dataset opens automatically. Archive processing happens in the browser; no third-party service receives the data. The initial scan streams the archive, and selected records are fetched using authenticated HTTP byte ranges. If the server does not advertise ranges, the viewer downloads a Blob once. Multi-record gzip members use sequential reading to avoid upstream's invalid individual-record offsets.

Save view stores the dataset ID, query, enabled record types, and selected record in a Galaxy visualization. Reopening restores that state. Galaxy passes an owned visualization ID for updates; otherwise saving creates a new visualization. Shared views still require access to the dataset. The local file/folder controls are hidden in the Galaxy interface.

The plugin registers for `warc.gz`, which must be present in the Galaxy deployment's datatype configuration. It can also parse plain WARC in development/tests, but does not register a nonexistent plain `warc` datatype or change Galaxy core.

From this directory:

```bash
npm ci
npm run build
npx playwright install chromium
npm test
```

Build output is `static/`, containing `warc.xml`, `index.js`, `index.css`, and the license/provenance notices. Install the built package through Galaxy's visualization plugin packaging in the same way as other packages in this repository. The entry point consumes `#app.dataset.incoming` supplied by Galaxy; it does not need Vue or Galaxy Charts.

`npm run dev` opens the sample archive `1.warc.gz` from [galaxy-test-data](https://github.com/galaxyproject/galaxy-test-data). For development against Galaxy:

```bash
GALAXY_ROOT=http://127.0.0.1:8080 GALAXY_DATASET_ID=ENCODED_ID npm run dev
```

Open the development server, or supply `?dataset_id=ENCODED_ID`. `GALAXY_KEY` optionally configures the development proxy; it is not included in the built JavaScript. Galaxy served under a URL prefix is supported by the incoming `root` configuration. Production accepts only the inherited Galaxy origin, including its `about:blank` visualization iframe.

`npm run test:unit` covers the actual vendored parser, plain/member/single-member gzip layouts, HTTP decompression, resource MIME types, payload limits, malformed input, cancellation, record identity, range transport, and Blob fallback. `npm run test:e2e` drives the built JavaScript/CSS inside a Galaxy-style iframe and mocks only the Galaxy API. It covers search/filter/selection, stale requests, save/restore/error paths, and browser isolation of HTML/image previews. Browser tests require a build first. The repository's existing CI discovers the package and builds it before running its tests.

Indexing still scans the complete archive and retains record metadata in memory. Large archives can therefore take time and browser memory, even though the list is virtualized. Single-member gzip record selection can require another scan from the beginning. Decoded record previews retain at most 16 MiB, and the upstream text view further truncates at 50,000 characters. Truncated payloads cannot be opened as if they were complete.

Payload previews use a sandboxed frame with a restrictive content policy. HTML is projected onto static markup without scripts, navigation, forms, embedded documents, or live URLs. Inline CSS remains, with network requests blocked by CSP. Images, including SVG, render through an image element; audio/video use local data URLs. Other types, including PDF, are shown as text in the isolated preview rather than opening an active document on Galaxy's origin. This is record inspection, not archived-site replay or payload full-text search.

See [vendor/README.md](vendor/README.md) for the upstream pin, retained files, modifications, and licenses.
