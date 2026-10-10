/**
 * SmilesDrawer — Galaxy Visualization Plugin
 *
 * Renders 2D molecular structures from SMILES notation using the
 * reymond-group/smilesDrawer library (https://github.com/reymond-group/smilesDrawer).
 *
 * Entry point injected by Galaxy as a <script> tag into the visualization frame.
 * Galaxy provides data via: document.getElementById("app").dataset.incoming
 */

/* ── Constants ─────────────────────────────────────────────── */
const SMILES_DRAWER_CDN = "https://unpkg.com/smiles-drawer@2/dist/smiles-drawer.min.js";
const CANVAS_SIZE       = 200;   // px — width & height of each molecule canvas
const PAGE_SIZE         = 48;    // molecules per page
const MAX_LABEL_LEN     = 40;    // truncate long molecule names in the card label

/* ── Bootstrap: read Galaxy-injected data ───────────────────── */
const appEl    = document.getElementById("app");
const incoming = JSON.parse(appEl?.dataset.incoming || "{}");
const root     = incoming.root     || "/";
const config   = incoming.visualization_config || {};
const datasetId = config.dataset_id;

/* ── State ──────────────────────────────────────────────────── */
let allMolecules = [];   // [{smiles, name}]
let filtered     = [];   // subset after search filter
let currentPage  = 1;
let currentTheme = "light";
let availableThemes = {};
let drawerOptions = { width: CANVAS_SIZE, height: CANVAS_SIZE };

/* ── Build UI skeleton ──────────────────────────────────────── */
document.body.innerHTML = `
  <div id="sd-error"></div>
  <div id="sd-toolbar">
    <label for="sd-search">Search</label>
    <input id="sd-search" type="search" placeholder="Filter by name or SMILES…" />
    <label for="sd-theme-select">Theme</label>
    <select id="sd-theme-select">
      <option value="light">Light</option>
    </select>
    <label for="sd-col-select">Columns</label>
    <select id="sd-col-select">
      <option value="">Auto</option>
      <option value="1">1</option>
      <option value="2">2</option>
      <option value="3">3</option>
      <option value="4">4</option>
      <option value="6">6</option>
    </select>
    <span id="sd-count"></span>
  </div>
  <div id="sd-status">Loading dataset…</div>
  <div id="sd-grid" style="display:none"></div>
  <div id="sd-pagination"></div>
`;

const errorEl    = document.getElementById("sd-error");
const statusEl   = document.getElementById("sd-status");
const gridEl     = document.getElementById("sd-grid");
const paginEl    = document.getElementById("sd-pagination");
const searchEl   = document.getElementById("sd-search");
const themeEl    = document.getElementById("sd-theme-select");
const colEl      = document.getElementById("sd-col-select");
const countEl    = document.getElementById("sd-count");

/* ── Helpers ────────────────────────────────────────────────── */
function showError(msg) {
    errorEl.textContent = "⚠ " + msg;
    errorEl.style.display = "block";
}

function setStatus(msg) {
    statusEl.textContent = msg;
    statusEl.style.display = msg ? "block" : "none";
}

function truncate(str, n) {
    return str.length > n ? str.slice(0, n - 1) + "…" : str;
}

function formatThemeName(name) {
    return name
        .split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
}

function isDarkTheme(themeName) {
    const bg = availableThemes[themeName]?.BACKGROUND;
    if (bg && typeof bg === "string" && bg.startsWith("#")) {
        const hex = bg.replace("#", "");
        if (hex.length === 6) {
            const r = parseInt(hex.slice(0, 2), 16);
            const g = parseInt(hex.slice(2, 4), 16);
            const b = parseInt(hex.slice(4, 6), 16);
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            return luminance < 128;
        }
    }
    return themeName.toLowerCase().includes("dark");
}

