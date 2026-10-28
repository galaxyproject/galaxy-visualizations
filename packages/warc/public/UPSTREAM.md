**Upstream provenance**

The files in `vendor/` come from [NationalLibraryOfNorway/webdata-warc-explorer](https://github.com/NationalLibraryOfNorway/webdata-warc-explorer), pinned to commit `c8122f69f060671e18621c8636d9bb88a8844908`, under the MIT license in `LICENSE`:

- `index.html`: upstream `app/index.html`, unchanged. The Galaxy entry point mounts its `.app` element.
- `style.css`: upstream `app/style.css`, unchanged.
- `app.js`: upstream `app/app.js`, adapted to export `createExplorer()` with cancellation and a preview callback. Its parser and record-detail helpers live in `src/warc.js`.
- `warcio.js`: upstream `app/warcio.min.js` with `export default warcio` appended. Its license notice is in `THIRD_PARTY_LICENSES.txt`.

The commit above is the authoritative pin; the app's internal version comments say `0.8.4` in JavaScript and `0.8.6` in HTML.

`src/` holds the Galaxy integration: dataset transport, gzip layout handling, truncation checks, payload limits and isolated previews. When updating upstream, re-apply the `createExplorer()` adaptation and rerun the unit and browser tests.
