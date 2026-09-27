"""Section addressing and staleness detection, matching Galaxy's PageEditor."""

import re

HEADING_RE = re.compile(r"^#{1,6}\s")

# Galaxy encodes an object id as 16 lowercase hex characters.
ENCODED_ID = re.compile(r"[0-9a-f]{16}")
# The directive arguments that name a Galaxy object. Only these: a page carries plenty of
# other arguments, and judging them is Galaxy's job, not this one's.
OBJECT_ARGUMENT = re.compile(
    r"\b(visualization_id|history_dataset_id|history_dataset_collection_id)\s*=\s*[\"']?([^\s,)\"']+)"
)


def malformed_object_ids(content):
    """Directive arguments naming a Galaxy object by something that is not its id.

    Galaxy validates that an argument's *name* is allowed and never looks at its value, so
    `visualization_id=plotly` is stored and renders a broken embed with no error anywhere.
    """
    return [
        f"{name}={value}" for name, value in OBJECT_ARGUMENT.findall(content or "") if not ENCODED_ID.fullmatch(value)
    ]


def djb2_hash(text):
    """Galaxy's page hash, in `sectionDiffUtils.ts` and `page_assistant.py`."""
    h = 5381
    for ch in text or "":
        h = ((h * 33) + ord(ch)) & 0xFFFFFFFF
    return format(h, "08x")


def markdown_sections(content):
    """Sections as `[(heading, text)]`, split on the first heading of each block."""
    if not content:
        return []
    lines = content.split("\n")
    sections = []
    heading, current = "", []
    for i, line in enumerate(lines):
        if HEADING_RE.match(line) and i > 0:
            sections.append((heading, "\n".join(current)))
            heading, current = line, [line]
        elif HEADING_RE.match(line) and i == 0:
            heading, current = line, [line]
        else:
            current.append(line)
    sections.append((heading, "\n".join(current)))
    return sections


def apply_section_edit(content, target_heading, new_section):
    """Replace the section under `target_heading`, appending it when absent."""
    parts = []
    found = False
    for heading, text in markdown_sections(content):
        if heading == target_heading:
            parts.append(new_section)
            found = True
        else:
            parts.append(text)
    if not found:
        parts.append(new_section)
    return "\n".join(parts)
