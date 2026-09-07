"""The organize_datasets process: history contents -> collection -> tags."""

import asyncio

from olite.drivers.graph import GraphDriver
from olite.registry import ProcessRegistry, load_primitives

load_primitives()

SRA = [
    {"id": f"ds{i}", "name": f"SRR100{n}_{m}.fastq.gz", "history_content_type": "dataset"}
    for i, (n, m) in enumerate([(n, m) for n in (1, 2) for m in (1, 2)])
]
# Files as they arrive from an unzipped archive: no mate markers.
ZIPPED = [
    {"id": f"z{i}", "name": f"run_{i}.txt", "history_content_type": "dataset"} for i in range(3)
]


class FakeCatalog:
    """Answers the three ops the process calls and records what it was asked."""

    def __init__(self, contents):
        self.contents = contents
        self.calls = []

    async def call(self, target, input=None):
        self.calls.append((target, input or {}))
        if target.endswith("contents.get"):
            return {"ok": True, "result": self.contents}
        if target == "galaxy.dataset_collections.post":
            return {"ok": True, "result": {"id": "hdca1", "name": (input or {}).get("name")}}
        if target == "galaxy.histories.show.contents.bulk.put":
            return {"ok": True, "result": {"success_count": len(self.contents), "errors": []}}
        raise AssertionError(f"unexpected op: {target}")

    def targets(self):
        return [t for t, _ in self.calls]

    def input_for(self, suffix):
        return next(i for t, i in self.calls if t.endswith(suffix))


class FakeManifest:
    def allows(self, capability):
        return True


class FakeSubstrate:
    def __init__(self, contents):
        self.catalog = FakeCatalog(contents)
        self.manifest = FakeManifest()

    def scoped(self, capabilities):
        return self


def _run(contents, **inputs):
    proc = ProcessRegistry().load_packaged().get("organize_datasets")
    assert proc is not None, "organize_datasets not registered"
    substrate = FakeSubstrate(contents)
    args = {"history_id": "h1", "collection_name": "reads", "structure": "auto", "tags": []}
    args.update(inputs)
    result = asyncio.run(GraphDriver(substrate).run(proc.graph, args))
    assert (result.get("last") or {}).get("ok"), f"graph did not complete: {result.get('last')}"
    return substrate.catalog, result


def test_paired_reads_become_a_list_paired_collection():
    catalog, _ = _run(SRA)
    body = catalog.input_for("dataset_collections.post")
    assert body["collection_type"] == "list:paired"
    assert [e["name"] for e in body["element_identifiers"]] == ["SRR1001", "SRR1002"]


def test_unzipped_files_become_a_flat_list():
    catalog, _ = _run(ZIPPED)
    body = catalog.input_for("dataset_collections.post")
    assert body["collection_type"] == "list"
    assert len(body["element_identifiers"]) == 3


def test_tags_are_applied_to_the_new_collection():
    catalog, _ = _run(SRA, tags=["sra", "paired"])
    body = next(i for t, i in catalog.calls if i.get("operation") == "add_tags")
    assert body["items"] == [{"id": "hdca1", "history_content_type": "dataset_collection"}]
    assert body["params"] == {"type": "add_tags", "tags": ["sra", "paired"]}


def test_no_tags_means_no_tag_call():
    catalog, _ = _run(SRA)
    assert not [i for _, i in catalog.calls if i.get("operation") == "add_tags"]


def test_it_only_reads_and_writes_what_the_process_declares():
    catalog, _ = _run(SRA, tags=["sra"], datatype="fastqsanger.gz")
    assert set(catalog.targets()) <= {
        "galaxy.histories.show.contents.get",
        "galaxy.histories.show.contents.bulk.put",
        "galaxy.dataset_collections.post",
    }


def test_a_requested_datatype_retypes_every_dataset_in_one_call():
    catalog, _ = _run(SRA, datatype="fastqsanger.gz")
    body = next(i for t, i in catalog.calls if i.get("operation") == "change_datatype")
    assert body["params"] == {"type": "change_datatype", "datatype": "fastqsanger.gz"}
    assert [i["id"] for i in body["items"]] == [d["id"] for d in SRA]


def test_no_datatype_means_no_write():
    catalog, _ = _run(SRA)
    assert "galaxy.histories.show.contents.bulk.put" not in catalog.targets()


def test_the_datatype_is_set_before_the_collection_is_built():
    catalog, _ = _run(SRA, datatype="fastqsanger.gz")
    order = catalog.targets()
    assert order.index("galaxy.histories.show.contents.bulk.put") < order.index(
        "galaxy.dataset_collections.post"
    )


def test_a_caller_who_names_neither_structure_nor_collection_still_gets_pairs():
    proc = ProcessRegistry().load_packaged().get("organize_datasets")
    substrate = FakeSubstrate(SRA)
    asyncio.run(GraphDriver(substrate).run(proc.graph, {"history_id": "h1"}))
    body = substrate.catalog.input_for("dataset_collections.post")
    assert body["collection_type"] == "list:paired"
    assert body["name"] == "Collection"


def test_a_call_without_a_history_says_so_instead_of_asking_galaxy():
    proc = ProcessRegistry().load_packaged().get("organize_datasets")
    substrate = FakeSubstrate(SRA)
    result = asyncio.run(GraphDriver(substrate).run(proc.graph, {}))
    assert result["last"]["error"]["code"] == "missing_inputs"
    assert "history_id" in result["last"]["error"]["message"]
    assert substrate.catalog.calls == []
