import type { Galaxy } from "./galaxy";
import { NOT_OFFERED } from "./visualizations";

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

const IWC_LISTINGS = new Set(["recommend_iwc_workflows", "search_iwc_workflows"]);

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
const CATALOG_SEARCHES = new Set(["search_tools_by_name", "search_tools_by_keywords"]);
/** Plugins never offered as a visualization: this agent and a standalone LLM plugin. */

/** The installed visualization this query names. */
async function visualizationNamed(galaxy: Galaxy, query: string): Promise<string | undefined> {
  const wanted = query.trim().toLowerCase();
  const installed: { name?: string }[] = (await galaxy.get("api/plugins")) || [];
  return installed
    .map((plugin) => plugin.name)
    .find((name) => name && !NOT_OFFERED.has(name) && name.toLowerCase() === wanted);
}

/** Where the thing this search did not find actually lives, or undefined. */
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
  const plugin = await visualizationNamed(galaxy, query);
  if (!plugin) {
    return undefined;
  }
  return (
    `[olit] '${plugin}' is a visualization, which the tool catalog does not hold. ` +
    "list_visualizations names the ones that can render a given dataset."
  );
}