function populateThemes() {
    try {
        const probe = new SmilesDrawer.Drawer(drawerOptions);
        availableThemes = probe.opts?.themes || {};
        const themeNames = Object.keys(availableThemes).filter(t => t !== "custom");

        if (themeNames.length > 0) {
            themeEl.innerHTML = "";
            themeNames.forEach(theme => {
                const opt = document.createElement("option");
                opt.value = theme;
                opt.textContent = formatThemeName(theme);
                if (theme === currentTheme) {
                    opt.selected = true;
                }
                themeEl.appendChild(opt);
            });

            if (!themeNames.includes(currentTheme)) {
                currentTheme = themeNames.includes("light") ? "light" : themeNames[0];
                themeEl.value = currentTheme;
            }
        }
    } catch (err) {
        console.warn("Could not load dynamic themes from SmilesDrawer:", err);
    }
}

/* ── Parse text content → [{smiles, name}] ──────────────────── */
function parseContent(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim() && !l.startsWith("#"));
    const molecules = [];

    for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (!parts[0]) continue;

        // Try to detect which column is SMILES (heuristic: contains ring/chain chars)
        // In .smi files the convention is: SMILES [name]
        // In tabular files we scan columns for the first that looks like SMILES
        let smiles = null;
        let name   = null;

        if (parts.length === 1) {
            smiles = parts[0];
        } else {
            // Check if first field is SMILES-like (contains C, N, O, ring tokens)
            if (/^[A-Za-z0-9@\[\]()=#%+\-\\/.]{2,}$/.test(parts[0]) && /[cnoCNO]/.test(parts[0])) {
                smiles = parts[0];
                name   = parts.slice(1).join(" ");
            } else {
                // scan all columns for a SMILES-like token
                for (let i = 0; i < parts.length; i++) {
                    if (/^[A-Za-z0-9@\[\]()=#%+\-\\/.]{4,}$/.test(parts[i]) && /[cnoCNO()]/.test(parts[i])) {
                        smiles = parts[i];
                        name   = parts.filter((_, j) => j !== i).join(" ");
                        break;
                    }
                }
            }
        }

        if (smiles) {
            molecules.push({ smiles, name: name || smiles });
        }
    }
    return molecules;
}

/* ── Render one page of molecules ───────────────────────────── */
function renderPage() {
    gridEl.innerHTML = "";
    paginEl.innerHTML = "";

    if (filtered.length === 0) {
        setStatus("No molecules match your filter.");
        gridEl.style.display = "none";
        return;
    }

    setStatus("");
    gridEl.style.display = "grid";

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    // Draw each molecule card
    pageItems.forEach(({ smiles, name }) => {
        const card = document.createElement("div");
        card.className = "sd-card";

        const canvas = document.createElement("canvas");
        canvas.width  = CANVAS_SIZE;
        canvas.height = CANVAS_SIZE;
        card.appendChild(canvas);

        const labelEl = document.createElement("div");
        labelEl.className  = "sd-card-label";
        labelEl.title      = name;
        labelEl.textContent = truncate(name, MAX_LABEL_LEN);
        card.appendChild(labelEl);

        const smilesEl = document.createElement("div");
        smilesEl.className  = "sd-card-smiles";
        smilesEl.title      = smiles;
        smilesEl.textContent = truncate(smiles, 40);
        card.appendChild(smilesEl);

        gridEl.appendChild(card);

        // Draw via SmilesDrawer
        const drawer = new SmilesDrawer.Drawer({ ...drawerOptions });
        SmilesDrawer.parse(smiles, (tree) => {
            drawer.draw(tree, canvas, currentTheme, false);
        }, (err) => {
            // Show parse error on canvas
            const ctx = canvas.getContext("2d");
            ctx.fillStyle = isDarkTheme(currentTheme) ? "#555" : "#eee";
            ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            ctx.fillStyle = "#c00";
            ctx.font = "11px monospace";
            ctx.textAlign = "center";
            ctx.fillText("Parse error", CANVAS_SIZE / 2, CANVAS_SIZE / 2 - 8);
            ctx.fillStyle = "#888";
            ctx.font = "9px monospace";
            ctx.fillText(String(err).slice(0, 30), CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 8);
        });
    });

    // Pagination controls
    if (totalPages > 1) {
        const mkBtn = (label, page, disabled, active) => {
            const btn = document.createElement("button");
            btn.textContent = label;
            btn.disabled = disabled;
            if (active) btn.classList.add("active");
            btn.addEventListener("click", () => {
                currentPage = page;
                renderPage();
                window.scrollTo(0, 0);
            });
            return btn;
        };

        paginEl.appendChild(mkBtn("‹ Prev", currentPage - 1, currentPage === 1, false));

        // Show a window of page numbers
        const delta = 2;
        for (let p = 1; p <= totalPages; p++) {
            if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= delta) {
                paginEl.appendChild(mkBtn(String(p), p, false, p === currentPage));
            } else if (Math.abs(p - currentPage) === delta + 1) {
                const ellipsis = document.createElement("span");
                ellipsis.id = "sd-page-info";
                ellipsis.textContent = "…";
                paginEl.appendChild(ellipsis);
            }
        }

        paginEl.appendChild(mkBtn("Next ›", currentPage + 1, currentPage === totalPages, false));
    }
}

