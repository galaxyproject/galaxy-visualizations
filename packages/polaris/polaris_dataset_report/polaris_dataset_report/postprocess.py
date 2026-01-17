"""Postprocessor for dataset_report agent.

Generates a Mermaid flowchart diagram from the dataset lineage.
"""

import re
from typing import Any


def sanitize_id(id_str: str) -> str:
    """Sanitize an ID for use in Mermaid diagram."""
    return re.sub(r"[^a-zA-Z0-9]", "_", id_str)


def format_label(text: str) -> str:
    """Format a label for Mermaid, escaping special characters."""
    return text.replace('"', "'").replace("<", "").replace(">", "")


def format_tool_name(tool_id: str) -> str:
    """Extract readable tool name from full tool ID."""
    parts = tool_id.split("/")
    name = parts[-2] if len(parts) >= 2 else parts[-1] if parts else tool_id
    return format_label(name)


def generate_mermaid(
    dataset_details: list[dict[str, Any]],
    job_details: list[dict[str, Any]],
    source_dataset_id: str | None = None,
) -> str:
    """Generate a Mermaid flowchart from dataset and job details.

    Args:
        dataset_details: List of dataset detail dicts with id, uuid, name, file_ext, creating_job
        job_details: List of job detail dicts with id, tool_id, inputs, outputs, create_time
        source_dataset_id: Optional ID of the source dataset to highlight

    Returns:
        Mermaid diagram string
    """
    if not job_details:
        return ""

    lines = ["flowchart LR"]

    # Create lookups
    job_map = {j["id"]: j for j in job_details}
    dataset_map = {ds["id"]: ds for ds in dataset_details}
    uuid_to_dataset_id = {ds.get("uuid"): ds["id"] for ds in dataset_details if ds.get("uuid")}

    # Build job inputs map from job details
    job_inputs_map: dict[str, list[str]] = {}
    for job in job_details:
        input_dataset_ids = []
        inputs = job.get("inputs")
        if inputs and isinstance(inputs, dict):
            for value in inputs.values():
                if isinstance(value, dict) and value.get("uuid"):
                    dataset_id = uuid_to_dataset_id.get(value["uuid"])
                    if dataset_id:
                        input_dataset_ids.append(dataset_id)
        job_inputs_map[job["id"]] = input_dataset_ids

    # Datasets by creating job
    datasets_by_job: dict[str, list[str]] = {}
    for ds in dataset_details:
        creating_job = ds.get("creating_job")
        if creating_job:
            if creating_job not in datasets_by_job:
                datasets_by_job[creating_job] = []
            datasets_by_job[creating_job].append(ds["id"])

    # Find input datasets (those without a creating job in our data)
    input_dataset_ids = set()
    for ds in dataset_details:
        creating_job = ds.get("creating_job")
        if not creating_job or creating_job not in job_map:
            input_dataset_ids.add(ds["id"])

    # Sort jobs by time
    sorted_jobs = sorted(
        job_details,
        key=lambda j: j.get("create_time", ""),
    )

    # Track added nodes
    added_datasets: set[str] = set()
    added_jobs: set[str] = set()

    # Add input dataset nodes
    for ds_id in input_dataset_ids:
        ds = dataset_map.get(ds_id)
        if ds and ds_id not in added_datasets:
            node_id = f"ds_{sanitize_id(ds_id)}"
            label = format_label(ds.get("name", ds_id))
            file_ext = ds.get("file_ext", "")
            lines.append(f'    {node_id}("{label} [{file_ext}]")')
            added_datasets.add(ds_id)

    # Add tool nodes and edges
    for job in sorted_jobs:
        job_id = job["id"]
        job_node_id = f"job_{sanitize_id(job_id)}"
        tool_label = format_tool_name(job.get("tool_id", "unknown"))

        if job_id not in added_jobs:
            lines.append(f'    {job_node_id}[/"{tool_label}"/]')
            added_jobs.add(job_id)

        # Edges from inputs to this job
        inputs = job_inputs_map.get(job_id, [])
        for input_id in inputs:
            if input_id in dataset_map:
                from_id = f"ds_{sanitize_id(input_id)}"
                lines.append(f"    {from_id} --> {job_node_id}")

        # Add output datasets and edges
        outputs = datasets_by_job.get(job_id, [])
        for out_id in outputs:
            ds = dataset_map.get(out_id)
            if ds and out_id not in added_datasets:
                node_id = f"ds_{sanitize_id(out_id)}"
                label = format_label(ds.get("name", out_id))
                file_ext = ds.get("file_ext", "")
                lines.append(f'    {node_id}("{label} [{file_ext}]")')
                added_datasets.add(out_id)
            lines.append(f"    {job_node_id} --> ds_{sanitize_id(out_id)}")

    # Apply CSS class names
    lines.append("")
    for ds_id in added_datasets:
        style_class = "highlighted" if ds_id == source_dataset_id else "dataset"
        lines.append(f"    class ds_{sanitize_id(ds_id)} {style_class}")
    for job in sorted_jobs:
        lines.append(f"    class job_{sanitize_id(job['id'])} tool")

    return "\n".join(lines)


def postprocess(result: dict[str, Any], state: dict[str, Any]) -> dict[str, Any]:
    """Postprocess the dataset_report result to add mermaid diagram.

    Args:
        result: The terminal node output
        state: The execution state

    Returns:
        Modified result with mermaid_diagram field
    """
    # Get the actual result content (handles both direct and wrapped results)
    output = result.get("result", result)

    dataset_details = output.get("dataset_details", [])
    job_details = output.get("job_details", [])
    source_dataset_id = state.get("inputs", {}).get("dataset_id")

    mermaid_diagram = generate_mermaid(dataset_details, job_details, source_dataset_id)

    # Add mermaid diagram to the output
    if "result" in result:
        result["result"]["mermaid_diagram"] = mermaid_diagram
    else:
        result["mermaid_diagram"] = mermaid_diagram

    return result
