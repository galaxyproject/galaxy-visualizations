"""Materializer functions for the dataset report agent.

These functions are registered with the Polaris materializer catalog
via the entry point mechanism at framework initialization.
"""

from typing import Any

from polaris.modules.materializers import register

from .postprocess import generate_mermaid as _generate_mermaid


@register("dataset_report.generate_mermaid")
def generate_mermaid(
    dataset_details: list[dict[str, Any]],
    job_details: list[dict[str, Any]],
    source_dataset_id: str | None = None,
) -> str:
    """Generate a Mermaid flowchart from dataset and job details.

    This materializer wraps the existing generate_mermaid function from
    postprocess.py, making it available for use in agent YAML definitions.

    Args:
        dataset_details: List of dataset detail dicts with id, uuid, name, file_ext, creating_job
        job_details: List of job detail dicts with id, tool_id, inputs, outputs, create_time
        source_dataset_id: Optional ID of the source dataset to highlight

    Returns:
        Mermaid diagram string
    """
    return _generate_mermaid(dataset_details, job_details, source_dataset_id)


def register_all() -> None:
    """Register all materializers for this package.

    This function is called by the Polaris framework via the entry point
    mechanism during initialization. The actual registration happens via
    the @register decorator when the module is imported.
    """
    # All materializers are registered via decorators when this module is imported.
    # This function exists to satisfy the entry point interface.
    pass
