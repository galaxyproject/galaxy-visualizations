import { fromArrayBuffer, GeoTIFFImage, type ReadRasterResult } from "geotiff";
import Panzoom from "@panzoom/panzoom";
import { COLOR_PALETTES, type PaletteKey } from "./palettes";

const isDev = import.meta.env.DEV;

const appElement = document.querySelector("#app") as HTMLElement;

const { toolbar, canvas } = initializeUI();

let currentPalette: PaletteKey = "grayscale";
let currentTIFFImage: GeoTIFFImage | null = null;

// Mock data for development
setDevelopmentIncomingData();

const url = buildDatasetUrl();

// Entry point
render();

function buildDatasetUrl() {
  const incoming = JSON.parse(appElement.getAttribute("data-incoming") || "{}");
  const datasetId = incoming.visualization_config.dataset_id;
  const datasetUrl = incoming.visualization_config.dataset_url;
  const root = incoming.root;
  const url = datasetUrl || `${root}api/datasets/${datasetId}/display`;
  return url;
}

function setDevelopmentIncomingData() {
  if (isDev) {
    const dataIncoming = {
      root: "/",
      visualization_config: {
        dataset_id: process.env.dataset_id,
      },
    };
    appElement.setAttribute("data-incoming", JSON.stringify(dataIncoming));
  }
}

async function render(): Promise<void> {
  try {
    const buffer = await loadTIFF();
    await processTIFF(buffer);
  } catch (error) {
    const errorTitle = "Cannot display TIFF image";
    console.error(errorTitle, error);
    displayErrorPanel(errorTitle, error);
  }
}

async function loadTIFF() {
  const response = await fetch(url);
  if (!response.ok) throw new Error("Failed to fetch TIFF file");

  return response.arrayBuffer();
}

async function processTIFF(arrayBuffer: ArrayBuffer): Promise<void> {
  const tiff = await fromArrayBuffer(arrayBuffer);
  const imageCount = await tiff.getImageCount();

  console.log(`TIFF has ${imageCount} page(s)`);

  if (imageCount === 0) {
    console.warn("No images found in the TIFF file.");
    appElement.innerHTML = "<p>No images found in the TIFF file.</p>";
    return;
  }

  if (imageCount > 1) {
    createPageSelector(imageCount, async (pageIndex) => {
      const image = await tiff.getImage(pageIndex);
      await renderTIFFImage(image);
    });
  }

  const firstImage = await tiff.getImage(0);
  await renderTIFFImage(firstImage);
}

async function renderTIFFImage(image: GeoTIFFImage): Promise<void> {
  // Turn off alpha channel for performance
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Canvas context not available");
  }

  currentTIFFImage = image;

  const width = image.getWidth();
  const height = image.getHeight();
  const samples = image.getSamplesPerPixel();

  const raster = await image.readRasters({ interleave: true });
  const data = normalizeIfNeeded(raster);
  const rgba = new Uint8ClampedArray(width * height * 4);

  if (samples === 1) {
    // Grayscale or palette
    const palette = COLOR_PALETTES[currentPalette] || COLOR_PALETTES.grayscale;
    for (let i = 0; i < width * height; i++) {
      const v = data[i];
      const [r, g, b] = palette.map(v);
      rgba[i * 4 + 0] = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = 255;
    }
  } else if (samples >= 3) {
    // Show RGB as-is
    for (let i = 0, j = 0; i < width * height; i++, j += samples) {
      rgba[i * 4 + 0] = data[j];
      rgba[i * 4 + 1] = data[j + 1];
      rgba[i * 4 + 2] = data[j + 2];
      rgba[i * 4 + 3] = samples >= 4 ? data[j + 3] : 255;
    }
  } else {
    console.warn(`Unsupported sample format with ${samples} channels`);
    return;
  }

  const dpr = window.devicePixelRatio || 1;
  canvas.width = width * dpr;
  canvas.height = height * dpr;

  // Scale the context to ensure correct drawing operations
  // See https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas#scaling_for_high_resolution_displays
  context.scale(dpr, dpr);

  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const imageData = new ImageData(rgba, width, height);
  context.putImageData(imageData, 0, 0);
}

function normalizeIfNeeded(raster: ReadRasterResult): Uint8ClampedArray {
  const arr = ArrayBuffer.isView(raster)
    ? raster
    : (raster as unknown as { data: ArrayLike<number> }).data;

  if (arr instanceof Float32Array || arr instanceof Float64Array) {
    let min = Infinity;
    let max = -Infinity;
    for (const v of arr) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
    const range = max - min || 1;
    return Uint8ClampedArray.from(arr, (v) =>
      Math.min(255, Math.max(0, ((v - min) / range) * 255))
    );
  }
  return new Uint8ClampedArray(arr);
}

