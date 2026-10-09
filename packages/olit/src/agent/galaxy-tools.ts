import { quote } from "./quote";
import { contentHash, malformedObjectIds } from "@galaxyproject/galaxy-ops/browser";

import { inventedEmbed } from "./artifacts";
import * as biocontainers from "./biocontainers";
import { HttpError, NotAnId, segment, type Galaxy } from "./galaxy";
import * as tables from "./tables";
import {
  catalogMissHint,
  fetchFailureHint,
  invocationOutcomeHint,
  iwcCandidatesHint,
} from "./hints";
import { ELIDED } from "./notebook";
import { pageBody, pageContentProblem } from "./page-edit";
import { type Annotate, type OpPolicy } from "./ops";
import { remember, sectionsHeaded, serialized, shownAs } from "./record-write";
import { fail, Outcome, rendered, type Capability, type Context, type OlitTool } from "./tool";

export const DATA_DIR = "/data";
/** Lines of a downloaded dataset shown in its result. */
export const PREVIEW_LINES = 50;
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
const HEADING = /^#{1,6}\s+\S/;

/** Keep the page a call answered with as what this session's agent was shown. */
function shownPage<T>(envelope: T, args: Record<string, unknown>, ctx: Context): T {
  const { success, data } = envelope as { success?: boolean; data?: Record<string, unknown> };
  if (success && data && (data.content_editor != null || data.content != null)) {
    remember(ctx.binding.sessionId, String(args.page_id), pageBody(data));
  }
  return envelope;
}

/**
 * A section edit's arguments against the page as it is now. The session writes its own lines
 * into the record, so a hash read before one of them no longer matches; when the agent's read
 * is known and the sections it replaces are unchanged since, the edit is checked against the
 * current hash instead. Anything else is sent as given, and galaxy-ops refuses a stale hash.
 */
async function againstCurrent(
  args: Record<string, unknown>,
  ctx: Context,
): Promise<Record<string, unknown>> {
  const { expect_hash: read, section_heading: heading, page_id: pageId } = args;
  if (typeof read !== "string" || typeof heading !== "string" || args.content != null) {
    return args;
  }
  const base = shownAs(ctx.binding.sessionId, String(pageId), read);
  if (base === undefined) {
    return args;
  }
  let current: string;
  try {
    current = pageBody((await ctx.galaxy.get(`api/pages/${segment(String(pageId))}`)) || {});
  } catch {
    return args;
  }
  const now = contentHash({ content_editor: current });
  const same =
    JSON.stringify(sectionsHeaded(base, heading)) ===
    JSON.stringify(sectionsHeaded(current, heading));
  return now !== read && same ? { ...args, expect_hash: now } : args;
}

/** A refusal for a section edit that would leave its text without a heading in the record. */
function headingless(args: Record<string, unknown>) {
  if (args.section_heading == null) {
    return undefined;
  }
  const heading = String(args.section_heading).trim();
  if (!HEADING.test(heading)) {
    return fail(
      `Refused: section_heading is the heading line itself, such as ${quote(`## ${heading}`)}, ` +
        "not the title alone; a line the page does not hold as a heading appends the text " +
        "under no heading.",
    );
  }
  const first = String(args.section_content ?? "")
    .trimStart()
    .split("\n")[0];
  return HEADING.test(first)
    ? undefined
    : fail(
        "Refused: section_content replaces the whole section, heading line included, so it " +
          `starts with ${quote(heading)}; without it the record loses the heading.`,
      );
}

/** A refusal for page content Galaxy would not render, before it is sent. */
const invalidPage = async (content: unknown) => {
  const problem =
    typeof content === "string"
      ? (pageContentProblem(content) ?? inventedEmbed(content) ?? undefined)
      : undefined;
  return problem ? fail(`Refused: ${problem}`) : undefined;
};

/**
 * Olit's policy over galaxy-ops operations it runs but does not own: a refusal of its own before
 * the call, a queue the call waits its turn in, or an answer to galaxy-ops' refusal.
 */
