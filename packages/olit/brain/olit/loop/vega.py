"""A Vega-Lite artifact over a Galaxy dataset: the model writes the spec, Olit writes the data.

Galaxy's Page renderer parses a ```vega fence as JSON and hands it to vega-embed, rewriting
and validating nothing. The data source is therefore built here from the dataset's own
metadata and never accepted from a caller, so a spec cannot name rows, another dataset, or
another origin.

Pure functions of their arguments; the fetching lives in visualizations.py.
"""

import json
import re

# Galaxy renders a page with vega-lite 5, so a spec written for a later one may not render.
SCHEMA = "https://vega.github.io/schema/vega-lite/v5.json"
DISPLAY_URL = "/api/datasets/{dataset_id}/display"
# A referenced spec sends every reader the whole file, so a chart of a large one is a download.
SIZE_LIMIT = 25_000_000

# Galaxy's column types that Vega should read as numbers rather than text.
NUMERIC = ("int", "float")

# The one state in which a dataset's content is final.
READABLE = "ok"

# What a transform invents when it is given no explicit `as`.
TRANSFORM_DEFAULTS = {
    "density": ("value", "density"),
    "quantile": ("prob", "value"),
    "fold": ("key", "value"),
}
# Transforms whose output columns come from the data, so no name can be known in advance.
OPAQUE_TRANSFORMS = ("pivot", "flatten")

_DATUM = re.compile(r"""datum(?:\.([A-Za-z_]\w*)|\[\s*['"]([^'"]+)['"]\s*\])""")


def column_names(details):
    """The names a spec may encode: Galaxy's own where it has them, else `col:N` by position."""
    named = [n for n in (details.get("metadata_column_names") or []) if n]
    if named:
        return named
    count = details.get("metadata_columns")
    return [f"col:{i + 1}" for i in range(count)] if isinstance(count, int) and count > 0 else []


def _named(details):
    return bool([n for n in (details.get("metadata_column_names") or []) if n])


def unreferenceable(details):
    """Why Vega cannot read this dataset directly, or None when it can.

    Checked against vega-loader 5.30 over real Galaxy datasets: tabular, interval and bed with
    no comment lines parse exactly as Galaxy counts them, a csv's header row is consumed by
    `type: csv`, and gff3 and vcf turn their `##` preamble into data rows.
    """
    name = details.get("name") or "this dataset"
    if details.get("purged"):
        return f"{name} is purged, so its content is gone and nothing can read it."
    state = details.get("state")
    if state != READABLE:
        # Named before the metadata checks, which would otherwise blame the datatype for a
        # dataset whose job has simply not finished.
        if state == "error":
            return f"{name} is in state 'error', so the job producing it failed and it holds nothing to chart."
        return (
            f"{name} is in state {state!r}, so it holds no readable content yet. A dataset reaches "
            "'ok' when the job producing it finishes; wait for it and chart it again rather than "
            "converting it or changing its datatype."
        )
    columns = details.get("metadata_columns")
    if not isinstance(columns, int) or columns < 1:
        return "Galaxy reports no column count for this dataset, so Vega cannot be told how to read it."
    if not isinstance(details.get("metadata_data_lines"), int):
        return "Galaxy has not measured this dataset's lines, so how Vega should read it is unknown."
    size = details.get("file_size")
    if isinstance(size, int) and size > SIZE_LIMIT:
        return (
            f"this dataset is {size} bytes and a referenced chart sends the whole file to every "
            f"reader; {SIZE_LIMIT} is the most one may carry. Summarise it with a Galaxy tool and "
            "chart the result."
        )
    comments = details.get("metadata_comment_lines") or 0
    if comments and not _named(details):
        return (
            f"the first {comments} line(s) are comments, which Vega reads as data rather than "
            "skipping. Produce a dataset without them with a Galaxy tool and chart that."
        )
    delimiter = details.get("metadata_delimiter")
    if _named(details) and delimiter != ",":
        return (
            f"Galaxy names this dataset's columns and separates them with {delimiter!r}, a "
            "combination Vega's reader has not been verified against here."
        )
    return None


def data_block(dataset_id, details):
    """The one data source a spec gets: this dataset's bytes, described from its metadata."""
    delimiter = details.get("metadata_delimiter") or "\t"
    if _named(details):
        fmt: dict = {"type": "csv"}
    else:
        fmt = {"type": "dsv", "delimiter": delimiter, "header": column_names(details)}
    types = details.get("metadata_column_types") or []
    parse = {name: "number" for name, kind in zip(column_names(details), types) if kind in NUMERIC}
    if parse:
        fmt["parse"] = parse
    return {"url": DISPLAY_URL.format(dataset_id=dataset_id), "format": fmt}