function initializeUI() {
  const toolbar = document.createElement("div");
  toolbar.id = "tiff-toolbar";
  appElement.appendChild(toolbar);

  const container = document.createElement("div");
  container.id = "canvas-container";
  appElement.appendChild(container);

  const canvas = document.createElement("canvas");
  container.appendChild(canvas);

  const panzoom = Panzoom(canvas, { canvas: true });
  const parent = canvas.parentElement!;
  parent.addEventListener("wheel", (event) => {
    panzoom.zoomWithWheel(event);
  });

  // --- Add zoom controls to toolbar ---
  const zoomInBtn = document.createElement("button");
  zoomInBtn.textContent = "＋";
  zoomInBtn.title = "Zoom In";
  zoomInBtn.type = "button";
  zoomInBtn.onclick = () => panzoom.zoomIn();

  const zoomOutBtn = document.createElement("button");
  zoomOutBtn.textContent = "－";
  zoomOutBtn.title = "Zoom Out";
  zoomOutBtn.type = "button";
  zoomOutBtn.onclick = () => panzoom.zoomOut();

  const resetZoomBtn = document.createElement("button");
  resetZoomBtn.textContent = "⭯";
  resetZoomBtn.title = "Reset Zoom";
  resetZoomBtn.type = "button";
  resetZoomBtn.onclick = () => panzoom.reset();

  // --- Add info switch to toolbar ---
  const infoSwitch = document.createElement("button");
  infoSwitch.textContent = "ℹ️";
  infoSwitch.title = "Show Info";
  infoSwitch.type = "button";
  let infoPanel: HTMLElement | null = null;
  infoSwitch.onclick = () => {
    if (infoPanel) {
      closeInfoPanel();
      return;
    }
    infoPanel = document.createElement("div");
    infoPanel.className = "info-floating-panel";
    infoPanel.innerHTML = `<div class='info-dialog-content'>${generateImageInfoHtml()}</div>`;
    const closeBtn = document.createElement("button");
    closeBtn.className = "info-dialog-close info-dialog-x";
    closeBtn.title = "Close";
    closeBtn.innerHTML = "&times;";
    function closeInfoPanel() {
      infoPanel?.remove();
      infoPanel = null;
      document.removeEventListener("keydown", closeInfoPanelOnEsc);
    }
    function closeInfoPanelOnEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && infoPanel) {
        closeInfoPanel();
      }
    }
    closeBtn.onclick = closeInfoPanel;
    infoPanel.appendChild(closeBtn);
    document.body.appendChild(infoPanel);
    document.addEventListener("keydown", closeInfoPanelOnEsc);
  };

  // --- Palette panel switch ---
  const palettePanelBtn = document.createElement("button");
  palettePanelBtn.textContent = "🎨";
  palettePanelBtn.title = "Show Palette Selector";
  palettePanelBtn.type = "button";
  let palettePanel: HTMLElement | null = null;
  palettePanelBtn.onclick = () => {
    if (palettePanel) {
      closePalettePanel();
      return;
    }
    const canUsePalette = currentTIFFImage?.getSamplesPerPixel() === 1;
    palettePanel = document.createElement("div");
    palettePanel.className = "info-floating-panel palette-panel";
    palettePanel.innerHTML = `<div class='info-dialog-content'><h2 class='info-table-title'>Color Palette</h2></div>`;
    const content = palettePanel.querySelector(".info-dialog-content")!;
    if (canUsePalette) {
      content.innerHTML += `<p class='palette-info'>Select a color palette to apply to the image.</p>`;
      // Swatch bar/grid for all palettes
      const swatchBar = document.createElement("div");
      swatchBar.className = "palette-swatch-bar";
      (Object.keys(COLOR_PALETTES) as PaletteKey[]).forEach((key) => {
        const swatchBtn = document.createElement("button");
        swatchBtn.type = "button";
        swatchBtn.className = "palette-swatch-btn";
        swatchBtn.setAttribute("data-palette", key);
        if (key === currentPalette) swatchBtn.classList.add("selected");
        // Swatch visual
        const swatch = document.createElement("span");
        swatch.className = "palette-swatch palette-swatch-bar-item";
        swatch.setAttribute("data-palette", key);
        swatchBtn.appendChild(swatch);
        // Name
        const label = document.createElement("span");
        label.className = "palette-swatch-label";
        label.textContent = COLOR_PALETTES[key].name;
        swatchBtn.appendChild(label);
        swatchBtn.onclick = () => {
          currentPalette = key;
          if (currentTIFFImage) renderTIFFImage(currentTIFFImage);
          // Update highlight
          swatchBar
            .querySelectorAll(".palette-swatch-btn")
            .forEach((btn) => btn.classList.remove("selected"));
          swatchBtn.classList.add("selected");
        };
        swatchBar.appendChild(swatchBtn);
      });
      content.appendChild(swatchBar);
    } else {
      content.innerHTML += `<p class='palette-warning'>Color palettes are only available for single-channel images.</p>`;
    }

    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.className = "info-dialog-close info-dialog-x";
    closeBtn.title = "Close";
    closeBtn.innerHTML = "&times;";
    function closePalettePanel() {
      palettePanel?.remove();
      palettePanel = null;
      document.removeEventListener("keydown", closePalettePanelOnEsc);
    }
    function closePalettePanelOnEsc(e: KeyboardEvent) {
      if (e.key === "Escape" && palettePanel) {
        closePalettePanel();
      }
    }
    closeBtn.onclick = closePalettePanel;
    palettePanel.appendChild(closeBtn);
    document.body.appendChild(palettePanel);
    document.addEventListener("keydown", closePalettePanelOnEsc);
  };
  toolbar.appendChild(infoSwitch);
  toolbar.appendChild(zoomInBtn);
  toolbar.appendChild(zoomOutBtn);
  toolbar.appendChild(resetZoomBtn);
  toolbar.appendChild(palettePanelBtn);
  return { toolbar, canvas };
}

