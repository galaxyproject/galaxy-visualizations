import { ChannelType, WebR } from "webr";

export const DEFAULT_REPOSITORIES = ["https://webr.bioconductor.org/3.23", "https://repo.r-wasm.org"];

export function runtimeUrl() {
    return import.meta.env.DEV ? `${self.origin}/webr/` : new URL("./webr/", import.meta.url).href;
}

export async function startR(options = {}) {
    const webR = new WebR({
        baseUrl: runtimeUrl(),
        channelType: ChannelType.PostMessage,
        interactive: false,
        ...options,
    });
    await webR.init();
    return webR;
}