export const OPS_POLICY: Record<string, OpPolicy> = {
  // Galaxy runs a tool on a dataset from another history, so galaxy-ops does too. An agent that
  // does so has nearly always copied the wrong id, and the job answers a question nobody asked.
  run_tool: {
    check: async (args, ctx) => {
      const unread = await unreadInputs(ctx.galaxy, args);
      if (unread) {
        return unread;
      }
      const foreign = await foreignInputs(ctx.galaxy, args.inputs, String(args.history_id));
      return foreign.length
        ? fail(
            `Refused: these inputs are in another history, not in history ${args.history_id} ` +
              `where this job runs: ${JSON.stringify(foreign)}. An id from another history is ` +
              "usually the wrong one: take the input's `id` from get_history_contents for this " +
              "history. If the user does mean that data, say which history it is in and ask them " +
              "to copy it into this one in Galaxy, then use the copy's id.",
          )
        : undefined;
    },
  },
  update_history: { destructiveWhen: (args) => args.deleted === true },
  create_page: { check: async (args) => invalidPage(args.content) },
  // A revert rewrites the page too, so it waits its turn behind the session's own record writes.
  revert_page_revision: { around: (call) => serialized(() => call()) },
  get_page: { around: (call, args, ctx) => call().then((out) => shownPage(out, args, ctx)) },
  get_dataset_details: { polls: "dataset_id" },
  get_job_details: { polls: "dataset_id" },
  get_invocations: { polls: "invocation_id" },
  search_tools_by_keywords: { settled: true },
  search_tools_by_name: { settled: true },
  // Every write to a page waits its turn in the session's record queue, so a marker written
  // between its read and its write is kept; a directive id galaxy-ops refuses is answered with
  // where the id the agent wanted comes from.
  update_page: {
    check: async (args) =>
      String(args.content ?? "").includes(ELIDED)
        ? fail(
            "Refused: this content still holds the record excerpt's elision marker, so it would delete the elided middle. Edit a section instead.",
          )
        : (headingless(args) ?? invalidPage(args.section_content ?? args.content)),
    around: (call, args, ctx) =>
      serialized(async () => shownPage(await call(await againstCurrent(args, ctx)), args, ctx)),
    refused: (message, args) =>
      malformedObjectIds(String(args.section_content ?? args.content ?? "")).length
        ? new Outcome(
            `${message} For an artifact you just made, write {{artifact}} where it belongs and ` +
              "the directive is built for you.",
            true,
            "malformed-object-id",
          )
        : undefined,
  },
};

/**
 * What Olit adds to a galaxy-ops result: where a missed search lives, what listed invocations'
 * jobs make of them, or fetch-failure triage.
 */
export const annotate: Annotate = async (name, args, data, ctx) =>
  iwcCandidatesHint(name) ??
  (await catalogMissHint(ctx.galaxy, name, args, data)) ??
  (await invocationOutcomeHint(ctx.galaxy, name, data)) ??
  fetchFailureHint(data);

type Row = Record<string, any>;

const isRow = (value: unknown): value is Row =>
  !!value && typeof value === "object" && !Array.isArray(value);

const STR = { type: "string" };
/**
 * Sources a history owns: where each answers its history_id, and how to ask for little more than
 * that, without a dataset's details or a collection's elements.
 */
const HISTORY_SCOPED_SRCS: Record<string, { path: string; brief: string }> = {
  hda: { path: "api/datasets", brief: "?keys=history_id,name" },
  hdca: { path: "api/dataset_collections", brief: "?view=collection" },
};

/** How many references are looked up at once. */
const LOOKUPS = 4;

/** Every history-scoped reference in a tool payload, with the field that carries it. */
export function hdaInputs(inputs: unknown): [string, string, string][] {
  const found: [string, string, string][] = [];
  const walk = (name: string, value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(`${name}[${index}]`, item));
    } else if (isRow(value)) {
      if (Object.hasOwn(HISTORY_SCOPED_SRCS, value.src) && value.id) {
        found.push([name, value.id, value.src]);
        return;
      }
      for (const [key, item] of Object.entries(value)) {
        walk(name ? `${name}.${key}` : key, item);
      }
    }
  };
  walk("", inputs || {});
  return found;
}

/**
 * Whether Galaxy's legacy tool state reads `key` for these declared inputs: a parameter by its
 * name, a repeat's instance as `name_N|`, a conditional or section member as `name|`, the way
 * `_populate_state_legacy` builds its keys. Galaxy runs the tool without any key it does not read.
 */
