import { connectGalaxy } from "./galaxy";
import { fail, Outcome, type OlitTool } from "./tool";

export const ENA_HOST = "www.ebi.ac.uk";
export const FIELDS =
  "run_accession,library_layout,fastq_ftp,fastq_md5,fastq_bytes,read_count,scientific_name";
export const RUNS_DEFAULT = 25;
export const RUNS_MAX = 500;
export const ERROR_MAX_CHARS = 400;

const ena = connectGalaxy({ root: `https://${ENA_HOST}/`, credentials: "omit" });

/** Percent-encode everything but unreserved characters. */
const quote = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

/** ENA lists paths without a scheme, semicolon-separated; https serves all of them. */
const urls = (field?: string) =>
  (field || "")
    .split(";")
    .filter(Boolean)
    .map((p) => `https://${p}`);

/** The TSV ENA answers with, as records; an empty body means no runs matched. */
function rows(table: string): Record<string, string>[] {
  const lines = table.trim().split(/\r\n|\r|\n/);
  if (lines.length < 2) {
    return [];
  }
  const header = lines[0].split("\t");
  return lines.slice(1).map((line) => {
    const cells = line.split("\t");
    return Object.fromEntries(header.slice(0, cells.length).map((name, i) => [name, cells[i]]));
  });
}

function clampLimit(limit: unknown): number {
  const value = limit || RUNS_DEFAULT;
  const n =
    typeof value === "number"
      ? Math.trunc(value)
      : /^\s*[+-]?\d+\s*$/.test(String(value))
        ? Number(value)
        : NaN;
  return Number.isFinite(n) ? Math.max(1, Math.min(n, RUNS_MAX)) : RUNS_DEFAULT;
}

async function enaRuns(args: { accession?: string; limit?: unknown }): Promise<Outcome> {
  const accession = (args?.accession || "").trim();
  if (!accession) {
    return fail(JSON.stringify({ error: "An ENA or SRA accession is required." }));
  }
  const limit = clampLimit(args?.limit);

  let table: unknown;
  try {
    table = await ena.get(
      `ena/portal/api/filereport?accession=${quote(accession)}&result=read_run&fields=${FIELDS}` +
        `&format=tsv&limit=${limit + 1}`,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return fail(
      JSON.stringify({
        accession,
        error: detail.slice(0, ERROR_MAX_CHARS) + (detail.length > ERROR_MAX_CHARS ? " ..." : ""),
      }),
    );
  }

  const found = rows(typeof table === "string" ? table : String(table));
  if (!found.length) {
    return new Outcome(
      JSON.stringify({
        accession,
        count: 0,
        runs: [],
        hint: "ENA holds no sequencing runs under this accession.",
      }),
    );
  }

  const truncated = found.length > limit;
  const runs = found.slice(0, limit).map((row) => {
    const files = urls(row.fastq_ftp);
    return {
      run: row.run_accession ?? null,
      layout: row.library_layout ?? null,
      paired: files.length >= 2,
      urls: files,
      md5: (row.fastq_md5 || "").split(";").filter(Boolean),
      bytes: (row.fastq_bytes || "")
        .split(";")
        .filter((b) => /^\d+$/.test(b))
        .map(Number),
      read_count: row.read_count ?? null,
      organism: row.scientific_name ?? null,
    };
  });

  return new Outcome(
    JSON.stringify({
      accession,
      count: runs.length,
      runs,
      ...(truncated
        ? { truncated: true, note: `Showing ${limit} runs; raise \`limit\` for more.` }
        : {}),
      hint:
        "Submit these run accessions to fastq_dump/fasterq_dump in one call. " +
        "The urls are exact and are for the cases that need a direct fetch; " +
        "never edit or construct one.",
    }),
  );
}

/** ENA accession lookup: the real download URLs for a run, experiment, sample or study. */
export function enaTools(): OlitTool[] {
  return [
    {
      name: "ena_runs",
      description:
        "Look up the sequencing runs ENA holds under an accession, with their exact " +
        "FASTQ download URLs, checksums, sizes and whether each run is paired or single " +
        "end. Takes a run (SRR/ERR/DRR), experiment (SRX/ERX/DRX), sample (SAM*/SRS), " +
        "study (PRJ*/SRP) or submission accession. ENA's FASTQ paths cannot be derived " +
        "from an accession - always read them here rather than constructing or guessing " +
        "a URL, and never assume a run is paired without checking.",
      parameters: {
        type: "object",
        properties: {
          accession: {
            type: "string",
            description: "ENA or SRA accession, e.g. 'SRR390728' or 'PRJNA630239'",
          },
          limit: {
            type: "integer",
            description: `Runs to return; defaults to ${RUNS_DEFAULT}, at most ${RUNS_MAX}.`,
          },
        },
        required: ["accession"],
      },
      run: enaRuns,
    },
  ];
}
