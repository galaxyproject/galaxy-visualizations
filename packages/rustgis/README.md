# Galaxy RustGIS

Embeds the full [RustGIS](https://github.com/opengeos/RustGIS) browser application in Galaxy.
Open a history dataset to explore maps, layer styles, attribute tables, edits, layouts and
browser-supported analysis. The application runs on the Galaxy origin with no extra GIS server.

Supported dataset extensions: `geojson`, `las`, `laz`, `csv`, `tsv`, `tif`, `tiff`, `parquet`
(GeoParquet), and `zip` (including zipped Shapefiles). Coordinate columns are inferred for
CSV/TSV. A Galaxy composite `shp` dataset must first be packaged as a ZIP. Plain Parquet
without supported geospatial geometry is not supported. Native GDAL/DuckDB and database
features are unavailable in this browser build.

Save and Export use RustGIS's normal local downloads. Changes are held in the browser and
are not automatically saved to a Galaxy visualization or uploaded into history. Use the
application's Save/Export before leaving the viewer.

## LAS, LAZ and deferred data

LAS/LAZ, including COPC LAZ, open as point layers with elevation, intensity, classification,
return number and RGB when present. The browser retains up to 500,000 sampled points and
considers at most the first 40 million LAZ points for decompression/sampling. Remote LiDAR
files download in full, with a 256 MiB download limit. The COPC spatial index is not used.
For larger clouds, create smaller extracts before viewing. Missing/unsupported coordinate
systems are reported inside RustGIS; check that the point cloud appears in the expected place.

For ready datasets the adapter uses Galaxy's authenticated display URL. For deferred datasets
it fetches metadata, then passes the primary source's HTTP(S) URL directly to RustGIS. Galaxy
does not materialize the deferred dataset. This still downloads a remote LAZ into the browser.
External sources must allow CORS requests from Galaxy and provide access without Galaxy's
session credentials (for example, a public or signed HTTPS URL). Signed query strings are
preserved. HTTPS Galaxy pages require HTTPS sources. Galaxy file-source URIs, embedded login
credentials and declared source transformations are rejected with an explanation.

Remote TIFF, GeoParquet and FlatGeobuf URLs with recognized suffixes can use RustGIS's range
readers when the server supports them. Stored datasets use an extensionless Galaxy display
URL and therefore take the full-download path. The download limit also applies to those files.

## Build and run

Requires Node.js 22+; Cargo/Trunk are not needed to build the Galaxy adapter.

```sh
npm ci
npm run build
npm run dev
```

The default development page opens bundled GeoJSON sample data. For an existing Galaxy
session, use `?dataset_id=ENCODED_ID&root=https://your-galaxy.example/galaxy/` from that Galaxy
origin. For local development against a local Galaxy, set `GALAXY_ROOT=http://127.0.0.1:8080`
before `npm run dev`; Vite proxies `/api` and the user must have a valid session through that
origin. No API keys are bundled into assets. `?webgl` on the demo page forces WebGL2.

`npm run prepare:vendor` downloads the **exact prebuilt upstream application** identified in
[upstream.json](upstream.json), verifying each file's Git blob ID and length. The source
revision is `797ccab15bf97a2f4c3cbda689bc5a2447ef1a8d` (RustGIS 0.4.0); its published build is
`cb2c8a3823b51838809d6e211a300eca8dee8093` in `opengeos/rustgis-web`. The unchanged WASM,
JavaScript and snippets are cached under `.vendor/` and staged under `public/vendor/rustgis/`.
The first build downloads about 39 MiB; subsequent builds verify the cache and work offline.
Build failure never silently substitutes a newer upstream. Updating the application requires
updating the source/build revisions and every file hash, then rerunning the browser tests.

The local `viewer/` shell supplies relative asset paths and reports network failures. It does
not include the public deployment's analytics, manifest or service worker. Optional actions
inside RustGIS (basemaps, fonts, plugins, external services or AI) can contact their providers.
The production package's `static/` output includes the complete browser app, its Apache-2.0
license and third-party notices. Only the Galaxy adapter is MIT-licensed.

Galaxy initializes the visualization by injecting `index.js` and `index.css` into an
`about:blank` frame with `#app[data-incoming]`. The entry point resolves the viewer relative
to its own module URL and uses the supplied Galaxy root, including deployment prefixes.
Upstream requires the bare `?embed` flag. The wrapper checks message origin and source;
the native `ready` and `project` messages confirm startup and actual import respectively.

## Tests

```sh
npx playwright install chromium
npm test
```

Playwright builds and serves the production artifact, reproducing Galaxy's script injection
into a blank frame under a prefixed URL. Tests use the **real WASM engine** with synthetic
GeoJSON, LAS, LAZ, CSV and tiled GeoTIFF fixtures. They cover session-authenticated stored
data, direct deferred sources and preserved signed URLs, native LiDAR classification decoding,
raster ranges, standalone tables, source/access/size errors, forged messages, nested asset
paths, registration and licenses. All external services
are blocked; the tests require no running Galaxy or public data service. A live deployment
check is still needed for the target Galaxy's proxy, authentication and object-store routing.

`PLAYWRIGHT_PORT` selects the server port. `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` can point to
an existing Chromium. Software WebGL is enabled for headless CI.

`tests/fixtures/berlin.las` and `berlin.laz` contain three generated, fictional LiDAR records
at Berlin coordinates, with classes 2, 5 and 6 and elevations 35, 48 and 70. They contain no
third-party survey data. To regenerate, install `laspy[lazrs]` and `numpy` in a separate Python
environment and run `python tests/generate_lidar.py`; test execution needs no Python packages.
The synthetic tiled `berlin.tif` can be regenerated with `python tests/generate_raster.py`
after installing `tifffile` and `numpy`.