function reads(declared: unknown, key: string): boolean {
  return ((declared as Row[]) || []).filter(isRow).some((p) => {
    const name = String(p.name ?? "");
    if (!name) {
      return false;
    }
    if (p.type === "repeat" || p.type === "upload_dataset") {
      const instance = key.match(/^(.+?)_\d+\|(.+)$/);
      return instance?.[1] === name && reads(p.inputs, instance[2]);
    }
    if (p.type === "conditional") {
      const test = p.test_param?.name;
      if (key === test) {
        return true;
      }
      const rest = key.startsWith(`${name}|`) ? key.slice(name.length + 1) : undefined;
      return (
        rest !== undefined &&
        (rest === test || ((p.cases as Row[]) || []).some((c) => reads(c.inputs, rest)))
      );
    }
    if (p.type === "section") {
      return key.startsWith(`${name}|`) && reads(p.inputs, key.slice(name.length + 1));
    }
    return key === name;
  });
}

/** The keys Galaxy reads for these declared inputs, a repeat's shown by its first instance. */
function keysOf(declared: unknown, prefix = ""): string[] {
  return ((declared as Row[]) || []).filter(isRow).flatMap((p) => {
    const key = `${prefix}${p.name}`;
    if (p.type === "repeat" || p.type === "upload_dataset") {
      return keysOf(p.inputs, `${key}_0|`);
    }
    if (p.type === "conditional") {
      const cases = ((p.cases as Row[]) || []).flatMap((c) => keysOf(c.inputs, `${key}|`));
      return [`${key}|${p.test_param?.name}`, ...new Set(cases)];
    }
    return p.type === "section" ? keysOf(p.inputs, `${key}|`) : [key];
  });
}

/** A refusal for input keys Galaxy would not read, which it otherwise drops without a word. */
async function unreadInputs(galaxy: Galaxy, args: Row) {
  if (!isRow(args.inputs)) {
    return undefined;
  }
  const version = args.tool_version ? `&tool_version=${encodeURIComponent(args.tool_version)}` : "";
  let schema: unknown;
  try {
    schema = await galaxy.get(`api/tools/${segment(args.tool_id)}?io_details=true${version}`);
  } catch {
    return undefined;
  }
  if (!isRow(schema) || !Array.isArray(schema.inputs)) {
    return undefined;
  }
  // Galaxy expands an unversioned id, and serves its newest version when the one asked for is
  // missing; a schema for another tool or version is not this run's, so Galaxy has the say.
  const id = String(schema.id ?? "");
  const tool = String(args.tool_id);
  if (!(id === tool || id.startsWith(`${tool}/`))) {
    return undefined;
  }
  if (args.tool_version && schema.version !== args.tool_version) {
    return undefined;
  }
  const unread = Object.keys(args.inputs).filter(
    (key) =>
      !key.startsWith("__") && !key.endsWith("|__identifier__") && !reads(schema.inputs, key),
  );
  if (!unread.length) {
    return undefined;
  }
  return fail(
    `Refused: ${args.tool_id} has no parameter at ${unread.map(quote).join(", ")}, so Galaxy ` +
      `would run it without ${unread.length > 1 ? "them" : "it"}. Its keys are ` +
      `${keysOf(schema.inputs).map(quote).join(", ")}; a repeat takes one instance per ` +
      `\`name_0|\`, \`name_1|\`, and a parameter that takes several datasets takes them under ` +
      `its own key as {"values": [...]}.`,
  );
}

/**
 * Inputs that belong to a history other than the one the job will run in, each looked up once. An
 * id Galaxy will not resolve is not known to be foreign: the run is left to report it.
 */
async function foreignInputs(galaxy: Galaxy, inputs: unknown, historyId: string) {
  const refs = hdaInputs(inputs);
  const distinct = [...new Set(refs.map(([, id, src]) => `${src}/${id}`))];
  const found = new Map<string, Row>();
  const lookup = async () => {
    for (let ref = distinct.pop(); ref !== undefined; ref = distinct.pop()) {
      const [src, id] = [ref.slice(0, ref.indexOf("/")), ref.slice(ref.indexOf("/") + 1)];
      try {
        const detail = await galaxy.get(
          `${HISTORY_SCOPED_SRCS[src].path}/${segment(id)}${HISTORY_SCOPED_SRCS[src].brief}`,
        );
        if (isRow(detail)) found.set(ref, detail);
      } catch (e) {
        if (!(e instanceof HttpError || e instanceof NotAnId)) throw e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(LOOKUPS, distinct.length) }, lookup));
  return refs.flatMap(([input, id, src]) => {
    const detail = found.get(`${src}/${id}`);
    const where = detail?.history_id;
    return where && where !== historyId
      ? [{ input, supplied_id: id, history_id: where, name: detail?.name ?? null }]
      : [];
  });
}

