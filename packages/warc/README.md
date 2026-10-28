**WARC Explorer for Galaxy**

A Galaxy visualization for `warc.gz` datasets, based on the [National Library of Norway's WARC Explorer](https://github.com/NationalLibraryOfNorway/webdata-warc-explorer). It keeps the upstream record list, record-type filters, URI and record-ID search, header viewers, text and hex payload display, keyboard navigation and pane resizers. Upstream's title bar and file pane are hidden, since the viewer opens a single dataset.

The archive is processed in the browser. The first pass streams the dataset to index its records; selecting a record fetches it with an HTTP byte range, or reads the archive sequentially when it is compressed as a single gzip member. Servers without range support get one complete download instead. The `warc.gz` datatype is available from Galaxy 26.2.

## Development

```bash
npm ci
npx playwright install chromium
npm test
```

`npm run dev` opens the sample archive `1.warc.gz` from [galaxy-test-data](https://github.com/galaxyproject/galaxy-test-data). To open a dataset from a Galaxy server:

```bash
GALAXY_ROOT=http://127.0.0.1:8080 GALAXY_KEY=API_KEY GALAXY_DATASET_ID=ENCODED_ID npm run dev
```

`?dataset_id=ENCODED_ID` also selects the dataset. `GALAXY_KEY` is used by the development proxy only.

`npm run test:unit` covers the vendored parser, gzip layouts, payload limits, malformed input, cancellation and range transport. `npm run test:e2e` drives the built viewer inside a Galaxy-style iframe, including search, filters, error states and isolated previews. Playwright reuses a dev server already running on its port; set `PLAYWRIGHT_PORT` to test against a fresh build.

## Limits

Indexing scans the whole archive and keeps record metadata in memory, so large archives take time and memory. Decoded previews hold up to 16 MiB, and the text view shows up to 50,000 characters.

Payload previews open in a sandboxed frame with a restrictive content policy. HTML is rebuilt as static markup with scripts, forms, embedded documents and live URLs removed; images and media use local data URLs; other types are shown as text.

See [public/UPSTREAM.md](public/UPSTREAM.md) for the upstream pin and changes.
