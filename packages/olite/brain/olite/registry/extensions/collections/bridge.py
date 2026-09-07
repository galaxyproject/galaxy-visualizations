"""Group loose datasets into collection element identifiers."""

import fnmatch
import re

from olite.drivers.graph import register_materializer

# A mate marker is its own segment. R1/read2/forward name the mate outright; a bare 1/2
# might just as easily be a sample number, so it counts as weak evidence below.
_EXPLICIT_MATE = re.compile(r"^(?:R|read)([12])$", re.IGNORECASE)
_WORD_MATE = re.compile(r"^(?:(forward|fwd)|(reverse|rev))$", re.IGNORECASE)
_WEAK_MATE = re.compile(r"^([12])$")
_SEP = re.compile(r"[._\-\s]+")
# Extensions stripped before pairing, so sample_1.fastq.gz pairs on "sample".
_STRIP = (".gz", ".bz2", ".zip", ".fastq", ".fq", ".fasta", ".fa", ".txt", ".tabular")


def _parts(name):
    """(directories, filename) for an archive member."""
    cleaned = str(name).replace("\\", "/").strip("/")
    *dirs, base = cleaned.split("/")
    return dirs, base


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


def _mate_of(segment):
    """(mate, explicit) for one path segment, or (None, False)."""
    m = _EXPLICIT_MATE.match(segment)
    if m:
        return ("forward" if m.group(1) == "1" else "reverse"), True
    m = _WORD_MATE.match(segment)
    if m:
        return ("forward" if m.group(1) else "reverse"), True
    m = _WEAK_MATE.match(segment)
    if m:
        return ("forward" if m.group(1) == "1" else "reverse"), False
    return None, False


def _split_mate(name, pattern=None, path=None):
    """(sample, mate, explicit) for a read name, or (stem, None, False).

    A caller-supplied `pattern` wins: it names the convention outright, so it counts as
    explicit evidence and needs no corroborating second sample. A file it does not match
    becomes a leftover rather than being forced into a guess.

    The marker may sit in any segment but the first, so Illumina's trailing `_001` survives.
    """
    stem = _stem(name)
    if pattern is not None:
        found = pattern.search(path if path is not None else name)
        if not found:
            return stem, None, False
        groups = found.groupdict()
        sample = groups.get("sample") or stem
        mate, _ = _mate_of(groups.get("mate") or "")
        return sample, mate, True

    segments = _SEP.split(stem)
    # Right to left, and never the first segment for a bare 1/2: a leading digit is a
    # sample number. An explicit R1/forward reads the same wherever it sits.
    for i in range(len(segments) - 1, -1, -1):
        mate, explicit = _mate_of(segments[i])
        if mate and (explicit or i > 0):
            return "_".join(segments[:i] + segments[i + 1 :]), mate, explicit
    return stem, None, False


def _compile(sample_regex):
    """The caller's pattern, or None. A bad pattern is the caller's error, said plainly."""
    if not sample_regex:
        return None
    try:
        return re.compile(sample_regex)
    except re.error as exc:
        raise ValueError(f"sample_regex is not a valid regular expression: {exc}") from exc


def _identify(datasets, name_field, pattern=None):
    """Per dataset: (sample, file_id, mate, explicit, dataset).

    A paired element is named by its sample, a flat element by the file. Both fall back to
    the archive path when the file names alone collide: `SampleA/reads_1.fq` and
    `SampleB/reads_1.fq` are different samples, and Galaxy rejects a collection whose
    element identifiers collide (verified: HTTP 400 "Found duplicated element identifier").
    """
    rows = []
    for d in datasets:
        raw = str(d.get(name_field) or d.get("id"))
        dirs, base = _parts(raw)
        # The pattern sees the whole archive path, so a sample can live in a directory.
        sample, mate, explicit = _split_mate(base, pattern, path=raw.replace("\\", "/"))
        rows.append((dirs, base, sample, mate, explicit, d))

    def qualify(values, keys):
        """Prefer the bare name; fall back to the path only where names collide."""
        unique = len(set(keys)) == len(keys)
        return [v if unique else "_".join([*dirs, v]) for v, (dirs, *_) in zip(values, rows)]

    # A sample appears once per mate, so its uniqueness is per (sample, mate).
    samples = qualify([r[2] for r in rows], [(r[2], r[3]) for r in rows])
    files = qualify([r[1] for r in rows], [r[1] for r in rows])
    return [(s, f, r[3], r[4], r[5]) for s, f, r in zip(samples, files, rows)]


