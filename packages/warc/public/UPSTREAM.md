**Upstream provenance**

These files come from [NationalLibraryOfNorway/webdata-warc-explorer](https://github.com/NationalLibraryOfNorway/webdata-warc-explorer), pinned to commit `c8122f69f060671e18621c8636d9bb88a8844908`:

- `index.html`: upstream `app/index.html`, unchanged. The Galaxy entry point mounts its `.app` element without the standalone script tags.
- `style.css`: upstream `app/style.css`, unchanged.
- `app.js`: upstream `app/app.js`, adapted to export `createExplorer()`. The file tree, virtual record list, type filters, search, header/payload panes, keyboard controls, and resizers are retained. The parser/detail helpers moved into `../src/warc.js`; the factory adds cancellation, saved-view hooks, and a preview callback. The local file controls are hidden by the Galaxy entry point.
- `warcio.js`: upstream `app/warcio.min.js`, with only `export default warcio` appended. Its bundled license notice is retained. This uses exactly the parser shipped with the inspected upstream revision rather than replacing it with a different npm release.
- `LICENSE`: upstream MIT license, unchanged.

The original application and the bundled parser carry their notices in the source files. The app's internal version comments disagree (`0.8.4` in JavaScript, `0.8.6` in HTML); the commit above is the authoritative pin.

Galaxy-specific dataset transport, compression-layout handling, premature-EOF checks, payload limits, isolated previews, and saved-view persistence are under `../src/`. New code is MIT licensed. When updating upstream, review the small factory integration and rerun both parser/transport tests and browser tests, including hostile-content previews.