def data_paths(node, path=()):
    """Every place a spec names data of its own.

    Vega-Lite accepts `data` in eighteen places, a `lookup` transform and each layer, concat,
    facet and repeat among them, so the whole tree is walked rather than just the root.
    """
    found = []
    if isinstance(node, dict):
        for key, value in node.items():
            if key == "data":
                found.append(".".join((*path, key)))
            found += data_paths(value, (*path, key))
    elif isinstance(node, list):
        for index, item in enumerate(node):
            found += data_paths(item, (*path, str(index)))
    return found


def produced_fields(node):
    """Names a transform creates, which the file itself does not contain."""
    made = set()
    for step in _steps(node):
        alias = step.get("as")
        if isinstance(alias, str):
            made.add(alias)
        elif isinstance(alias, list):
            made.update(a for a in alias if isinstance(a, str))
        for kind, defaults in TRANSFORM_DEFAULTS.items():
            if kind in step and "as" not in step:
                made.update(defaults)
        for nested in ("aggregate", "joinaggregate", "window"):
            for item in step.get(nested) or []:
                if isinstance(item, dict) and isinstance(item.get("as"), str):
                    made.add(item["as"])
        # A bin written as a transform writes the two edges of each bin.
        if "bin" in step and isinstance(step.get("field"), str):
            made.update({f"{step['field']}_start", f"{step['field']}_end"})
    return made


def _steps(node):
    """Every transform step anywhere in the spec, layers included."""
    out = []
    if isinstance(node, dict):
        for step in node.get("transform") or []:
            if isinstance(step, dict):
                out.append(step)
        for key, value in node.items():
            if key != "transform":
                out += _steps(value)
    elif isinstance(node, list):
        for item in node:
            out += _steps(item)
    return out


def names_are_opaque(spec):
    """Whether a transform makes the readable field names unknowable."""
    return any(kind in step for step in _steps(spec) for kind in OPAQUE_TRANSFORMS)


def read_fields(node):
    """Every field name a spec reads, from `field` entries and from filter expressions."""
    found = set()
    if isinstance(node, dict):
        if isinstance(node.get("field"), str):
            found.add(node["field"])
        for key, value in node.items():
            if key == "filter" and isinstance(value, str):
                found.update(a or b for a, b in _DATUM.findall(value))
            found |= read_fields(value)
    elif isinstance(node, list):
        for item in node:
            found |= read_fields(item)
    return found


def unsatisfiable_types(spec, details):
    """Quantitative encodings on columns Galaxy typed as text, which plot nothing.

    Not a refusal: Galaxy types a column as text if any value in it is, so a numeric column
    with missing values reads as text while the encoding is still right.
    """
    typed = dict(zip(column_names(details), details.get("metadata_column_types") or []))
    suspect = []
    for channel in (spec.get("encoding") or {}).values():
        for entry in channel if isinstance(channel, list) else [channel]:
            if not isinstance(entry, dict) or entry.get("type") != "quantitative":
                continue
            field = entry.get("field")
            if field in typed and typed[field] not in NUMERIC:
                suspect.append(field)
    return sorted(set(suspect))


def build(dataset_id, spec, details):
    """The spec Olit will render, or a sentence saying why it will not. Returns `(ready, refusal)`."""
    if not isinstance(spec, dict) or not spec:
        return None, "`spec` has to be a Vega-Lite specification object."

    owned = data_paths(spec)
    if owned:
        return None, (
            f"the spec names its own data at {', '.join(sorted(owned))}. Leave `data` out "
            "entirely: this tool points the spec at the dataset, and a chart of anything else "
            "has to become a Galaxy dataset first."
        )

    refusal = unreferenceable(details)
    if refusal:
        return None, refusal

    available = column_names(details)
    if not names_are_opaque(spec):
        unknown = sorted(read_fields(spec) - set(available) - produced_fields(spec))
        if unknown:
            return None, (
                f"the spec reads {', '.join(repr(u) for u in unknown)}, which this dataset does "
                f"not hold. Its columns are {', '.join(repr(a) for a in available)}."
            )

    ready: dict = {"$schema": SCHEMA}
    ready.update({k: v for k, v in spec.items() if k != "$schema"})
    ready["data"] = data_block(dataset_id, details)
    return ready, None


def fence(spec):
    """The spec as the markdown a Galaxy page holds."""
    return "```vega\n" + json.dumps(spec, indent=2) + "\n```"
