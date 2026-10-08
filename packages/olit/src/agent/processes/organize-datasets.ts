import { quote } from "../quote";
import { query, segment, type Galaxy } from "../galaxy";
import { chunkItems, groupDatasets, type Grouping } from "./dataset-grouping";
import { type Process, type State } from "./process";

export const BATCH = 1000;
const NAME_SAMPLE = 10;

type Dataset = Record<string, any>;

/** Names Galaxy already stores compressed that this datatype would relabel plain. */
export function compressionLost(
  datatype: string | null | undefined,
  datasets: Dataset[],
): string[] {
  if (!datatype || [".gz", ".bz2", ".zip"].some((ext) => datatype.endsWith(ext))) {
    return [];
  }
  const names = datasets
    .filter(
      (d) => String(d.extension || "").endsWith(".gz") || String(d.name || "").endsWith(".gz"),
    )
    .map((d) => String(d.name || d.id));
  return [...new Set(names)].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

function bulk(
  galaxy: Galaxy,
  historyId: string,
  operation: string,
  items: unknown[],
  params: unknown,
) {
  return galaxy.put(`api/histories/${segment(historyId)}/contents/bulk`, {
    operation,
    items,
    params,
  });
}

function collection(
  galaxy: Galaxy,
  historyId: string,
  name: string,
  collectionType: string,
  elements: unknown[],
) {
  return galaxy.post("api/dataset_collections", {
    history_id: historyId,
    name,
    type: "dataset_collection",
    collection_type: collectionType,
    element_identifiers: elements,
  });
}

async function organize(
  galaxy: Galaxy,
  {
    history_id,
    collection_name,
    include,
    structure,
    datatype,
    tags,
    sample_regex,
  }: Record<string, any>,
): Promise<State> {
  // This endpoint filters through q/qv; a plain `visible` or `deleted` is ignored.
  const contents: Dataset[] = await galaxy.get(
    `api/histories/${segment(history_id)}/contents${query({ v: "dev", q: ["visible", "deleted"], qv: ["True", "False"] })}`,
  );
  const grouping = groupDatasets({
    datasets: contents,
    structure,
    include,
    sampleRegex: sample_regex,
  });
  if (grouping.empty) {
    return { grouping };
  }

  const wanted = new Set(grouping.items.map((i) => i.id));
  const compressed = compressionLost(
    datatype,
    contents.filter((d) => wanted.has(d.id)),
  );
  if (compressed.length) {
    return { compression_lost: { datatype, names: compressed } };
  }

  // Galaxy detects the datatype on upload, so most of these are usually already right.
  let already = new Set<unknown>();
  if (datatype) {
    already = new Set(contents.filter((d) => d.extension === datatype).map((d) => d.id));
    const pending = grouping.items.filter((i) => !already.has(i.id));
    for (const batch of chunkItems(pending, BATCH)) {
      await bulk(galaxy, history_id, "change_datatype", batch, {
        type: "change_datatype",
        datatype,
      });
    }
  }

  const built = await collection(
    galaxy,
    history_id,
    collection_name,
    grouping.structure,
    grouping.elements,
  );

  // Files that did not pair get their own collection rather than being dropped.
  const leftovers = grouping.has_leftovers
    ? await collection(galaxy, history_id, "Unpaired", "list", grouping.leftovers)
    : null;

  // Tags belong to the collection, which the per-dataset route cannot address.
  if (tags?.length) {
    await bulk(
      galaxy,
      history_id,
      "add_tags",
      [{ id: built.id, history_content_type: "dataset_collection" }],
      { type: "add_tags", tags: [...tags] },
    );
  }

  return {
    grouping,
    collection: built,
    leftovers,
    batches: Boolean(datatype),
    datatype_already_set: datatype ? already.size : 0,
  };
}

function sample(names: string[] = []) {
  return {
    count: names.length,
    names: names.slice(0, NAME_SAMPLE),
    ...(names.length > NAME_SAMPLE ? { truncated: true } : {}),
  };
}

/** Counts and a sample of names. The payload itself must never reach the model. */
export function summarizeState(state: State): State | null {
  const lost = state.compression_lost;
  if (lost) {
    return {
      ok: false,
      error:
        `Refused: ${quote(lost.datatype)} would relabel ` +
        `${lost.names.length} compressed dataset(s) as uncompressed.`,
      use: `${lost.datatype}.gz`,
      datasets: lost.names.slice(0, NAME_SAMPLE),
    };
  }
  const grouping: Grouping | undefined = state.grouping;
  if (!grouping || typeof grouping !== "object") {
    return null;
  }
  if (grouping.empty) {
    return {
      ok: false,
      error: `Nothing was organized: no datasets formed a ${grouping.structure} collection.`,
      unpaired: sample(grouping.unmatched),
      out_of_scope: sample(grouping.out_of_scope),
    };
  }
  const built = state.collection || {};
  const leftovers = state.leftovers || {};
  return {
    ok: true,
    collection: {
      id: built.id ?? null,
      name: built.name ?? null,
      type: grouping.structure ?? null,
      elements: (grouping.elements || []).length,
    },
    unpaired: { id: leftovers.id || null, ...sample(grouping.unmatched) },
    out_of_scope: sample(grouping.out_of_scope),
    datatype: state.batches
      ? {
          queued: (grouping.items || []).length,
          state: "Galaxy applies these in the background; they are not converted yet",
        }
      : null,
  };
}

export const organizeDatasets: Process = {
  name: "organize_datasets",
  description:
    "Group loose datasets in a history into a collection, tag it, and set their datatype.",
  whenToUse:
    "when the user asks to organise, group, or collect loose datasets in a history, to build " +
    "a collection from files that arrived separately, or to tag or set the datatype of a set " +
    "of datasets",
  capabilities: ["read", "write"],
  inputs: {
    history_id: { type: "string", required: true },
    collection_name: { type: "string", default: "Collection" },
    include: { type: "string", default: "*" },
    structure: {
      type: "string",
      default: "auto",
      help:
        '"auto" pairs on evidence, "paired" (or Galaxy\'s own "list:paired") forces pairing, ' +
        '"list" forces a flat list.',
    },
    datatype: {
      type: "string",
      help:
        "Galaxy's datatype for these files, e.g. 'fastqsanger.gz'. A compressed file keeps " +
        "the compression in its datatype, so gzipped reads are 'fastqsanger.gz' and never " +
        "'fastqsanger'; setting the uncompressed name is refused.",
    },
    tags: { type: "array" },
    sample_regex: {
      type: "string",
      help:
        "Optional regex over each archive path naming a `sample` group and an optional " +
        "`mate` group, e.g. '(?P<sample>[^/]+)/part(?P<mate>[12])'. Use it when the file " +
        "names follow a convention this tool did not infer; read a few names first.",
    },
  },
  run: organize,
  summarize: summarizeState,
};
