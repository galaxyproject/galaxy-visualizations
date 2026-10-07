import { invocationOutcome } from "@galaxyproject/galaxy-ops/browser";

import type { Galaxy } from "./galaxy";
import { quote } from "./quote";
import { NOT_OFFERED } from "./visualizations";
import { invocationJobStates } from "./watch";

const FAILED_FETCH = /Failed to fetch url\s+(\S+)/;
/** ENA and SRA read paths, whose sharding is not derivable from an accession. */
const ARCHIVE_HOSTS = ["ftp.sra.ebi.ac.uk", "ftp.ncbi.nlm.nih.gov", "sra-pub", "sra-download"];
const ACCESSION = /\b[EDS]RR\d{6,}/;

const ARCHIVE_HINT =
  "A sequencing-archive fetch failed. Do not construct another url: ENA and SRA fastq " +
  "paths are not derivable from an accession, and whether a run is paired is a property " +
  "of the run rather than its name. Call `ena_runs` with the accession to read the exact " +
  "urls, checksums and layout. For more than a couple of runs, submit the accessions to " +
  "fastq_dump/fasterq_dump in one call instead of fetching urls at all.";

const GENERIC_HINT =
  "A url fetch failed. Do not retry with another url written from memory; a url that was " +
  "not read from a tool result or given by the user is a guess. Establish the real " +
  "location first, or tell the user what you could not find.";

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Every dataset-shaped object in a tool result, however the tool nests them. */
function datasets(result: unknown): Row[] {
  if (Array.isArray(result)) {
    return result.filter(isRow);
  }
  if (!isRow(result)) {
    return [];
  }
  // Not `contents`: a history listing is Galaxy's summary view, which has no misc_info to read.
  const nested = ["outputs", "datasets"].flatMap((key) =>
    Array.isArray(result[key]) ? (result[key] as unknown[]).filter(isRow) : [],
  );
  return [result, ...nested];
}

/** The source url a dataset in this result failed to fetch, or undefined. */
export function failedUrl(result: unknown): string | undefined {
  for (const dataset of datasets(result)) {
    if (dataset.state === "error") {
      const found = FAILED_FETCH.exec(String(dataset.misc_info || ""));
      if (found) {
        return found[1];
      }
    }
  }
  return undefined;
}

/** The triage line this result earns, or undefined when nothing failed to fetch. */
export const IWC_CANDIDATES_HINT =
  "[olit] These are ranked by word overlap, not relevance. Before offering one, call " +
  "`get_iwc_workflow_details` on the plausible candidates and check their inputs " +
  "against the data the user actually has (reads vs count tables, paired vs single-end). " +
  "A workflow that needs another's outputs first is half of a chain, not a match. If none " +
  "fit, say so. If nothing came back, retry once with just the assay; if the query had no " +
  "searchable terms, ask the user what they want to find out.";

export const IWC_LISTINGS = new Set(["recommend_iwc_workflows", "search_iwc_workflows"]);

export const iwcCandidatesHint = (name: string) =>
  IWC_LISTINGS.has(name) ? IWC_CANDIDATES_HINT : undefined;

export function fetchFailureHint(result: unknown): string | undefined {
  const url = failedUrl(result);
  if (url === undefined) {
    return undefined;
  }
  const archive = ARCHIVE_HOSTS.some((host) => url.includes(host)) || ACCESSION.test(url);
  return `[olit] ${archive ? ARCHIVE_HINT : GENERIC_HINT}`;
}

/** Searches over the tool catalog, which holds no visualizations. */
export const CATALOG_SEARCHES = new Set(["search_tools_by_name", "search_tools_by_keywords"]);
/** Plugins never offered as a visualization: this agent and a standalone LLM plugin. */

type Plugin = { name?: string; html?: string; tags?: string[] | null };

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z0-9]{3,}/g) ?? []);

