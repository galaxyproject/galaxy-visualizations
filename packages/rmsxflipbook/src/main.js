import { Viewer } from "molstar/lib/apps/viewer/app";
import { Binding } from "molstar/lib/mol-util/binding";
import "molstar/build/viewer/molstar.css";
import "./main.css";

(function () {
    "use strict";

    const SCHEMA_VERSION = "flipbook-molstar-viewer/v1";
    const TEST_DATASET_ID = "__test__";
    const TEST_DATA_FILE = "test-data/example.rmsx.json";
    const appElement = document.querySelector("#app");

    if (import.meta.env.DEV && appElement && !appElement.dataset.incoming) {
        const pageUrl = new URL(window.location.href);
        appElement.dataset.incoming = JSON.stringify({
            root: "/",
            visualization_config: {
                dataset_id: pageUrl.searchParams.has("dataset_id")
                    ? pageUrl.searchParams.get("dataset_id")
                    : process.env.dataset_id || TEST_DATASET_ID,
            },
        });
    }

    const incoming = parseIncoming(appElement?.dataset?.incoming);
    const visualizationConfig = incoming.visualization_config || {};

    function parseIncoming(value) {
        try {
            return JSON.parse(value || "{}");
        } catch (_error) {
            return {};
        }
    }

    function galaxyUrl(path) {
        const root = String(incoming.root || "/");
        const normalizedRoot = root.endsWith("/") ? root : `${root}/`;
        return `${normalizedRoot}${String(path).replace(/^\/+/, "")}`;
    }

    const VISUAL_MIN = 0;
    const VISUAL_MAX = 1;
    const LAYOUTS = new Set(["tiled"]);
    const VIEW_MODES = new Set(["structures", "heatmap", "analysis"]);
    const CONTROL_PANEL_KEYS = ["view", "style", "rotation", "metrics"];
    const RENDER_PRESETS = new Set(["clean-interactive", "soft"]);
    const COMPACT_SPACING = Object.freeze({ min: 0.3, max: 0.7, default: 0.5, step: 0.01 });

    let REPORT = null;
    let viewer = null;
    let dragState = null;
    let renderToken = 0;
    let queuedSceneUpdate = null;
    let sceneReloadPromise = null;
    let sceneReloadRequested = false;
    let sceneReloadAutoView = false;
    let interactiveFrame = null;
    let resizeObserver = null;
    let resizeResetTimer = null;
    let heatmapResizeObserver = null;
    let heatmapDrawFrame = null;
    let analysisResizeObserver = null;
    let analysisDrawFrame = null;
    let analysisLayoutFrame = null;
    let analysisDragState = null;
    let analysisLoadingPromise = null;
    let analysisCameraSnapshot = null;
    let analysisLayoutTargets = new Map();
    const analysisPdbCache = new Map();
    const analysisStatsCache = new Map();
    let markerUpdateTimer = null;
    let markerUpdateToken = 0;

    const state = {
        layout: "tiled",
        activeView: "structures",
        currentIndex: 0,
        visible: new Set(),
        paletteName: "viridis",
        thickness: 1,
        spacing: 1,
        columns: 1,
        rotation: { x: 90, y: 0, z: 0 },
        rotationMatrix: null,
        colorMin: 0,
        colorMax: 1,
        radiusMin: 0.63,
        radiusMax: 3.18,
        marker: false,
        localDrag: true,
        rotationSensitivity: 0.35,
        renderMode: "clean-interactive",
        outline: true,
        activePanel: "view",
        selectedResidueKey: "",
        representationMode: "-",
        records: [],
        loaded: false,
        analysisLoaded: false,
        analysisCameraReady: false,
        liveTransforms: false,
        forceCoordinateFallback: false,
    };

    document.body.innerHTML = `
    <main class="rmsx-app">
      <aside class="rmsx-controls" data-testid="molstar-controls-sidebar">
        <div class="controls-heading">
          <h1>RMSX Flipbook</h1>
          <div class="control-row primary-row">
            <button id="resetViewButton" type="button" data-testid="molstar-reset">Reset View</button>
          </div>
          <div class="view-tabs" role="tablist" aria-label="Viewer mode" data-testid="viewer-mode-tabs">
            <button id="structuresTab" class="active" type="button" role="tab" aria-selected="true" aria-controls="molstarViewport" data-testid="structures-tab">Structures</button>
            <button id="heatmapTab" type="button" role="tab" aria-selected="false" aria-controls="heatmapView" data-testid="heatmap-tab">Heatmap</button>
            <button id="analysisTab" type="button" role="tab" aria-selected="false" aria-controls="molstarViewport analysisView" data-testid="analysis-tab">Analysis</button>
          </div>
        </div>
        <div id="status" class="status sidebar-status">Loading RMSX manifest...</div>
        <p class="citation-note">Please cite: RMSX/Flipbook paper, Scientific Reports (2026), doi:<a href="https://doi.org/10.1038/s41598-026-39869-7" target="_blank" rel="noopener noreferrer">10.1038/s41598-026-39869-7</a>.</p>
        <div class="control-panels" data-testid="molstar-control-panels">
          <details class="control-panel active" open data-panel="view" data-testid="molstar-panel-layout">
            <summary>View</summary>
            <div class="panel-grid">
              <label>Spacing <input id="spacingRange" type="range" min="0.3" max="0.7" value="0.5" step="0.01" data-testid="molstar-spacing-range"><input id="spacingNumber" type="number" min="0.3" max="0.7" value="0.5" step="0.01" data-testid="molstar-spacing-number"></label>
              <label>Cols <input id="columnsNumber" type="number" min="1" value="1" step="1" data-testid="molstar-columns-number"></label>
              <div class="slice-visibility">
                <div class="field-label">Slices</div>
                <div id="sliceChips" class="chips sidebar-chips" data-testid="molstar-slice-chips"></div>
              </div>
            </div>
          </details>
          <details class="control-panel" data-panel="style" data-testid="molstar-panel-scale">
            <summary>Style</summary>
            <div class="panel-grid">
              <label>Palette <select id="paletteSelect" data-testid="molstar-palette-select"></select></label>
              <div class="legend" data-testid="molstar-rmsx-legend">
                <div id="legendColorBar" class="bar" aria-hidden="true"></div>
                <div class="legend-values" aria-label="RMSX color domain">
                  <span class="legend-stop"><span id="legendLowSwatch" class="legend-swatch" aria-hidden="true"></span><span id="domainMin">-</span></span>
                  <span class="legend-stop"><span id="legendMidSwatch" class="legend-swatch" aria-hidden="true"></span><span id="domainMid">-</span></span>
                  <span class="legend-stop"><span id="legendHighSwatch" class="legend-swatch" aria-hidden="true"></span><span id="domainMax">-</span></span>
                </div>
                <div class="radius-legend" aria-label="RMSX radius domain" data-testid="molstar-radius-legend">
                  <span class="radius-stop"><span id="legendLowRadius" class="radius-dot" aria-hidden="true"></span><span id="legendLowRadiusLabel">-</span></span>
                  <span class="radius-stop"><span id="legendMidRadius" class="radius-dot" aria-hidden="true"></span><span id="legendMidRadiusLabel">-</span></span>
                  <span class="radius-stop"><span id="legendHighRadius" class="radius-dot" aria-hidden="true"></span><span id="legendHighRadiusLabel">-</span></span>
                </div>
              </div>
              <label>Thickness <input id="thicknessRange" type="range" min="0.25" max="2.5" value="1" step="0.05" data-testid="molstar-thickness-range"><input id="thicknessNumber" type="number" min="0.25" max="2.5" value="1" step="0.05" data-testid="molstar-thickness-number"></label>
              <label>Color min <input id="colorMinNumber" type="number" value="0" step="0.1" data-testid="molstar-color-min-number"></label>
              <label>Color max <input id="colorMaxNumber" type="number" value="1" step="0.1" data-testid="molstar-color-max-number"></label>
              <label>Radius min <input id="radiusMinNumber" type="number" min="0.05" max="5" value="0.63" step="0.05" data-testid="molstar-radius-min-number"></label>
              <label>Radius max <input id="radiusMaxNumber" type="number" min="0.1" max="8" value="3.18" step="0.05" data-testid="molstar-radius-max-number"></label>
              <label class="check-row">Outline <input id="outlineCheckbox" type="checkbox" checked data-testid="molstar-outline-checkbox"></label>
              <button id="resetScaleButton" type="button" data-testid="molstar-reset-scale">Reset Scale</button>
            </div>
          </details>
          <details class="control-panel" data-panel="rotation" data-testid="molstar-panel-rotation">
            <summary>Rotation</summary>
            <div class="panel-grid">
              <label>Rot X <input id="rotationXRange" type="range" min="-180" max="180" value="90" step="1" data-testid="molstar-rotation-x-range"><input id="rotationXNumber" type="number" min="-180" max="180" value="90" step="1" data-testid="molstar-rotation-x-number"></label>
              <label>Rot Y <input id="rotationYRange" type="range" min="-180" max="180" value="0" step="1" data-testid="molstar-rotation-y-range"><input id="rotationYNumber" type="number" min="-180" max="180" value="0" step="1" data-testid="molstar-rotation-y-number"></label>
              <label>Rot Z <input id="rotationZRange" type="range" min="-180" max="180" value="0" step="1" data-testid="molstar-rotation-z-range"><input id="rotationZNumber" type="number" min="-180" max="180" value="0" step="1" data-testid="molstar-rotation-z-number"></label>
              <label>Drag speed <input id="rotateSensitivityRange" type="range" min="0.1" max="3" value="0.35" step="0.05" data-testid="molstar-rotate-sensitivity-range"><input id="rotateSensitivityNumber" type="number" min="0.1" max="3" value="0.35" step="0.05" data-testid="molstar-rotate-sensitivity-number"></label>
              <div class="button-group">
                <button id="rotateXButton" type="button" data-testid="molstar-rotate-x">X +15</button>
                <button id="rotateYButton" type="button" data-testid="molstar-rotate-y">Y +15</button>
                <button id="rotateZButton" type="button" data-testid="molstar-rotate-z">Z +15</button>
                <button id="resetRotationButton" type="button" data-testid="molstar-reset-rotation">Reset</button>
              </div>
            </div>
          </details>
          <details class="control-panel" data-panel="metrics" data-testid="molstar-panel-diagnostics">
            <summary>Metrics</summary>
            <dl class="metrics">
              <div><dt>Slices</dt><dd id="currentSliceMetric">-</dd></div>
              <div><dt>RMSX range</dt><dd id="peakMetric">-</dd></div>
              <div><dt>Mean RMSX</dt><dd id="meanMetric">-</dd></div>
              <div><dt>Peak residue</dt><dd id="peakResidueMetric">-</dd></div>
              <div><dt>Residues</dt><dd id="residueCountMetric">-</dd></div>
              <div><dt>Masked</dt><dd id="maskedMetric">-</dd></div>
            </dl>
          </details>
        </div>
      </aside>
      <section id="viewerRegion" class="rmsx-viewer" data-testid="molstar-report">
        <div id="molstarViewport" class="viewport" role="tabpanel" aria-labelledby="structuresTab" data-testid="molstar-viewport"></div>
        <div id="heatmapView" class="heatmap-view" role="tabpanel" aria-labelledby="heatmapTab" data-testid="rmsx-heatmap-view" hidden>
          <header class="heatmap-header">
            <h2>RMSX heatmap</h2>
            <div id="heatmapSelection" class="heatmap-selection" aria-live="polite">-</div>
          </header>
          <div id="heatmapChains" class="heatmap-chains" data-testid="rmsx-heatmap-chains"></div>
          <div id="heatmapTooltip" class="heatmap-tooltip" role="tooltip" hidden></div>
        </div>
        <div id="analysisView" class="analysis-view" role="tabpanel" aria-labelledby="analysisTab" data-testid="rmsx-analysis-view" hidden>
          <div id="analysisContent" class="analysis-content">
            <header class="analysis-header">
              <h2>RMSX trajectory analysis</h2>
              <div id="analysisSelection" class="heatmap-selection" aria-live="polite">-</div>
            </header>
            <div id="analysisChainGrid" class="analysis-chain-grid" data-testid="rmsx-analysis-chain-grid"></div>
            <section id="analysisAssemblyPanel" class="analysis-assembly-panel" data-testid="rmsx-analysis-assembly" hidden>
              <h3>All chains</h3>
              <div id="analysisAssemblyLane" class="analysis-structure-lane assembly-lane" data-lane="assembly" data-testid="rmsx-analysis-assembly-lane"></div>
            </section>
          </div>
          <div id="analysisTooltip" class="heatmap-tooltip analysis-tooltip" role="tooltip" hidden></div>
          <div id="analysisDebugOverlay" class="analysis-debug-overlay" aria-hidden="true" hidden></div>
        </div>
      </section>
    </main>
  `;

    const elements = {
        status: document.getElementById("status"),
        resetViewButton: document.getElementById("resetViewButton"),
        structuresTab: document.getElementById("structuresTab"),
        heatmapTab: document.getElementById("heatmapTab"),
        analysisTab: document.getElementById("analysisTab"),
        viewerRegion: document.getElementById("viewerRegion"),
        controlPanels: [...document.querySelectorAll("[data-panel]")],
        outlineCheckbox: document.getElementById("outlineCheckbox"),
        paletteSelect: document.getElementById("paletteSelect"),
        thicknessRange: document.getElementById("thicknessRange"),
        thicknessNumber: document.getElementById("thicknessNumber"),
        spacingRange: document.getElementById("spacingRange"),
        spacingNumber: document.getElementById("spacingNumber"),
        columnsNumber: document.getElementById("columnsNumber"),
        rotationXRange: document.getElementById("rotationXRange"),
        rotationXNumber: document.getElementById("rotationXNumber"),
        rotationYRange: document.getElementById("rotationYRange"),
        rotationYNumber: document.getElementById("rotationYNumber"),
        rotationZRange: document.getElementById("rotationZRange"),
        rotationZNumber: document.getElementById("rotationZNumber"),
        rotateSensitivityRange: document.getElementById("rotateSensitivityRange"),
        rotateSensitivityNumber: document.getElementById("rotateSensitivityNumber"),
        rotateXButton: document.getElementById("rotateXButton"),
        rotateYButton: document.getElementById("rotateYButton"),
        rotateZButton: document.getElementById("rotateZButton"),
        resetRotationButton: document.getElementById("resetRotationButton"),
        colorMinNumber: document.getElementById("colorMinNumber"),
        colorMaxNumber: document.getElementById("colorMaxNumber"),
        radiusMinNumber: document.getElementById("radiusMinNumber"),
        radiusMaxNumber: document.getElementById("radiusMaxNumber"),
        resetScaleButton: document.getElementById("resetScaleButton"),
        sliceChips: document.getElementById("sliceChips"),
        viewport: document.getElementById("molstarViewport"),
        heatmapView: document.getElementById("heatmapView"),
        heatmapChains: document.getElementById("heatmapChains"),
        heatmapSelection: document.getElementById("heatmapSelection"),
        heatmapTooltip: document.getElementById("heatmapTooltip"),
        analysisView: document.getElementById("analysisView"),
        analysisContent: document.getElementById("analysisContent"),
        analysisChainGrid: document.getElementById("analysisChainGrid"),
        analysisAssemblyPanel: document.getElementById("analysisAssemblyPanel"),
        analysisAssemblyLane: document.getElementById("analysisAssemblyLane"),
        analysisSelection: document.getElementById("analysisSelection"),
        analysisTooltip: document.getElementById("analysisTooltip"),
        analysisDebugOverlay: document.getElementById("analysisDebugOverlay"),
        legendColorBar: document.getElementById("legendColorBar"),
        domainMin: document.getElementById("domainMin"),
        domainMid: document.getElementById("domainMid"),
        domainMax: document.getElementById("domainMax"),
        legendLowSwatch: document.getElementById("legendLowSwatch"),
        legendMidSwatch: document.getElementById("legendMidSwatch"),
        legendHighSwatch: document.getElementById("legendHighSwatch"),
        legendLowRadius: document.getElementById("legendLowRadius"),
        legendMidRadius: document.getElementById("legendMidRadius"),
        legendHighRadius: document.getElementById("legendHighRadius"),
        legendLowRadiusLabel: document.getElementById("legendLowRadiusLabel"),
        legendMidRadiusLabel: document.getElementById("legendMidRadiusLabel"),
        legendHighRadiusLabel: document.getElementById("legendHighRadiusLabel"),
        currentSliceMetric: document.getElementById("currentSliceMetric"),
        meanMetric: document.getElementById("meanMetric"),
        peakMetric: document.getElementById("peakMetric"),
        peakResidueMetric: document.getElementById("peakResidueMetric"),
        residueCountMetric: document.getElementById("residueCountMetric"),
        maskedMetric: document.getElementById("maskedMetric"),
        selectedResidueMetric: null,
        selectedRadiusMetric: null,
        selectedColorSwatch: null,
        selectedColorMetric: null,
        styleMetric: null,
        assetMetric: null,
    };

    function setStatus(message, isError) {
        elements.status.textContent = message;
        elements.status.classList.toggle("error", Boolean(isError));
    }

    async function fetchManifest() {
        const datasetId = visualizationConfig.dataset_id;
        if (!datasetId) {
            throw new Error("No Galaxy dataset id was provided to the RMSX Flipbook visualization.");
        }
        const url =
            datasetId === TEST_DATASET_ID
                ? TEST_DATA_FILE
                : galaxyUrl(`api/datasets/${encodeURIComponent(datasetId)}/display`);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Could not load RMSX manifest from Galaxy dataset (${response.status}).`);
        }
        return JSON.parse(await response.text());
    }

    function validateManifest(manifest) {
        if (!manifest || manifest.schemaVersion !== SCHEMA_VERSION) {
            throw new Error(
                `This JSON dataset is not an RMSX Flipbook manifest. Expected schemaVersion ${SCHEMA_VERSION}.`,
            );
        }
        const required = [
            "title",
            "slices",
            "residues",
            "summaries",
            "domain",
            "maskSummary",
            "palette",
            "availablePalettes",
            "presentation",
            "visualMapping",
            "rotationModel",
            "molstarRenderStyle",
        ];
        const missing = required.filter((key) => manifest[key] === undefined);
        if (missing.length) {
            throw new Error(`RMSX manifest is missing required field(s): ${missing.join(", ")}.`);
        }
        if (!Array.isArray(manifest.slices) || !manifest.slices.length) {
            throw new Error("RMSX manifest does not contain any embedded PDB slices.");
        }
        const badSlice = manifest.slices.find(
            (slice) =>
                !["index", "id", "label", "filename", "rmsxColumn", "pdb"].every((key) => slice[key] !== undefined),
        );
        if (badSlice) {
            throw new Error(
                "RMSX manifest slice entries must include index, id, label, filename, rmsxColumn, and embedded pdb text.",
            );
        }
        if (!Array.isArray(manifest.residues) || !manifest.residues.length) {
            throw new Error("RMSX manifest does not contain residue-level RMSX values.");
        }
        if (manifest.analysis !== undefined) {
            const chains = manifest.analysis?.chains;
            if (!Array.isArray(chains) || !chains.length) {
                throw new Error("RMSX manifest analysis data must contain at least one chain.");
            }
            for (const chain of chains) {
                const rmsd = chain?.rmsd;
                const rmsf = chain?.rmsf;
                const rmsdLengths = [rmsd?.frames, rmsd?.timeNs, rmsd?.values].map((values) =>
                    Array.isArray(values) ? values.length : -1,
                );
                const rmsfLengths = [rmsf?.residueIds, rmsf?.values].map((values) =>
                    Array.isArray(values) ? values.length : -1,
                );
                if (
                    !chain?.id ||
                    rmsdLengths.some((length) => length <= 0 || length !== rmsdLengths[0]) ||
                    rmsfLengths.some((length) => length <= 0 || length !== rmsfLengths[0])
                ) {
                    throw new Error(`RMSX manifest analysis arrays are invalid for chain ${chain?.id || "unknown"}.`);
                }
            }
        }
        for (const slice of manifest.slices) {
            if (slice.chainAtomRanges === undefined) {
                continue;
            }
            if (
                !Array.isArray(slice.chainAtomRanges) ||
                slice.chainAtomRanges.some(
                    (range) =>
                        !range?.chain ||
                        !Number.isFinite(Number(range.atomSerialStart)) ||
                        !Number.isFinite(Number(range.atomSerialEnd)),
                )
            ) {
                throw new Error(`RMSX manifest chain atom ranges are invalid for ${slice.filename}.`);
            }
        }
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function formatNumber(value) {
        return Number.isFinite(value) ? value.toFixed(3) : "-";
    }

    function defaultLayoutName() {
        return LAYOUTS.has(REPORT.presentation?.defaultLayout) ? REPORT.presentation.defaultLayout : "tiled";
    }

    function availablePalettes() {
        const palettes = REPORT.availablePalettes || {};
        if (Object.keys(palettes).length) {
            return palettes;
        }
        return {
            [REPORT.palette?.name || "viridis"]: REPORT.palette?.colors || [],
        };
    }

    function defaultPaletteName() {
        const requested = REPORT.palette?.name || "viridis";
        return availablePalettes()[requested] ? requested : paletteNames()[0] || requested;
    }

    function defaultColorMin() {
        return Number(REPORT.visualMapping?.defaultColorMin ?? REPORT.domain.min);
    }

    function defaultColorMax() {
        return Number(REPORT.visualMapping?.defaultColorMax ?? REPORT.domain.max);
    }

    function defaultRadiusMin() {
        return Number(REPORT.visualMapping?.defaultRadiusMin ?? 0.63);
    }

    function defaultRadiusMax() {
        return Number(REPORT.visualMapping?.defaultRadiusMax ?? 3.18);
    }

    function defaultThickness() {
        return Number(REPORT.visualMapping?.defaultThicknessScale ?? 1);
    }

    function minSpacing() {
        const requested = Number(REPORT.flipbookReference?.minimumSpacingFactor ?? COMPACT_SPACING.min);
        return clamp(
            Number.isFinite(requested) ? requested : COMPACT_SPACING.min,
            COMPACT_SPACING.min,
            COMPACT_SPACING.max,
        );
    }

    function maxSpacing() {
        const requested = Number(REPORT.flipbookReference?.maximumSpacingFactor ?? COMPACT_SPACING.max);
        return clamp(Number.isFinite(requested) ? requested : COMPACT_SPACING.max, minSpacing(), COMPACT_SPACING.max);
    }

    function defaultSpacing() {
        const requested = Number(REPORT.flipbookReference?.defaultSpacingFactor ?? COMPACT_SPACING.default);
        if (!Number.isFinite(requested) || requested < minSpacing() || requested > maxSpacing()) {
            return clamp(COMPACT_SPACING.default, minSpacing(), maxSpacing());
        }
        return requested;
    }

    function spacingStep() {
        const requested = Number(REPORT.flipbookReference?.spacingStepFactor ?? COMPACT_SPACING.step);
        return Number.isFinite(requested) && requested > 0 ? requested : COMPACT_SPACING.step;
    }

    function defaultTileColumns() {
        return clamp(
            Math.round(Number(REPORT.flipbookReference?.defaultColumns ?? REPORT.slices.length)),
            1,
            Math.max(1, REPORT.slices.length),
        );
    }

    function defaultRenderMode() {
        const preset = String(REPORT.molstarRenderStyle?.preset || "clean-interactive").toLowerCase();
        return RENDER_PRESETS.has(preset) ? preset : "clean-interactive";
    }

    function defaultOutline() {
        return REPORT.molstarRenderStyle?.outline !== false;
    }

    function defaultResidueKey() {
        return REPORT.residues[0]?.key || "";
    }

    function paletteNames() {
        return Object.keys(availablePalettes()).sort((a, b) => a.localeCompare(b));
    }

    function currentPaletteColors() {
        const palettes = availablePalettes();
        return (palettes[state.paletteName] || palettes[defaultPaletteName()] || REPORT.palette.colors || []).map(
            (hex) => String(hex).toUpperCase(),
        );
    }

    function currentMolstarUncertaintyColors() {
        return [...currentPaletteColors()].reverse().map((hex) => Number.parseInt(hex.slice(1), 16));
    }

    function uncertaintyColorParams() {
        return {
            domain: [VISUAL_MIN, VISUAL_MAX],
            list: { kind: "interpolate", colors: currentMolstarUncertaintyColors() },
        };
    }

    function colorDomainMin() {
        return Math.min(state.colorMin, state.colorMax - 0.000001);
    }

    function colorDomainMax() {
        return Math.max(state.colorMax, state.colorMin + 0.000001);
    }

    function normalizedRmsx(value) {
        if (!Number.isFinite(value)) {
            return 0;
        }
        return clamp((value - colorDomainMin()) / Math.max(0.000001, colorDomainMax() - colorDomainMin()), 0, 1);
    }

    function wormRadiusMin() {
        return Math.max(0.01, Math.min(state.radiusMin, state.radiusMax - 0.01) * state.thickness);
    }

    function wormRadiusMax() {
        return Math.max(wormRadiusMin() + 0.01, Math.max(state.radiusMax, state.radiusMin + 0.01) * state.thickness);
    }

    function wormRadiusSpan() {
        return Math.max(0.01, wormRadiusMax() - wormRadiusMin());
    }

    function maskedKeys() {
        return new Set(REPORT.maskSummary?.maskedKeys || []);
    }

    function residueKey(chainId, residueId) {
        return chainId ? `${chainId}:${residueId}` : residueId;
    }

    function isMasked(chainId, residueId) {
        const keys = maskedKeys();
        return keys.has(residueKey(chainId, residueId)) || keys.has(residueId);
    }

    function residueByKey() {
        const map = new Map();
        REPORT.residues.forEach((residue) => {
            map.set(residue.key, residue);
            map.set(residue.id, residue);
        });
        return map;
    }

    function analysisChainGroups() {
        return heatmapChainGroups();
    }

    function analysisMetricForChain(chainId) {
        return REPORT?.analysis?.chains?.find((chain) => String(chain.id) === String(chainId)) || null;
    }

    function laneKey(lane) {
        return lane?.kind === "chain" ? `chain:${lane.chain}` : "assembly";
    }

    function primaryAnalysisLane() {
        const groups = analysisChainGroups();
        return groups.length === 1 ? { kind: "chain", chain: groups[0].chain } : { kind: "assembly" };
    }

    function atomSerialForLine(line) {
        const serial = Number.parseInt(String(line).slice(6, 11).trim(), 10);
        return Number.isFinite(serial) ? serial : null;
    }

    function logicalChainForAtom(slice, line) {
        const serial = atomSerialForLine(line);
        if (serial !== null && Array.isArray(slice?.chainAtomRanges)) {
            const range = slice.chainAtomRanges.find(
                (candidate) => serial >= Number(candidate.atomSerialStart) && serial <= Number(candidate.atomSerialEnd),
            );
            if (range?.chain) {
                return String(range.chain);
            }
        }
        return String(line).padEnd(22, " ").slice(21, 22).trim();
    }

    function pdbForLane(slice, lane = { kind: "assembly" }) {
        if (!lane || lane.kind !== "chain") {
            return slice.pdb;
        }
        const key = `${slice.id}:${laneKey(lane)}`;
        if (analysisPdbCache.has(key)) {
            return analysisPdbCache.get(key);
        }
        const lines = slice.pdb.split(/\r?\n/);
        const filtered = lines.filter((line) => {
            if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) {
                return !line.startsWith("END");
            }
            return logicalChainForAtom(slice, line) === String(lane.chain);
        });
        filtered.push("END");
        const pdb = filtered.join("\n");
        analysisPdbCache.set(key, pdb);
        return pdb;
    }

    function structureStatsForLane(slice, lane = { kind: "assembly" }) {
        const key = `${slice.id}:${laneKey(lane)}`;
        if (!analysisStatsCache.has(key)) {
            analysisStatsCache.set(key, structureStats(pdbForLane(slice, lane)));
        }
        return analysisStatsCache.get(key);
    }

    function structureStats(pdb) {
        const stats = {
            minX: Infinity,
            maxX: -Infinity,
            minY: Infinity,
            maxY: -Infinity,
            minZ: Infinity,
            maxZ: -Infinity,
            sumX: 0,
            sumY: 0,
            sumZ: 0,
            count: 0,
        };
        pdb.split(/\r?\n/).forEach((line) => {
            if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) {
                return;
            }
            const x = Number(line.slice(30, 38));
            const y = Number(line.slice(38, 46));
            const z = Number(line.slice(46, 54));
            if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
                return;
            }
            stats.minX = Math.min(stats.minX, x);
            stats.maxX = Math.max(stats.maxX, x);
            stats.minY = Math.min(stats.minY, y);
            stats.maxY = Math.max(stats.maxY, y);
            stats.minZ = Math.min(stats.minZ, z);
            stats.maxZ = Math.max(stats.maxZ, z);
            stats.sumX += x;
            stats.sumY += y;
            stats.sumZ += z;
            stats.count += 1;
        });
        if (!stats.count) {
            return {
                ...stats,
                width: 30,
                height: 30,
                depth: 30,
                center: { x: 0, y: 0, z: 0 },
            };
        }
        return {
            ...stats,
            width: Math.max(1, stats.maxX - stats.minX),
            height: Math.max(1, stats.maxY - stats.minY),
            depth: Math.max(1, stats.maxZ - stats.minZ),
            center: {
                x: stats.sumX / stats.count,
                y: stats.sumY / stats.count,
                z: stats.sumZ / stats.count,
            },
        };
    }

    function degreesToRadians(value) {
        return (value * Math.PI) / 180;
    }

    function radiansToDegrees(value) {
        return (value * 180) / Math.PI;
    }

    function wrapAngle(value) {
        if (!Number.isFinite(Number(value))) {
            return 0;
        }
        let angle = Number(value);
        while (angle > 180) {
            angle -= 360;
        }
        while (angle < -180) {
            angle += 360;
        }
        return angle;
    }

    function multiplyMatrices(left, right) {
        return left.map((row) =>
            right[0].map((_, columnIndex) =>
                row.reduce((sum, value, index) => sum + value * right[index][columnIndex], 0),
            ),
        );
    }

    function rotationMatrixFor(rotation) {
        const x = degreesToRadians(Number(rotation.x ?? 90));
        const y = degreesToRadians(Number(rotation.y ?? 0));
        const z = degreesToRadians(Number(rotation.z ?? 0));
        const sx = Math.sin(x);
        const cx = Math.cos(x);
        const sy = Math.sin(y);
        const cy = Math.cos(y);
        const sz = Math.sin(z);
        const cz = Math.cos(z);
        const rx = [
            [1, 0, 0],
            [0, cx, -sx],
            [0, sx, cx],
        ];
        const ry = [
            [cy, 0, sy],
            [0, 1, 0],
            [-sy, 0, cy],
        ];
        const rz = [
            [cz, -sz, 0],
            [sz, cz, 0],
            [0, 0, 1],
        ];
        return multiplyMatrices(rz, multiplyMatrices(ry, rx));
    }

    function rotationMatrix() {
        if (!state.rotationMatrix) {
            syncRotationMatrixFromEuler();
        }
        return state.rotationMatrix;
    }

    function defaultRotationMatrix() {
        return rotationMatrixFor(REPORT.rotationModel?.defaultRotation || { x: 90, y: 0, z: 0 });
    }

    function visualEnvelope() {
        const layoutMatrix = defaultRotationMatrix();
        const projectedWidths = REPORT.slices.map((slice) => {
            const stats = structureStats(slice.pdb);
            return rotatedExtentX(stats, layoutMatrix);
        });
        return (Math.max(30, ...projectedWidths) + visualRadiusPadding()) * tilePaddingFactor();
    }

    function rotatedExtentX(stats, matrix) {
        const corners = [
            [stats.minX, stats.minY, stats.minZ],
            [stats.minX, stats.minY, stats.maxZ],
            [stats.minX, stats.maxY, stats.minZ],
            [stats.minX, stats.maxY, stats.maxZ],
            [stats.maxX, stats.minY, stats.minZ],
            [stats.maxX, stats.minY, stats.maxZ],
            [stats.maxX, stats.maxY, stats.minZ],
            [stats.maxX, stats.maxY, stats.maxZ],
        ].map(([x, y, z]) => transformPoint(matrix, stats.center, stats.center, x, y, z).x);
        return Math.max(1, Math.max(...corners) - Math.min(...corners));
    }

    function tilePaddingFactor() {
        return Math.max(1, Number(REPORT.flipbookReference?.tilePaddingFactor ?? 1.55));
    }

    function visualRadiusPadding() {
        return Math.max(24, wormRadiusMax() * 8 + 12);
    }

    function tileOffset(index) {
        if (state.layout !== "tiled") {
            return { x: 0, y: 0, z: 0 };
        }
        const columns = clamp(Math.round(state.columns), 1, REPORT.slices.length);
        const rows = Math.ceil(REPORT.slices.length / columns);
        const row = Math.floor(index / columns);
        const column = index % columns;
        const rowLength = row === rows - 1 ? REPORT.slices.length - row * columns : columns;
        const slot = visualEnvelope() * state.spacing;
        return {
            x: (column - (rowLength - 1) / 2) * slot,
            y: ((rows - 1) / 2 - row) * slot * 0.82,
            z: 0,
        };
    }

    function transformPoint(matrix, center, target, x, y, z) {
        const lx = x - center.x;
        const ly = y - center.y;
        const lz = z - center.z;
        return {
            x: target.x + matrix[0][0] * lx + matrix[0][1] * ly + matrix[0][2] * lz,
            y: target.y + matrix[1][0] * lx + matrix[1][1] * ly + matrix[1][2] * lz,
            z: target.z + matrix[2][0] * lx + matrix[2][1] * ly + matrix[2][2] * lz,
        };
    }

    function identityRotationMatrix() {
        return [
            [1, 0, 0],
            [0, 1, 0],
            [0, 0, 1],
        ];
    }

    function cloneRotationMatrix(matrix) {
        return (matrix || identityRotationMatrix()).map((row) => row.slice());
    }

    function eulerFromRotationMatrix(matrix) {
        const m = matrix || identityRotationMatrix();
        const y = Math.asin(clamp(-m[2][0], -1, 1));
        const cy = Math.cos(y);
        let x = 0;
        let z = 0;
        if (Math.abs(cy) > 0.000001) {
            x = Math.atan2(m[2][1], m[2][2]);
            z = Math.atan2(m[1][0], m[0][0]);
        } else {
            z = Math.atan2(-m[0][1], m[1][1]);
        }
        return {
            x: radiansToDegrees(x),
            y: radiansToDegrees(y),
            z: radiansToDegrees(z),
        };
    }

    function setRotationMatrix(matrix, options = {}) {
        state.rotationMatrix = cloneRotationMatrix(matrix);
        if (options.updateEuler !== false) {
            const euler = eulerFromRotationMatrix(state.rotationMatrix);
            state.rotation = {
                x: wrapAngle(euler.x),
                y: wrapAngle(euler.y),
                z: wrapAngle(euler.z),
            };
        }
    }

    function syncRotationMatrixFromEuler() {
        state.rotationMatrix = rotationMatrixFor(state.rotation);
    }

    function vectorFromArray(value, fallback) {
        const vector = {
            x: Number(value?.[0]),
            y: Number(value?.[1]),
            z: Number(value?.[2]),
        };
        if (Number.isFinite(vector.x) && Number.isFinite(vector.y) && Number.isFinite(vector.z)) {
            return vector;
        }
        return { ...fallback };
    }

    function subtractVectors(left, right) {
        return {
            x: left.x - right.x,
            y: left.y - right.y,
            z: left.z - right.z,
        };
    }

    function crossVectors(left, right) {
        return {
            x: left.y * right.z - left.z * right.y,
            y: left.z * right.x - left.x * right.z,
            z: left.x * right.y - left.y * right.x,
        };
    }

    function normalizeVector(vector, fallback) {
        const length = Math.sqrt(vector.x * vector.x + vector.y * vector.y + vector.z * vector.z);
        if (!Number.isFinite(length) || length < 0.000001) {
            return { ...fallback };
        }
        return {
            x: vector.x / length,
            y: vector.y / length,
            z: vector.z / length,
        };
    }

    function cameraSnapshot() {
        const camera = viewer?.plugin?.canvas3d?.camera;
        try {
            return camera?.getSnapshot?.() || camera?.state || null;
        } catch (error) {
            console.debug("Molstar camera snapshot unavailable for local rotation.", error);
            return null;
        }
    }

    function currentScreenRotationAxes() {
        const snapshot = cameraSnapshot();
        const position = vectorFromArray(snapshot?.position, {
            x: 0,
            y: 0,
            z: 100,
        });
        const target = vectorFromArray(snapshot?.target, { x: 0, y: 0, z: 0 });
        const view = normalizeVector(subtractVectors(target, position), {
            x: 0,
            y: 0,
            z: -1,
        });
        let up = normalizeVector(vectorFromArray(snapshot?.up, { x: 0, y: 1, z: 0 }), { x: 0, y: 1, z: 0 });
        const right = normalizeVector(crossVectors(view, up), { x: 1, y: 0, z: 0 });
        up = normalizeVector(crossVectors(right, view), up);
        return { right, up, view };
    }

    function axisAngleRotationMatrix(axis, degrees) {
        const unit = normalizeVector(axis, { x: 0, y: 1, z: 0 });
        const angle = degreesToRadians(degrees);
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        const t = 1 - c;
        const x = unit.x;
        const y = unit.y;
        const z = unit.z;
        return [
            [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
            [t * y * x + s * z, t * y * y + c, t * y * z - s * x],
            [t * z * x - s * y, t * z * y + s * x, t * z * z + c],
        ];
    }

    function rotationDeltaMatrixForScreenDrag(dx, dy, axes) {
        const horizontal = axisAngleRotationMatrix(axes.up, dx * state.rotationSensitivity);
        const vertical = axisAngleRotationMatrix(axes.right, dy * state.rotationSensitivity);
        return multiplyMatrices(vertical, horizontal);
    }

    function applyScreenRotationDrag(dx, dy, axes) {
        const delta = rotationDeltaMatrixForScreenDrag(dx, dy, axes);
        setRotationMatrix(multiplyMatrices(delta, rotationMatrix()));
    }

    function transformedPdb(slice, index, mode, applySceneTransform = true, lane = { kind: "assembly" }) {
        const sourcePdb = pdbForLane(slice, lane);
        const stats = structureStats(sourcePdb);
        const anchor = structureStats(REPORT.slices[0].pdb).center;
        const offset = tileOffset(index);
        const target = {
            x: anchor.x + offset.x,
            y: anchor.y + offset.y,
            z: anchor.z + offset.z,
        };
        const matrix = rotationMatrix();
        const residues = residueByKey();
        let atomCount = 0;
        const lines = sourcePdb
            .split(/\r?\n/)
            .map((line) => {
                if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) {
                    return line;
                }
                const padded = line.padEnd(80, " ");
                const x = Number(padded.slice(30, 38));
                const y = Number(padded.slice(38, 46));
                const z = Number(padded.slice(46, 54));
                const chainId = logicalChainForAtom(slice, padded);
                const residueId = padded.slice(22, 26).trim();
                const masked = isMasked(chainId, residueId);
                if (mode === "unmasked" && masked) {
                    return null;
                }
                if (mode === "masked" && !masked) {
                    return null;
                }
                const residue = residues.get(residueKey(chainId, residueId)) || residues.get(residueId);
                const rmsx = residue?.values?.[slice.rmsxColumn];
                const bfactor = normalizedRmsx(Number(rmsx));
                const point =
                    applySceneTransform && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
                        ? transformPoint(matrix, stats.center, target, x, y, z)
                        : null;
                atomCount += 1;
                const xText = point ? point.x.toFixed(3).padStart(8) : padded.slice(30, 38);
                const yText = point ? point.y.toFixed(3).padStart(8) : padded.slice(38, 46);
                const zText = point ? point.z.toFixed(3).padStart(8) : padded.slice(46, 54);
                const bText = bfactor.toFixed(2).padStart(6);
                return `${padded.slice(0, 30)}${xText}${yText}${zText}${padded.slice(54, 60)}${bText}${padded.slice(66)}`.trimEnd();
            })
            .filter((line) => line !== null);
        return { pdb: lines.join("\n"), atomCount };
    }

    function analysisLaneForRecord(lane = { kind: "assembly" }) {
        if (lane.kind === "assembly" && analysisChainGroups().length === 1) {
            return primaryAnalysisLane();
        }
        return lane;
    }

    function analysisTargetForSlice(index, lane = { kind: "assembly" }) {
        return analysisLayoutTargets.get(`${laneKey(analysisLaneForRecord(lane))}:${index}`) || null;
    }

    function sceneTransformForSlice(slice, index, lane = { kind: "assembly" }, useAnalysisLayout = true) {
        const stats = structureStatsForLane(slice, lane);
        const anchor = structureStats(REPORT.slices[0].pdb).center;
        const offset = tileOffset(index);
        let target = {
            x: anchor.x + offset.x,
            y: anchor.y + offset.y,
            z: anchor.z + offset.z,
        };
        let scale = 1;
        if (useAnalysisLayout && state.activeView === "analysis") {
            const analysisTarget = analysisTargetForSlice(index, lane);
            if (analysisTarget) {
                target = analysisTarget.target;
                scale = analysisTarget.scale;
            }
        }
        const matrix = rotationMatrix();
        return { matrix, center: stats.center, target, scale };
    }

    function molstarTransformForSlice(slice, index, lane = { kind: "assembly" }) {
        const transform = sceneTransformForSlice(slice, index, lane);
        const r = transform.matrix;
        const c = transform.center;
        const t = transform.target;
        const s = Number(transform.scale || 1);
        const tx = t.x - s * (r[0][0] * c.x + r[0][1] * c.y + r[0][2] * c.z);
        const ty = t.y - s * (r[1][0] * c.x + r[1][1] * c.y + r[1][2] * c.z);
        const tz = t.z - s * (r[2][0] * c.x + r[2][1] * c.y + r[2][2] * c.z);
        return [
            s * r[0][0],
            s * r[1][0],
            s * r[2][0],
            0,
            s * r[0][1],
            s * r[1][1],
            s * r[2][1],
            0,
            s * r[0][2],
            s * r[1][2],
            s * r[2][2],
            0,
            tx,
            ty,
            tz,
            1,
        ];
    }

    function molstarTransformFromBaked(record) {
        const base = record.bakedSceneTransform;
        const current = sceneTransformForSlice(record.slice, record.index, record.lane);
        const inverseBaseRotation = [
            [base.matrix[0][0], base.matrix[1][0], base.matrix[2][0]],
            [base.matrix[0][1], base.matrix[1][1], base.matrix[2][1]],
            [base.matrix[0][2], base.matrix[1][2], base.matrix[2][2]],
        ];
        const rotation = multiplyMatrices(current.matrix, inverseBaseRotation);
        const scale = Number(current.scale || 1) / Number(base.scale || 1);
        const r = rotation.map((row) => row.map((value) => value * scale));
        const tx = current.target.x - (r[0][0] * base.target.x + r[0][1] * base.target.y + r[0][2] * base.target.z);
        const ty = current.target.y - (r[1][0] * base.target.x + r[1][1] * base.target.y + r[1][2] * base.target.z);
        const tz = current.target.z - (r[2][0] * base.target.x + r[2][1] * base.target.y + r[2][2] * base.target.z);
        return [
            r[0][0],
            r[1][0],
            r[2][0],
            0,
            r[0][1],
            r[1][1],
            r[2][1],
            0,
            r[0][2],
            r[1][2],
            r[2][2],
            0,
            tx,
            ty,
            tz,
            1,
        ];
    }

    function selectedResiduePdb(slice, index, applySceneTransform = true, lane = { kind: "assembly" }) {
        if (!state.marker || !state.selectedResidueKey) {
            return { pdb: "", atomCount: 0 };
        }
        const selected =
            REPORT.residues.find((residue) => residue.key === state.selectedResidueKey) || REPORT.residues[0];
        const sourcePdb = pdbForLane(slice, lane);
        const stats = structureStats(sourcePdb);
        const anchor = structureStats(REPORT.slices[0].pdb).center;
        const offset = tileOffset(index);
        const target = {
            x: anchor.x + offset.x,
            y: anchor.y + offset.y,
            z: anchor.z + offset.z,
        };
        const matrix = rotationMatrix();
        let atomCount = 0;
        const lines = sourcePdb
            .split(/\r?\n/)
            .map((line) => {
                if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) {
                    return null;
                }
                const padded = line.padEnd(80, " ");
                const chainId = logicalChainForAtom(slice, padded);
                const residueId = padded.slice(22, 26).trim();
                if (selected.chain && chainId !== selected.chain) {
                    return null;
                }
                if (residueId !== selected.id && residueId !== selected.key) {
                    return null;
                }
                const x = Number(padded.slice(30, 38));
                const y = Number(padded.slice(38, 46));
                const z = Number(padded.slice(46, 54));
                const point =
                    applySceneTransform && Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)
                        ? transformPoint(matrix, stats.center, target, x, y, z)
                        : null;
                atomCount += 1;
                const xText = point ? point.x.toFixed(3).padStart(8) : padded.slice(30, 38);
                const yText = point ? point.y.toFixed(3).padStart(8) : padded.slice(38, 46);
                const zText = point ? point.z.toFixed(3).padStart(8) : padded.slice(46, 54);
                return `${padded.slice(0, 30)}${xText}${yText}${zText}${padded.slice(54)}`.trimEnd();
            })
            .filter(Boolean);
        return { pdb: lines.join("\n"), atomCount };
    }

    function estimatedVisualRadius() {
        return Math.max(1, wormRadiusMax());
    }

    function sceneBoundsForEntry(entry) {
        const stats = structureStats(entry.slice.pdb);
        if (!stats.count) {
            return null;
        }
        const transform = sceneTransformForSlice(entry.slice, entry.index);
        const radius = estimatedVisualRadius();
        const corners = [
            [stats.minX, stats.minY, stats.minZ],
            [stats.minX, stats.minY, stats.maxZ],
            [stats.minX, stats.maxY, stats.minZ],
            [stats.minX, stats.maxY, stats.maxZ],
            [stats.maxX, stats.minY, stats.minZ],
            [stats.maxX, stats.minY, stats.maxZ],
            [stats.maxX, stats.maxY, stats.minZ],
            [stats.maxX, stats.maxY, stats.maxZ],
        ].map(([x, y, z]) => transformPoint(transform.matrix, transform.center, transform.target, x, y, z));
        const bounds = corners.reduce(
            (acc, point) => ({
                minX: Math.min(acc.minX, point.x),
                maxX: Math.max(acc.maxX, point.x),
                minY: Math.min(acc.minY, point.y),
                maxY: Math.max(acc.maxY, point.y),
                minZ: Math.min(acc.minZ, point.z),
                maxZ: Math.max(acc.maxZ, point.z),
            }),
            {
                minX: Infinity,
                maxX: -Infinity,
                minY: Infinity,
                maxY: -Infinity,
                minZ: Infinity,
                maxZ: -Infinity,
            },
        );
        return {
            minX: bounds.minX - radius,
            maxX: bounds.maxX + radius,
            minY: bounds.minY - radius,
            maxY: bounds.maxY + radius,
            minZ: bounds.minZ - radius,
            maxZ: bounds.maxZ + radius,
        };
    }

    function focusEntries() {
        return activeEntries();
    }

    function sceneFocusSphere(entries = focusEntries()) {
        const sceneBounds = entries.map(sceneBoundsForEntry).filter(Boolean);
        if (!sceneBounds.length) {
            return null;
        }
        const bounds = sceneBounds.reduce(
            (acc, current) => ({
                minX: Math.min(acc.minX, current.minX),
                maxX: Math.max(acc.maxX, current.maxX),
                minY: Math.min(acc.minY, current.minY),
                maxY: Math.max(acc.maxY, current.maxY),
                minZ: Math.min(acc.minZ, current.minZ),
                maxZ: Math.max(acc.maxZ, current.maxZ),
            }),
            {
                minX: Infinity,
                maxX: -Infinity,
                minY: Infinity,
                maxY: -Infinity,
                minZ: Infinity,
                maxZ: -Infinity,
            },
        );
        if (!Number.isFinite(bounds.minX) || !Number.isFinite(bounds.maxX)) {
            return null;
        }
        const center = [
            (bounds.minX + bounds.maxX) / 2,
            (bounds.minY + bounds.maxY) / 2,
            (bounds.minZ + bounds.maxZ) / 2,
        ];
        const dx = bounds.maxX - bounds.minX;
        const dy = bounds.maxY - bounds.minY;
        const dz = bounds.maxZ - bounds.minZ;
        return {
            center,
            radius: Math.max(1, Math.sqrt(dx * dx + dy * dy + dz * dz) / 2),
        };
    }

    function cameraFocusExtraRadius(sphere) {
        return Math.max(4, sphere.radius * 0.9);
    }

    function hexColorToMolstarNumber(hex, fallback = 0xffffff) {
        const normalized = String(hex || "").replace("#", "");
        if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
            return fallback;
        }
        return Number.parseInt(normalized, 16);
    }

    function molstarCanvasProps(options = {}) {
        const style = REPORT.molstarRenderStyle || {};
        const softRender = ["soft", "studio", "cinematic"].includes(state.renderMode);
        const occlusionEnabled =
            !options.interactive && (softRender ? style.ambientOcclusion !== "never" : style.ambientOcclusion === true);
        const illuminationEnabled =
            !options.interactive && (softRender ? style.illumination !== "never" : style.illumination === true);
        return {
            transparentBackground: false,
            dpoitIterations: 1,
            userInteractionReleaseMs: 0,
            multiSample: {
                mode: "off",
                sampleLevel: 0,
                reduceFlicker: false,
                reuseOcclusion: false,
            },
            cameraFog: { name: "off", params: {} },
            renderer: {
                backgroundColor: hexColorToMolstarNumber(style.backgroundColor, 0xffffff),
                ambientIntensity: 0.78,
            },
            postprocessing: {
                enabled: state.outline || occlusionEnabled,
                outline: state.outline
                    ? {
                          name: "on",
                          params: {
                              scale: 0.55,
                              threshold: 0.22,
                              color: 0x1f2937,
                              includeTransparent: true,
                          },
                      }
                    : { name: "off", params: {} },
                occlusion: occlusionEnabled
                    ? {
                          name: "on",
                          params: {
                              samples: 8,
                              multiScale: { name: "off", params: {} },
                              radius: 3.2,
                              bias: 0.85,
                              blurKernelSize: 11,
                              blurDepthBias: 0.5,
                              resolutionScale: 0.5,
                              color: 0x000000,
                              transparentThreshold: 0.4,
                          },
                      }
                    : { name: "off", params: {} },
                antialiasing: { name: "smaa", params: {} },
                shadow: { name: "off", params: {} },
                dof: { name: "off", params: {} },
                sharpening: { name: "off", params: {} },
                bloom: { name: "off", params: {} },
                background: { variant: { name: "off", params: {} } },
            },
            marking: {
                enabled: false,
                highlightEdgeColor: 0x000000,
                selectEdgeColor: 0x000000,
                ghostEdgeStrength: 0,
                innerEdgeFactor: 1,
            },
            illumination: {
                enabled: illuminationEnabled,
                maxIterations: 4,
                denoise: true,
            },
        };
    }

    function applyMolstarRenderStyle(options = {}) {
        const plugin = viewer?.plugin;
        if (!plugin?.canvas3d?.setProps) {
            return false;
        }
        try {
            plugin.canvas3d.setProps(molstarCanvasProps(options));
            plugin.canvas3d.requestDraw?.();
            return true;
        } catch (error) {
            console.warn("RMSX Flipbook render style could not be applied.", error);
            return false;
        }
    }

    async function createViewer() {
        elements.viewport.replaceChildren();
        viewer = await Viewer.create("molstarViewport", {
            layoutIsExpanded: false,
            layoutShowControls: false,
            layoutShowRemoteState: false,
            layoutShowSequence: false,
            layoutShowLog: false,
            layoutShowLeftPanel: false,
            viewportShowExpand: false,
            viewportShowSelectionMode: false,
            viewportShowAnimation: false,
        });
        applyMolstarRenderStyle();
        const canvas3d = viewer?.plugin?.canvas3d;
        const trackballBindings = canvas3d?.attribs?.trackball?.bindings;
        if (canvas3d?.setAttribs && trackballBindings) {
            canvas3d.setAttribs({
                trackball: {
                    bindings: {
                        ...trackballBindings,
                        dragRotate: Binding.Empty,
                    },
                },
            });
        }
        setupViewportResizeObserver();
    }

    function requestMolstarDraw() {
        try {
            viewer?.handleResize?.();
            viewer?.plugin?.layout?.events?.updated?.next?.(void 0);
            window.dispatchEvent(new Event("resize"));
            viewer?.plugin?.canvas3d?.requestDraw?.();
        } catch (error) {
            console.debug("Molstar resize/draw refresh failed.", error);
        }
    }

    function schedulePostLayoutReset() {
        if (!state.loaded) {
            return Promise.resolve();
        }
        const resetAfterLayout = () => {
            requestMolstarDraw();
            resetView();
        };
        const scheduleFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
        return new Promise((resolve) => {
            scheduleFrame(() => {
                scheduleFrame(() => {
                    resetAfterLayout();
                    scheduleFrame(resolve);
                    window.setTimeout(resetAfterLayout, 180);
                    window.setTimeout(resetAfterLayout, 700);
                });
            });
        });
    }

    function setupViewportResizeObserver() {
        if (resizeObserver || typeof ResizeObserver === "undefined" || !elements.viewport) {
            return;
        }
        let lastWidth = 0;
        let lastHeight = 0;
        resizeObserver = new ResizeObserver((entries) => {
            const rect = entries?.[0]?.contentRect;
            if (!rect) {
                return;
            }
            const widthChanged = Math.abs(rect.width - lastWidth) > 2;
            const heightChanged = Math.abs(rect.height - lastHeight) > 2;
            lastWidth = rect.width;
            lastHeight = rect.height;
            if (!state.loaded || (!widthChanged && !heightChanged)) {
                return;
            }
            window.clearTimeout(resizeResetTimer);
            resizeResetTimer = window.setTimeout(() => {
                requestMolstarDraw();
                if (state.activeView === "analysis") {
                    requestAnalysisDraw();
                    requestAnalysisLayout();
                    window.setTimeout(requestAnalysisLayout, 260);
                } else {
                    resetView();
                }
            }, 120);
        });
        resizeObserver.observe(elements.viewport);
    }

    async function addStructure(plugin, pdb, label, alpha, marker) {
        if (!pdb.trim()) {
            return null;
        }
        const data = await plugin.builders.data.rawData({ data: pdb, label });
        const trajectory = await plugin.builders.structure.parseTrajectory(data, "pdb");
        const model = await plugin.builders.structure.createModel(trajectory);
        const structure = await plugin.builders.structure.createStructure(model);
        if (marker) {
            return plugin.builders.structure.representation.addRepresentation(structure, {
                type: "spacefill",
                typeParams: { sizeFactor: 0.36, alpha: 0.86, quality: "high" },
                color: "uniform",
                colorParams: { value: 0x111827 },
            });
        }
        const rep = {
            type: "putty",
            typeParams: { sizeFactor: 1, quality: "high", alpha },
            color: "uncertainty",
            colorParams: uncertaintyColorParams(),
            size: "uncertainty",
            sizeParams: {
                bfactorFactor: wormRadiusSpan(),
                rmsfFactor: 0,
                baseSize: wormRadiusMin(),
            },
        };
        try {
            const representation = await plugin.builders.structure.representation.addRepresentation(structure, rep);
            state.representationMode = "putty";
            return representation;
        } catch (error) {
            const representation = await plugin.builders.structure.representation.addRepresentation(structure, {
                ...rep,
                type: "cartoon",
                typeParams: {
                    aspectRatio: 1.2,
                    sizeFactor: Math.max(0.22, wormRadiusMax() / 2.7),
                    quality: "high",
                    alpha,
                },
            });
            state.representationMode = "cartoon";
            return representation;
        }
    }

    async function addSelectedResidueMarkerRecord(
        plugin,
        entry,
        coordinateBaked,
        lane = { kind: "assembly" },
        visibility = {},
    ) {
        if (!state.marker) {
            return null;
        }
        const marker = selectedResiduePdb(entry.slice, entry.index, coordinateBaked, lane);
        if (!marker.pdb.trim()) {
            return null;
        }
        const data = await plugin.builders.data.rawData({
            data: marker.pdb,
            label: `${entry.slice.label} selected residue ${state.selectedResidueKey}`,
        });
        const trajectory = await plugin.builders.structure.parseTrajectory(data, "pdb");
        const model = await plugin.builders.structure.createModel(trajectory);
        const structure = await plugin.builders.structure.createStructure(model);
        const representation = await plugin.builders.structure.representation.addRepresentation(structure, {
            type: "spacefill",
            typeParams: { sizeFactor: 0.36, alpha: 0.86, quality: "high" },
            color: "uniform",
            colorParams: { value: 0x111827 },
        });
        return {
            ...entry,
            lane,
            ...visibility,
            kind: "marker",
            representation,
            rootRef: data.ref,
            bakedSceneTransform: coordinateBaked ? sceneTransformForSlice(entry.slice, entry.index, lane, false) : null,
        };
    }

    async function removeSelectedResidueMarkerRecords(plugin) {
        const markerRecords = state.records.filter((record) => record.kind === "marker");
        state.records = state.records.filter((record) => record.kind !== "marker");
        elements.heatmapView.dataset.markerRecords = "0";
        await deleteMarkerRecordRoots(plugin, markerRecords);
    }

    async function deleteMarkerRecordRoots(plugin, records) {
        const rootRefs = [...new Set(records.map((record) => record.rootRef).filter(Boolean))];
        if (!rootRefs.length || !plugin?.state?.data?.build) {
            return;
        }
        const update = plugin.state.data.build();
        rootRefs.forEach((ref) => update.delete(ref));
        await update.commit();
    }

    async function refreshSelectedResidueMarkers() {
        const plugin = viewer?.plugin;
        if (!plugin || !state.loaded) {
            return;
        }
        const token = ++markerUpdateToken;
        await removeSelectedResidueMarkerRecords(plugin);
        if (!state.marker || token !== markerUpdateToken) {
            applyLiveTransforms(false, true);
            return;
        }
        const records = [];
        const multipleChains = analysisChainGroups().length > 1;
        const laneRequests = [
            {
                coordinateBaked: state.forceCoordinateFallback,
                lane: { kind: "assembly" },
                visibility: { structuresOnly: multipleChains && state.forceCoordinateFallback },
            },
        ];
        if (state.analysisLoaded && multipleChains) {
            laneRequests.push(
                { coordinateBaked: false, lane: { kind: "assembly" }, visibility: { analysisOnly: true } },
                ...analysisChainGroups().map(({ chain }) => ({
                    coordinateBaked: false,
                    lane: { kind: "chain", chain },
                    visibility: { analysisOnly: true },
                })),
            );
        }
        for (const request of laneRequests) {
            for (const entry of allEntries()) {
                const record = await addSelectedResidueMarkerRecord(
                    plugin,
                    entry,
                    request.coordinateBaked,
                    request.lane,
                    request.visibility,
                );
                if (record) {
                    records.push(record);
                }
            }
        }
        if (token !== markerUpdateToken) {
            await deleteMarkerRecordRoots(plugin, records);
            return;
        }
        state.records.push(...records);
        elements.heatmapView.dataset.markerRecords = String(records.length);
        applyLiveTransforms(false, true);
    }

    function queueSelectedResidueMarkerUpdate(delay = 100) {
        window.clearTimeout(markerUpdateTimer);
        markerUpdateTimer = window.setTimeout(() => {
            refreshSelectedResidueMarkers().catch((error) => {
                console.error(error);
                setStatus(`Could not update the selected residue marker: ${error.message}`, true);
            });
        }, delay);
    }

    function representationObject(representation) {
        return (
            representation?.cell?.obj?.data?.repr ||
            representation?.obj?.data?.repr ||
            representation?.data?.repr ||
            null
        );
    }

    function recordRepresentation(record) {
        return representationObject(record?.representation);
    }

    function activeEntries() {
        return REPORT.slices
            .map((slice, index) => ({ slice, index }))
            .filter((entry) => state.visible.has(entry.index));
    }

    function allEntries() {
        return REPORT.slices.map((slice, index) => ({ slice, index }));
    }

    function isSliceVisible(index) {
        return state.visible.has(index);
    }

    function disposeViewer() {
        markerUpdateToken += 1;
        window.clearTimeout(markerUpdateTimer);
        elements.heatmapView.dataset.markerRecords = "0";
        if (viewer?.dispose) {
            viewer.dispose();
        } else if (viewer?.plugin?.dispose) {
            viewer.plugin.dispose();
        }
        viewer = null;
        state.records = [];
        state.loaded = false;
        state.analysisLoaded = false;
        state.analysisCameraReady = false;
        state.liveTransforms = false;
        analysisCameraSnapshot = null;
        analysisLayoutTargets = new Map();
        elements.viewport.replaceChildren();
    }

    function flushMolstarDraw(representations, fast = false) {
        const canvas = viewer?.plugin?.canvas3d;
        if (!canvas) {
            return;
        }
        for (const repr of representations) {
            try {
                if (repr && typeof canvas.update === "function") {
                    canvas.update(repr, fast);
                }
            } catch (error) {
                console.debug("Molstar representation update failed.", error);
            }
        }
        try {
            canvas.commit?.(fast);
            canvas.requestDraw?.();
        } catch (error) {
            console.debug("Molstar draw flush failed.", error);
        }
    }

    function recordVisibleInActiveView(record) {
        if (state.activeView === "analysis") {
            return !record.structuresOnly;
        }
        return !record.analysisOnly && record.lane?.kind !== "chain";
    }

    function applyRecordTransform(record) {
        const repr = recordRepresentation(record);
        if (!repr?.setState) {
            return null;
        }
        const visible =
            recordVisibleInActiveView(record) &&
            isSliceVisible(record.index) &&
            (record.kind !== "marker" || state.marker);
        repr.setState({
            transform: record.bakedSceneTransform
                ? molstarTransformFromBaked(record)
                : molstarTransformForSlice(record.slice, record.index, record.lane),
            visible,
            pickable: visible,
        });
        return repr;
    }

    function applyLiveTransforms(autoView = false, fast = false) {
        const updated = [];
        let visibleRecordCount = 0;
        for (const record of state.records) {
            const repr = applyRecordTransform(record);
            if (repr) {
                updated.push(repr);
                if (
                    recordVisibleInActiveView(record) &&
                    isSliceVisible(record.index) &&
                    (record.kind !== "marker" || state.marker)
                ) {
                    visibleRecordCount += 1;
                }
            }
        }
        elements.viewport.dataset.visibleRecordCount = String(visibleRecordCount);
        elements.viewport.dataset.uniqueRepresentations = String(new Set(updated).size);
        elements.viewport.dataset.tileColumns = String(state.columns);
        elements.viewport.dataset.assemblyTargetX = JSON.stringify(
            state.records
                .filter((record) => record.lane?.kind === "assembly" && record.kind === "all")
                .map((record) =>
                    Number(sceneTransformForSlice(record.slice, record.index, record.lane).target.x.toFixed(3)),
                ),
        );
        state.liveTransforms = updated.length > 0;
        if (updated.length) {
            flushMolstarDraw(updated, fast);
        }
        if (autoView) {
            resetView();
        }
        setLoadedSceneStatus();
        updateMetrics();
        return updated.length;
    }

    async function loadAnalysisChainRecords() {
        if (state.analysisLoaded || analysisChainGroups().length <= 1) {
            state.analysisLoaded = true;
            return;
        }
        const plugin = viewer?.plugin;
        if (!plugin) {
            return;
        }
        setStatus("Loading synchronized Analysis lanes...");
        const coordinateBaked = false;
        const hasMask = (REPORT.maskSummary?.maskedKeys || []).length > 0;
        const lanes = [{ kind: "assembly" }, ...analysisChainGroups().map(({ chain }) => ({ kind: "chain", chain }))];
        for (const lane of lanes) {
            const laneLabel = lane.kind === "chain" ? `chain ${lane.chain}` : "all chains";
            for (const entry of allEntries()) {
                const bakedSceneTransform = null;
                if (hasMask) {
                    const unmasked = transformedPdb(entry.slice, entry.index, "unmasked", coordinateBaked, lane);
                    const unmaskedRep = await addStructure(
                        plugin,
                        unmasked.pdb,
                        `${entry.slice.label} ${laneLabel} analysis unmasked`,
                        1,
                        false,
                    );
                    state.records.push({
                        ...entry,
                        lane,
                        analysisOnly: true,
                        bakedSceneTransform,
                        kind: "unmasked",
                        representation: unmaskedRep,
                    });
                    const masked = transformedPdb(entry.slice, entry.index, "masked", coordinateBaked, lane);
                    const maskedRep = await addStructure(
                        plugin,
                        masked.pdb,
                        `${entry.slice.label} ${laneLabel} analysis masked`,
                        REPORT.maskOpacity || 0.3,
                        false,
                    );
                    state.records.push({
                        ...entry,
                        lane,
                        analysisOnly: true,
                        bakedSceneTransform,
                        kind: "masked",
                        representation: maskedRep,
                    });
                } else {
                    const all = transformedPdb(entry.slice, entry.index, "all", coordinateBaked, lane);
                    const representation = await addStructure(
                        plugin,
                        all.pdb,
                        `${entry.slice.label} ${laneLabel} analysis`,
                        1,
                        false,
                    );
                    state.records.push({
                        ...entry,
                        lane,
                        analysisOnly: true,
                        bakedSceneTransform,
                        kind: "all",
                        representation,
                    });
                }
                const markerRecord = await addSelectedResidueMarkerRecord(plugin, entry, coordinateBaked, lane, {
                    analysisOnly: true,
                });
                if (markerRecord) {
                    state.records.push(markerRecord);
                }
            }
        }
        state.analysisLoaded = true;
    }

    function ensureAnalysisRecords() {
        if (state.analysisLoaded) {
            return Promise.resolve();
        }
        if (!analysisLoadingPromise) {
            analysisLoadingPromise = loadAnalysisChainRecords().finally(() => {
                analysisLoadingPromise = null;
            });
        }
        return analysisLoadingPromise;
    }

    async function loadLiveScene(autoView) {
        disposeViewer();
        await createViewer();
        setStatus(`Loading ${REPORT.slices.length} RMSX slices in one native Molstar scene...`);
        const plugin = viewer.plugin;
        const hasMask = (REPORT.maskSummary?.maskedKeys || []).length > 0;
        for (const entry of allEntries()) {
            if (hasMask) {
                const unmasked = transformedPdb(entry.slice, entry.index, "unmasked", false);
                const unmaskedRep = await addStructure(plugin, unmasked.pdb, `${entry.slice.label} unmasked`, 1, false);
                state.records.push({
                    ...entry,
                    lane: { kind: "assembly" },
                    kind: "unmasked",
                    representation: unmaskedRep,
                });
                const masked = transformedPdb(entry.slice, entry.index, "masked", false);
                const maskedRep = await addStructure(
                    plugin,
                    masked.pdb,
                    `${entry.slice.label} masked`,
                    REPORT.maskOpacity || 0.3,
                    false,
                );
                state.records.push({
                    ...entry,
                    lane: { kind: "assembly" },
                    kind: "masked",
                    representation: maskedRep,
                });
            } else {
                const all = transformedPdb(entry.slice, entry.index, "all", false);
                const representation = await addStructure(plugin, all.pdb, entry.slice.label, 1, false);
                state.records.push({ ...entry, lane: { kind: "assembly" }, kind: "all", representation });
            }
            const markerRecord = await addSelectedResidueMarkerRecord(plugin, entry, false, { kind: "assembly" });
            if (markerRecord) {
                state.records.push(markerRecord);
            }
        }
        state.loaded = true;
        const updated = applyLiveTransforms(autoView);
        if (!updated) {
            state.forceCoordinateFallback = true;
            await renderCoordinateScene(autoView);
        } else if (autoView !== false) {
            schedulePostLayoutReset();
        }
    }

    async function renderCoordinateScene(autoView) {
        const currentToken = ++renderToken;
        setStatus("Rendering RMSX slices in Molstar...");
        disposeViewer();
        await createViewer();
        if (currentToken !== renderToken) {
            return;
        }
        const plugin = viewer.plugin;
        const hasMask = (REPORT.maskSummary?.maskedKeys || []).length > 0;
        const structuresOnly = analysisChainGroups().length > 1;
        const centerIndex = (REPORT.slices.length - 1) / 2;
        const entries = activeEntries().sort(
            (left, right) => Math.abs(left.index - centerIndex) - Math.abs(right.index - centerIndex),
        );
        for (const entry of entries) {
            const bakedSceneTransform = sceneTransformForSlice(entry.slice, entry.index, { kind: "assembly" }, false);
            if (hasMask) {
                const unmasked = transformedPdb(entry.slice, entry.index, "unmasked", true);
                const unmaskedRep = await addStructure(plugin, unmasked.pdb, `${entry.slice.label} unmasked`, 1, false);
                state.records.push({
                    ...entry,
                    lane: { kind: "assembly" },
                    structuresOnly,
                    bakedSceneTransform,
                    kind: "unmasked",
                    representation: unmaskedRep,
                });
                const masked = transformedPdb(entry.slice, entry.index, "masked", true);
                const maskedRep = await addStructure(
                    plugin,
                    masked.pdb,
                    `${entry.slice.label} masked`,
                    REPORT.maskOpacity || 0.3,
                    false,
                );
                state.records.push({
                    ...entry,
                    lane: { kind: "assembly" },
                    structuresOnly,
                    bakedSceneTransform,
                    kind: "masked",
                    representation: maskedRep,
                });
            } else {
                const all = transformedPdb(entry.slice, entry.index, "all", true);
                const representation = await addStructure(plugin, all.pdb, entry.slice.label, 1, false);
                state.records.push({
                    ...entry,
                    lane: { kind: "assembly" },
                    structuresOnly,
                    bakedSceneTransform,
                    kind: "all",
                    representation,
                });
            }
            const markerRecord = await addSelectedResidueMarkerRecord(
                plugin,
                entry,
                true,
                { kind: "assembly" },
                { structuresOnly },
            );
            if (markerRecord) {
                state.records.push(markerRecord);
            }
        }
        state.loaded = true;
        applyLiveTransforms(false);
        if (autoView !== false) {
            resetView();
            await schedulePostLayoutReset();
        }
        setLoadedSceneStatus();
        updateMetrics();
    }

    async function renderScene(autoView) {
        if (!REPORT) {
            return;
        }
        if (state.loaded && state.liveTransforms) {
            applyLiveTransforms(autoView !== false);
        } else if (!state.forceCoordinateFallback) {
            await loadLiveScene(autoView !== false);
        } else {
            await renderCoordinateScene(autoView !== false);
        }
        if (state.activeView === "analysis") {
            await activateAnalysis();
        }
    }

    function resetView() {
        if (state.activeView === "analysis") {
            requestAnalysisLayout();
            return;
        }
        const plugin = viewer?.plugin;
        const sphere = sceneFocusSphere();
        if (sphere && plugin?.managers?.camera?.focusSphere) {
            plugin.managers.camera.focusSphere(sphere, {
                durationMs: 0,
                extraRadius: cameraFocusExtraRadius(sphere),
            });
        } else if (plugin?.managers?.camera?.reset) {
            plugin.managers.camera.reset();
        } else if (plugin?.canvas3d?.requestCameraReset) {
            plugin.canvas3d.requestCameraReset();
        }
    }

    function hasMaskedResidues() {
        return (REPORT.maskSummary?.maskedKeys || []).length > 0;
    }

    function setLoadedSceneStatus() {
        if (!REPORT) {
            return;
        }
        const visibleCount = visibleSliceIndexes().length;
        const maskText = hasMaskedResidues()
            ? `; ${Number(REPORT.maskSummary?.maskedResidues ?? REPORT.maskSummary?.maskedKeys?.length ?? 0)} masked`
            : "";
        const selected = selectedHeatmapCell();
        const selectionText = state.marker && selected.residue ? `; selected ${selected.residue.key}` : "";
        setStatus(
            `${visibleCount}/${REPORT.slices.length} slices visible; ${state.paletteName}; ${state.representationMode}${maskText}${selectionText}.`,
        );
    }

    function sequenceRmsxStats() {
        const stats = {
            min: Infinity,
            max: -Infinity,
            sum: 0,
            count: 0,
            peakResidue: "-",
        };
        for (const residue of REPORT?.residues || []) {
            for (const value of Object.values(residue.values || {})) {
                const numeric = Number(value);
                if (!Number.isFinite(numeric)) {
                    continue;
                }
                stats.min = Math.min(stats.min, numeric);
                stats.sum += numeric;
                stats.count += 1;
                if (numeric > stats.max) {
                    stats.max = numeric;
                    stats.peakResidue = residue.label || residue.key || "-";
                }
            }
        }
        stats.mean = stats.count ? stats.sum / stats.count : NaN;
        if (!stats.count) {
            stats.min = NaN;
            stats.max = NaN;
        }
        return stats;
    }

    function updateMetrics() {
        const stats = sequenceRmsxStats();
        const visibleCount = visibleSliceIndexes().length;
        elements.currentSliceMetric.textContent = REPORT ? `${visibleCount}/${REPORT.slices.length}` : "-";
        elements.meanMetric.textContent = formatNumber(stats.mean);
        elements.peakMetric.textContent = `${formatNumber(stats.min)} - ${formatNumber(stats.max)}`;
        elements.peakResidueMetric.textContent = stats.peakResidue;
        elements.residueCountMetric.textContent = String(REPORT?.residues?.length || "-");
        elements.maskedMetric.textContent = `${Number(REPORT.maskSummary?.maskedResidues ?? REPORT.maskSummary?.maskedKeys?.length ?? 0)} / ${Number(REPORT.maskSummary?.totalResidues ?? REPORT.residues?.length ?? 0)}`;
        elements.outlineCheckbox.checked = state.outline;
        elements.viewport.classList.toggle("local-drag-disabled", !state.localDrag);
        elements.thicknessRange.value = String(state.thickness);
        elements.thicknessNumber.value = String(state.thickness);
        elements.spacingRange.value = String(state.spacing);
        elements.spacingNumber.value = String(state.spacing);
        elements.colorMinNumber.value = String(Number(state.colorMin.toFixed(3)));
        elements.colorMaxNumber.value = String(Number(state.colorMax.toFixed(3)));
        elements.radiusMinNumber.value = String(Number(state.radiusMin.toFixed(3)));
        elements.radiusMaxNumber.value = String(Number(state.radiusMax.toFixed(3)));
        elements.rotateSensitivityRange.value = String(Number(state.rotationSensitivity.toFixed(3)));
        elements.rotateSensitivityNumber.value = String(Number(state.rotationSensitivity.toFixed(3)));
        updateLegend();
        if (state.activeView === "heatmap") {
            requestHeatmapDraw();
        } else if (state.activeView === "analysis") {
            requestAnalysisDraw();
        }
    }

    function hexToRgb(hex) {
        const normalized = String(hex || "").replace("#", "");
        if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
            return { r: 0, g: 0, b: 0 };
        }
        return {
            r: Number.parseInt(normalized.slice(0, 2), 16),
            g: Number.parseInt(normalized.slice(2, 4), 16),
            b: Number.parseInt(normalized.slice(4, 6), 16),
        };
    }

    function rgbToHex(rgb) {
        return `#${[rgb.r, rgb.g, rgb.b]
            .map((value) => {
                return clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0").toUpperCase();
            })
            .join("")}`;
    }

    function interpolateHexColor(leftHex, rightHex, fraction) {
        const left = hexToRgb(leftHex);
        const right = hexToRgb(rightHex);
        const t = clamp(fraction, 0, 1);
        return rgbToHex({
            r: left.r + (right.r - left.r) * t,
            g: left.g + (right.g - left.g) * t,
            b: left.b + (right.b - left.b) * t,
        });
    }

    function expectedColorForNormalizedRmsx(normalized) {
        const colors = currentPaletteColors();
        if (!colors.length) {
            return "#000000";
        }
        if (colors.length === 1) {
            return colors[0];
        }
        const scaled = clamp(normalized, 0, 1) * (colors.length - 1);
        const lower = Math.floor(scaled);
        const upper = Math.ceil(scaled);
        if (lower === upper) {
            return colors[lower];
        }
        return interpolateHexColor(colors[lower], colors[upper], scaled - lower);
    }

    function currentPaletteGradient() {
        const colors = currentPaletteColors();
        if (!colors.length) {
            return "#000000, #000000";
        }
        if (colors.length === 1) {
            return `${colors[0]}, ${colors[0]}`;
        }
        return colors
            .map((color, index) => {
                const pct = colors.length === 1 ? 0 : (index / (colors.length - 1)) * 100;
                return `${color} ${pct.toFixed(2)}%`;
            })
            .join(", ");
    }

    function mappingLegendStops() {
        const min = colorDomainMin();
        const max = colorDomainMax();
        const mid = min + (max - min) / 2;
        return [
            { key: "Low", rmsx: min, normalized: 0, radius: wormRadiusMin() },
            {
                key: "Mid",
                rmsx: mid,
                normalized: 0.5,
                radius: wormRadiusMin() + wormRadiusSpan() / 2,
            },
            { key: "High", rmsx: max, normalized: 1, radius: wormRadiusMax() },
        ].map((stop) => ({
            ...stop,
            color: expectedColorForNormalizedRmsx(stop.normalized),
        }));
    }

    function radiusDotSize(radius) {
        return clamp(radius * 5, 7, 24);
    }

    function updateLegend() {
        if (elements.legendColorBar) {
            elements.legendColorBar.style.background = `linear-gradient(90deg, ${currentPaletteGradient()})`;
        }
        const textElements = {
            Low: elements.domainMin,
            Mid: elements.domainMid,
            High: elements.domainMax,
        };
        const swatches = {
            Low: elements.legendLowSwatch,
            Mid: elements.legendMidSwatch,
            High: elements.legendHighSwatch,
        };
        const radiusDots = {
            Low: elements.legendLowRadius,
            Mid: elements.legendMidRadius,
            High: elements.legendHighRadius,
        };
        const radiusLabels = {
            Low: elements.legendLowRadiusLabel,
            Mid: elements.legendMidRadiusLabel,
            High: elements.legendHighRadiusLabel,
        };
        mappingLegendStops().forEach((stop) => {
            const value = textElements[stop.key];
            const swatch = swatches[stop.key];
            const dot = radiusDots[stop.key];
            const label = radiusLabels[stop.key];
            if (value) {
                value.textContent = formatNumber(stop.rmsx);
            }
            if (swatch) {
                swatch.style.background = stop.color;
            }
            if (dot) {
                const size = radiusDotSize(stop.radius);
                dot.style.width = `${size.toFixed(1)}px`;
                dot.style.height = `${size.toFixed(1)}px`;
                dot.style.background = stop.color;
            }
            if (label) {
                label.textContent = stop.radius.toFixed(2);
            }
        });
    }

    function heatmapChainGroups() {
        const groups = new Map();
        for (const residue of REPORT?.residues || []) {
            const chain = String(residue.chain || "Unassigned");
            if (!groups.has(chain)) {
                groups.set(chain, []);
            }
            groups.get(chain).push(residue);
        }
        return [...groups.entries()].map(([chain, residues]) => ({ chain, residues }));
    }

    function selectedHeatmapCell() {
        const residue =
            REPORT?.residues?.find((candidate) => candidate.key === state.selectedResidueKey) || REPORT?.residues?.[0];
        const sliceIndex = clamp(Math.round(Number(state.currentIndex) || 0), 0, Math.max(0, REPORT.slices.length - 1));
        const slice = REPORT?.slices?.[sliceIndex];
        return {
            residue,
            slice,
            sliceIndex,
            value: Number(residue?.values?.[slice?.rmsxColumn]),
        };
    }

    function updateHeatmapSelection() {
        const selected = selectedHeatmapCell();
        if (!selected.residue || !selected.slice) {
            elements.heatmapSelection.textContent = "-";
            return;
        }
        const chain = selected.residue.chain ? `Chain ${selected.residue.chain}` : "Unassigned chain";
        elements.heatmapSelection.textContent = `${chain} · Residue ${selected.residue.id} · ${selected.slice.label} · RMSX ${formatNumber(selected.value)}`;
    }

    function prepareChartCanvas(canvas, requestedHeight) {
        const logicalWidth = Math.max(240, Math.floor(canvas.clientWidth));
        const logicalHeight = Math.max(120, Math.floor(requestedHeight || canvas.clientHeight));
        const pixelRatio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        if (!canvas.classList.contains("analysis-chart")) {
            canvas.style.height = `${logicalHeight}px`;
        }
        canvas.width = Math.round(logicalWidth * pixelRatio);
        canvas.height = Math.round(logicalHeight * pixelRatio);
        const context = canvas.getContext("2d");
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        context.clearRect(0, 0, logicalWidth, logicalHeight);
        return { context, logicalHeight, logicalWidth };
    }

    function analysisChartInsets(canvas) {
        return canvas.classList.contains("analysis-chart")
            ? { bottom: 36, left: 72, right: 14, top: 8 }
            : { bottom: 42, left: 64, right: 18, top: 8 };
    }

    function chartPlot(logicalWidth, logicalHeight, insets) {
        return {
            x: insets.left,
            y: insets.top,
            width: Math.max(1, logicalWidth - insets.left - insets.right),
            height: Math.max(1, logicalHeight - insets.top - insets.bottom),
        };
    }

    function sliceTimeNs(slice, index) {
        const center = Number(slice?.time?.centerNs);
        if (Number.isFinite(center)) {
            return center;
        }
        const domain = REPORT?.analysis?.timeDomainNs;
        if (Array.isArray(domain) && domain.length === 2) {
            const start = Number(domain[0]);
            const end = Number(domain[1]);
            if (Number.isFinite(start) && Number.isFinite(end)) {
                return start + (end - start) * ((index + 0.5) / Math.max(1, REPORT.slices.length));
            }
        }
        return Number(slice?.index ?? index + 1);
    }

    function drawVerticalHeatmapLegend(context, plot) {
        const legendX = 10;
        const legendWidth = 9;
        const gradient = context.createLinearGradient(0, plot.y + plot.height, 0, plot.y);
        currentPaletteColors().forEach((color, index, colors) => {
            gradient.addColorStop(index / Math.max(1, colors.length - 1), color);
        });
        context.fillStyle = gradient;
        context.fillRect(legendX, plot.y, legendWidth, plot.height);
        context.strokeStyle = "#98A2B3";
        context.strokeRect(legendX + 0.5, plot.y + 0.5, legendWidth - 1, plot.height - 1);
        context.fillStyle = "#5F6B7A";
        context.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        context.textAlign = "left";
        context.textBaseline = "top";
        context.fillText(formatNumber(colorDomainMax()), legendX + legendWidth + 4, plot.y);
        context.textBaseline = "bottom";
        context.fillText(formatNumber(colorDomainMin()), legendX + legendWidth + 4, plot.y + plot.height);
        context.save();
        context.translate(2, plot.y + plot.height / 2);
        context.rotate(-Math.PI / 2);
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText("RMSX", 0, 0);
        context.restore();
    }

    function drawHeatmapCanvas(canvas) {
        const group = canvas.heatmapGroup;
        if (!group || !REPORT || canvas.clientWidth <= 0) {
            return;
        }
        const slices = REPORT.slices;
        const residues = group.residues;
        const analysisCanvas = canvas.classList.contains("analysis-chart");
        const requestedHeight = analysisCanvas
            ? canvas.clientHeight
            : Math.max(248, Math.min(560, residues.length * 2.6 + 60));
        const { context, logicalHeight, logicalWidth } = prepareChartCanvas(canvas, requestedHeight);
        const plot = chartPlot(logicalWidth, logicalHeight, analysisChartInsets(canvas));
        const cellWidth = plot.width / Math.max(1, slices.length);
        const cellHeight = plot.height / Math.max(1, residues.length);
        const selected = selectedHeatmapCell();

        slices.forEach((slice, column) => {
            residues.forEach((residue, residueIndex) => {
                const row = residues.length - residueIndex - 1;
                const value = Number(residue.values?.[slice.rmsxColumn]);
                context.fillStyle = expectedColorForNormalizedRmsx(normalizedRmsx(value));
                const x = plot.x + column * cellWidth;
                const y = plot.y + row * cellHeight;
                context.fillRect(x, y, Math.ceil(cellWidth + 0.25), Math.ceil(cellHeight + 0.25));
                if (selected.sliceIndex === column && selected.residue?.key === residue.key) {
                    context.strokeStyle = "#FFFFFF";
                    context.lineWidth = 3;
                    context.strokeRect(x + 1.5, y + 1.5, Math.max(1, cellWidth - 3), Math.max(1, cellHeight - 3));
                    context.strokeStyle = "#1D2630";
                    context.lineWidth = 1;
                    context.strokeRect(x + 0.5, y + 0.5, Math.max(1, cellWidth - 1), Math.max(1, cellHeight - 1));
                }
            });
        });

        context.strokeStyle = "#98A2B3";
        context.lineWidth = 1;
        context.strokeRect(plot.x + 0.5, plot.y + 0.5, plot.width - 1, plot.height - 1);
        context.fillStyle = "#5F6B7A";
        context.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        context.textBaseline = "middle";
        context.textAlign = "right";
        const residueStep = Math.max(1, Math.ceil(residues.length / 6));
        residues.forEach((residue, residueIndex) => {
            if (residueIndex % residueStep === 0 || residueIndex === residues.length - 1) {
                const y = plot.y + (residues.length - residueIndex - 0.5) * cellHeight;
                context.fillText(String(residue.id || ""), plot.x - 7, y);
            }
        });

        const tickCount = Math.min(5, slices.length);
        const tickIndexes = new Set();
        for (let tick = 0; tick < tickCount; tick += 1) {
            tickIndexes.add(Math.round((tick * (slices.length - 1)) / Math.max(1, tickCount - 1)));
        }
        context.textBaseline = "top";
        [...tickIndexes].forEach((index, tickPosition, indexes) => {
            const x = plot.x + (index + 0.5) * cellWidth;
            context.textAlign = tickPosition === 0 ? "left" : tickPosition === indexes.length - 1 ? "right" : "center";
            context.fillText(
                REPORT.analysis
                    ? formatNumber(sliceTimeNs(slices[index], index))
                    : String(slices[index]?.index ?? index + 1),
                x,
                plot.y + plot.height + 6,
            );
        });
        context.textAlign = "center";
        context.fillText(REPORT.analysis ? "Time (ns)" : "Slice", plot.x + plot.width / 2, logicalHeight - 13);
        context.save();
        context.translate(analysisCanvas ? 50 : 12, plot.y + plot.height / 2);
        context.rotate(-Math.PI / 2);
        context.textBaseline = "top";
        context.fillText("Residue", 0, 0);
        context.restore();
        if (analysisCanvas) {
            drawVerticalHeatmapLegend(context, plot);
        }

        canvas.heatmapGeometry = { cellHeight, cellWidth, logicalHeight, logicalWidth, plot };
        canvas.dataset.renderedCells = String(residues.length * slices.length);
        canvas.dataset.colorMin = String(colorDomainMin());
        canvas.dataset.colorMax = String(colorDomainMax());
        canvas.dataset.palette = state.paletteName;
        canvas.dataset.plotLeft = String(plot.x);
        canvas.dataset.plotRight = String(plot.x + plot.width);
        canvas.dataset.plotTop = String(plot.y);
        canvas.dataset.plotBottom = String(plot.y + plot.height);
        canvas.dataset.sliceAnchors = JSON.stringify(
            slices.map((_, index) => plot.x + (index + 0.5) * (plot.width / Math.max(1, slices.length))),
        );
    }

    function requestHeatmapDraw() {
        if (heatmapDrawFrame !== null) {
            return;
        }
        heatmapDrawFrame = window.requestAnimationFrame(() => {
            heatmapDrawFrame = null;
            elements.heatmapChains.querySelectorAll("canvas").forEach(drawHeatmapCanvas);
            updateHeatmapSelection();
        });
    }

    function heatmapHitForEvent(canvas, event) {
        const geometry = canvas.heatmapGeometry;
        const group = canvas.heatmapGroup;
        if (!geometry || !group) {
            return null;
        }
        const rect = canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * geometry.logicalWidth;
        const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * geometry.logicalHeight;
        const { plot, cellWidth, cellHeight } = geometry;
        if (x < plot.x || x >= plot.x + plot.width || y < plot.y || y >= plot.y + plot.height) {
            return null;
        }
        const sliceIndex = clamp(Math.floor((x - plot.x) / cellWidth), 0, REPORT.slices.length - 1);
        const visualResidueIndex = clamp(Math.floor((y - plot.y) / cellHeight), 0, group.residues.length - 1);
        const residueIndex = group.residues.length - visualResidueIndex - 1;
        const residue = group.residues[residueIndex];
        const slice = REPORT.slices[sliceIndex];
        return {
            residue,
            residueIndex,
            slice,
            sliceIndex,
            value: Number(residue.values?.[slice.rmsxColumn]),
        };
    }

    function showHeatmapTooltip(event, hit) {
        if (!hit) {
            elements.heatmapTooltip.hidden = true;
            return;
        }
        const chain = hit.residue.chain ? `Chain ${hit.residue.chain}` : "Unassigned chain";
        elements.heatmapTooltip.textContent = `${chain} · Residue ${hit.residue.id} · ${hit.slice.label} · RMSX ${formatNumber(hit.value)}`;
        elements.heatmapTooltip.hidden = false;
        const viewRect = elements.heatmapView.getBoundingClientRect();
        const left = event.clientX - viewRect.left + elements.heatmapView.scrollLeft + 12;
        const top = event.clientY - viewRect.top + elements.heatmapView.scrollTop + 12;
        elements.heatmapTooltip.style.left = `${Math.max(
            8,
            Math.min(left, elements.heatmapView.scrollWidth - elements.heatmapTooltip.offsetWidth - 8),
        )}px`;
        elements.heatmapTooltip.style.top = `${top}px`;
    }

    function selectHeatmapCell(hit) {
        if (!hit) {
            return;
        }
        state.currentIndex = hit.sliceIndex;
        state.selectedResidueKey = hit.residue.key;
        state.marker = true;
        renderChips();
        updateHeatmapSelection();
        requestHeatmapDraw();
        requestAnalysisDraw();
        queueSelectedResidueMarkerUpdate();
    }

    function handleHeatmapKeydown(canvas, event) {
        if (!REPORT || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) {
            return;
        }
        const group = canvas.heatmapGroup;
        const selected = selectedHeatmapCell();
        let residueIndex = Math.max(
            0,
            group.residues.findIndex((residue) => residue.key === selected.residue?.key),
        );
        let sliceIndex = selected.sliceIndex;
        if (event.key === "ArrowLeft") sliceIndex -= 1;
        if (event.key === "ArrowRight") sliceIndex += 1;
        if (event.key === "ArrowUp") residueIndex += 1;
        if (event.key === "ArrowDown") residueIndex -= 1;
        residueIndex = clamp(residueIndex, 0, group.residues.length - 1);
        sliceIndex = clamp(sliceIndex, 0, REPORT.slices.length - 1);
        const residue = group.residues[residueIndex];
        const slice = REPORT.slices[sliceIndex];
        event.preventDefault();
        selectHeatmapCell({
            residue,
            residueIndex,
            slice,
            sliceIndex,
            value: Number(residue.values?.[slice.rmsxColumn]),
        });
    }

    function renderHeatmapPanels() {
        const panels = heatmapChainGroups().map((group) => {
            const section = document.createElement("section");
            section.className = "chain-heatmap";
            section.dataset.chain = group.chain;
            section.dataset.testid = "rmsx-chain-heatmap";
            const heading = document.createElement("h3");
            heading.className = "chain-heatmap-heading";
            const chainLabel = document.createElement("span");
            chainLabel.textContent = group.chain === "Unassigned" ? "Unassigned chain" : `Chain ${group.chain}`;
            const count = document.createElement("span");
            count.className = "chain-heatmap-count";
            count.textContent = `${group.residues.length} residues`;
            heading.append(chainLabel, count);
            const canvas = document.createElement("canvas");
            canvas.className = "heatmap-canvas";
            canvas.tabIndex = 0;
            canvas.dataset.testid = "rmsx-heatmap-canvas";
            canvas.dataset.chain = group.chain;
            canvas.setAttribute("role", "img");
            canvas.setAttribute(
                "aria-label",
                `RMSX heatmap for ${chainLabel.textContent}, ${group.residues.length} residues by ${REPORT.slices.length} slices`,
            );
            canvas.heatmapGroup = group;
            canvas.addEventListener("pointermove", (event) =>
                showHeatmapTooltip(event, heatmapHitForEvent(canvas, event)),
            );
            canvas.addEventListener("pointerleave", () => {
                elements.heatmapTooltip.hidden = true;
            });
            canvas.addEventListener("click", (event) => selectHeatmapCell(heatmapHitForEvent(canvas, event)));
            canvas.addEventListener("keydown", (event) => handleHeatmapKeydown(canvas, event));
            section.append(heading, canvas);
            return section;
        });
        elements.heatmapChains.replaceChildren(...panels);
        elements.heatmapView.dataset.markerRecords ||= "0";
        if (!heatmapResizeObserver && typeof ResizeObserver !== "undefined") {
            heatmapResizeObserver = new ResizeObserver(requestHeatmapDraw);
            heatmapResizeObserver.observe(elements.heatmapChains);
        }
        updateHeatmapSelection();
    }

    function analysisTimeDomain(metric) {
        const manifestDomain = REPORT?.analysis?.timeDomainNs;
        const times = metric?.rmsd?.timeNs || [];
        const start = Number(manifestDomain?.[0] ?? times[0] ?? 0);
        const end = Number(manifestDomain?.[1] ?? times[times.length - 1] ?? REPORT.slices.length);
        return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : [0, 1];
    }

    function finiteMaximum(values, fallback = 1) {
        const finite = (values || []).map(Number).filter(Number.isFinite);
        return finite.length ? Math.max(...finite) : fallback;
    }

    function drawChartGrid(context, plot, horizontalLines = 4, verticalLines = 4) {
        context.save();
        context.strokeStyle = "#E3E7EC";
        context.lineWidth = 1;
        for (let index = 0; index <= horizontalLines; index += 1) {
            const y = plot.y + (index / Math.max(1, horizontalLines)) * plot.height;
            context.beginPath();
            context.moveTo(plot.x, y + 0.5);
            context.lineTo(plot.x + plot.width, y + 0.5);
            context.stroke();
        }
        for (let index = 0; index <= verticalLines; index += 1) {
            const x = plot.x + (index / Math.max(1, verticalLines)) * plot.width;
            context.beginPath();
            context.moveTo(x + 0.5, plot.y);
            context.lineTo(x + 0.5, plot.y + plot.height);
            context.stroke();
        }
        context.restore();
    }

    function drawAnalysisRmsdCanvas(canvas) {
        const metric = canvas.analysisMetric;
        if (!metric?.rmsd || canvas.clientWidth <= 0) {
            return;
        }
        const { context, logicalHeight, logicalWidth } = prepareChartCanvas(canvas, canvas.clientHeight);
        const plot = chartPlot(logicalWidth, logicalHeight, analysisChartInsets(canvas));
        const times = metric.rmsd.timeNs.map(Number);
        const values = metric.rmsd.values.map(Number);
        const [timeMin, timeMax] = analysisTimeDomain(metric);
        const valueMax = Math.max(0.001, finiteMaximum(values, 1) * 1.08);
        const xForTime = (time) => plot.x + ((time - timeMin) / Math.max(0.000001, timeMax - timeMin)) * plot.width;
        const yForValue = (value) => plot.y + plot.height - (value / valueMax) * plot.height;
        drawChartGrid(context, plot, 3, 4);
        context.strokeStyle = "#111827";
        context.lineWidth = 1.35;
        context.beginPath();
        let started = false;
        values.forEach((value, index) => {
            if (!Number.isFinite(value) || !Number.isFinite(times[index])) {
                return;
            }
            const x = xForTime(times[index]);
            const y = yForValue(value);
            if (!started) {
                context.moveTo(x, y);
                started = true;
            } else {
                context.lineTo(x, y);
            }
        });
        context.stroke();
        const selectedTime = sliceTimeNs(REPORT.slices[state.currentIndex], state.currentIndex);
        const markerX = xForTime(selectedTime);
        context.strokeStyle = "#B42318";
        context.lineWidth = 1.5;
        context.beginPath();
        context.moveTo(markerX + 0.5, plot.y);
        context.lineTo(markerX + 0.5, plot.y + plot.height);
        context.stroke();
        context.fillStyle = "#5F6B7A";
        context.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        context.textAlign = "right";
        context.textBaseline = "middle";
        for (let tick = 0; tick <= 3; tick += 1) {
            const value = (valueMax * tick) / 3;
            context.fillText(value.toFixed(valueMax < 10 ? 1 : 0), plot.x - 7, yForValue(value));
        }
        context.save();
        context.translate(12, plot.y + plot.height / 2);
        context.rotate(-Math.PI / 2);
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText(`RMSD (${REPORT.analysis?.distanceUnit || "angstrom"})`, 0, 0);
        context.restore();
        canvas.analysisGeometry = { logicalHeight, logicalWidth, plot, timeMax, timeMin, valueMax };
        canvas.dataset.plotLeft = String(plot.x);
        canvas.dataset.plotRight = String(plot.x + plot.width);
        canvas.dataset.pointCount = String(values.length);
    }

    function drawAnalysisRmsfCanvas(canvas) {
        const metric = canvas.analysisMetric;
        const group = canvas.heatmapGroup;
        if (!metric?.rmsf || !group || canvas.clientWidth <= 0) {
            return;
        }
        const { context, logicalHeight, logicalWidth } = prepareChartCanvas(canvas, canvas.clientHeight);
        const insets = { ...analysisChartInsets(canvas), left: 8, right: 14 };
        const plot = chartPlot(logicalWidth, logicalHeight, insets);
        const metricValues = new Map(
            metric.rmsf.residueIds.map((residueId, index) => [String(residueId), Number(metric.rmsf.values[index])]),
        );
        const values = group.residues.map((residue) => metricValues.get(String(residue.id)) ?? NaN);
        const valueMax = Math.max(0.001, finiteMaximum(values, 1) * 1.08);
        const cellHeight = plot.height / Math.max(1, group.residues.length);
        const xForValue = (value) => plot.x + (value / valueMax) * plot.width;
        const yForIndex = (index) => plot.y + (group.residues.length - index - 0.5) * cellHeight;
        drawChartGrid(context, plot, 3, 3);
        context.strokeStyle = "#111827";
        context.lineWidth = 1.35;
        context.beginPath();
        let started = false;
        values.forEach((value, index) => {
            if (!Number.isFinite(value)) {
                started = false;
                return;
            }
            const x = xForValue(value);
            const y = yForIndex(index);
            if (!started) {
                context.moveTo(x, y);
                started = true;
            } else {
                context.lineTo(x, y);
            }
        });
        context.stroke();
        const selectedIndex = group.residues.findIndex((residue) => residue.key === state.selectedResidueKey);
        if (selectedIndex >= 0) {
            const markerY = yForIndex(selectedIndex);
            context.strokeStyle = "#B42318";
            context.lineWidth = 1.5;
            context.beginPath();
            context.moveTo(plot.x, markerY + 0.5);
            context.lineTo(plot.x + plot.width, markerY + 0.5);
            context.stroke();
        }
        context.fillStyle = "#5F6B7A";
        context.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
        context.textAlign = "center";
        context.textBaseline = "top";
        context.fillText("RMSF", plot.x + plot.width / 2, logicalHeight - 13);
        canvas.analysisGeometry = { cellHeight, logicalHeight, logicalWidth, plot, valueMax, values };
        canvas.dataset.plotTop = String(plot.y);
        canvas.dataset.plotBottom = String(plot.y + plot.height);
        canvas.dataset.pointCount = String(values.filter(Number.isFinite).length);
    }

    function showAnalysisTooltip(event, textContent) {
        if (!textContent) {
            elements.analysisTooltip.hidden = true;
            return;
        }
        elements.analysisTooltip.textContent = textContent;
        elements.analysisTooltip.hidden = false;
        const left = Math.min(event.clientX + 12, window.innerWidth - elements.analysisTooltip.offsetWidth - 8);
        const top = Math.min(event.clientY + 12, window.innerHeight - elements.analysisTooltip.offsetHeight - 8);
        elements.analysisTooltip.style.left = `${Math.max(8, left)}px`;
        elements.analysisTooltip.style.top = `${Math.max(8, top)}px`;
    }

    function sliceIndexForTime(time) {
        let closest = 0;
        let distance = Infinity;
        REPORT.slices.forEach((slice, index) => {
            const candidate = Math.abs(sliceTimeNs(slice, index) - time);
            if (candidate < distance) {
                closest = index;
                distance = candidate;
            }
        });
        return closest;
    }

    function handleAnalysisRmsdEvent(canvas, event, select = false) {
        const geometry = canvas.analysisGeometry;
        if (!geometry) {
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * geometry.logicalWidth;
        if (x < geometry.plot.x || x > geometry.plot.x + geometry.plot.width) {
            showAnalysisTooltip(event, null);
            return;
        }
        const fraction = (x - geometry.plot.x) / geometry.plot.width;
        const time = geometry.timeMin + fraction * (geometry.timeMax - geometry.timeMin);
        const sliceIndex = sliceIndexForTime(time);
        const slice = REPORT.slices[sliceIndex];
        showAnalysisTooltip(event, `${slice.label} · ${formatNumber(sliceTimeNs(slice, sliceIndex))} ns`);
        if (select) {
            state.currentIndex = sliceIndex;
            renderChips();
            requestHeatmapDraw();
            requestAnalysisDraw();
            queueSelectedResidueMarkerUpdate();
        }
    }

    function handleAnalysisRmsfEvent(canvas, event, select = false) {
        const geometry = canvas.analysisGeometry;
        const group = canvas.heatmapGroup;
        if (!geometry || !group) {
            return;
        }
        const rect = canvas.getBoundingClientRect();
        const y = ((event.clientY - rect.top) / Math.max(1, rect.height)) * geometry.logicalHeight;
        if (y < geometry.plot.y || y > geometry.plot.y + geometry.plot.height) {
            showAnalysisTooltip(event, null);
            return;
        }
        const visualIndex = clamp(
            Math.floor((y - geometry.plot.y) / geometry.cellHeight),
            0,
            group.residues.length - 1,
        );
        const residueIndex = group.residues.length - visualIndex - 1;
        const residue = group.residues[residueIndex];
        const value = geometry.values[residueIndex];
        showAnalysisTooltip(event, `Chain ${group.chain} · Residue ${residue.id} · RMSF ${formatNumber(value)}`);
        if (select) {
            state.selectedResidueKey = residue.key;
            state.marker = true;
            requestHeatmapDraw();
            requestAnalysisDraw();
            queueSelectedResidueMarkerUpdate();
        }
    }

    function createAnalysisLane(lane, testid) {
        const laneElement = document.createElement("div");
        laneElement.className = "analysis-structure-lane";
        laneElement.dataset.laneKind = lane.kind;
        if (lane.chain) {
            laneElement.dataset.chain = lane.chain;
        }
        laneElement.dataset.testid = testid;
        laneElement.style.setProperty("--slice-count", String(REPORT.slices.length));
        const grid = document.createElement("div");
        grid.className = "analysis-slice-grid";
        REPORT.slices.forEach((slice, index) => {
            const anchor = document.createElement("span");
            anchor.className = "analysis-slice-anchor";
            anchor.dataset.sliceIndex = String(index);
            anchor.dataset.sliceLabel = slice.label;
            grid.append(anchor);
        });
        laneElement.append(grid);
        wireAnalysisLaneDrag(laneElement);
        return laneElement;
    }

    function renderAnalysisPanels() {
        const panels = analysisChainGroups().map((group) => {
            const metric = analysisMetricForChain(group.chain);
            const hasMetrics = Boolean(metric?.rmsd && metric?.rmsf);
            const panel = document.createElement("section");
            panel.className = `analysis-chain-panel${hasMetrics ? "" : " metrics-missing"}`;
            panel.dataset.chain = group.chain;
            panel.dataset.testid = "rmsx-analysis-chain-panel";
            panel.dataset.metrics = hasMetrics ? "present" : "missing";
            const heading = document.createElement("h3");
            heading.className = "analysis-chain-title";
            const chainLabel = document.createElement("span");
            chainLabel.textContent = `Chain ${group.chain}`;
            const residueCount = document.createElement("span");
            residueCount.className = "analysis-chain-count";
            residueCount.textContent = `${group.residues.length} residues`;
            heading.append(chainLabel, residueCount);
            panel.append(heading);
            if (hasMetrics) {
                const rmsd = document.createElement("canvas");
                rmsd.className = "analysis-chart analysis-rmsd";
                rmsd.dataset.testid = "rmsx-analysis-rmsd";
                rmsd.analysisMetric = metric;
                rmsd.addEventListener("pointermove", (event) => handleAnalysisRmsdEvent(rmsd, event));
                rmsd.addEventListener("pointerleave", () => showAnalysisTooltip({}, null));
                rmsd.addEventListener("click", (event) => handleAnalysisRmsdEvent(rmsd, event, true));
                panel.append(rmsd);
            }
            const heatmap = document.createElement("canvas");
            heatmap.className = "analysis-chart analysis-heatmap";
            heatmap.dataset.testid = "rmsx-analysis-heatmap";
            heatmap.tabIndex = 0;
            heatmap.heatmapGroup = group;
            heatmap.addEventListener("pointermove", (event) => {
                const hit = heatmapHitForEvent(heatmap, event);
                showAnalysisTooltip(
                    event,
                    hit
                        ? `Chain ${hit.residue.chain} · Residue ${hit.residue.id} · ${hit.slice.label} · RMSX ${formatNumber(hit.value)}`
                        : null,
                );
            });
            heatmap.addEventListener("pointerleave", () => showAnalysisTooltip({}, null));
            heatmap.addEventListener("click", (event) => selectHeatmapCell(heatmapHitForEvent(heatmap, event)));
            heatmap.addEventListener("keydown", (event) => handleHeatmapKeydown(heatmap, event));
            panel.append(heatmap);
            if (hasMetrics) {
                const rmsf = document.createElement("canvas");
                rmsf.className = "analysis-chart analysis-rmsf";
                rmsf.dataset.testid = "rmsx-analysis-rmsf";
                rmsf.analysisMetric = metric;
                rmsf.heatmapGroup = group;
                rmsf.addEventListener("pointermove", (event) => handleAnalysisRmsfEvent(rmsf, event));
                rmsf.addEventListener("pointerleave", () => showAnalysisTooltip({}, null));
                rmsf.addEventListener("click", (event) => handleAnalysisRmsfEvent(rmsf, event, true));
                panel.append(rmsf);
            }
            panel.append(createAnalysisLane({ kind: "chain", chain: group.chain }, "rmsx-analysis-chain-lane"));
            return panel;
        });
        elements.analysisChainGrid.replaceChildren(...panels);
        const multipleChains = panels.length > 1;
        elements.analysisAssemblyPanel.hidden = !multipleChains;
        if (multipleChains) {
            elements.analysisAssemblyLane.replaceWith(
                createAnalysisLane({ kind: "assembly" }, "rmsx-analysis-assembly-lane"),
            );
            elements.analysisAssemblyLane = elements.analysisAssemblyPanel.querySelector(
                '[data-testid="rmsx-analysis-assembly-lane"]',
            );
        }
        if (!analysisResizeObserver && typeof ResizeObserver !== "undefined") {
            analysisResizeObserver = new ResizeObserver(() => {
                requestAnalysisDraw();
                requestAnalysisLayout();
            });
            analysisResizeObserver.observe(elements.analysisContent);
        }
        if (!elements.analysisView.dataset.scrollWired) {
            elements.analysisView.dataset.scrollWired = "true";
            elements.analysisView.addEventListener("scroll", requestAnalysisLayout, { passive: true });
        }
        requestAnalysisDraw();
    }

    function requestAnalysisDraw() {
        if (analysisDrawFrame !== null) {
            return;
        }
        analysisDrawFrame = window.requestAnimationFrame(() => {
            analysisDrawFrame = null;
            elements.analysisChainGrid.querySelectorAll(".analysis-heatmap").forEach(drawHeatmapCanvas);
            elements.analysisChainGrid.querySelectorAll(".analysis-rmsd").forEach(drawAnalysisRmsdCanvas);
            elements.analysisChainGrid.querySelectorAll(".analysis-rmsf").forEach(drawAnalysisRmsfCanvas);
            updateHeatmapSelection();
            const selected = selectedHeatmapCell();
            if (selected.residue && selected.slice) {
                elements.analysisSelection.textContent = `Chain ${selected.residue.chain} · Residue ${selected.residue.id} · ${selected.slice.label}`;
            }
        });
    }

    function rotatedScreenExtents(stats, matrix) {
        const corners = [
            [stats.minX, stats.minY, stats.minZ],
            [stats.minX, stats.minY, stats.maxZ],
            [stats.minX, stats.maxY, stats.minZ],
            [stats.minX, stats.maxY, stats.maxZ],
            [stats.maxX, stats.minY, stats.minZ],
            [stats.maxX, stats.minY, stats.maxZ],
            [stats.maxX, stats.maxY, stats.minZ],
            [stats.maxX, stats.maxY, stats.maxZ],
        ].map(([x, y, z]) => transformPoint(matrix, stats.center, { x: 0, y: 0, z: 0 }, x, y, z));
        return {
            width: Math.max(
                1,
                Math.max(...corners.map((point) => point.x)) - Math.min(...corners.map((point) => point.x)),
            ),
            height: Math.max(
                1,
                Math.max(...corners.map((point) => point.y)) - Math.min(...corners.map((point) => point.y)),
            ),
        };
    }

    function molstarCanvasRect() {
        return (
            elements.viewport.querySelector("canvas")?.getBoundingClientRect() ||
            elements.viewport.getBoundingClientRect()
        );
    }

    function worldPointForClient(clientX, clientY) {
        const camera = viewer?.plugin?.canvas3d?.camera;
        if (!camera) {
            return null;
        }
        camera.update?.();
        const rect = molstarCanvasRect();
        if (!rect.width || !rect.height) {
            return null;
        }
        const viewport = camera.viewport;
        const screenX = viewport.x + ((clientX - rect.left) / rect.width) * viewport.width;
        const screenY = viewport.y + ((rect.bottom - clientY) / rect.height) * viewport.height;
        const projectedTarget = new Float32Array(4);
        camera.project(projectedTarget, camera.target);
        const world = new Float32Array(3);
        camera.unproject(world, new Float32Array([screenX, screenY, projectedTarget[2]]));
        return { x: world[0], y: world[1], z: world[2] };
    }

    function clientPointForWorld(world) {
        const camera = viewer?.plugin?.canvas3d?.camera;
        if (!camera) {
            return null;
        }
        const rect = molstarCanvasRect();
        const viewport = camera.viewport;
        const projected = new Float32Array(4);
        camera.project(projected, new Float32Array([world.x, world.y, world.z]));
        return {
            x: rect.left + ((projected[0] - viewport.x) / viewport.width) * rect.width,
            y: rect.bottom - ((projected[1] - viewport.y) / viewport.height) * rect.height,
        };
    }

    function distanceBetween(left, right) {
        return Math.sqrt((left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2);
    }

    function laneDescriptor(laneElement) {
        return laneElement.dataset.laneKind === "chain"
            ? { kind: "chain", chain: laneElement.dataset.chain }
            : { kind: "assembly" };
    }

    function prepareAnalysisCamera() {
        const camera = viewer?.plugin?.canvas3d?.camera;
        if (!camera || state.analysisCameraReady) {
            return;
        }
        analysisCameraSnapshot = camera.getSnapshot?.() || null;
        const stats = structureStats(REPORT.slices[0].pdb);
        const radius = Math.max(40, stats.width, stats.height, stats.depth) * 1.4;
        camera.setState({ mode: "orthographic" }, 0);
        camera.focus(new Float32Array([stats.center.x, stats.center.y, stats.center.z]), radius, 0);
        camera.update?.();
        state.analysisCameraReady = true;
        viewer?.plugin?.canvas3d?.requestDraw?.();
    }

    function restoreStructureCamera() {
        const camera = viewer?.plugin?.canvas3d?.camera;
        if (camera && analysisCameraSnapshot) {
            camera.setState(analysisCameraSnapshot, 0);
            camera.update?.();
        }
        analysisCameraSnapshot = null;
        state.analysisCameraReady = false;
        analysisLayoutTargets = new Map();
    }

    function renderAnalysisDebugOverlay() {
        const enabled = import.meta.env.DEV && new URL(window.location.href).searchParams.get("layoutDebug") === "1";
        elements.analysisDebugOverlay.hidden = !enabled;
        if (!enabled) {
            elements.analysisDebugOverlay.replaceChildren();
            return;
        }
        const items = [];
        elements.analysisChainGrid.querySelectorAll(".analysis-chain-panel").forEach((panel) => {
            const rect = panel.getBoundingClientRect();
            const box = document.createElement("span");
            box.className = "analysis-debug-box";
            Object.assign(box.style, {
                height: `${rect.height}px`,
                left: `${rect.left}px`,
                top: `${rect.top}px`,
                width: `${rect.width}px`,
            });
            items.push(box);
        });
        elements.analysisView.querySelectorAll(".analysis-structure-lane").forEach((lane) => {
            const laneRect = lane.getBoundingClientRect();
            const centerLine = document.createElement("span");
            centerLine.className = "analysis-debug-horizontal";
            Object.assign(centerLine.style, {
                left: `${laneRect.left}px`,
                top: `${laneRect.top + laneRect.height / 2}px`,
                width: `${laneRect.width}px`,
            });
            items.push(centerLine);
            lane.querySelectorAll(".analysis-slice-anchor").forEach((anchor) => {
                const rect = anchor.getBoundingClientRect();
                const line = document.createElement("span");
                line.className = "analysis-debug-line";
                Object.assign(line.style, {
                    height: `${laneRect.height}px`,
                    left: `${rect.left + rect.width / 2}px`,
                    top: `${laneRect.top}px`,
                });
                items.push(line);
            });
        });
        elements.analysisDebugOverlay.replaceChildren(...items);
    }

    function updateAnalysisLayout() {
        if (state.activeView !== "analysis" || !state.loaded || !viewer) {
            return;
        }
        prepareAnalysisCamera();
        const targets = new Map();
        const matrix = rotationMatrix();
        elements.analysisView.querySelectorAll(".analysis-structure-lane").forEach((laneElement) => {
            const lane = laneDescriptor(laneElement);
            const laneRect = laneElement.getBoundingClientRect();
            let maxAnchorError = 0;
            laneElement.querySelectorAll(".analysis-slice-anchor").forEach((anchor, index) => {
                const anchorRect = anchor.getBoundingClientRect();
                const clientX = anchorRect.left + anchorRect.width / 2;
                const clientY = laneRect.top + laneRect.height / 2;
                const target = worldPointForClient(clientX, clientY);
                const onePixelRight = worldPointForClient(clientX + 1, clientY);
                if (!target || !onePixelRight) {
                    return;
                }
                const worldPerCssPixel = distanceBetween(target, onePixelRight);
                const stats = structureStatsForLane(REPORT.slices[index], lane);
                const extents = rotatedScreenExtents(stats, matrix);
                const slotWidth = laneRect.width / Math.max(1, REPORT.slices.length);
                // Leave a visible inter-slice gutter even when a chain's widest
                // projection is aligned with the horizontal lane.
                const desiredWidth = slotWidth * 0.86 * worldPerCssPixel;
                const desiredHeight = laneRect.height * 0.82 * worldPerCssPixel;
                const radiusPadding = estimatedVisualRadius() * 2;
                const scale = Math.max(
                    0.001,
                    Math.min(
                        desiredWidth / Math.max(1, extents.width + radiusPadding),
                        desiredHeight / Math.max(1, extents.height + radiusPadding),
                    ),
                );
                targets.set(`${laneKey(lane)}:${index}`, {
                    anchor: { x: clientX, y: clientY },
                    lane,
                    scale,
                    target,
                });
                const projected = clientPointForWorld(target);
                if (projected) {
                    maxAnchorError = Math.max(maxAnchorError, Math.hypot(projected.x - clientX, projected.y - clientY));
                }
            });
            laneElement.dataset.clusterCount = String(REPORT.slices.length);
            laneElement.dataset.maxAnchorError = maxAnchorError.toFixed(3);
        });
        analysisLayoutTargets = targets;
        renderAnalysisDebugOverlay();
        applyLiveTransforms(false, true);
    }

    function requestAnalysisLayout() {
        if (analysisLayoutFrame !== null) {
            return;
        }
        analysisLayoutFrame = window.requestAnimationFrame(() => {
            analysisLayoutFrame = null;
            updateAnalysisLayout();
        });
    }

    function wireAnalysisLaneDrag(laneElement) {
        laneElement.addEventListener("pointerdown", (event) => {
            if (!state.localDrag || event.button !== 0) {
                return;
            }
            event.preventDefault();
            analysisDragState = {
                axes: currentScreenRotationAxes(),
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
            };
            laneElement.classList.add("dragging");
            laneElement.setPointerCapture?.(event.pointerId);
        });
        laneElement.addEventListener("pointermove", (event) => {
            if (!analysisDragState || analysisDragState.pointerId !== event.pointerId) {
                return;
            }
            event.preventDefault();
            const dx = event.clientX - analysisDragState.x;
            const dy = event.clientY - analysisDragState.y;
            if (!dx && !dy) {
                return;
            }
            applyScreenRotationDrag(dx, dy, analysisDragState.axes);
            analysisDragState.x = event.clientX;
            analysisDragState.y = event.clientY;
            syncRotationControls();
            queueInteractiveGeometryUpdate(false);
            requestAnalysisDraw();
        });
        const finish = (event) => {
            if (!analysisDragState || analysisDragState.pointerId !== event.pointerId) {
                return;
            }
            analysisDragState = null;
            laneElement.classList.remove("dragging");
            laneElement.releasePointerCapture?.(event.pointerId);
            queueGeometryUpdate(false, 20);
        };
        laneElement.addEventListener("pointerup", finish);
        laneElement.addEventListener("pointercancel", finish);
    }

    async function activateAnalysis() {
        if (!state.loaded || state.activeView !== "analysis") {
            return;
        }
        await ensureAnalysisRecords();
        if (state.activeView !== "analysis") {
            return;
        }
        prepareAnalysisCamera();
        requestMolstarDraw();
        window.requestAnimationFrame(() => {
            requestAnalysisDraw();
            requestAnalysisLayout();
        });
    }

    function setActiveView(view) {
        const next = VIEW_MODES.has(view) ? view : "structures";
        const leavingAnalysis = state.activeView === "analysis" && next !== "analysis";
        if (leavingAnalysis) {
            restoreStructureCamera();
        }
        state.activeView = next;
        const structuresSelected = next === "structures";
        const heatmapSelected = next === "heatmap";
        const analysisSelected = next === "analysis";
        const structuresVisible = structuresSelected || analysisSelected;
        const heatmapVisible = heatmapSelected;
        elements.structuresTab.classList.toggle("active", structuresSelected);
        elements.structuresTab.setAttribute("aria-selected", structuresSelected ? "true" : "false");
        elements.heatmapTab.classList.toggle("active", heatmapSelected);
        elements.heatmapTab.setAttribute("aria-selected", heatmapSelected ? "true" : "false");
        elements.analysisTab.classList.toggle("active", analysisSelected);
        elements.analysisTab.setAttribute("aria-selected", analysisSelected ? "true" : "false");
        elements.viewerRegion.classList.toggle("analysis-view-active", analysisSelected);
        elements.viewport.hidden = !structuresVisible;
        elements.heatmapView.hidden = !heatmapVisible;
        elements.analysisView.hidden = !analysisSelected;
        elements.heatmapTooltip.hidden = true;
        elements.analysisTooltip.hidden = true;
        elements.spacingRange.disabled = analysisSelected;
        elements.spacingNumber.disabled = analysisSelected;
        elements.columnsNumber.disabled = analysisSelected;
        if (state.loaded) {
            applyLiveTransforms(false, true);
        }
        if (structuresVisible) {
            requestMolstarDraw();
        }
        if (heatmapVisible) {
            requestHeatmapDraw();
        }
        if (analysisSelected) {
            requestAnalysisDraw();
            activateAnalysis().catch((error) => {
                console.error(error);
                setStatus(`Could not open the Analysis view: ${error.message}`, true);
            });
        }
    }

    function visibleSliceIndexes() {
        return REPORT.slices.map((_, index) => index).filter((index) => state.visible.has(index));
    }

    function firstVisibleSliceIndex() {
        return visibleSliceIndexes()[0] ?? 0;
    }

    function populateControls() {
        const defaultRotation = REPORT.rotationModel?.defaultRotation || {
            x: 90,
            y: 0,
            z: 0,
        };
        state.layout = defaultLayoutName();
        state.paletteName = defaultPaletteName();
        state.colorMin = defaultColorMin();
        state.colorMax = defaultColorMax();
        state.radiusMin = defaultRadiusMin();
        state.radiusMax = defaultRadiusMax();
        state.thickness = defaultThickness();
        state.spacing = defaultSpacing();
        state.renderMode = defaultRenderMode();
        state.outline = defaultOutline();
        state.rotation = {
            x: Number(defaultRotation.x ?? 90),
            y: Number(defaultRotation.y ?? 0),
            z: Number(defaultRotation.z ?? 0),
        };
        syncRotationMatrixFromEuler();
        state.rotationSensitivity = 0.35;
        state.columns = defaultTileColumns();
        state.visible = new Set(REPORT.slices.map((_, index) => index));
        state.currentIndex = 0;
        if (!state.visible.has(state.currentIndex)) {
            state.currentIndex = firstVisibleSliceIndex();
        }
        state.marker = false;
        state.localDrag = true;
        state.selectedResidueKey = defaultResidueKey();

        elements.columnsNumber.max = String(Math.max(1, REPORT.slices.length));
        elements.columnsNumber.value = String(state.columns);
        elements.spacingRange.min = String(minSpacing());
        elements.spacingNumber.min = String(minSpacing());
        elements.spacingRange.max = String(maxSpacing());
        elements.spacingNumber.max = String(maxSpacing());
        elements.spacingRange.step = String(spacingStep());
        elements.spacingNumber.step = String(spacingStep());
        elements.colorMinNumber.min = String(REPORT.domain.min);
        elements.colorMinNumber.max = String(REPORT.domain.max);
        elements.colorMaxNumber.min = String(REPORT.domain.min);
        elements.colorMaxNumber.max = String(REPORT.domain.max);
        elements.colorMinNumber.step = String(REPORT.visualMapping?.colorDomainStep ?? 0.1);
        elements.colorMaxNumber.step = String(REPORT.visualMapping?.colorDomainStep ?? 0.1);
        elements.radiusMinNumber.step = String(REPORT.visualMapping?.radiusStep ?? 0.05);
        elements.radiusMaxNumber.step = String(REPORT.visualMapping?.radiusStep ?? 0.05);
        elements.paletteSelect.replaceChildren(
            ...paletteNames().map((name) => new Option(name.replace(/[-_]+/g, " "), name)),
        );
        elements.paletteSelect.value = state.paletteName;
        elements.outlineCheckbox.checked = state.outline;
        setActiveControlPanel(state.activePanel);
        updateMetrics();
        renderChips();
        renderHeatmapPanels();
        renderAnalysisPanels();
        setActiveView("structures");
    }

    function setActiveControlPanel(panel) {
        const next = CONTROL_PANEL_KEYS.includes(panel) ? panel : "view";
        state.activePanel = next;
        elements.controlPanels.forEach((panelElement) => {
            const active = panelElement.dataset.panel === next;
            panelElement.classList.toggle("active", active);
            if (active) {
                panelElement.open = true;
            }
        });
    }

    function renderChips() {
        elements.sliceChips.replaceChildren(
            ...REPORT.slices.map((slice, index) => {
                const button = document.createElement("button");
                button.type = "button";
                button.className = `chip${isSliceVisible(index) ? " active" : ""}${state.currentIndex === index ? " current" : ""}`;
                button.dataset.testid = "molstar-slice-chip";
                button.dataset.sliceIndex = String(index + 1);
                button.setAttribute("aria-current", state.currentIndex === index ? "true" : "false");
                button.setAttribute("aria-pressed", state.visible.has(index) ? "true" : "false");
                button.setAttribute(
                    "aria-label",
                    state.visible.has(index) ? `Hide item ${index + 1}` : `Show item ${index + 1}`,
                );
                button.title = state.visible.has(index) ? `Hide item ${index + 1}` : `Show item ${index + 1}`;
                button.textContent = String(slice.index ?? index + 1);
                button.addEventListener("click", () => {
                    if (state.visible.has(index) && state.visible.size > 1) {
                        state.visible.delete(index);
                    } else {
                        state.visible.add(index);
                    }
                    state.currentIndex = index;
                    renderChips();
                    requestHeatmapDraw();
                    renderScene(true);
                });
                return button;
            }),
        );
    }

    function reloadScene(autoView = false) {
        sceneReloadRequested = true;
        sceneReloadAutoView = sceneReloadAutoView || autoView;
        if (sceneReloadPromise) {
            return sceneReloadPromise;
        }
        elements.viewport.dataset.sceneReloading = "true";
        sceneReloadPromise = (async () => {
            while (sceneReloadRequested) {
                const nextAutoView = sceneReloadAutoView;
                sceneReloadRequested = false;
                sceneReloadAutoView = false;
                state.loaded = false;
                state.liveTransforms = false;
                await renderScene(nextAutoView);
            }
        })().finally(() => {
            sceneReloadPromise = null;
            elements.viewport.dataset.sceneReloading = "false";
        });
        return sceneReloadPromise;
    }

    function queueSceneReload(autoView = false, delay = 120) {
        window.clearTimeout(queuedSceneUpdate);
        queuedSceneUpdate = window.setTimeout(() => reloadScene(autoView), delay);
    }

    function queueGeometryUpdate(autoView = false, delay = 60) {
        window.clearTimeout(queuedSceneUpdate);
        queuedSceneUpdate = window.setTimeout(() => {
            if (state.loaded && state.liveTransforms) {
                applyLiveTransforms(autoView, true);
            } else {
                reloadScene(autoView);
            }
        }, delay);
    }

    function queueTileLayoutUpdate() {
        if (state.forceCoordinateFallback) {
            queueSceneReload(true, 100);
            return;
        }
        queueGeometryUpdate(true);
    }

    function queueInteractiveGeometryUpdate(autoView = false) {
        if (interactiveFrame !== null) {
            return;
        }
        const scheduleFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
        interactiveFrame = scheduleFrame(() => {
            interactiveFrame = null;
            if (state.loaded && state.liveTransforms) {
                applyLiveTransforms(autoView, true);
            } else {
                queueSceneReload(autoView, 60);
            }
        });
    }

    function syncRotationControls() {
        for (const axis of ["x", "y", "z"]) {
            elements[`rotation${axis.toUpperCase()}Range`].value = String(Math.round(state.rotation[axis]));
            elements[`rotation${axis.toUpperCase()}Number`].value = String(Math.round(state.rotation[axis]));
        }
    }

    function addRotation(axis, degrees) {
        state.rotation[axis] = (((Number(state.rotation[axis]) || 0) + degrees + 540) % 360) - 180;
        syncRotationMatrixFromEuler();
        syncRotationControls();
        queueGeometryUpdate(false);
    }

    function updateThickness(value) {
        const next = clamp(Number(value), 0.25, 2.5);
        if (!Number.isFinite(next)) {
            return;
        }
        state.thickness = next;
        elements.thicknessRange.value = next.toFixed(3);
        elements.thicknessNumber.value = next.toFixed(3);
        updateMetrics();
        queueSceneReload(false);
    }

    function updateSpacing(value) {
        if (state.activeView === "analysis") {
            return;
        }
        const next = clamp(Number(value), minSpacing(), maxSpacing());
        if (!Number.isFinite(next)) {
            return;
        }
        state.spacing = next;
        elements.spacingRange.value = next.toFixed(3);
        elements.spacingNumber.value = next.toFixed(3);
        updateMetrics();
        if (state.layout === "tiled") {
            queueTileLayoutUpdate();
        }
    }

    function updateTileColumns(value) {
        if (state.activeView === "analysis") {
            return;
        }
        const next = clamp(Math.round(Number(value)), 1, REPORT.slices.length);
        if (!Number.isFinite(next)) {
            return;
        }
        state.columns = next;
        elements.columnsNumber.value = String(next);
        updateMetrics();
        if (state.layout === "tiled") {
            queueTileLayoutUpdate();
        }
    }

    function updatePalette(value) {
        const requested = String(value || "").toLowerCase();
        if (!availablePalettes()[requested]) {
            return;
        }
        state.paletteName = requested;
        elements.paletteSelect.value = requested;
        updateMetrics();
        queueSceneReload(false);
    }

    function setOutline(enabled) {
        state.outline = Boolean(enabled);
        elements.outlineCheckbox.checked = state.outline;
        applyMolstarRenderStyle();
        updateMetrics();
    }

    function updateColorDomain(bound, value) {
        const next = clamp(Number(value), REPORT.domain.min, REPORT.domain.max);
        if (!Number.isFinite(next)) {
            return;
        }
        if (bound === "min") {
            state.colorMin = Math.min(next, colorDomainMax() - 0.000001);
        } else {
            state.colorMax = Math.max(next, colorDomainMin() + 0.000001);
        }
        elements.colorMinNumber.value = colorDomainMin().toFixed(3);
        elements.colorMaxNumber.value = colorDomainMax().toFixed(3);
        updateMetrics();
        queueSceneReload(false);
    }

    function updateRadiusRange(bound, value) {
        const next = clamp(Number(value), 0.05, 8);
        if (!Number.isFinite(next)) {
            return;
        }
        if (bound === "min") {
            state.radiusMin = Math.min(next, state.radiusMax - 0.01);
        } else {
            state.radiusMax = Math.max(next, state.radiusMin + 0.01);
        }
        elements.radiusMinNumber.value = state.radiusMin.toFixed(3);
        elements.radiusMaxNumber.value = state.radiusMax.toFixed(3);
        updateMetrics();
        queueSceneReload(false);
    }

    function resetScale() {
        state.colorMin = defaultColorMin();
        state.colorMax = defaultColorMax();
        state.radiusMin = defaultRadiusMin();
        state.radiusMax = defaultRadiusMax();
        state.thickness = defaultThickness();
        updateMetrics();
        queueSceneReload(false);
    }

    function updateRotateSensitivity(value) {
        const next = clamp(Number(value), 0.1, 3);
        if (!Number.isFinite(next)) {
            return;
        }
        state.rotationSensitivity = next;
        elements.rotateSensitivityRange.value = next.toFixed(3);
        elements.rotateSensitivityNumber.value = next.toFixed(3);
        updateMetrics();
    }

    function wireEvents() {
        elements.controlPanels.forEach((panelElement) => {
            panelElement.addEventListener("toggle", () => {
                if (panelElement.open) {
                    setActiveControlPanel(panelElement.dataset.panel);
                }
            });
        });
        elements.resetViewButton.addEventListener("click", resetView);
        elements.structuresTab.addEventListener("click", () => setActiveView("structures"));
        elements.heatmapTab.addEventListener("click", () => setActiveView("heatmap"));
        elements.analysisTab.addEventListener("click", () => setActiveView("analysis"));
        elements.paletteSelect.addEventListener("change", (event) => updatePalette(event.target.value));
        elements.outlineCheckbox.addEventListener("change", (event) => setOutline(event.target.checked));
        elements.thicknessRange.addEventListener("input", (event) => updateThickness(event.target.value));
        elements.thicknessRange.addEventListener("change", (event) => updateThickness(event.target.value));
        elements.thicknessNumber.addEventListener("input", (event) => updateThickness(event.target.value));
        elements.thicknessNumber.addEventListener("change", (event) => updateThickness(event.target.value));
        elements.spacingRange.addEventListener("input", (event) => updateSpacing(event.target.value));
        elements.spacingRange.addEventListener("change", (event) => updateSpacing(event.target.value));
        elements.spacingNumber.addEventListener("input", (event) => updateSpacing(event.target.value));
        elements.spacingNumber.addEventListener("change", (event) => updateSpacing(event.target.value));
        elements.columnsNumber.addEventListener("input", (event) => updateTileColumns(event.target.value));
        elements.columnsNumber.addEventListener("change", (event) => updateTileColumns(event.target.value));
        for (const axis of ["x", "y", "z"]) {
            const range = elements[`rotation${axis.toUpperCase()}Range`];
            const number = elements[`rotation${axis.toUpperCase()}Number`];
            const handler = (event) => {
                state.rotation[axis] = Number(event.target.value);
                syncRotationMatrixFromEuler();
                syncRotationControls();
                queueGeometryUpdate(false);
            };
            range.addEventListener("input", handler);
            range.addEventListener("change", handler);
            number.addEventListener("input", handler);
            number.addEventListener("change", handler);
        }
        elements.rotateXButton.addEventListener("click", () => addRotation("x", 15));
        elements.rotateYButton.addEventListener("click", () => addRotation("y", 15));
        elements.rotateZButton.addEventListener("click", () => addRotation("z", 15));
        elements.rotateSensitivityRange.addEventListener("input", (event) =>
            updateRotateSensitivity(event.target.value),
        );
        elements.rotateSensitivityRange.addEventListener("change", (event) =>
            updateRotateSensitivity(event.target.value),
        );
        elements.rotateSensitivityNumber.addEventListener("input", (event) =>
            updateRotateSensitivity(event.target.value),
        );
        elements.rotateSensitivityNumber.addEventListener("change", (event) =>
            updateRotateSensitivity(event.target.value),
        );
        elements.resetRotationButton.addEventListener("click", () => {
            state.rotation = {
                ...(REPORT.rotationModel?.defaultRotation || { x: 90, y: 0, z: 0 }),
            };
            syncRotationMatrixFromEuler();
            syncRotationControls();
            queueGeometryUpdate(false);
        });
        elements.colorMinNumber.addEventListener("input", (event) => updateColorDomain("min", event.target.value));
        elements.colorMinNumber.addEventListener("change", (event) => updateColorDomain("min", event.target.value));
        elements.colorMaxNumber.addEventListener("input", (event) => updateColorDomain("max", event.target.value));
        elements.colorMaxNumber.addEventListener("change", (event) => updateColorDomain("max", event.target.value));
        elements.radiusMinNumber.addEventListener("input", (event) => updateRadiusRange("min", event.target.value));
        elements.radiusMinNumber.addEventListener("change", (event) => updateRadiusRange("min", event.target.value));
        elements.radiusMaxNumber.addEventListener("input", (event) => updateRadiusRange("max", event.target.value));
        elements.radiusMaxNumber.addEventListener("change", (event) => updateRadiusRange("max", event.target.value));
        elements.resetScaleButton.addEventListener("click", resetScale);
        elements.viewport.addEventListener(
            "pointerdown",
            (event) => {
                if (!state.localDrag || event.button !== 0) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                dragState = {
                    pointerId: event.pointerId,
                    x: event.clientX,
                    y: event.clientY,
                    axes: currentScreenRotationAxes(),
                };
                elements.viewport.classList.add("dragging");
                elements.viewport.setPointerCapture?.(event.pointerId);
            },
            true,
        );
        elements.viewport.addEventListener(
            "pointermove",
            (event) => {
                if (!dragState || dragState.pointerId !== event.pointerId) {
                    return;
                }
                event.preventDefault();
                event.stopPropagation();
                const coalesced = typeof event.getCoalescedEvents === "function" ? event.getCoalescedEvents() : [];
                const samples = coalesced.length ? coalesced : [event];
                const latest = samples[samples.length - 1] || event;
                const dx = latest.clientX - dragState.x;
                const dy = latest.clientY - dragState.y;
                const axes = dragState.axes || currentScreenRotationAxes();
                dragState = {
                    pointerId: event.pointerId,
                    x: latest.clientX,
                    y: latest.clientY,
                    axes,
                };
                if (dx === 0 && dy === 0) {
                    return;
                }
                applyScreenRotationDrag(dx, dy, axes);
                syncRotationControls();
                queueInteractiveGeometryUpdate(false);
            },
            true,
        );
        const endDrag = (event) => {
            if (!dragState || dragState.pointerId !== event.pointerId) {
                return;
            }
            dragState = null;
            elements.viewport.classList.remove("dragging");
            elements.viewport.releasePointerCapture?.(event.pointerId);
            queueGeometryUpdate(false, 20);
        };
        elements.viewport.addEventListener("pointerup", endDrag, true);
        elements.viewport.addEventListener("pointercancel", endDrag, true);
        document.addEventListener("keydown", (event) => {
            if (event.target && ["INPUT", "SELECT", "TEXTAREA"].includes(event.target.tagName)) {
                return;
            }
            const colorStep = Number(REPORT.visualMapping?.colorDomainStep ?? 0.5);
            const actions = {
                u: ["rotate-x-positive", () => addRotation("x", 5)],
                i: ["rotate-x-negative", () => addRotation("x", -5)],
                n: ["rotate-y-positive", () => addRotation("y", 5)],
                m: ["rotate-y-negative", () => addRotation("y", -5)],
                j: ["rotate-z-positive", () => addRotation("z", 5)],
                k: ["rotate-z-negative", () => addRotation("z", -5)],
                "[": ["thickness-increase", () => updateThickness(state.thickness + 0.05)],
                "]": ["thickness-decrease", () => updateThickness(state.thickness - 0.05)],
                "-": ["spacing-decrease", () => updateSpacing(state.spacing - spacingStep())],
                "=": ["spacing-increase", () => updateSpacing(state.spacing + spacingStep())],
                "+": ["spacing-increase", () => updateSpacing(state.spacing + spacingStep())],
                ",": ["color-domain-low-increase", () => updateColorDomain("min", state.colorMin + colorStep)],
                ".": ["color-domain-high-decrease", () => updateColorDomain("max", state.colorMax - colorStep)],
            };
            const normalizedKey = event.key.length === 1 ? event.key.toLowerCase() : event.key;
            const action = actions[normalizedKey];
            if (action) {
                event.preventDefault();
                event.stopPropagation();
                action[1]();
            }
        });
    }

    async function init() {
        try {
            REPORT = await fetchManifest();
            validateManifest(REPORT);
            state.forceCoordinateFallback = analysisChainGroups().length > 1;
            document.title = REPORT.title || "RMSX Flipbook";
            populateControls();
            wireEvents();
            syncRotationControls();
            await renderScene();
        } catch (error) {
            setStatus(error.message, true);
            console.error(error);
        }
    }

    init();
})();
