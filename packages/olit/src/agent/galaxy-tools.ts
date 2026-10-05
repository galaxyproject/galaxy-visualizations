import { quote } from "./quote";
import { malformedObjectIds, validatePagination } from "@galaxyproject/galaxy-ops/browser";

import * as biocontainers from "./biocontainers";
import { query, segment, type Galaxy } from "./galaxy";
import { catalogMissHint, fetchFailureHint } from "./hints";
import { described, ROLLUP_LIMIT, type JobStates } from "./invocation-outcome";
import { UPSTREAM_DOCS, type Annotate, type OpPolicy } from "./ops";
import { pageBody } from "./page-edit";
import { serverPage } from "./paging";
import { serialized } from "./record-write";
import { fail, Outcome, rendered, type Capability, type Context, type OlitTool } from "./tool";

export const DATA_DIR = "/data";
/** Lines of a downloaded dataset shown in its result. */
export const PREVIEW_LINES = 50;
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
/** Top-level fields of `data` that a description tells the model to read. */
export const PROMISED_FIELDS: Record<string, string[]> = {
  get_tool_panel: ["entries"],
  get_tool_citations: ["tool_name", "tool_version", "citations"],
  get_tool_input_template: ["tool_id", "inputs_template", "parameters"],
  get_tool_run_examples: ["tool_id", "requested_version", "test_cases"],
  get_history_details: ["history", "contents_summary"],
  get_collection_details: ["collection_id", "collection", "elements", "elements_truncated", "note"],
  get_workflow_input_template: ["inputs_template", "guide", "warnings"],
};

export const promisedFields = (name: string) => PROMISED_FIELDS[name] ?? [];

/**
 * Olit's policy over galaxy-ops operations it runs but does not own: a refusal of its own before
 * the call, a queue the call waits its turn in, or an answer to galaxy-ops' refusal.
 */
export const OPS_POLICY: Record<string, OpPolicy> = {
  // Galaxy runs a tool on a dataset from another history, so galaxy-ops does too. An agent that
  // does so has nearly always copied the wrong id, and the job answers a question nobody asked.
  run_tool: {
    check: async (args, ctx) => {
      const foreign = await foreignInputs(ctx.galaxy, args.inputs, String(args.history_id));
      return foreign.length
        ? fail(
            `Refused: these inputs do not identify a dataset in history ${args.history_id}: ` +
              `${JSON.stringify(foreign)}. Use the \`id\` field of a dataset returned by ` +
              `get_history_contents for this history. To use data from elsewhere, copy it into ` +
              `this history first.`,
          )
        : undefined;
    },
  },
  // Every write to a page waits its turn in the session's record queue, so a marker written
  // between its read and its write is kept; a directive id galaxy-ops refuses is answered with
  // where the id the agent wanted comes from.
  update_page: {
    around: serialized,
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
  const limit = Math.trunc(args.limit ?? 100);
  const offset = Math.trunc(args.offset ?? 0);
  // galaxy-ops' own window check, so a bad page fails here as it would there.
  validatePagination(limit, offset);
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
  // The data both galaxy-ops and galaxy-mcp answer with, the window beside it.
  const page = serverPage(items.map(oneIdentifier), offset, limit);
  const payload = rendered({
    data: { history_id: args.history_id, contents: page.data },
    pagination: page.pagination,
  });
  const hint = fetchFailureHint(page.data);
  return new Outcome(hint ? `${payload}\n\n${hint}` : payload);
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
  // A blank filter is no filter, as galaxy-ops reads it, not a search for the empty id.
  const params = {
    workflow_id: args.workflow_id || undefined,
    history_id: args.history_id || undefined,
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
    tool("download_dataset", "read", { dataset_id: STR }, ["dataset_id"], downloadDataset),
    tool(
      "upload_file",
      "write",
      { path: STR, history_id: STR, file_name: STR, file_type: STR, dbkey: STR },
      ["path"],
      uploadFile,
    ),
    {
      // Watched by its id, as galaxy-ops says of its own get_invocations.
      ...tool(
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
      polls: "invocation_id",
    },
    tool(
      "recommend_biocontainer",
      "read",
      { packages: { type: "array", items: { type: "string" } } },
      ["packages"],
      recommendBiocontainer,
    ),
  ];
}
