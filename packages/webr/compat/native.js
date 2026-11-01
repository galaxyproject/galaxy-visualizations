import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DATA_DIR, fetchData } from "./fetch-data.js";
import { WORKFLOWS } from "./workflows.js";

const COMPAT_DIR = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(COMPAT_DIR, "results", "native");
const IMAGE = process.env.NATIVE_IMAGE || "bioconductor/bioconductor_docker:RELEASE_3_23";
const BIOCONDUCTOR = process.env.NATIVE_BIOCONDUCTOR || "3.23";
const PLATFORM = process.env.NATIVE_PLATFORM ? ["--platform", process.env.NATIVE_PLATFORM] : [];
const VOLUME = process.env.NATIVE_LIBRARY_VOLUME || "webr-compat-native-library";
const SELECTED = process.env.WORKFLOWS ? process.env.WORKFLOWS.split(",") : WORKFLOWS.map(({ id }) => id);

function docker(...args) {
    return execFileSync(
        "docker",
        [
            "run",
            "--rm",
            ...PLATFORM,
            "-v",
            `${join(COMPAT_DIR, "workflows")}:/workflows:ro`,
            "-v",
            `${DATA_DIR}:/data:ro`,
            "-v",
            `${VOLUME}:/library`,
            "-e",
            "R_LIBS=/library",
            "-e",
            "COMPAT_DATA=/data",
            IMAGE,
            ...args,
        ],
        { encoding: "utf8", maxBuffer: 1 << 28, stdio: ["ignore", "pipe", "inherit"] },
    );
}

function parse(output) {
    const lines = output.split("\n");
    return {
        results: Object.fromEntries(
            lines
                .filter((line) => line.startsWith("RESULT "))
                .map((line) => {
                    const [, key, ...value] = line.trim().split(" ");
                    return [key, value.join(" ")];
                }),
        ),
        error: lines.find((line) => line.startsWith("ERROR "))?.trim() || null,
    };
}

await fetchData();
mkdirSync(RESULTS_DIR, { recursive: true });
const workflows = WORKFLOWS.filter(({ id }) => SELECTED.includes(id));
const packages = [...new Set(workflows.flatMap(({ packages }) => packages))];
const install = [
    "options(Ncpus = parallel::detectCores())",
    'if (!requireNamespace("BiocManager", quietly = TRUE)) install.packages("BiocManager", lib = "/library")',
    `BiocManager::install(version = "${BIOCONDUCTOR}", ask = FALSE, update = FALSE, lib = "/library")`,
    `missing <- setdiff(c(${packages.map((name) => JSON.stringify(name)).join(", ")}), rownames(installed.packages()))`,
    'if (length(missing)) BiocManager::install(missing, update = FALSE, ask = FALSE, lib = "/library")',
].join("; ");
docker("Rscript", "-e", install);
const session = docker(
    "Rscript",
    "-e",
    'cat(R.version.string, "Bioconductor", as.character(BiocManager::version()), "\\n")',
).trim();

const versionOutput = docker(
    "Rscript",
    "-e",
    `for (name in c(${packages.map((name) => JSON.stringify(name)).join(", ")})) cat(sprintf("VERSION %s %s\\n", name, tryCatch(as.character(packageVersion(name)), error = function(e) NA)))`,
);
const versions = Object.fromEntries(
    versionOutput
        .split("\n")
        .filter((line) => line.startsWith("VERSION "))
        .map((line) => line.trim().split(" ").slice(1)),
);

for (const workflow of workflows) {
    const wrapped = `tryCatch({ source("/workflows/${workflow.id}.R"); invisible(NULL) }, error = function(e) cat(sprintf("ERROR %s: %s\\n", paste(deparse(conditionCall(e)), collapse = " "), conditionMessage(e))))`;
    const timed = `elapsed <- system.time(${wrapped})[["elapsed"]]; cat(sprintf("ELAPSED %f\\n", elapsed))`;
    const output = docker("Rscript", "-e", `pdf(NULL); ${timed}`);
    const elapsed = Number(output.match(/^ELAPSED (\S+)$/m)?.[1]);
    const record = {
        workflow: workflow.id,
        image: IMAGE,
        platform: process.env.NATIVE_PLATFORM || null,
        session,
        script: { seconds: elapsed, ...parse(output) },
    };
    writeFileSync(join(RESULTS_DIR, `${workflow.id}.json`), JSON.stringify(record, null, 4));
}
