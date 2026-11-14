# R (webR)

An R environment for Galaxy that runs in the browser with [webR](https://docs.r-wasm.org/webr/) 0.6.0 (R 4.6.0). It installs packages from Bioconductor's and CRAN's webR repositories, and nothing runs on the Galaxy server.

- **Script and console:** an editor (Ctrl/Cmd+Enter runs the line or selection) and a console with history.
- **Dataset:** the dataset the visualization was opened on is written to `/galaxy/input/<name>.<ext>`, and its path is in `galaxy_input`. A first script is suggested by datatype: `read.delim` for tabular data, `read.csv` for csv, `readRDS` for rds, `load` for rdata.
- **Plots, files and packages:** plots and files can be downloaded or sent to the dataset's history with a button. Packages are installed from the Packages tab or with `install.packages()`.
- **Saved script:** "Save script" stores it in the visualization through Galaxy Charts, and it is restored when the visualization is reopened.

## Repositories

The `repositories` setting lists webR repositories in priority order. The default is Bioconductor's webR repository, then CRAN's:

```
https://webr.bioconductor.org/3.23, https://repo.r-wasm.org
```

Bioconductor's r-universe (`https://bioc-release.r-universe.dev`) is a drop-in addition. When two repositories have the same version of a package, the first one wins. Restart R after changing the setting.

## Limits

- **No interrupt:** Galaxy's frame is not cross-origin isolated, so webR uses its PostMessage channel. Running code cannot be interrupted, and `readline()`, `menu()` and `browser()` do not work. "Restart R" is the way to stop code; it clears the workspace and home directory and reloads the dataset.
- **Memory and cores:** about 2 GB of memory and one core.
- **Packages:** only packages with webR builds install. As of 2026-11-01, DESeq2, edgeR and scran fail on `locfit`, which has no webR build. 271 of the 2,239 packages in webr.bioconductor.org/3.23's index have no file behind them (404), scater and scuttle among them; Bioconductor's r-universe has those.
- **No outside services:** packages that need the network at run time (AnnotationHub, ExperimentHub, biomaRt) or other programs (Python, pandoc) do not work.
- **Saving needs a login:** sending files to the history works for anonymous users, but saving the script with the visualization needs a logged-in user.

## Hosting in Galaxy

The build adjusts two things in webR so it runs when Galaxy serves it:

- **The about:blank frame:** webR 0.6.0 resolves its worker URL against `location.origin`, which is `"null"` in Galaxy's about:blank frame, so R does not start. The build rewrites that one call to use `self.origin` (`vite.config.js`, `webrOrigin`) and fails if webR's code changes.
- **Compressed images:** Galaxy serves `.gz` files with `Content-Encoding: gzip`, so the browser decompresses webR's `.data.gz` library images before webR does. The build ships them decompressed instead (`decompressImages`). The plugin's webR files are 71 MB on disk rather than 47 MB.

## Development

```bash
npm install
npm run dev            # GALAXY_ROOT and GALAXY_KEY proxy /api to a Galaxy server
npm test               # interface tests against a mocked Galaxy API (Playwright)
npm run build          # static/ with the webR runtime in static/webr/
```

Integration test against a running Galaxy with this plugin deployed. It uses an anonymous session:

```bash
GALAXY_URL=http://localhost:8080 npx playwright test --config playwright.integration.config.ts
```

## Package compatibility

`compat/` installs and runs representative workflows in a real browser, separately from the interface:

```bash
npm run compat                                  # all workflows, results in compat/results/webr/
WORKFLOWS=seurat npm run compat                 # one workflow
WEBR_REPOSITORIES=https://bioc-release.r-universe.dev,https://webr.bioconductor.org/3.23,https://repo.r-wasm.org npm run compat
node compat/native.js                           # the same scripts in native R 4.6 / Bioconductor 3.23 (Docker)
docker build -t webr-compat-native -f compat/native.Dockerfile compat   # rocker R 4.6.0 with build libraries
NATIVE_IMAGE=webr-compat-native node compat/native.js
node compat/compare.js                          # compat/results/report.md
```

- **Scripts:** `compat/workflows/` holds the scripts. Each prints `RESULT <key> <value>` lines, which are compared with the native run.
- **Data:** `compat/fetch-data.js` downloads the data and checks it by SHA-256: the GTN limma table and 10x PBMC 3k.
- **Versions:** both sides record each package's version, so a differing result can be told apart from a differing version.
- **Package cache:** package downloads are cached under `compat/data/repositories/`, so reruns measure webR rather than the network. Delete it to measure cold installs.

## Licences

The plugin's own code is MIT. The webR distribution in `static/webr/` (R, the webR runtime and libgfortran) is GPL-2/GPL-3, and its `LICENSE.md` is shipped next to it. Sources: <https://github.com/r-wasm/webr/tree/v0.6.0> and <https://cran.r-project.org/src/base/R-4/>.
