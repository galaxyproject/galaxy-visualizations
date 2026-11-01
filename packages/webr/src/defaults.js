const EXTENSIONS = {
    csv: "csv",
    gz: "auto",
    json: "json",
    pdf: "pdf",
    png: "png",
    rda: "rdata",
    rdata: "rdata",
    rds: "rds",
    svg: "svg",
    tab: "tabular",
    tsv: "tabular",
    txt: "txt",
};

export function inputName(dataset) {
    const base = String(dataset.name || "dataset").replace(/[^A-Za-z0-9._-]+/g, "_");
    const extension = dataset.extension || "dat";
    return base.endsWith(`.${extension}`) ? base : `${base}.${extension}`;
}

export function galaxyExtension(path) {
    const suffix = path.split(".").pop().toLowerCase();
    return EXTENSIONS[suffix] || "auto";
}

export function defaultScript(extension, path) {
    const quoted = JSON.stringify(path);
    if (["tabular", "tsv", "interval", "bed"].includes(extension)) {
        return `data <- read.delim(${quoted}, check.names = FALSE)\nhead(data)\nsummary(data)\n`;
    } else if (extension === "csv") {
        return `data <- read.csv(${quoted}, check.names = FALSE)\nhead(data)\nsummary(data)\n`;
    } else if (extension === "rds") {
        return `object <- readRDS(${quoted})\nobject\n`;
    } else if (extension === "rdata" || extension.startsWith("rdata.")) {
        return `loaded <- load(${quoted})\nloaded\n`;
    } else {
        return `lines <- readLines(${quoted}, n = 10)\nlines\n`;
    }
}
