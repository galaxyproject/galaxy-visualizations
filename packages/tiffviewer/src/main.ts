import { fromArrayBuffer, GeoTIFFImage, type ReadRasterResult } from "geotiff";
import Panzoom from "@panzoom/panzoom";

const appElement = document.querySelector("#app") as HTMLElement;
const { canvas, context } = initializeCanvas();

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

function initializeCanvas() {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d")!;
  appElement.appendChild(canvas);

  const panzoom = Panzoom(canvas, { canvas: true });
  const parent = canvas.parentElement!;
  parent.addEventListener("wheel", (event) => {
    if (event.shiftKey) {
      panzoom.zoomWithWheel(event);
    }
  });
  return { canvas, context };
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

  // TODO: Handle multi-page TIFFs using a selection UI
  const image = await tiff.getImage(0);
  await renderTIFFImage(image);
}

async function renderTIFFImage(image: GeoTIFFImage): Promise<void> {
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

  canvas.width = width;
  canvas.height = height;

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
