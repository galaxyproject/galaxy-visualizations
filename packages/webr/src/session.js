import { DEFAULT_REPOSITORIES, startR } from "./runtime.js";

export const HOME = "/home/web_user";
export const INPUT_DIR = "/galaxy/input";

export function parseRepositories(value) {
    const urls = String(value || "")
        .split(/[\s,]+/)
        .filter(Boolean);
    return urls.length ? urls : DEFAULT_REPOSITORIES;
}

export function rString(value) {
    return JSON.stringify(String(value));
}

export function rVector(values) {
    return `c(${values.map(rString).join(", ")})`;
}

async function entry({ type, data }) {
    const text = typeof data === "string" ? data : (await (await data.get("message")).toArray()).join("\n");
    return { type, text };
}

export class RSession {
    constructor(repositories) {
        this.repositories = repositories;
        this.webR = null;
    }

    async start() {
        this.webR = await startR();
        await this.webR.FS.mkdir("/galaxy");
        await this.webR.FS.mkdir(INPUT_DIR);
        await this.webR.evalRVoid(
            `options(webr_pkg_repos = ${rVector(this.repositories)}, repos = ${rVector(this.repositories)}); webr::shim_install()`,
        );
        return await this.webR.evalRString("R.version.string");
    }

    async run(code, { width = 640, height = 480 } = {}) {
        const shelter = await new this.webR.Shelter();
        const capture = await shelter.captureR(code, {
            captureGraphics: { width, height },
            throwJsException: false,
            withAutoprint: true,
        });
        const entries = await Promise.all(capture.output.map(entry));
        await shelter.purge();
        return { entries, images: capture.images };
    }

    async install(packages) {
        return await this.run(`webr::install(${rVector(packages)}, repos = ${rVector(this.repositories)})`);
    }

    async installed() {
        const result = await this.webR.evalR(
            `local({ info <- installed.packages(.libPaths()[1])[, c("Package", "Version"), drop = FALSE]; paste(info[, "Package"], info[, "Version"]) })`,
        );
        const values = await result.toArray();
        this.webR.destroy(result);
        return values;
    }

    async writeFile(path, bytes) {
        await this.webR.FS.writeFile(path, bytes);
    }

    async readFile(path) {
        return await this.webR.FS.readFile(path);
    }

    async listFiles(directory) {
        const result = await this.webR.evalR(
            `local({ paths <- list.files(${rString(directory)}, recursive = TRUE, full.names = TRUE); paths[!dir.exists(paths)] })`,
        );
        const values = await result.toArray();
        this.webR.destroy(result);
        return values;
    }

    close() {
        this.webR?.close();
        this.webR = null;
    }
}
