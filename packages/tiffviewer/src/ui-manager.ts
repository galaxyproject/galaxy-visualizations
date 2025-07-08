import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";
import { PaletteManager } from "./palette-manager";
import { TIFFService } from "./tiff-service";
import { normalizeIfNeeded } from "./utils";
import type { GeoTIFFImage } from "geotiff";
import { icons } from "./icons";

export class UIManager {
  private appElement: HTMLElement;
  private toolbar: HTMLElement;
  private canvas: HTMLCanvasElement;
  private panzoom: PanzoomObject;
  private currentTIFFImage: GeoTIFFImage | null = null;
  private pageCount: number = 0;
  private currentPageIndex: number = 0;
  private readonly maxScale: number = 20;

  private tiffService: TIFFService;
  private paletteManager: PaletteManager;

  constructor(
    tiffService: TIFFService,
    paletteManager: PaletteManager,
    appElement: HTMLElement
  ) {
    this.tiffService = tiffService;
    this.paletteManager = paletteManager;
    this.appElement = appElement;
    this.toolbar = document.createElement("div");
    this.toolbar.id = "tiff-toolbar";
    this.appElement.appendChild(this.toolbar);
    const container = document.createElement("div");
    container.id = "canvas-container";
    this.appElement.appendChild(container);
    this.canvas = document.createElement("canvas");
    container.appendChild(this.canvas);
    this.panzoom = Panzoom(this.canvas, {
      canvas: true,
      maxScale: this.maxScale,
    });
    container.addEventListener("wheel", (event) => {
      this.panzoom.zoomWithWheel(event);
    });
  }

  async loadAndRender(url: string) {
    try {
      this.showLoading("Loading...");
      await this.tiffService.load(url);
      this.pageCount = this.tiffService.getPageCount();
      if (this.pageCount === 0) {
        this.appElement.innerHTML = "<p>No images found in the TIFF file.</p>";
        return;
      }
      this.currentPageIndex = 0;
      await this.renderTIFFImage(this.currentPageIndex);
      this.createToolbar();
    } catch (error) {
      this.displayErrorPanel("Cannot display TIFF image", error);
    } finally {
      this.hideLoading();
    }
  }

