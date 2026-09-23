"""Renders a history graph subgraph as a Mermaid flowchart."""

from olit.drivers.graph import register_materializer

# Edges Galaxy reports; datasets and collections are boxes, jobs are stadiums.
JOB_SRC = "job"


@register_materializer("lineage.mermaid")
def generate_mermaid(nodes=None, edges=None, seed_id=None):
    """Render a history graph's nodes and edges as a Mermaid flowchart."""
    nodes = nodes or []
    edges = edges or []

    lines = ["flowchart TD"]
    for n in nodes:
        ref = _node_id(n.get("src"), n.get("id"))
        label = n.get("name") or n.get("tool_name") or n.get("tool_id") or n.get("id")
        marker = "*" if n.get("id") == seed_id else ""
        shape = '(["{}"])' if n.get("src") == JOB_SRC else '["{}"]'
        lines.append(f"    {ref}" + shape.format(_label(f"{marker}{label}")))

    for e in edges:
        source, target = e.get("source") or {}, e.get("target") or {}
        if not source.get("id") or not target.get("id"):
            continue
        lines.append(
            f'    {_node_id(source.get("src"), source.get("id"))}'
            f' --> {_node_id(target.get("src"), target.get("id"))}'
        )

    return "\n".join(lines)


def _label(text):
    """Mermaid reads a quote as the end of the label; its entity form keeps it as text."""
    return str(text).replace('"', "#quot;")


def _node_id(src, raw):
    """A Mermaid-safe identifier; src keeps hda and hdca ids from colliding."""
    return f"{src or 'n'}_" + "".join(c if c.isalnum() else "_" for c in str(raw))
