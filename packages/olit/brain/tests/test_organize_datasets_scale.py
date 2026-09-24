"""Organising a large history: what Olit sends, and what it hands back.

The capability a user asked for is grouping loose compressed reads into a tagged
collection. Its value depends on holding up at real element counts, so this drives the
process against a recording substrate and asserts the shape of every request it makes.
Galaxy is not involved: this is the half Olit controls.
"""

import asyncio
import json

from olit.registry.python.organize_datasets import BATCH, organize_datasets, summarize_state


class Catalog:
    """Answers the three targets the process calls, and records every request."""

    def __init__(self, contents):
        self.contents = contents
        self.calls = []

    async def call(self, target, payload):
        self.calls.append((target, payload))
        if target.endswith("contents.get"):
            return {"ok": True, "result": self.contents}
        if target.endswith("dataset_collections.post"):
            return {"ok": True, "result": {"id": "coll1", "name": payload.get("name")}}
        return {"ok": True, "result": {"success_count": len(payload.get("items") or [])}}


class Substrate:
    def __init__(self, contents):
        self.catalog = Catalog(contents)


def history(pairs, ext="fasta.gz"):
    """`ext` is what Galaxy currently holds, which is not always what the user wants."""
    return [
        {"name": f"SRR{i:06}_{mate}.fasta.gz", "id": f"{i}_{mate}", "extension": ext, "history_content_type": "dataset"}
        for i in range(pairs)
        for mate in (1, 2)
    ]


def run(pairs, ext="fasta.gz", **kwargs):
    substrate = Substrate(history(pairs, ext))
    state = asyncio.run(organize_datasets(substrate, history_id="h1", collection_name="reads", **kwargs))
    return state, substrate.catalog.calls


def posted(calls):
    return next(p for t, p in calls if t.endswith("dataset_collections.post"))


def bulk(calls):
    return [p for t, p in calls if t.endswith("bulk.put")]


def test_every_pair_reaches_the_collection_exactly_once():
    state, calls = run(5000, datatype="fasta.gz")
    elements = posted(calls)["element_identifiers"]
    assert len(elements) == 5000
    names = [e["name"] for e in elements]
    assert len(set(names)) == 5000, "identifiers must be unique or Galaxy rejects the collection"


def test_a_datatype_already_correct_is_not_rewritten():
    """Galaxy detects most of these on upload, so the common case costs no requests."""
    _, calls = run(5000, datatype="fasta.gz")
    assert bulk(calls) == []


def test_datatype_changes_are_batched_rather_than_sent_one_by_one():
    _, calls = run(5000, ext="data", datatype="fasta.gz")
    batches = bulk(calls)
    assert len(batches) == 10000 // BATCH
    assert all(len(b["items"]) <= BATCH for b in batches)
    assert sum(len(b["items"]) for b in batches) == 10000


def test_the_history_is_read_once_however_large_it_is():
    _, calls = run(5000, datatype="fasta.gz")
    assert sum(1 for t, _ in calls if t.endswith("contents.get")) == 1


def test_what_the_model_sees_does_not_grow_with_the_history():
    """The payload must never reach the model; counts and a sample do."""
    small = summarize_state(run(10, datatype="fasta.gz")[0])
    large = summarize_state(run(5000, datatype="fasta.gz")[0])
    assert large["collection"]["elements"] == 5000
    # Same shape, same order of size: a large history costs the context nothing extra.
    assert set(small) == set(large)
    assert len(json.dumps(large)) < 2 * len(json.dumps(small))
    assert len(json.dumps(large)) < 1000


def test_a_datatype_that_would_drop_compression_is_refused_before_anything_is_written():
    state, calls = run(5000, datatype="fasta")
    assert "compression_lost" in state
    assert not [
        t for t, _ in calls if t.endswith("post") or t.endswith("bulk.put")
    ], "a refusal must not leave a half-built collection behind"
    assert summarize_state(state)["ok"] is False


def test_tags_are_applied_to_the_collection_rather_than_to_every_dataset():
    _, calls = run(2000, datatype="fasta.gz", tags=["sra"])
    tagging = [b for b in bulk(calls) if b["operation"] == "add_tags"]
    assert len(tagging) == 1
    assert len(tagging[0]["items"]) == 1
    assert tagging[0]["items"][0]["history_content_type"] == "dataset_collection"


def test_the_collection_is_built_in_one_request_whose_size_is_known():
    """Every element rides in a single POST, so its body is the scaling limit to watch.

    Measured at ~205 bytes per element: 5.1MB for 25,000 pairs. Galaxy has to accept that
    body in one piece, and a collection cannot be assembled from several requests, so this
    is a ceiling to characterise rather than a thing to chunk.
    """
    _, calls = run(5000, datatype="fasta.gz")
    posts = [p for t, p in calls if t.endswith("dataset_collections.post")]
    assert len(posts) == 1
    per_element = len(json.dumps(posts[0])) / len(posts[0]["element_identifiers"])
    assert per_element < 300, f"{per_element:.0f} bytes per element"


def test_requests_grow_with_batches_rather_than_with_datasets():
    _, small = run(500, ext="data", datatype="fasta.gz")
    _, large = run(5000, ext="data", datatype="fasta.gz")
    # 10x the datasets must not mean 10x the round trips beyond the batching itself.
    assert len(large) - len(small) == (10000 - 1000) // BATCH
