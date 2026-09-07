"""Thin collection/tag/datatype tools, registered only when OLITE_COLLECTION_TOOLS is set.

An experiment: does widening the loop's tool surface reach the same outcome as dispatching
to the organize_datasets process? Off by default so the shipped surface stays Orbit's.
"""

import os

from .galaxy_tools import _STR, _tool


async def _create_dataset_collection(g, a):
    return await g.post(
        "api/dataset_collections",
        {
            "history_id": a["history_id"],
            "name": a["name"],
            "collection_type": a["collection_type"],
            "element_identifiers": a["element_identifiers"],
            "type": "dataset_collection",
        },
    )


async def _change_dataset_datatype(g, a):
    return await g.put(
        f"api/histories/{a['history_id']}/contents/bulk",
        {
            "operation": "change_datatype",
            "items": [{"id": i, "history_content_type": "dataset"} for i in a["dataset_ids"]],
            "params": {"type": "change_datatype", "datatype": a["datatype"]},
        },
    )


async def _add_tags(g, a):
    return await g.put(
        f"api/histories/{a['history_id']}/contents/bulk",
        {
            "operation": "add_tags",
            "items": [{"id": a["item_id"], "history_content_type": a.get("item_type", "dataset")}],
            "params": {"type": "add_tags", "tags": a["tags"]},
        },
    )


def register():
    if not os.environ.get("OLITE_COLLECTION_TOOLS"):
        return
    _tool(
        "create_dataset_collection",
        "write",
        "Build a dataset collection from datasets already in a history. `collection_type` is "
        "'list' for a flat list or 'list:paired' for paired reads. `element_identifiers` is a "
        "list: for a flat list, {'name': <label>, 'src': 'hda', 'id': <dataset id>}; for a pair, "
        "{'name': <sample>, 'src': 'new_collection', 'collection_type': 'paired', "
        "'element_identifiers': [{'name': 'forward', 'src': 'hda', 'id': ...}, "
        "{'name': 'reverse', 'src': 'hda', 'id': ...}]}.",
        {
            "history_id": _STR,
            "name": _STR,
            "collection_type": _STR,
            "element_identifiers": {"type": "array", "items": {"type": "object"}},
        },
        ["history_id", "name", "collection_type", "element_identifiers"],
        _create_dataset_collection,
    )
    _tool(
        "change_dataset_datatype",
        "write",
        "Set the datatype (extension) of one or more datasets in a history, e.g. 'fastqsanger.gz'.",
        {
            "history_id": _STR,
            "dataset_ids": {"type": "array", "items": _STR},
            "datatype": _STR,
        },
        ["history_id", "dataset_ids", "datatype"],
        _change_dataset_datatype,
    )
    _tool(
        "add_tags_to_item",
        "write",
        "Add tags to one history item. `item_type` is 'dataset' or 'dataset_collection'.",
        {
            "history_id": _STR,
            "item_id": _STR,
            "item_type": _STR,
            "tags": {"type": "array", "items": _STR},
        },
        ["history_id", "item_id", "tags"],
        _add_tags,
    )