/** Python's `str.splitlines`. */
function splitLines(text: string): string[] {
  const lines = text.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/);
  if (lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function decodeUtf8(bytes: Uint8Array): string | undefined {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

/** A line-aligned prefix, or undefined if the datatype cannot be chunked. */
async function chunk(galaxy: Galaxy, datasetId: string, size: number): Promise<string | undefined> {
  try {
    const got = await galaxy.get(
      `api/datasets/${segment(datasetId)}/display?offset=0&ck_size=${segment(size)}`,
    );
    return isRow(got) ? (got.ck_data ?? undefined) : undefined;
  } catch {
    return undefined;
  }
}

async function downloadDataset(args: Row, { galaxy, python }: Context) {
  const details = (await galaxy.get(`api/datasets/${segment(args.dataset_id)}`)) || {};
  const state = isRow(details) ? details.state : undefined;
  if (state !== "ok") {
    return fail(
      `Dataset is in state ${quote(state)}, not "ok", so it holds nothing to read yet. ` +
        "Wait for the job producing it to finish and download it again.",
    );
  }
  const stated = details.file_size;
  let partial = false;
  let data: Uint8Array;
  if (Number.isInteger(stated) && stated > MAX_DOWNLOAD_BYTES) {
    // Only Galaxy's tabular datatypes serve a chunk of themselves; any other ignores the offset
    // and streams the whole file, and BAM answers with SAM text.
    const tabular = tables.isTable(details);
    const prefix = tabular ? await chunk(galaxy, args.dataset_id, MAX_DOWNLOAD_BYTES) : undefined;
    if (prefix === undefined) {
      return fail(
        `Dataset is ${(stated / 1e6).toFixed(1)} MB, over the ${MAX_DOWNLOAD_BYTES / 1e6} MB a ` +
          `download reads, and Galaxy cannot serve ${quote(details.extension)} data in parts. ` +
          "Run a Galaxy tool on it instead.",
      );
    }
    data = new TextEncoder().encode(prefix);
    partial = true;
  } else {
    data = await galaxy.bytes(`api/datasets/${segment(args.dataset_id)}/display`);
  }
  const path = `${DATA_DIR}/${args.dataset_id}.dat`;
  await python.write(path, data);

  const out: Row = { dataset_id: args.dataset_id, path, bytes: data.length };
  for (const [key, field] of [
    ["extension", "extension"],
    ["delimiter", "metadata_delimiter"],
  ]) {
    if (details[field] != null) {
      out[key] = details[field];
    }
  }
  if (partial) {
    Object.assign(out, { partial: true, bytes_total: stated });
  }
  const text = decodeUtf8(data);
  if (text === undefined) {
    return Object.assign(out, { binary: true, preview: null, lines: null, truncated: false });
  }
  const lines = splitLines(text);
  return Object.assign(out, {
    binary: false,
    lines: lines.length,
    preview: lines.slice(0, PREVIEW_LINES).join("\n"),
    truncated: lines.length > PREVIEW_LINES,
  });
}

/** A fetch payload placing one element into a history. */
function fetchPayload(element: Row, historyId: string | undefined) {
  const payload: Row = { targets: [{ destination: { type: "hdas" }, elements: [element] }] };
  if (historyId) {
    payload.history_id = historyId;
  }
  return payload;
}

async function uploadFile(args: Row, { galaxy, python }: Context) {
  const path: string = args.path;
  const raw = await python.read(path);
  if (raw === undefined) {
    return fail(`No such file: ${path}`);
  }
  const text = decodeUtf8(raw);
  if (text === undefined) {
    return fail(
      "Cannot upload binary content: Galaxy accepts pasted uploads as text only. " +
        "Use upload_file_from_url for binary data.",
    );
  }
  const element = {
    src: "pasted",
    paste_content: text,
    ext: args.file_type ?? "auto",
    dbkey: args.dbkey ?? "?",
    name: args.file_name || path.split("/").pop(),
  };
  return galaxy.post("api/tools/fetch", fetchPayload(element, args.history_id));
}

async function recommendBiocontainer(args: Row, ctx: Context) {
  try {
    return await biocontainers.recommend(args.packages || [], ctx.web.fetch);
  } catch (error) {
    return fail((error as Error).message);
  }
}

type Run = (args: Row, ctx: Context) => Promise<unknown>;

/**
 * What Olit says of the two tools that work on the browser's in-memory filesystem, which
 * galaxy-mcp's docstrings describe as the server's own disk, and of the image resolver, which
 * reads quay.io's tag listing rather than galaxy-mcp's mulled extra.
 */
const LOCAL_DOCS: Record<string, string> = {
  download_dataset:
    "Save a Galaxy dataset to the local filesystem.\n\nReturns `path`, `bytes`, `binary`, and for text data `lines`, a `preview` of the first 50 lines and `truncated`. Fetched as raw bytes, so BAM/HDF5/gzip arrive intact. The file lives in the browser's in-memory filesystem, which persists for the session, so read it with run_python -- text with `pandas.read_csv(path, sep='\\t')`, binary with `open(path, 'rb')` or a suitable library. Do not paste the preview into code: it is a sample, and re-emitting file content as a string breaks on tabs and newlines.",
  recommend_biocontainer:
    'Resolve a verified quay.io/biocontainers image for a conda package.\n\nUse this to pick the ``container`` of a user-defined tool instead of guessing an image, before the definition is written, as the udt-authoring skill says to do first. The result is read from quay.io\'s tag listing rather than hallucinated, which avoids the most common user-defined-tool failure: inventing a tag, or using a bare image (e.g. "python:3.12-slim") that doesn\'t ship the libraries the tool imports.\n\nArgs:\n    packages: The conda packages the tool wraps, each as "name" or "name=version" (e.g. ["samtools=1.17"]). Use canonical conda names you would `conda install` (e.g. "pandas", "r-ggplot2", "samtools"). A single package yields a single-package image. Several need a mulled-v2 image, which a tag listing cannot resolve: the result then holds no image and a note saying so.\n\nReturns:\n    - image: the resolved quay.io/biocontainers/... reference, or null if none.\n    - found: whether an image was resolved.\n    - match_quality: "exact_version" | "name_only" | "not_found" (name_only means no version was pinned, so the newest built tag was used; a pinned version with no built tag is not_found).\n    - source, notes: provenance and any explanatory notes.\n    - verified: true if the tag is built on quay.io, false if the pinned version is not, null if it could not be checked.\n\nNEXT STEPS:\n- If match_quality is "exact_version" and verified is not false, use data["image"] as the "container".\n- If match_quality is "name_only", show the user which image you got before using it.\n- If image is null, don\'t guess a tag: tell the user no built image was found for those packages and ask how to proceed.',
  upload_file:
    "Upload a file from the local filesystem to a Galaxy history.\n\nReads the path from the browser's in-memory filesystem, so it pairs with run_python: write a result to a file, then upload it. Sent to Galaxy as pasted content. Use upload_file_from_url to ingest directly from a URL instead.\n\nAn upload is a Galaxy job: the dataset comes back before it is readable. Wait for it to reach 'ok' (check its state with get_dataset_details) before running a tool on it or charting it.",
};

/** A tool Olit runs itself, under galaxy-mcp's name and its own description, with fetch-failure
 * triage appended. */
function tool(
  name: string,
  capability: Capability,
  properties: Record<string, unknown>,
  required: string[],
  run: Run,
): OlitTool {
  return {
    name,
    description: LOCAL_DOCS[name],
    capability,
    parameters: { type: "object", properties, required },
    run: async (args, ctx) => {
      const value = await run(args, ctx);
      const hint = value instanceof Outcome ? undefined : fetchFailureHint(value);
      if (!hint) return value;
      return new Outcome(`${rendered({ data: value })}\n\n${hint}`, false, undefined, value);
    },
  };
}

export function galaxyTools(): OlitTool[] {
  return [
    tool("download_dataset", "read", { dataset_id: STR }, ["dataset_id"], downloadDataset),
    tool(
      "upload_file",
      "write",
      { path: STR, history_id: STR, file_name: STR, file_type: STR, dbkey: STR },
      ["path"],
      uploadFile,
    ),
    tool(
      "recommend_biocontainer",
      "read",
      { packages: { type: "array", items: { type: "string" } } },
      ["packages"],
      recommendBiocontainer,
    ),
  ];
}