  private async renderTIFFImage(pageIndex: number) {
    const image = await this.tiffService.getImage(pageIndex);
    this.currentTIFFImage = image;
    const context = this.canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas context not available");
    const width = image.getWidth();
    const height = image.getHeight();
    const samples = image.getSamplesPerPixel();
    const raster = await image.readRasters({ interleave: true });
    const data = normalizeIfNeeded(raster);
    const rgba = new Uint8ClampedArray(width * height * 4);
    if (samples === 1) {
      const palette = this.paletteManager.getPalette(
        this.paletteManager.getCurrentPalette()
      );
      for (let i = 0; i < width * height; i++) {
        const v = data[i];
        const [r, g, b] = palette.map(v);
        rgba[i * 4 + 0] = r;
        rgba[i * 4 + 1] = g;
        rgba[i * 4 + 2] = b;
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
    this.canvas.width = width * dpr;
    this.canvas.height = height * dpr;
    context.scale(dpr, dpr);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    const imageData = new ImageData(rgba, width, height);
    context.putImageData(imageData, 0, 0);
    this.fitImageToScreen();
  }

  private createToolbar() {
    this.toolbar.innerHTML = "";
    // Info button (SVG)
    const infoSwitch = document.createElement("button");
    infoSwitch.appendChild(this.createIcon("info", "Show Info"));
    infoSwitch.title = "Show Info";
    infoSwitch.type = "button";
    infoSwitch.setAttribute("aria-label", "Show Info");
    let infoPanel: HTMLElement | null = null;
    infoSwitch.onclick = () => {
      if (infoPanel) {
        closeInfoPanel();
        return;
      }
      infoPanel = document.createElement("div");
      infoPanel.className = "info-floating-panel";
      infoPanel.innerHTML = `<div class='info-dialog-content'>${this.generateImageInfoHtml()}</div>`;
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
    // Zoom controls (SVG)
    const zoomInBtn = document.createElement("button");
    zoomInBtn.appendChild(this.createIcon("zoom-in", "Zoom In"));
    zoomInBtn.title = "Zoom In";
    zoomInBtn.type = "button";
    zoomInBtn.setAttribute("aria-label", "Zoom In");
    zoomInBtn.onclick = () => this.panzoom.zoomIn();
    const zoomOutBtn = document.createElement("button");
    zoomOutBtn.appendChild(this.createIcon("zoom-out", "Zoom Out"));
    zoomOutBtn.title = "Zoom Out";
    zoomOutBtn.type = "button";
    zoomOutBtn.setAttribute("aria-label", "Zoom Out");
    zoomOutBtn.onclick = () => this.panzoom.zoomOut();
    const resetZoomBtn = document.createElement("button");
    resetZoomBtn.appendChild(this.createIcon("reset", "Reset Zoom"));
    resetZoomBtn.title = "Reset Zoom";
    resetZoomBtn.type = "button";
    resetZoomBtn.setAttribute("aria-label", "Reset Zoom");
    resetZoomBtn.onclick = () => this.resetImage();
    // Fit to screen button (SVG)
    const fitBtn = document.createElement("button");
    fitBtn.appendChild(this.createIcon("fit", "Fit to Screen"));
    fitBtn.title = "Fit to Screen";
    fitBtn.type = "button";
    fitBtn.setAttribute("aria-label", "Fit to Screen");
    fitBtn.onclick = () => this.fitImageToScreen();
    // Palette panel (SVG)
    const palettePanelBtn = document.createElement("button");
    palettePanelBtn.appendChild(
      this.createIcon("palette", "Show Palette Selector")
    );
    palettePanelBtn.title = "Show Palette Selector";
    palettePanelBtn.type = "button";
    palettePanelBtn.setAttribute("aria-label", "Show Palette Selector");
    let palettePanel: HTMLElement | null = null;
    palettePanelBtn.onclick = () => {
      if (palettePanel) {
        closePalettePanel();
        return;
      }
      const canUsePalette = this.currentTIFFImage?.getSamplesPerPixel() === 1;
      palettePanel = document.createElement("div");
      palettePanel.className = "info-floating-panel palette-panel";
      palettePanel.innerHTML = `<div class='info-dialog-content'><h2 class='info-table-title'>Color Palette</h2></div>`;
      const content = palettePanel.querySelector(".info-dialog-content")!;
      if (canUsePalette) {
        content.innerHTML += `<p class='palette-info'>Select a color palette to apply to the image.</p>`;
        const swatchBar = document.createElement("div");
        swatchBar.className = "palette-swatch-bar";
        this.paletteManager.getPaletteKeys().forEach((key) => {
          const swatchBtn = document.createElement("button");
          swatchBtn.type = "button";
          swatchBtn.className = "palette-swatch-btn";
          swatchBtn.setAttribute("data-palette", key);
          if (key === this.paletteManager.getCurrentPalette())
            swatchBtn.classList.add("selected");
          const swatch = document.createElement("span");
          swatch.className = "palette-swatch palette-swatch-bar-item";
          swatch.setAttribute("data-palette", key);
          swatchBtn.appendChild(swatch);
          const label = document.createElement("span");
          label.className = "palette-swatch-label";
          label.textContent = this.paletteManager.getPalette(key).name;
          swatchBtn.appendChild(label);
          swatchBtn.onclick = () => {
            this.paletteManager.setPalette(key);
            if (this.currentTIFFImage)
              this.renderTIFFImage(this.currentPageIndex);
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
    // Add page selector if needed
    if (this.pageCount > 1) {
      this.createPageSelector();
    }
    this.toolbar.appendChild(infoSwitch);
    this.toolbar.appendChild(zoomInBtn);
    this.toolbar.appendChild(zoomOutBtn);
    this.toolbar.appendChild(resetZoomBtn);
    this.toolbar.appendChild(fitBtn);
    this.toolbar.appendChild(palettePanelBtn);
  }

  private createPageSelector() {
    let currentIndex = this.currentPageIndex;
    const select = document.createElement("select");
    select.id = "tiff-page-selector";
    for (let i = 0; i < this.pageCount; i++) {
      const option = document.createElement("option");
      option.value = i.toString();
      option.textContent = `Page ${i + 1}`;
      if (i === currentIndex) option.selected = true;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      currentIndex = parseInt(select.value, 10);
      updateButtonStates();
      this.renderTIFFImage(currentIndex);
    });
    const prevBtn = document.createElement("button");
    prevBtn.appendChild(this.createIcon("arrow-left", "Previous Page"));
    prevBtn.title = "Previous Page";
    prevBtn.type = "button";
    prevBtn.onclick = () => {
      if (currentIndex > 0) {
        currentIndex--;
        select.value = currentIndex.toString();
        updateButtonStates();
        this.renderTIFFImage(currentIndex);
      }
    };
    const nextBtn = document.createElement("button");
    nextBtn.appendChild(this.createIcon("arrow-right", "Next Page"));
    nextBtn.title = "Next Page";
    nextBtn.type = "button";
    nextBtn.onclick = () => {
      if (currentIndex < this.pageCount - 1) {
        currentIndex++;
        select.value = currentIndex.toString();
        updateButtonStates();
        this.renderTIFFImage(currentIndex);
      }
    };
    const updateButtonStates = () => {
      prevBtn.disabled = currentIndex === 0;
      nextBtn.disabled = currentIndex === this.pageCount - 1;
    };
    updateButtonStates();
    this.toolbar.appendChild(prevBtn);
    this.toolbar.appendChild(select);
    this.toolbar.appendChild(nextBtn);
  }

  private generateImageInfoHtml(): string {
    const imageTags = this.currentTIFFImage?.getFileDirectory();
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

  private displayErrorPanel(title: string, error: unknown) {
    this.clearErrorPanel();
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

  private clearErrorPanel() {
    document
      .querySelectorAll(".centered-error-panel")
      .forEach((e) => e.remove());
  }

  private showLoading(message = "Loading...") {
    this.hideLoading();
    const overlay = document.createElement("div");
    overlay.className = "centered-loading-overlay";
    overlay.innerHTML = `<div class="centered-loading-message"><div class="centered-loading-spinner"></div>${message}</div>`;
    overlay.id = "tiff-loading-overlay";
    document.body.appendChild(overlay);
  }

  private hideLoading() {
    document.getElementById("tiff-loading-overlay")?.remove();
  }

  private centerImageInContainer(scale: number) {
    const container = this.canvas.parentElement as HTMLElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    let useScale = scale;
    if (isNaN(useScale) || useScale <= 0) {
      useScale = this.panzoom.getScale() || 1;
    }
    // Calculate offset for centering
    const panX = (containerRect.width - width) / 2 / useScale;
    const panY = (containerRect.height - height) / 2 / useScale;
    this.panzoom.reset();
    if (useScale !== 1) {
      this.panzoom.zoom(useScale);
    }
    this.panzoom.pan(panX, panY);
  }

  private fitImageToScreen() {
    const container = this.canvas.parentElement as HTMLElement;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const width = this.canvas.width / (window.devicePixelRatio || 1);
    const height = this.canvas.height / (window.devicePixelRatio || 1);
    const scaleX = containerRect.width / width;
    const scaleY = containerRect.height / height;
    const scale = Math.min(scaleX, scaleY);
    this.centerImageInContainer(scale);
  }

  private resetImage() {
    this.centerImageInContainer(1);
  }

  private createIcon(key: string, label: string): HTMLElement {
    const wrapper = document.createElement("span");
    wrapper.innerHTML = icons[key] || "";
    const svg = wrapper.firstElementChild as SVGElement | null;
    if (svg) {
      svg.setAttribute("aria-label", label);
      svg.setAttribute("role", "img");
      svg.setAttribute("focusable", "false");
      svg.style.verticalAlign = "middle";
      svg.style.width = "20px";
      svg.style.height = "20px";
    }
    return svg || wrapper;
  }
}
