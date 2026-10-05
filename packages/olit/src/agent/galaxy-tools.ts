import { quote } from "./quote";
import { allOperations, runWithEnvelope } from "@galaxyproject/galaxy-ops/browser";

import * as biocontainers from "./biocontainers";
import { query, segment, type Galaxy } from "./galaxy";
import { catalogMissHint, fetchFailureHint } from "./hints";
import { described, ROLLUP_LIMIT, type JobStates } from "./invocation-outcome";
import { UPSTREAM_DOCS, type Annotate } from "./ops";
import { applySectionEdit, djb2Hash, malformedObjectIds } from "./page-edit";
import { serverPage } from "./paging";
import { fail, Outcome, rendered, type Capability, type Context, type OlitTool } from "./tool";

export const DATA_DIR = "/data";
/** Lines of a downloaded dataset shown in its result. */
export const PREVIEW_LINES = 50;
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
/** The log fields Galaxy adds to a job under `full=true`. */
export const JOB_LOG_FIELDS = [
  "tool_stdout",
  "tool_stderr",
  "job_stdout",
  "job_stderr",
  "stdout",
  "stderr",
];
export const JOB_LOG_BYTES = 4 * 1024;

/** Lookups over data Galaxy holds still for a session: the same question returns the same answer. */
export const SETTLED = new Set([
  "search_tools_by_name",
  "search_tools_by_keywords",
  "get_visualization_details",
]);

/** Whether repeating this call with the same arguments can produce anything new. */
export const settled = (name: string) => SETTLED.has(name);

/** Top-level fields of `data` that a description tells the model to read. */
export const PROMISED_FIELDS: Record<string, string[]> = {
  get_tool_panel: ["tool_count", "section_count"],
  get_tool_citations: ["tool_name", "tool_version", "citations"],
  get_tool_input_template: ["tool_id", "inputs_template", "parameters"],
  get_tool_run_examples: ["tool_id", "requested_version", "test_cases"],
  get_history_details: ["history", "contents_summary"],
  get_collection_details: ["collection_id", "collection", "elements", "elements_truncated", "note"],
  get_workflow_input_template: ["inputs_template", "guide", "warnings"],
};

export const promisedFields = (name: string) => PROMISED_FIELDS[name] ?? [];

/** What Olit adds to a galaxy-ops result: where a missed search lives, or fetch-failure triage. */
export const annotate: Annotate = async (name, args, data, ctx) =>
  (await catalogMissHint(ctx.galaxy, name, args, data)) ?? fetchFailureHint(data);

type Row = Record<string, any>;

const isRow = (value: unknown): value is Row =>
  !!value && typeof value === "object" && !Array.isArray(value);

const STR = { type: "string" };
const INT = { type: "integer" };
const BOOL = { type: "boolean" };
const LIMIT = {
  type: "integer",
  description: "Rows per page; the reply names next_offset when more remain.",
};
const OFFSET = {
  type: "integer",
  description: "Rows to skip, from a previous reply's next_offset.",
};

/** A dataset row with only the id a dataset-taking tool accepts. */
function oneIdentifier(item: unknown): unknown {
  if (!isRow(item)) {
    return item;
  }
  const { dataset_id: _, ...rest } = item;
  return rest;
}

async function getHistoryContents(args: Row, { galaxy }: Context) {
  const limit = Math.trunc(args.limit || 100);
  const offset = Math.max(0, Math.trunc(args.offset || 0));
  const wanted: [string, string][] = [];
  if (!args.deleted) {
    wanted.push(["deleted", "False"]);
  }
  if (args.visible ?? true) {
    wanted.push(["visible", "True"]);
  }
  const params = {
    limit: limit + 1,
    offset,
    order: args.order ?? "hid-asc",
    v: "dev",
    q: wanted.map(([field]) => field),
    qv: wanted.map(([, value]) => value),
  };
  const items = await galaxy.get(
    `api/histories/${segment(args.history_id)}/contents${query(params)}`,
  );
  if (!Array.isArray(items)) {
    return items;
  }
  // galaxy-ops' envelope, as the description promises: rows under `data`, `pagination` beside.
  return rendered(serverPage(items.map(oneIdentifier), offset, limit));
}

/** Sources a history owns, and where each one answers its history_id. */
const HISTORY_SCOPED_SRCS: Record<string, string> = {
  hda: "api/datasets",
  hdca: "api/dataset_collections",
};

