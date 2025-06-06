import { fromArrayBuffer, GeoTIFFImage, type ReadRasterResult } from "geotiff";
import Panzoom from "@panzoom/panzoom";

const appElement = document.querySelector("#app") as HTMLElement;

const { toolbar, canvas } = initializeUI();

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
  if (import.meta.env.DEV) {
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
    console.error("Failed to load TIFF:", error);
    appElement.innerHTML = `<p>Error loading TIFF: ${error}</p>`;
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

  const width = image.getWidth();
  const height = image.getHeight();
  const samples = image.getSamplesPerPixel();

  const raster = await image.readRasters({ interleave: true });
  const data = normalizeIfNeeded(raster);
  const rgba = new Uint8ClampedArray(width * height * 4);

  if (samples === 1) {
    // Grayscale
    for (let i = 0; i < width * height; i++) {
      const v = data[i];
      rgba[i * 4 + 0] = v;
      rgba[i * 4 + 1] = v;
      rgba[i * 4 + 2] = v;
      rgba[i * 4 + 3] = 255;
    }
  } else if (samples >= 3) {
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
    if (event.shiftKey) {
      panzoom.zoomWithWheel(event);
    }
  });

  return { toolbar, canvas };
}

function createPageSelector(
  imageCount: number,
  onChange: (index: number) => void
) {
  const label = document.createElement("label");
  label.textContent = "Page:";

  const select = document.createElement("select");
  select.id = "tiff-page-selector";

  for (let i = 0; i < imageCount; i++) {
    const option = document.createElement("option");
    option.value = i.toString();
    option.textContent = `Page ${i + 1}`;
    select.appendChild(option);
  }

  select.addEventListener("change", () => {
    const index = parseInt(select.value, 10);
    onChange(index);
  });

  toolbar.appendChild(label);
  toolbar.appendChild(select);
}
