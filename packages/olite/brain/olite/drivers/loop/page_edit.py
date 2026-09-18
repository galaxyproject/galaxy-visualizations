"""Section addressing and staleness detection, matching Galaxy's PageEditor."""

import re

HEADING_RE = re.compile(r"^#{1,6}\s")


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