@register_materializer("collections.group")
def group_datasets(datasets=None, structure=None, name_field="name", include=None,
                   sample_regex=None):
    """Partition datasets into collection elements plus whatever did not fit.

    `include` is a filename glob scoping which datasets are in play at all. `structure` is
    "paired", "list", or "auto". Nothing is discarded: a dataset is in `elements`, in
    `leftovers`, or out of scope, and `out_of_scope` names the last group.

    `sample_regex` overrides the built-in conventions: a regex over the archive path with a
    named `sample` group and an optional `mate` group, for layouts this module cannot infer.

    `auto` pairs only on evidence. An explicit marker (R1/read2/forward) is enough on its
    own; a bare 1/2 could be a sample number, so it also needs a second sample showing the
    same convention. Pass structure="paired" to force it.
    """
    datasets = datasets or []
    structure = structure or "auto"
    rows = _identify(datasets, name_field, _compile(sample_regex))

    in_scope, out_of_scope = [], []
    for row in rows:
        target = in_scope if _matches(_parts(row[4].get(name_field) or "")[1], include) else out_of_scope
        target.append(row)

    pairs, unpaired = {}, []
    for sample, file_id, mate, explicit, d in in_scope:
        if mate is None:
            unpaired.append((file_id, d))
        else:
            pairs.setdefault(sample, {}).setdefault(mate, []).append((file_id, d, explicit))

    # Exactly one dataset per mate, or the marker was a run number rather than a mate.
    complete = {
        s: {mate: rows_[0] for mate, rows_ in m.items()}
        for s, m in pairs.items()
        if set(m) == {"forward", "reverse"} and all(len(r) == 1 for r in m.values())
    }
    half = [(i, d) for s, m in pairs.items() if s not in complete for r in m.values() for i, d, _ in r]
    explicit_seen = any(e for s in complete for _, _, e in complete[s].values())
    # Two independent guards: enough of the files pair, and the marker means what we think.
    majority = len(complete) * 2 > len(in_scope) / 2
    evidenced = explicit_seen or len(complete) >= 2

    if structure == "paired" or (structure == "auto" and complete and majority and evidenced):
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
        leftovers = sorted(unpaired + half, key=lambda e: e[0])
        return _result("list:paired", elements, leftovers, out_of_scope)

    flat = sorted(((f, d) for _, f, _, _, d in in_scope), key=lambda e: e[0])
    return _result("list", _flat_elements(flat), [], out_of_scope, in_scope=flat)


def _matches(name, include):
    return True if not include or include == "*" else fnmatch.fnmatch(name, include)


def _flat_elements(entries):
    return [{"name": str(n), "src": "hda", "id": d.get("id")} for n, d in entries]


def _items(entries):
    """Dataset references the bulk history-contents operations accept."""
    return [
        {"id": d.get("id"), "history_content_type": d.get("history_content_type", "dataset")}
        for _, d in entries
    ]


def _placed(elements):
    """(name, dataset-ref) for each dataset an element points at, pairs included."""
    out = []
    for element in elements:
        for inner in element.get("element_identifiers") or [element]:
            out.append((inner.get("name"), {"id": inner.get("id")}))
    return out


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
        "out_of_scope": [f for _, f, _, _, _ in out_of_scope],
        "has_leftovers": bool(leftovers),
        "empty": not elements,
    }


@register_materializer("collections.chunk")
def chunk_items(items=None, size=1000):
    """Split a list into batches a single request can carry."""
    items = items or []
    size = max(1, int(size or 1000))
    return {"batches": [items[i : i + size] for i in range(0, len(items), size)]}
