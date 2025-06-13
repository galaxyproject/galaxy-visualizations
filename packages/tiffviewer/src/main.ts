import { TIFFService } from "./tiff-service";
import { PaletteManager } from "./palette-manager";
import { UIManager } from "./ui-manager";

const isDev = import.meta.env.DEV;

function setDevelopmentIncomingData(appElement: HTMLElement) {
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

function buildDatasetUrl(appElement: HTMLElement) {
  const incoming = JSON.parse(appElement.getAttribute("data-incoming") || "{}");
  const datasetId = incoming.visualization_config.dataset_id;
  const datasetUrl = incoming.visualization_config.dataset_url;
  const root = incoming.root;
  return datasetUrl || `${root}api/datasets/${datasetId}/display`;
}

function main() {
  const appElement = document.querySelector("#app") as HTMLElement;
  setDevelopmentIncomingData(appElement);
  const url = buildDatasetUrl(appElement);
  const tiffService = new TIFFService();
  const paletteManager = new PaletteManager();
  const uiManager = new UIManager(tiffService, paletteManager, appElement);
  uiManager.loadAndRender(url);
}

main();
