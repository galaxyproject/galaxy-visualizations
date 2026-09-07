"""Group a history's loose datasets into a collection, tag it, set their datatype."""

from olite.registry.extensions.collections.bridge import chunk_items, group_datasets

BATCH = 1000


class ProcessError(Exception):
    """A Galaxy call the process cannot continue without."""

    def __init__(self, target, error):
        super().__init__(f"{target}: {error}")
        self.target, self.error = target, error


async def _call(substrate, target, payload):
    result = await substrate.catalog.call(target, payload)
    if not result.get("ok"):
        raise ProcessError(target, result.get("error"))
    return result.get("result")


async def _bulk(substrate, history_id, operation, items, params):
    return await _call(substrate, "galaxy.histories.show.contents.bulk.put", {
        "history_id": history_id, "operation": operation, "items": items, "params": params,
    })


async def _collection(substrate, history_id, name, collection_type, elements):
    return await _call(substrate, "galaxy.dataset_collections.post", {
        "history_id": history_id, "name": name, "type": "dataset_collection",
        "collection_type": collection_type, "element_identifiers": elements,
    })


async def organize_datasets(substrate, history_id: str, collection_name: str = "Collection",
                            include: str = "*", structure: str = "auto",
                            datatype: str = None, tags: list = None,
                            sample_regex: str = None):
    """Group loose datasets in a history into a collection, tag it, and set their datatype."""
    contents = await _call(substrate, "galaxy.histories.show.contents.get", {
        "history_id": history_id, "v": "dev", "deleted": False, "visible": True,
    })

    grouping = group_datasets(datasets=contents, structure=structure, include=include,
                              sample_regex=sample_regex)
    if grouping["empty"]:
        return {"grouping": grouping}

    # Batched: a 10k history is one oversized request otherwise.
    if datatype:
        for batch in chunk_items(items=grouping["items"], size=BATCH)["batches"]:
            await _bulk(substrate, history_id, "change_datatype", batch,
                        {"type": "change_datatype", "datatype": datatype})

    collection = await _collection(substrate, history_id, collection_name,
                                   grouping["structure"], grouping["elements"])

    # Files that did not pair get their own collection rather than being dropped.
    leftovers = None
    if grouping["has_leftovers"]:
        leftovers = await _collection(substrate, history_id, "Unpaired", "list",
                                      grouping["leftovers"])

    # Bulk again: tags belong to the collection, which the per-dataset route cannot address.
    if tags:
        await _bulk(substrate, history_id, "add_tags",
                    [{"id": collection["id"], "history_content_type": "dataset_collection"}],
                    {"type": "add_tags", "tags": list(tags)})

    return {"grouping": grouping, "collection": collection, "leftovers": leftovers,
            "batches": bool(datatype)}


organize_datasets.capabilities = ["read", "write"]
organize_datasets.inputs_help = {
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
