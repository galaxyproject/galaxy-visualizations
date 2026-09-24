"""Group a history's loose datasets into a collection, tag it, set their datatype."""

from olit.registry.extensions.collections.bridge import chunk_items, group_datasets
from olit.registry.python.galaxy import call as _call

BATCH = 1000


def compression_lost(datatype, datasets):
    """Names Galaxy already stores compressed that this datatype would relabel plain.

    Galaxy detects `.gz` on upload, so asking for `fastqsanger` over gzipped reads
    mislabels them; the compressed datatype is the same name with `.gz`.
    """
    if not datatype or datatype.endswith((".gz", ".bz2", ".zip")):
        return []
    return sorted(
        {
            str(d.get("name") or d.get("id"))
            for d in datasets
            if str(d.get("extension") or "").endswith(".gz") or str(d.get("name") or "").endswith(".gz")
        }
    )


async def _bulk(substrate, history_id, operation, items, params):
    return await _call(
        substrate,
        "galaxy.histories.show.contents.bulk.put",
        {
            "history_id": history_id,
            "operation": operation,
            "items": items,
            "params": params,
        },
    )


async def _collection(substrate, history_id, name, collection_type, elements):
    return await _call(
        substrate,
        "galaxy.dataset_collections.post",
        {
            "history_id": history_id,
            "name": name,
            "type": "dataset_collection",
            "collection_type": collection_type,
            "element_identifiers": elements,
        },
    )


async def organize_datasets(
    substrate,
    history_id: str,
    collection_name: str = "Collection",
    include: str = "*",
    structure: str = "auto",
    datatype: str = None,
    tags: list = None,
    sample_regex: str = None,
):
    """Group loose datasets in a history into a collection, tag it, and set their datatype."""
    already = set()
    contents = await _call(
        substrate,
        "galaxy.histories.show.contents.get",
        {
            "history_id": history_id,
            "v": "dev",
            "deleted": False,
            "visible": True,
        },
    )

    grouping = group_datasets(datasets=contents, structure=structure, include=include, sample_regex=sample_regex)
    if grouping["empty"]:
        return {"grouping": grouping}

    wanted = {i["id"] for i in grouping["items"]}
    compressed = compression_lost(datatype, [d for d in contents if d.get("id") in wanted])
    if compressed:
        return {"compression_lost": {"datatype": datatype, "names": compressed}}

    # Galaxy detects the datatype on upload, so most of these are usually already right.
    if datatype:
        already = {d.get("id") for d in contents if d.get("extension") == datatype}
        pending = [i for i in grouping["items"] if i["id"] not in already]
        for batch in chunk_items(items=pending, size=BATCH)["batches"]:
            await _bulk(
                substrate, history_id, "change_datatype", batch, {"type": "change_datatype", "datatype": datatype}
            )

    collection = await _collection(substrate, history_id, collection_name, grouping["structure"], grouping["elements"])

    # Files that did not pair get their own collection rather than being dropped.
    leftovers = None
    if grouping["has_leftovers"]:
        leftovers = await _collection(substrate, history_id, "Unpaired", "list", grouping["leftovers"])

    # Bulk again: tags belong to the collection, which the per-dataset route cannot address.
    if tags:
        await _bulk(
            substrate,
            history_id,
            "add_tags",
            [{"id": collection["id"], "history_content_type": "dataset_collection"}],
            {"type": "add_tags", "tags": list(tags)},
        )

    return {
        "grouping": grouping,
        "collection": collection,
        "leftovers": leftovers,
        "batches": bool(datatype),
        "datatype_already_set": len(already) if datatype else 0,
    }


NAME_SAMPLE = 10


def summarize_state(state):
    """Counts and a sample of names. The payload itself must never reach the model."""
    lost = state.get("compression_lost")
    if lost:
        return {
            "ok": False,
            "error": f"Refused: {lost['datatype']!r} would relabel "
            f"{len(lost['names'])} compressed dataset(s) as uncompressed.",
            "use": f"{lost['datatype']}.gz",
            "datasets": lost["names"][:NAME_SAMPLE],
        }
    grouping = state.get("grouping")
    if not isinstance(grouping, dict):
        return None

    def sample(names):
        names = names or []
        out = {"count": len(names), "names": names[:NAME_SAMPLE]}
        if len(names) > NAME_SAMPLE:
            out["truncated"] = True
        return out

    collection = state.get("collection") or {}
    leftovers = state.get("leftovers") or {}
    return {
        "ok": True,
        "collection": {
            "id": collection.get("id"),
            "name": collection.get("name"),
            "type": grouping.get("structure"),
            "elements": len(grouping.get("elements") or []),
        },
        "unpaired": {"id": leftovers.get("id") or None, **sample(grouping.get("unmatched"))},
        "out_of_scope": sample(grouping.get("out_of_scope")),
        "datatype": (
            {
                "queued": len(grouping.get("items") or []),
                "state": "Galaxy applies these in the background; they are not converted yet",
            }
            if state.get("batches")
            else None
        ),
    }


organize_datasets.summarize = summarize_state
organize_datasets.capabilities = ["read", "write"]
organize_datasets.inputs_help = {
    "structure": (
        "'auto' pairs on evidence, 'paired' (or Galaxy's own 'list:paired') forces pairing, "
        "'list' forces a flat list."
    ),
    "datatype": (
        "Galaxy's datatype for these files, e.g. 'fastqsanger.gz'. A compressed file keeps "
        "the compression in its datatype, so gzipped reads are 'fastqsanger.gz' and never "
        "'fastqsanger'; setting the uncompressed name is refused."
    ),
    "sample_regex": (
        "Optional regex over each archive path naming a `sample` group and an optional "
        "`mate` group, e.g. '(?P<sample>[^/]+)/part(?P<mate>[12])'. Use it when the file "
        "names follow a convention this tool did not infer; read a few names first."
    ),
}
organize_datasets.when_to_use = (
    "when the user asks to organise, group, or collect loose datasets in a history, to build "
    "a collection from files that arrived separately, or to tag or set the datatype of a set "
    "of datasets"
)
