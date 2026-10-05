import { quote } from "./quote";
import { malformedObjectIds } from "@galaxyproject/galaxy-ops/browser";

import * as biocontainers from "./biocontainers";
import { segment, type Galaxy } from "./galaxy";
import { catalogMissHint, fetchFailureHint, iwcCandidatesHint } from "./hints";
import { ELIDED } from "./notebook";
import { UPSTREAM_DOCS, type Annotate, type OpPolicy } from "./ops";
import { serialized } from "./record-write";
import { fail, Outcome, rendered, type Capability, type Context, type OlitTool } from "./tool";

export const DATA_DIR = "/data";
/** Lines of a downloaded dataset shown in its result. */
export const PREVIEW_LINES = 50;
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;
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
  update_history: { destructiveWhen: (args) => args.deleted === true },
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
        : undefined,
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
  iwcCandidatesHint(name) ??
  (await catalogMissHint(ctx.galaxy, name, args, data)) ??
  fetchFailureHint(data);

type Row = Record<string, any>;

const isRow = (value: unknown): value is Row =>
  !!value && typeof value === "object" && !Array.isArray(value);

const STR = { type: "string" };
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

/** Inputs that belong to a history other than the one the job will run in. */
async function foreignInputs(galaxy: Galaxy, inputs: unknown, historyId: string) {
  const foreign = [];
  for (const [name, objectId, src] of hdaInputs(inputs)) {
    const detail = (await galaxy.get(`${HISTORY_SCOPED_SRCS[src]}/${segment(objectId)}`)) || {};
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