/** Whether a search's words name an installed visualization: its name, display title or a tag. */
async function namesVisualization(galaxy: Galaxy, query: string): Promise<boolean> {
  const wanted = words(query);
  if (!wanted.size) {
    return false;
  }
  const installed: Plugin[] = (await galaxy.get("api/plugins")) || [];
  return installed.some(
    (plugin) =>
      plugin.name &&
      !NOT_OFFERED.has(plugin.name) &&
      [...words([plugin.name, plugin.html ?? "", ...(plugin.tags ?? [])].join(" "))].some((word) =>
        wanted.has(word),
      ),
  );
}

/** Where a tool search that found nothing was looking: a visualization the catalog does not hold. */
export async function catalogMissHint(
  galaxy: Galaxy,
  name: string,
  args: Record<string, unknown>,
  data: unknown,
): Promise<string | undefined> {
  const empty =
    !data || (Array.isArray(data) && !data.length) || (isRow(data) && !Object.keys(data).length);
  if (!CATALOG_SEARCHES.has(name) || !empty) {
    return undefined;
  }
  const query = (args.query as string) || ((args.keywords as string[]) || []).join(" ");
  if (!(await namesVisualization(galaxy, query))) {
    return undefined;
  }
  return (
    `[olit] No Galaxy tool matched '${query}', which names an installed visualization. ` +
    "Visualizations are not in the tool catalog: list_visualizations names the ones that can " +
    "render a given dataset."
  );
}

/** Invocations in a listing rolled up from their jobs, one Galaxy call each. */
const ROLLUP_LIMIT = 20;

const OUTCOME_NOTES: Record<string, string> = {
  failed:
    "A job in this invocation failed. Galaxy's `state` describes scheduling only. Report the " +
    "failure rather than the state, and read the failing dataset's get_job_details before " +
    "proposing a repair.",
  failing:
    "A job in this invocation failed while others are still running. The run is not over, so do " +
    "not report it as finished, and do not repair it until it settles.",
  cancelled: "This invocation was cancelled, so its outputs are incomplete.",
};

/**
 * What an invocation's jobs make of it, as galaxy-ops reads one by id: a listing carries only
 * Galaxy's `state`, which describes scheduling, so each listed one whose jobs say otherwise is named.
 */
export async function invocationOutcomeHint(
  galaxy: Galaxy,
  name: string,
  data: unknown,
): Promise<string | undefined> {
  if (name !== "get_invocations") {
    return undefined;
  }
  if (isRow(data)) {
    const note = OUTCOME_NOTES[String(data.outcome)];
    return note && `[olit] ${note}`;
  }
  const lines: string[] = [];
  const listed = Array.isArray(data) ? data : [];
  const unchecked: string[] = [];
  for (const row of listed.slice(0, ROLLUP_LIMIT)) {
    if (!isRow(row) || typeof row.id !== "string") {
      continue;
    }
    const states = await invocationJobStates(galaxy, row.id).catch(() => undefined);
    if (!states) unchecked.push(row.id);
    const outcome = states && invocationOutcome(row.state as string | undefined, states);
    if (outcome && outcome !== row.state) {
      const note = OUTCOME_NOTES[outcome];
      lines.push(
        `[olit] Invocation ${row.id}: outcome ${quote(outcome)}, jobs ${JSON.stringify(states)}.` +
          (note ? ` ${note}` : ""),
      );
    }
  }
  const beyond = Math.max(0, listed.length - ROLLUP_LIMIT);
  if (unchecked.length || beyond) {
    const which = [
      unchecked.length ? `${unchecked.join(", ")} (their jobs could not be read)` : "",
      beyond ? `the ${beyond} listed after the first ${ROLLUP_LIMIT}` : "",
    ].filter(Boolean);
    lines.push(
      `[olit] Jobs were not checked for ${which.join(" and ")}; their \`state\` describes ` +
        "scheduling only, so read one by id before reporting how it went.",
    );
  }
  return lines.length ? lines.join("\n") : undefined;
}
