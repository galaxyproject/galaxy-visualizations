"""Tests for the postprocess module."""

import pytest

from polaris_dataset_report.postprocess import generate_mermaid


class TestGenerateMermaid:
    """Tests for generate_mermaid function."""

    def test_empty_job_details_returns_empty(self):
        """Empty job details returns empty string."""
        result = generate_mermaid([], [])
        assert result == ""

    def test_simple_linear_workflow(self):
        """Simple linear workflow generates correct diagram."""
        dataset_details = [
            {"id": "d1", "uuid": "uuid-1", "name": "Input.fastq", "file_ext": "fastq"},
            {"id": "d2", "uuid": "uuid-2", "name": "Output.bam", "file_ext": "bam", "creating_job": "j1"},
        ]
        job_details = [
            {
                "id": "j1",
                "tool_id": "toolshed/bwa/1.0",
                "inputs": {"reads": {"id": "d1", "uuid": "uuid-1"}},
                "outputs": {"output": {"id": "d2", "uuid": "uuid-2"}},
                "create_time": "2024-01-01T00:00:00",
            }
        ]

        result = generate_mermaid(dataset_details, job_details)

        # Should have input dataset, job, and output dataset
        assert "ds_d1" in result
        assert "ds_d2" in result
        assert "job_j1" in result
        # Should have edges
        assert "ds_d1 --> job_j1" in result
        assert "job_j1 --> ds_d2" in result

    def test_uuid_deduplication_in_inputs(self):
        """Job inputs with same UUID are deduplicated to canonical ID."""
        # After traverse deduplication, only d1 is in dataset_details
        # but job still references d2 with same UUID
        dataset_details = [
            {"id": "d1", "uuid": "uuid-shared", "name": "Input.fastq", "file_ext": "fastq"},
            {"id": "d3", "uuid": "uuid-3", "name": "Output.bam", "file_ext": "bam", "creating_job": "j1"},
        ]
        job_details = [
            {
                "id": "j1",
                "tool_id": "toolshed/align/1.0",
                # Job references d2, but d2 has same UUID as d1
                "inputs": {"reads": {"id": "d2", "uuid": "uuid-shared"}},
                "outputs": {"output": {"id": "d3", "uuid": "uuid-3"}},
                "create_time": "2024-01-01T00:00:00",
            }
        ]

        result = generate_mermaid(dataset_details, job_details)

        # Should use canonical d1 (from uuid-shared) not d2
        assert "ds_d1" in result
        assert "ds_d2" not in result
        # Edge should use d1
        assert "ds_d1 --> job_j1" in result

    def test_multiple_inputs_same_uuid_deduplicated(self):
        """Multiple job inputs with same UUID become single edge."""
        dataset_details = [
            {"id": "d1", "uuid": "uuid-1", "name": "Data", "file_ext": "txt"},
            {"id": "d5", "uuid": "uuid-5", "name": "Output", "file_ext": "txt", "creating_job": "j1"},
        ]
        job_details = [
            {
                "id": "j1",
                "tool_id": "tool",
                # Two inputs reference different IDs but same UUID
                "inputs": {
                    "input1": {"id": "d1", "uuid": "uuid-1"},
                    "input2": {"id": "d2", "uuid": "uuid-1"},  # Same UUID as d1
                },
                "outputs": {"output": {"id": "d5", "uuid": "uuid-5"}},
                "create_time": "2024-01-01T00:00:00",
            }
        ]

        result = generate_mermaid(dataset_details, job_details)

        # Should only have one edge from d1 (not d1 and d2)
        edge_count = result.count("ds_d1 --> job_j1")
        assert edge_count == 1
        assert "ds_d2" not in result

    def test_passthrough_jobs_shown(self):
        """Jobs where inputs == outputs (like extract) are still shown."""
        dataset_details = [
            {"id": "d1", "uuid": "uuid-1", "name": "Data", "file_ext": "txt", "creating_job": "j1"},
        ]
        job_details = [
            {
                "id": "j1",
                "tool_id": "__EXTRACT_DATASET__",
                # Input and output reference same dataset (same UUID)
                "inputs": {"data": {"id": "d1", "uuid": "uuid-1"}},
                "outputs": {"data": {"id": "d1", "uuid": "uuid-1"}},
                "create_time": "2024-01-01T00:00:00",
            }
        ]

        result = generate_mermaid(dataset_details, job_details)

        # Job should be shown (not skipped)
        assert "job_j1" in result
        assert "__EXTRACT_DATASET__" in result
        # Dataset should appear
        assert "ds_d1" in result
        # Both input and output edges should exist
        assert "ds_d1 --> job_j1" in result
        assert "job_j1 --> ds_d1" in result

    def test_source_dataset_highlighted(self):
        """Source dataset gets highlighted class."""
        dataset_details = [
            {"id": "source123", "uuid": "uuid-1", "name": "Output", "file_ext": "bam", "creating_job": "j1"},
            {"id": "d1", "uuid": "uuid-2", "name": "Input", "file_ext": "fastq"},
        ]
        job_details = [
            {
                "id": "j1",
                "tool_id": "tool",
                "inputs": {"in": {"id": "d1", "uuid": "uuid-2"}},
                "outputs": {"out": {"id": "source123", "uuid": "uuid-1"}},
                "create_time": "2024-01-01T00:00:00",
            }
        ]

        result = generate_mermaid(dataset_details, job_details, source_dataset_id="source123")

        # Source should have highlighted class
        assert "class ds_source123 highlighted" in result
        # Other datasets should have dataset class
        assert "class ds_d1 dataset" in result

    def test_input_without_uuid_uses_id_fallback(self):
        """Job inputs without UUID fall back to ID lookup."""
        dataset_details = [
            {"id": "d1", "uuid": "uuid-1", "name": "Input", "file_ext": "txt"},
            {"id": "d2", "uuid": "uuid-2", "name": "Output", "file_ext": "txt", "creating_job": "j1"},
        ]
        job_details = [
            {
                "id": "j1",
                "tool_id": "tool",
                # Input has no UUID, only ID
                "inputs": {"in": {"id": "d1"}},
                "outputs": {"out": {"id": "d2", "uuid": "uuid-2"}},
                "create_time": "2024-01-01T00:00:00",
            }
        ]

        result = generate_mermaid(dataset_details, job_details)

        # Should still create edge using ID fallback
        assert "ds_d1 --> job_j1" in result


class TestMermaidFormatting:
    """Tests for Mermaid formatting helpers."""

    def test_tool_name_extraction(self):
        """Tool name is extracted from full tool ID."""
        dataset_details = [
            {"id": "d1", "uuid": "uuid-1", "name": "In", "file_ext": "txt"},
            {"id": "d2", "uuid": "uuid-2", "name": "Out", "file_ext": "txt", "creating_job": "j1"},
        ]
        job_details = [
            {
                "id": "j1",
                "tool_id": "toolshed.g2.bx.psu.edu/repos/iuc/bwa_mem2/bwa_mem2/2.2.1",
                "inputs": {"in": {"id": "d1", "uuid": "uuid-1"}},
                "create_time": "2024-01-01T00:00:00",
            }
        ]

        result = generate_mermaid(dataset_details, job_details)

        # Should extract "bwa_mem2" from the full path
        assert "bwa_mem2" in result

    def test_special_chars_escaped_in_labels(self):
        """Special characters are escaped in labels."""
        dataset_details = [
            {"id": "d1", "uuid": "uuid-1", "name": 'File "with" <special> chars', "file_ext": "txt"},
        ]
        job_details = []

        result = generate_mermaid(dataset_details, job_details)

        # No job details means empty result
        assert result == ""
