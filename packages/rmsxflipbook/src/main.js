import { Viewer } from "molstar/lib/apps/viewer/app";
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
    const CONTROL_PANEL_KEYS = ["view", "style", "rotation", "metrics"];
    const RENDER_PRESETS = new Set(["clean-interactive", "soft"]);

    let REPORT = null;
    let viewer = null;
    let dragState = null;
    let renderToken = 0;
    let queuedSceneUpdate = null;
    let interactiveFrame = null;
    let resizeObserver = null;
    let resizeResetTimer = null;

    const state = {
        layout: "tiled",
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
        </div>
        <div id="status" class="status sidebar-status">Loading RMSX manifest...</div>
        <p class="citation-note">Please cite: RMSX/Flipbook paper, Scientific Reports (2026), doi:<a href="https://doi.org/10.1038/s41598-026-39869-7" target="_blank" rel="noopener noreferrer">10.1038/s41598-026-39869-7</a>.</p>
        <div class="control-panels" data-testid="molstar-control-panels">
          <details class="control-panel active" open data-panel="view" data-testid="molstar-panel-layout">
            <summary>View</summary>
            <div class="panel-grid">
              <label>Spacing <input id="spacingRange" type="range" min="0" max="2.5" value="1" step="0.05" data-testid="molstar-spacing-range"><input id="spacingNumber" type="number" min="0" max="2.5" value="1" step="0.05" data-testid="molstar-spacing-number"></label>
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
      <section class="rmsx-viewer" data-testid="molstar-report">
        <div id="molstarViewport" class="viewport" data-testid="molstar-viewport"></div>
      </section>
    </main>
  `;

    const elements = {
        status: document.getElementById("status"),
        resetViewButton: document.getElementById("resetViewButton"),
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
        return Number(REPORT.flipbookReference?.minimumSpacingFactor ?? 0.1);
    }

    function maxSpacing() {
        return Number(REPORT.flipbookReference?.maximumSpacingFactor ?? 2.5);
    }

    function defaultSpacing() {
        return Number(REPORT.flipbookReference?.defaultSpacingFactor ?? 1);
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

    function transformedPdb(slice, index, mode, applySceneTransform = true) {
        const stats = structureStats(slice.pdb);
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
        const lines = slice.pdb
            .split(/\r?\n/)
            .map((line) => {
                if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) {
                    return line;
                }
                const padded = line.padEnd(80, " ");
                const x = Number(padded.slice(30, 38));
                const y = Number(padded.slice(38, 46));
                const z = Number(padded.slice(46, 54));
                const chainId = padded.slice(21, 22).trim();
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

    function sceneTransformForSlice(slice, index) {
        const stats = structureStats(slice.pdb);
        const anchor = structureStats(REPORT.slices[0].pdb).center;
        const offset = tileOffset(index);
        const target = {
            x: anchor.x + offset.x,
            y: anchor.y + offset.y,
            z: anchor.z + offset.z,
        };
        const matrix = rotationMatrix();
        return { matrix, center: stats.center, target };
    }

    function molstarTransformForSlice(slice, index) {
        const transform = sceneTransformForSlice(slice, index);
        const r = transform.matrix;
        const c = transform.center;
        const t = transform.target;
        const tx = t.x - (r[0][0] * c.x + r[0][1] * c.y + r[0][2] * c.z);
        const ty = t.y - (r[1][0] * c.x + r[1][1] * c.y + r[1][2] * c.z);
        const tz = t.z - (r[2][0] * c.x + r[2][1] * c.y + r[2][2] * c.z);
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

    function selectedResiduePdb(slice, index, applySceneTransform = true) {
        if (!state.marker || !state.selectedResidueKey) {
            return { pdb: "", atomCount: 0 };
        }
        const selected =
            REPORT.residues.find((residue) => residue.key === state.selectedResidueKey) || REPORT.residues[0];
        const stats = structureStats(slice.pdb);
        const anchor = structureStats(REPORT.slices[0].pdb).center;
        const offset = tileOffset(index);
        const target = {
            x: anchor.x + offset.x,
            y: anchor.y + offset.y,
            z: anchor.z + offset.z,
        };
        const matrix = rotationMatrix();
        let atomCount = 0;
        const lines = slice.pdb
            .split(/\r?\n/)
            .map((line) => {
                if (!line.startsWith("ATOM") && !line.startsWith("HETATM")) {
                    return null;
                }
                const padded = line.padEnd(80, " ");
                const chainId = padded.slice(21, 22).trim();
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
            return;
        }
        const resetAfterLayout = () => {
            requestMolstarDraw();
            resetView();
        };
        const scheduleFrame = window.requestAnimationFrame || ((callback) => window.setTimeout(callback, 16));
        scheduleFrame(() => {
            scheduleFrame(() => {
                resetAfterLayout();
                window.setTimeout(resetAfterLayout, 180);
                window.setTimeout(resetAfterLayout, 700);
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
                resetView();
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
        if (viewer?.dispose) {
            viewer.dispose();
        } else if (viewer?.plugin?.dispose) {
            viewer.plugin.dispose();
        }
        viewer = null;
        state.records = [];
        state.loaded = false;
        state.liveTransforms = false;
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

    function applyRecordTransform(record) {
        const repr = recordRepresentation(record);
        if (!repr?.setState) {
            return null;
        }
        const visible = isSliceVisible(record.index) && (record.kind !== "marker" || state.marker);
        repr.setState({
            transform: molstarTransformForSlice(record.slice, record.index),
            visible,
            pickable: visible,
        });
        return repr;
    }

    function applyLiveTransforms(autoView = false, fast = false) {
        const updated = [];
        for (const record of state.records) {
            const repr = applyRecordTransform(record);
            if (repr) {
                updated.push(repr);
            }
        }
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
                    kind: "masked",
                    representation: maskedRep,
                });
            } else {
                const all = transformedPdb(entry.slice, entry.index, "all", false);
                const representation = await addStructure(plugin, all.pdb, entry.slice.label, 1, false);
                state.records.push({ ...entry, kind: "all", representation });
            }
            const marker = selectedResiduePdb(entry.slice, entry.index, false);
            const markerRep = await addStructure(
                plugin,
                marker.pdb,
                `${entry.slice.label} selected residue`,
                0.86,
                true,
            );
            if (markerRep) {
                state.records.push({
                    ...entry,
                    kind: "marker",
                    representation: markerRep,
                });
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
        const centerIndex = (REPORT.slices.length - 1) / 2;
        const entries = activeEntries().sort(
            (left, right) => Math.abs(left.index - centerIndex) - Math.abs(right.index - centerIndex),
        );
        for (const entry of entries) {
            if (hasMask) {
                const unmasked = transformedPdb(entry.slice, entry.index, "unmasked", true);
                await addStructure(plugin, unmasked.pdb, `${entry.slice.label} unmasked`, 1, false);
                const masked = transformedPdb(entry.slice, entry.index, "masked", true);
                await addStructure(plugin, masked.pdb, `${entry.slice.label} masked`, REPORT.maskOpacity || 0.3, false);
            } else {
                const all = transformedPdb(entry.slice, entry.index, "all", true);
                await addStructure(plugin, all.pdb, entry.slice.label, 1, false);
            }
            const marker = selectedResiduePdb(entry.slice, entry.index, true);
            await addStructure(plugin, marker.pdb, `${entry.slice.label} selected residue`, 0.86, true);
        }
        if (autoView !== false) {
            resetView();
            schedulePostLayoutReset();
        }
        setLoadedSceneStatus();
        updateMetrics();
    }

    async function renderScene(autoView) {
        if (!REPORT) {
            return;
        }
        if (!state.forceCoordinateFallback && state.loaded && state.liveTransforms) {
            applyLiveTransforms(autoView !== false);
            return;
        }
        if (!state.forceCoordinateFallback) {
            await loadLiveScene(autoView !== false);
            return;
        }
        await renderCoordinateScene(autoView !== false);
    }

    function resetView() {
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
        setStatus(
            `${visibleCount}/${REPORT.slices.length} slices visible; ${state.paletteName}; ${state.representationMode}${maskText}.`,
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
                button.className = `chip${isSliceVisible(index) ? " active" : ""}`;
                button.dataset.testid = "molstar-slice-chip";
                button.dataset.sliceIndex = String(index + 1);
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
                    renderScene(true);
                });
                return button;
            }),
        );
    }

    function reloadScene(autoView = false) {
        state.loaded = false;
        state.liveTransforms = false;
        renderScene(autoView);
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
        const next = clamp(Number(value), minSpacing(), maxSpacing());
        if (!Number.isFinite(next)) {
            return;
        }
        state.spacing = next;
        elements.spacingRange.value = next.toFixed(3);
        elements.spacingNumber.value = next.toFixed(3);
        updateMetrics();
        if (state.layout === "tiled") {
            queueGeometryUpdate(true);
        }
    }

    function updateTileColumns(value) {
        const next = clamp(Math.round(Number(value)), 1, REPORT.slices.length);
        if (!Number.isFinite(next)) {
            return;
        }
        state.columns = next;
        elements.columnsNumber.value = String(next);
        updateMetrics();
        if (state.layout === "tiled") {
            queueGeometryUpdate(true);
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
        elements.viewport.addEventListener("pointerdown", (event) => {
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
        });
        elements.viewport.addEventListener("pointermove", (event) => {
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
        });
        const endDrag = (event) => {
            if (dragState && dragState.pointerId !== event.pointerId) {
                return;
            }
            dragState = null;
            elements.viewport.classList.remove("dragging");
            elements.viewport.releasePointerCapture?.(event.pointerId);
            queueGeometryUpdate(false, 20);
        };
        elements.viewport.addEventListener("pointerup", endDrag);
        elements.viewport.addEventListener("pointercancel", endDrag);
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
                "-": ["spacing-decrease", () => updateSpacing(state.spacing - 0.05)],
                "=": ["spacing-increase", () => updateSpacing(state.spacing + 0.05)],
                "+": ["spacing-increase", () => updateSpacing(state.spacing + 0.05)],
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
            state.forceCoordinateFallback =
                new Set(REPORT.residues.map((residue) => residue.chain).filter(Boolean)).size > 1;
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
