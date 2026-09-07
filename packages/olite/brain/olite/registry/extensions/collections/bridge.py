"""Group loose datasets into collection element identifiers."""

import fnmatch
import re

from olite.drivers.graph import register_materializer

# A mate marker is its own segment: R1/R2, or a bare 1/2.
_MATE_TOKEN = re.compile(r"^R?([12])$", re.IGNORECASE)
_SEP = re.compile(r"[._-]")
# Extensions stripped before pairing, so sample_1.fastq.gz pairs on "sample".
_STRIP = (".gz", ".bz2", ".zip", ".fastq", ".fq", ".fasta", ".fa", ".txt", ".tabular")


def _basename(name):
    """Archive members arrive as paths; only the file name identifies the sample."""
    return str(name).replace("\\", "/").rsplit("/", 1)[-1]


def _stem(name):
    out = name
    changed = True
    while changed:
        changed = False
        for ext in _STRIP:
            if out.lower().endswith(ext):
                out = out[: -len(ext)]
                changed = True
    return out


def _split_mate(name):
    """(sample, mate) for a paired read name, or (name, None).

    The marker may sit in any segment but the first, so Illumina's trailing `_001` survives.
    """
    stem = _stem(name)
    parts = _SEP.split(stem)
    for i in range(len(parts) - 1, 0, -1):
        m = _MATE_TOKEN.match(parts[i])
        if m:
            sample = "_".join(parts[:i] + parts[i + 1 :])
            return sample, "forward" if m.group(1) == "1" else "reverse"
    return stem, None


@register_materializer("collections.group")
def group_datasets(datasets=None, structure=None, name_field="name", include=None):
    """Partition datasets into collection elements plus whatever did not fit.

    `include` is a filename glob scoping which datasets are in play at all. `structure`
    is "paired", "list", or "auto", which pairs every sample holding exactly both mates
    and routes the rest to `leftovers`. Nothing is discarded: a dataset is in `elements`,
    in `leftovers`, or out of scope, and `out_of_scope` names the last group.
    """
    datasets = datasets or []
    structure = structure or "auto"
    named = [(_basename(d.get(name_field) or d.get("id")), d) for d in datasets]

    in_scope, out_of_scope = [], []
    for name, d in named:
        (in_scope if _matches(name, include) else out_of_scope).append((name, d))

    pairs, unpaired = {}, []
    for name, d in in_scope:
        sample, mate = _split_mate(str(name))
        if mate is None:
            unpaired.append((name, d))
        else:
            pairs.setdefault(sample, {}).setdefault(mate, []).append((name, d))

    # Exactly one dataset per mate, or the marker was a run number rather than a mate.
    complete = {
        s: {mate: ds[0] for mate, ds in m.items()}
        for s, m in pairs.items()
        if set(m) == {"forward", "reverse"} and all(len(ds) == 1 for ds in m.values())
    }
    half = [entry for s, m in pairs.items() if s not in complete for ds in m.values() for entry in ds]

    # Pairing is the shape only when most of the files actually pair; two mate-like names
    # among many (run_1, run_2, run_3...) are run numbers, not mates.
    paired_majority = len(complete) * 2 > len(in_scope) / 2

    if structure == "paired" or (structure == "auto" and complete and paired_majority):
        elements = [
            {
                "name": sample,
                "src": "new_collection",
                "collection_type": "paired",
                "element_identifiers": [
                    {"name": mate, "src": "hda", "id": complete[sample][mate][1].get("id")}
                    for mate in ("forward", "reverse")
                ],
            }
            for sample in sorted(complete)
        ]
        placed = [entry for s in complete for entry in complete[s].values()]
        leftovers = sorted(unpaired + half, key=lambda e: e[0])
        return _result("list:paired", elements, leftovers, out_of_scope)

    flat = sorted(in_scope, key=lambda e: e[0])
    return _result("list", _flat_elements(flat), [], out_of_scope, in_scope=flat)


def _matches(name, include):
    return True if not include or include == "*" else fnmatch.fnmatch(name, include)


def _flat_elements(entries):
    return [{"name": str(n), "src": "hda", "id": d.get("id")} for n, d in entries]


def _placed(elements):
    """(name, dataset-ref) for each dataset an element points at, pairs included."""
    out = []
    for element in elements:
        for inner in element.get("element_identifiers") or [element]:
            out.append((inner.get("name"), {"id": inner.get("id")}))
    return out


def _items(entries):
    """Dataset references the bulk history-contents operations accept."""
    return [
        {"id": d.get("id"), "history_content_type": d.get("history_content_type", "dataset")}
        for _, d in entries
    ]


def _result(structure, elements, leftovers, out_of_scope, in_scope=None):
    # `items` is everything in scope, so a datatype write reaches the leftovers too;
    # `include` is what keeps a non-read file out of scope in the first place.
    scoped = in_scope if in_scope is not None else _placed(elements) + leftovers
    return {
        "structure": structure,
        "elements": elements,
        "items": _items(scoped),
        "leftovers": _flat_elements(leftovers),
        "unmatched": [n for n, _ in leftovers],
        "out_of_scope": [n for n, _ in out_of_scope],
        "has_leftovers": bool(leftovers),
        "empty": not elements,
    }


@register_materializer("collections.chunk")
def chunk_items(items=None, size=1000):
    """Split a list into batches a single request can carry."""
    items = items or []
    size = max(1, int(size or 1000))
    return {"batches": [items[i : i + size] for i in range(0, len(items), size)]}