/* ── Apply search filter ────────────────────────────────────── */
function applyFilter() {
    const q = searchEl.value.trim().toLowerCase();
    filtered = q
        ? allMolecules.filter(m => m.smiles.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
        : [...allMolecules];
    currentPage = 1;
    countEl.textContent = `${filtered.length} / ${allMolecules.length} molecules`;
    renderPage();
}

/* ── Theme toggle ───────────────────────────────────────────── */
themeEl.addEventListener("change", () => {
    currentTheme = themeEl.value;
    document.body.className = isDarkTheme(currentTheme) ? "theme-dark" : "";
    renderPage();
});

/* ── Column override ────────────────────────────────────────── */
colEl.addEventListener("change", () => {
    const n = colEl.value;
    gridEl.style.gridTemplateColumns = n ? `repeat(${n}, 1fr)` : "";
});

/* ── Search ─────────────────────────────────────────────────── */
searchEl.addEventListener("input", applyFilter);

/* ── Load SmilesDrawer library dynamically ──────────────────── */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = src;
        s.onload  = resolve;
        s.onerror = () => reject(new Error(`Failed to load script: ${src}`));
        document.head.appendChild(s);
    });
}

/* ── Main init ──────────────────────────────────────────────── */
async function init() {
    if (!datasetId) {
        showError("No dataset_id provided by Galaxy. Cannot load data.");
        setStatus("");
        return;
    }

    // 1. Fetch the dataset content
    const url = `${root}api/datasets/${datasetId}/display`;
    let text;
    try {
        const resp = await fetch(url);
        if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${resp.statusText}`);
        text = await resp.text();
    } catch (err) {
        showError(`Could not fetch dataset: ${err.message}`);
        setStatus("");
        return;
    }

    // 2. Parse molecules
    allMolecules = parseContent(text);
    if (allMolecules.length === 0) {
        showError("No valid SMILES strings found in the dataset.");
        setStatus("");
        return;
    }

    setStatus(`Loading SmilesDrawer library…`);

    // 3. Load the SmilesDrawer library from CDN
    try {
        await loadScript(SMILES_DRAWER_CDN);
    } catch (err) {
        showError(`Could not load SmilesDrawer: ${err.message}`);
        setStatus("");
        return;
    }

    // Populate theme selector dynamically from SmilesDrawer built-in themes
    populateThemes();
    document.body.className = isDarkTheme(currentTheme) ? "theme-dark" : "";

    // 4. Render
    filtered = [...allMolecules];
    countEl.textContent = `${allMolecules.length} molecules`;
    setStatus("");
    renderPage();
}

init();