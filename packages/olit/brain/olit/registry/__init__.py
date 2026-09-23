"""Registry: what olit knows — crystallized processes and skills."""

from .processes import Process, ProcessRegistry
from .skills import SkillEntry, SkillRegistry, SkillRepo, parse_frontmatter, select_skills


def load_primitives():
    """Register every materializer and schema-builder a graph node can call."""
    from . import extensions  # noqa: F401


__all__ = [
    "load_primitives",
    "Process",
    "ProcessRegistry",
    "SkillEntry",
    "SkillRegistry",
    "SkillRepo",
    "parse_frontmatter",
    "select_skills",
]