/** Every history-scoped reference in a tool payload, with the field that carries it. */
export function hdaInputs(inputs: unknown): [string, string, string][] {
  const found: [string, string, string][] = [];
  const walk = (name: string, value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(`${name}[${index}]`, item));
    } else if (isRow(value)) {
      if (value.src in HISTORY_SCOPED_SRCS && value.id) {
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

/** Inputs that belong to a history other than the one the job will run in. */
async function foreignInputs(galaxy: Galaxy, inputs: unknown, historyId: string) {
  const foreign = [];
  for (const [name, objectId, src] of hdaInputs(inputs)) {
    const detail = (await galaxy.get(`${HISTORY_SCOPED_SRCS[src]}/${objectId}`)) || {};
    const where = isRow(detail) ? detail.history_id : undefined;
    if (where && where !== historyId) {
      foreign.push({
        input: name,
        supplied_id: objectId,
        resolves_to_history_id: where,
        resolves_to_name: detail.name ?? null,
      });
    }
  }
  return foreign;
}

/** What the model is told when a tool rejects its inputs. */
export function parameterHelp(detail: string, template: unknown): string {
  if (!template || (isRow(template) && !Object.keys(template).length)) {
    return detail;
  }
  return (
    `${detail}\nThe tool accepts these input keys. Fill this template and resend:\n` +
    JSON.stringify(template, null, 1)
  );
}

/** Galaxy's prose on the paths that answer 500 instead of rejecting the request. */
const PARAMETER_ERROR_PHRASES = ["invalid key structure", "has no attribute"];

/** Whether the tool rejected the inputs, which is when its template is worth attaching. */
function isParameterError(error: unknown): boolean {
  if ((error as { status?: number })?.status === 400) {
    return true;
  }
  return PARAMETER_ERROR_PHRASES.some((phrase) =>
    String((error as Error)?.message ?? error).includes(phrase),
  );
}

/** The shape a tool accepts, built by galaxy-ops, or undefined. */
async function toolInputTemplate(toolId: string | undefined, ctx: Context): Promise<unknown> {
  const op = allOperations.find((o) => o.name === "get_tool_input_template");
  if (!toolId || !op) {
    return undefined;
  }
  try {
    const envelope = await runWithEnvelope(op, { toolId } as never, ctx.ops);
    return envelope.success ? (envelope.data as Row | undefined)?.inputs_template : undefined;
  } catch {
    return undefined;
  }
}

async function runTool(args: Row, ctx: Context) {
  const historyId = args.history_id;
  const inputs = args.inputs || {};
  const foreign = await foreignInputs(ctx.galaxy, inputs, historyId);
  if (foreign.length) {
    return fail(
      `Refused: these inputs do not identify a dataset in history ${historyId}: ` +
        `${JSON.stringify(foreign)}. Use the \`id\` field of a dataset returned by ` +
        `get_history_contents for this history. To use data from elsewhere, copy it into ` +
        `this history first.`,
    );
  }
  try {
    return await ctx.galaxy.post("api/tools", {
      history_id: historyId,
      tool_id: args.tool_id,
      inputs,
      // A request, not a guarantee: Galaxy falls back to an installed version.
      ...(args.tool_version ? { tool_version: args.tool_version } : {}),
    });
  } catch (error) {
    if (!isParameterError(error)) {
      throw error;
    }
    const detail = String((error as Error)?.message ?? error);
    return fail(parameterHelp(detail, await toolInputTemplate(args.tool_id, ctx)));
  }
}

/** Keep both ends of a log: the cause is usually at the end, the context at the start. */
export function ends(text: string, cap: number): string {
  const data = new TextEncoder().encode(text);
  if (data.length <= cap) {
    return text;
  }
  const half = Math.floor(cap / 2);
  const front = data.subarray(0, half);
  const back = data.subarray(data.length - half);
  const cut = front.lastIndexOf(10);
  const head = cut < 0 ? front : front.subarray(0, cut);
  const start = back.indexOf(10);
  const tail = start < 0 ? back : back.subarray(start + 1);
  const dropped = data.length - head.length - tail.length;
  const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
  return `${decode(head)}\n[... ${dropped} of ${data.length} bytes omitted ...]\n${decode(tail)}`;
}

async function getJobDetails(args: Row, { galaxy }: Context) {
  const dataset = (await galaxy.get(`api/datasets/${segment(args.dataset_id)}`)) || {};
  const jobId = dataset.creating_job;
  if (!jobId) {
    return fail(`No creating job for dataset ${args.dataset_id}.`);
  }
  const job = await galaxy.get(`api/jobs/${segment(jobId)}${query({ full: true })}`);
  if (!isRow(job)) {
    return job;
  }
  const out: Row = { ...job };
  for (const field of JOB_LOG_FIELDS) {
    if (typeof out[field] === "string") {
      out[field] = ends(out[field], JOB_LOG_BYTES);
    }
  }
  return out;
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
    const prefix = await chunk(galaxy, args.dataset_id, MAX_DOWNLOAD_BYTES);
    if (prefix === undefined) {
      return fail(
        `Dataset is ${(stated / 1e6).toFixed(1)} MB and cannot be read in chunks. Run a Galaxy tool on it instead.`,
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

async function uploadFileFromUrl(args: Row, { galaxy }: Context) {
  const element: Row = {
    src: "url",
    url: args.url,
    ext: args.file_type ?? "auto",
    dbkey: args.dbkey ?? "?",
    auto_decompress: true,
  };
  if (args.file_name) {
    element.name = args.file_name;
  }
  return galaxy.post("api/tools/fetch", fetchPayload(element, args.history_id));
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

async function jobStates(galaxy: Galaxy, invocationId: string): Promise<JobStates> {
  try {
    const summary = await galaxy.get(`api/invocations/${segment(invocationId)}/jobs_summary`);
    return summary?.states || {};
  } catch {
    return {};
  }
}

async function getInvocations(args: Row, { galaxy }: Context) {
  if (args.invocation_id) {
    const one = await galaxy.get(
      `api/invocations/${segment(args.invocation_id)}${query({ step_details: args.step_details ?? false })}`,
    );
    return described(one, await jobStates(galaxy, args.invocation_id));
  }
  const params = {
    workflow_id: args.workflow_id,
    history_id: args.history_id,
    limit: args.limit,
    view: args.view ?? "collection",
    step_details: args.step_details ?? false,
  };
  const listed = await galaxy.get(`api/invocations${query(params)}`);
  if (!Array.isArray(listed)) {
    return listed;
  }
  const out = [];
  for (const [index, invocation] of listed.entries()) {
    const id = isRow(invocation) ? invocation.id : undefined;
    out.push(
      id && index < ROLLUP_LIMIT ? described(invocation, await jobStates(galaxy, id)) : invocation,
    );
  }
  return out;
}

async function recommendBiocontainer(args: Row) {
  try {
    return await biocontainers.recommend(args.packages || []);
  } catch (error) {
    return fail((error as Error).message);
  }
}

const pageBody = (page: Row) => page.content_editor || page.content || "";

async function getPage(args: Row, { galaxy }: Context) {
  const page = (await galaxy.get(`api/pages/${segment(args.page_id)}`)) || {};
  if (!isRow(page)) {
    return page;
  }
  const out: Row = { ...page, content_hash: djb2Hash(pageBody(page)) };
  if (!args.include_rendered) {
    delete out.content;
  }
  return out;
}

async function updatePage(args: Row, { galaxy }: Context) {
  const malformed = malformedObjectIds(args.content || args.section_content || "");
  if (malformed.length) {
    return new Outcome(
      `These name a Galaxy object by something that is not its encoded id: ` +
        `${malformed.join(", ")}. Galaxy stores that and the embed renders nothing. ` +
        "For an artifact you just made, write {{artifact}} where it belongs and the " +
        "directive is built for you; otherwise use the encoded id a tool returned.",
      true,
      "malformed-object-id",
    );
  }
  const payload: Row = {};
  for (const key of ["title", "content"]) {
    if (args[key] != null) {
      payload[key] = args[key];
    }
  }
  payload.edit_source = "agent";

  const heading = args.section_heading;
  const section = args.section_content;
  const expect = args.expect_hash;
  if (heading || section || expect) {
    const current = (await galaxy.get(`api/pages/${segment(args.page_id)}`)) || {};
    const source = pageBody(current);
    const actual = djb2Hash(source);
    if (expect && expect !== actual) {
      return {
        written: false,
        reason: "the page changed since you read it",
        content_hash: actual,
        content: source,
      };
    }
    if (heading && section != null) {
      payload.content = applySectionEdit(source, heading, section);
    }
  }

  const written = await galaxy.put(`api/pages/${segment(args.page_id)}`, payload);
  if (isRow(written)) {
    written.content_hash = djb2Hash(pageBody(written));
  }
  return written;
}

type Run = (args: Row, ctx: Context) => Promise<unknown>;

/**
 * What Olit says of the two tools that work on the browser's in-memory filesystem, which
 * galaxy-mcp's docstrings describe as the server's own disk.
 */
const LOCAL_DOCS: Record<string, string> = {
  download_dataset:
    "Save a Galaxy dataset to the local filesystem.\n\nReturns `path`, `bytes`, `binary`, and for text data `lines`, a `preview` of the first 50 lines and `truncated`. Fetched as raw bytes, so BAM/HDF5/gzip arrive intact. The file lives in the browser's in-memory filesystem, which persists for the session, so read it with run_python -- text with `pandas.read_csv(path, sep='\\t')`, binary with `open(path, 'rb')` or a suitable library. Do not paste the preview into code: it is a sample, and re-emitting file content as a string breaks on tabs and newlines.",
  upload_file:
    "Upload a file from the local filesystem to a Galaxy history.\n\nReads the path from the browser's in-memory filesystem, so it pairs with run_python: write a result to a file, then upload it. Sent to Galaxy as pasted content. Use upload_file_from_url to ingest directly from a URL instead.\n\nAn upload is a Galaxy job: the dataset comes back before it is readable. Wait for it to reach 'ok' (check its state with get_dataset_details) before running a tool on it or charting it.",
};

/** A tool Olit runs itself, under galaxy-mcp's description, with fetch-failure triage appended. */
function tool(
  name: string,
  capability: Capability,
  properties: Record<string, unknown>,
  required: string[],
  run: Run,
): OlitTool {
  return {
    name,
    description: LOCAL_DOCS[name] ?? UPSTREAM_DOCS[name],
    capability,
    parameters: { type: "object", properties, required },
    run: async (args, ctx) => {
      const value = await run(args, ctx);
      const hint = value instanceof Outcome ? undefined : fetchFailureHint(value);
      return hint ? new Outcome(`${rendered({ data: value })}\n\n${hint}`) : value;
    },
  };
}

export function galaxyTools(): OlitTool[] {
  return [
    tool(
      "get_history_contents",
      "read",
      { history_id: STR, limit: LIMIT, offset: OFFSET, deleted: BOOL, visible: BOOL, order: STR },
      ["history_id"],
      getHistoryContents,
    ),
    tool(
      "run_tool",
      "write",
      { history_id: STR, tool_id: STR, inputs: { type: "object" }, tool_version: STR },
      ["history_id", "tool_id", "inputs"],
      runTool,
    ),
    tool(
      "get_job_details",
      "read",
      { dataset_id: STR, history_id: STR },
      ["dataset_id"],
      getJobDetails,
    ),
    tool("download_dataset", "read", { dataset_id: STR }, ["dataset_id"], downloadDataset),
    tool(
      "upload_file_from_url",
      "write",
      { url: STR, history_id: STR, file_type: STR, dbkey: STR, file_name: STR },
      ["url"],
      uploadFileFromUrl,
    ),
    tool(
      "upload_file",
      "write",
      { path: STR, history_id: STR, file_name: STR, file_type: STR, dbkey: STR },
      ["path"],
      uploadFile,
    ),
    tool(
      "get_invocations",
      "read",
      {
        invocation_id: STR,
        workflow_id: STR,
        history_id: STR,
        limit: INT,
        view: STR,
        step_details: BOOL,
      },
      [],
      getInvocations,
    ),
    tool(
      "recommend_biocontainer",
      "read",
      { packages: { type: "array", items: { type: "string" } } },
      ["packages"],
      recommendBiocontainer,
    ),
    tool("get_page", "read", { page_id: STR, include_rendered: BOOL }, ["page_id"], getPage),
    tool(
      "update_page",
      "write",
      {
        page_id: STR,
        content: STR,
        title: STR,
        section_heading: {
          type: "string",
          description: "The exact heading line of the section to replace.",
        },
        section_content: {
          type: "string",
          description: "The section's new text, heading line included.",
        },
        expect_hash: {
          type: "string",
          description:
            "content_hash from when the page was read; the write is refused if it changed.",
        },
      },
      ["page_id"],
      updatePage,
    ),
  ];
}
