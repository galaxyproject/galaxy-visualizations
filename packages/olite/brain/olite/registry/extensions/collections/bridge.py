"""Group loose datasets into collection element identifiers."""

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
def group_datasets(datasets=None, structure="auto", name_field="name"):
    """Collection element identifiers for a set of datasets.

    `structure` is "paired", "list", or "auto", which pairs only when every dataset
    carries a mate marker and every sample has both. Anything short of that is a flat
    list, so a partial match never drops a file.
    """
    datasets = datasets or []
    named = [(_basename(d.get(name_field) or d.get("id")), d) for d in datasets]

    pairs = {}
    unpaired = []
    for name, d in named:
        sample, mate = _split_mate(str(name))
        if mate is None:
            unpaired.append((name, d))
        else:
            pairs.setdefault(sample, {}).setdefault(mate, []).append(d)

    # Exactly one dataset per mate, or the marker was a run number rather than a mate.
    complete = {
        s: {mate: ds[0] for mate, ds in m.items()}
        for s, m in pairs.items()
        if set(m) == {"forward", "reverse"} and all(len(ds) == 1 for ds in m.values())
    }
    can_pair = bool(complete) and not unpaired and len(complete) == len(pairs)

    if structure == "paired" or (structure == "auto" and can_pair):
        elements = [
            {
                "identifier": sample,
                "type": "paired",
                "forward": complete[sample]["forward"].get("id"),
                "reverse": complete[sample]["reverse"].get("id"),
            }
            for sample in sorted(complete)
        ]
        leftover = [n for n, _ in unpaired] + [s for s in pairs if s not in complete]
        return {"structure": "list:paired", "elements": elements, "unmatched": sorted(leftover)}

    elements = [
        {"identifier": str(name), "type": "dataset", "id": d.get("id")} for name, d in named
    ]
    return {"structure": "list", "elements": elements, "unmatched": []}
