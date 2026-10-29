#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packagesDir = path.join(root, "packages");
const assetDirs = ["public", "static"];
const logoNames = ["logo.svg", "logo.png"];

function findFile(dir, match) {
    for (const assetDir of assetDirs) {
        const full = path.join(dir, assetDir);
        if (fs.existsSync(full)) {
            const found = fs.readdirSync(full).sort().find(match);
            if (found) {
                return path.join(full, found);
            }
        }
    }
    return null;
}

function decode(text) {
    return text
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

function cell(text) {
    return text.replace(/\s+/g, " ").replace(/\|/g, "\\|").trim();
}

function findXml(dir, packageDirs) {
    const xmlName = `${path.basename(dir)}.xml`;
    return (
        findFile(dir, (name) => name === xmlName) ||
        findFile(dir, (name) => name.endsWith(".xml")) ||
        packageDirs.map((other) => findFile(other, (name) => name === xmlName)).find(Boolean) ||
        null
    );
}

function readVisualization(dir, packageDirs) {
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8"));
    const xmlPath = findXml(dir, packageDirs);
    const xml = xmlPath ? fs.readFileSync(xmlPath, "utf8") : "";
    const title = /<visualization\b[^>]*\bname="([^"]*)"/.exec(xml);
    const description = /<description>([\s\S]*?)<\/description>/.exec(xml);
    const logo = findFile(dir, (name) => logoNames.includes(name));
    return {
        private: Boolean(pkg.private),
        npm: pkg.name,
        name: decode(title ? title[1] : pkg.name.replace(/^@[^/]+\//, "")),
        description: decode(description ? description[1] : pkg.description || ""),
        logo: logo ? path.relative(root, logo).split(path.sep).join("/") : null,
    };
}

const packageDirs = fs
    .readdirSync(packagesDir)
    .map((name) => path.join(packagesDir, name))
    .filter((dir) => fs.existsSync(path.join(dir, "package.json")));

const visualizations = packageDirs
    .map((dir) => readVisualization(dir, packageDirs))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

const rows = visualizations.map((visualization) => {
    const logo = visualization.logo ? `<img src="${visualization.logo}" alt="" width="32">` : "";
    const npm = encodeURIComponent(visualization.npm);
    const badge = `[![${visualization.npm}](https://img.shields.io/npm/v/${visualization.npm}?label=${npm})](https://www.npmjs.com/package/${visualization.npm})`;
    return `| ${logo} | ${cell(visualization.name)} | ${cell(visualization.description) || "Not available"} | ${visualization.private ? "Not published" : badge} |`;
});

process.stdout.write(
    [
        `## Available Visualizations (${rows.length})`,
        "",
        "| Logo | Name | Description | Package |",
        "| --- | --- | --- | --- |",
        ...rows,
    ].join("\n") + "\n",
);