function createPageSelector(
  imageCount: number,
  onChange: (index: number) => void
) {
  let currentIndex = 0;

  const select = document.createElement("select");
  select.id = "tiff-page-selector";

  for (let i = 0; i < imageCount; i++) {
    const option = document.createElement("option");
    option.value = i.toString();
    option.textContent = `Page ${i + 1}`;
    select.appendChild(option);
  }

  select.addEventListener("change", () => {
    currentIndex = parseInt(select.value, 10);
    updateButtonStates();
    onChange(currentIndex);
  });

  const prevBtn = document.createElement("button");
  prevBtn.textContent = "⬅️";
  prevBtn.title = "Previous Page";
  prevBtn.type = "button";
  prevBtn.onclick = () => {
    if (currentIndex > 0) {
      currentIndex--;
      select.value = currentIndex.toString();
      updateButtonStates();
      onChange(currentIndex);
    }
  };

  const nextBtn = document.createElement("button");
  nextBtn.textContent = "➡️";
  nextBtn.title = "Next Page";
  nextBtn.type = "button";
  nextBtn.onclick = () => {
    if (currentIndex < imageCount - 1) {
      currentIndex++;
      select.value = currentIndex.toString();
      updateButtonStates();
      onChange(currentIndex);
    }
  };

  function updateButtonStates() {
    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex === imageCount - 1;
  }

  updateButtonStates();

  toolbar.appendChild(prevBtn);
  toolbar.appendChild(select);
  toolbar.appendChild(nextBtn);
}

function generateImageInfoHtml(): string {
  const imageTags = currentTIFFImage?.getFileDirectory();
  if (!imageTags) {
    return "<p>No TIFF metadata available.</p>";
  }
  const tags = imageTags as Record<string, unknown>;
  const rows = Object.entries(tags)
    .map(
      ([key, value]) =>
        `<tr><td class='info-table-key'>${key}</td><td class='info-table-value'>${value}</td></tr>`
    )
    .join("");

  return `
    <h2 class="info-table-title">Image Information</h2>
    <table class="info-table">
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function displayErrorPanel(title: string, error: unknown) {
  clearErrorPanel();

  const panel = document.createElement("div");
  panel.className = "centered-error-panel";

  const titleElem = document.createElement("h2");
  titleElem.className = "centered-error-title";
  titleElem.textContent = title;
  panel.appendChild(titleElem);

  const msgElem = document.createElement("div");
  msgElem.className = "centered-error-message";
  if (error instanceof Error) {
    msgElem.innerHTML = `<strong>Reason:</strong> ${error.message}`;
    if (error.stack) {
      const pre = document.createElement("pre");
      pre.className = "centered-error-stack";
      pre.textContent = error.stack;
      panel.appendChild(pre);
    }
  } else {
    msgElem.textContent = String(error);
  }
  panel.appendChild(msgElem);

  document.body.appendChild(panel);
}

function clearErrorPanel() {
  document.querySelectorAll(".centered-error-panel").forEach((e) => e.remove());
}
