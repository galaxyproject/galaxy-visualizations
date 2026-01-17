"""Tests for traverse handler."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from polaris.modules.constants import ErrorCode
from polaris.modules.handlers.traverse import TraverseHandler


@pytest.fixture
def handler():
    return TraverseHandler()


@pytest.fixture
def mock_registry():
    registry = MagicMock()
    registry.call_api = AsyncMock()
    return registry


@pytest.fixture
def mock_runner():
    runner = MagicMock()
    runner.state = {}

    def resolve(value, ctx):
        if value is None:
            return None
        if isinstance(value, dict) and "$ref" in value:
            ref = value["$ref"]
            parts = ref.split(".")
            obj = ctx
            for part in parts:
                if isinstance(obj, dict):
                    obj = obj.get(part)
                else:
                    return None
            return obj
        return value

    runner.resolver = MagicMock()
    runner.resolver.resolve = resolve
    runner.resolver.apply_emit = MagicMock()
    return runner


@pytest.fixture
def simple_pipeline_data():
    """
    Simple linear pipeline: D1 -> J1 -> D2 -> J2 -> D3
    D1 is input (no creating job)
    J1 takes D1, produces D2
    J2 takes D2, produces D3
    """
    return {
        "datasets": {
            "d1": {
                "id": "d1",
                "uuid": "uuid-d1",
                "name": "Input Dataset",
                "creating_job": None,
                "file_ext": "fastq",
            },
            "d2": {
                "id": "d2",
                "uuid": "uuid-d2",
                "name": "Processed Dataset",
                "creating_job": "j1",
                "file_ext": "bam",
            },
            "d3": {
                "id": "d3",
                "uuid": "uuid-d3",
                "name": "Final Output",
                "creating_job": "j2",
                "file_ext": "vcf",
            },
        },
        "jobs": {
            "j1": {
                "id": "j1",
                "tool_id": "bwa",
                "tool_version": "1.0",
                "inputs": {"input1": {"id": "d1", "uuid": "uuid-d1"}},
                "outputs": {"output1": {"id": "d2", "uuid": "uuid-d2"}},
            },
            "j2": {
                "id": "j2",
                "tool_id": "samtools",
                "tool_version": "1.0",
                "inputs": {"input1": {"id": "d2", "uuid": "uuid-d2"}},
                "outputs": {"output1": {"id": "d3", "uuid": "uuid-d3"}},
            },
        },
    }


@pytest.fixture
def branching_pipeline_data():
    """
    Branching pipeline:
    D1 -> J1 -> D2
             -> D3 -> J2 -> D4
    """
    return {
        "datasets": {
            "d1": {"id": "d1", "creating_job": None},
            "d2": {"id": "d2", "creating_job": "j1"},
            "d3": {"id": "d3", "creating_job": "j1"},
            "d4": {"id": "d4", "creating_job": "j2"},
        },
        "jobs": {
            "j1": {
                "id": "j1",
                "tool_id": "splitter",
                "inputs": {"input1": {"id": "d1"}},
                "outputs": {
                    "output1": {"id": "d2"},
                    "output2": {"id": "d3"},
                },
            },
            "j2": {
                "id": "j2",
                "tool_id": "processor",
                "inputs": {"input1": {"id": "d3"}},
                "outputs": {"output1": {"id": "d4"}},
            },
        },
    }


def create_mock_api(data):
    """Create a mock call_api that returns pipeline data."""

    async def mock_call_api(ctx, spec):
        target = spec.get("target", "")
        input_data = spec.get("input", {})

        if "datasets" in target:
            dataset_id = input_data.get("dataset_id")
            if dataset_id in data["datasets"]:
                return {"ok": True, "result": data["datasets"][dataset_id]}
            return {"ok": False, "error": {"message": f"Dataset not found: {dataset_id}"}}

        if "jobs" in target:
            job_id = input_data.get("job_id")
            if job_id in data["jobs"]:
                return {"ok": True, "result": data["jobs"][job_id]}
            return {"ok": False, "error": {"message": f"Job not found: {job_id}"}}

        return {"ok": False, "error": {"message": f"Unknown target: {target}"}}

    return mock_call_api


@pytest.fixture
def traverse_node():
    """Standard traverse node configuration."""
    return {
        "type": "traverse",
        "seed": {"$ref": "state.source_dataset"},
        "seed_type": "dataset",
        "max_depth": 10,
        "max_per_level": 10,
        "types": {
            "dataset": {
                "id_field": "id",
                "fetch": {
                    "target": "galaxy.datasets.show.get",
                    "id_param": "dataset_id",
                },
                "relations": {
                    "creating_job": {
                        "type": "job",
                        "extract": "creating_job",
                    },
                },
            },
            "job": {
                "id_field": "id",
                "fetch": {
                    "target": "galaxy.jobs.show.get",
                    "id_param": "job_id",
                },
                "relations": {
                    "inputs": {
                        "type": "dataset",
                        "extract": "inputs.*.id",
                    },
                    "outputs": {
                        "type": "dataset",
                        "extract": "outputs.*.id",
                    },
                },
            },
        },
        "emit": {
            "state.dataset_details": "result.dataset",
            "state.job_details": "result.job",
        },
    }


class TestTraverseHandler:
    """Tests for TraverseHandler."""

    @pytest.mark.asyncio
    async def test_traverses_upstream_from_output(
        self, handler, mock_registry, mock_runner, simple_pipeline_data, traverse_node
    ):
        """Starting from D3, should find J2, D2, J1, D1 (upstream)."""
        mock_registry.call_api = create_mock_api(simple_pipeline_data)

        ctx = {
            "state": {"source_dataset": simple_pipeline_data["datasets"]["d3"]},
            "inputs": {},
        }

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is True
        datasets = result["result"]["dataset"]
        jobs = result["result"]["job"]

        dataset_ids = {d["id"] for d in datasets}
        job_ids = {j["id"] for j in jobs}

        # Should have traversed upstream to find all datasets
        assert "d3" in dataset_ids  # source
        assert "d2" in dataset_ids  # upstream via j2
        assert "d1" in dataset_ids  # upstream via j1
        assert "j2" in job_ids
        assert "j1" in job_ids

    @pytest.mark.asyncio
    async def test_respects_depth_limit(
        self, handler, mock_registry, mock_runner, simple_pipeline_data, traverse_node
    ):
        """With depth=2, should find immediate upstream (d3->j2->d2) but not further (d1)."""
        mock_registry.call_api = create_mock_api(simple_pipeline_data)

        # depth=2 means: d3 (depth 0) -> j2 (depth 1) -> d2 (depth 2)
        # d2's creating job j1 would be depth 3, so d1 won't be reached
        traverse_node["max_depth"] = 2
        ctx = {
            "state": {"source_dataset": simple_pipeline_data["datasets"]["d3"]},
            "inputs": {},
        }

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is True
        datasets = result["result"]["dataset"]
        jobs = result["result"]["job"]
        dataset_ids = {d["id"] for d in datasets}
        job_ids = {j["id"] for j in jobs}

        # With depth 2, starting from d3:
        # - d3 (source, depth 0)
        # - j2 (creating job of d3, depth 1)
        # - d2 (input of j2, depth 2)
        assert "d3" in dataset_ids  # source
        assert "j2" in job_ids  # one hop
        assert "d2" in dataset_ids  # two hops
        # d1 and j1 should NOT be reached with depth=2
        assert "d1" not in dataset_ids
        assert "j1" not in job_ids

    @pytest.mark.asyncio
    async def test_traverses_branching_pipeline(
        self, handler, mock_registry, mock_runner, branching_pipeline_data, traverse_node
    ):
        """Should follow relations through branching pipeline."""
        mock_registry.call_api = create_mock_api(branching_pipeline_data)

        ctx = {
            "state": {"source_dataset": branching_pipeline_data["datasets"]["d4"]},
            "inputs": {},
        }

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is True
        datasets = result["result"]["dataset"]
        dataset_ids = {d["id"] for d in datasets}

        # From d4, trace back via creating_job and inputs relations:
        # d4 -> j2 (creating_job) -> d3 (inputs) -> j1 (creating_job) -> d1 (inputs)
        assert "d4" in dataset_ids
        assert "d3" in dataset_ids
        assert "d1" in dataset_ids
        # Note: d2 is not reachable via inputs relation (it's a sibling output)

    @pytest.mark.asyncio
    async def test_missing_seed_returns_error(
        self, handler, mock_registry, mock_runner, traverse_node
    ):
        """Should return error if seed doesn't resolve."""
        traverse_node["seed"] = {"$ref": "state.missing"}
        ctx = {"state": {}, "inputs": {}}

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.TRAVERSE_INVALID_CONFIG

    @pytest.mark.asyncio
    async def test_missing_seed_type_returns_error(
        self, handler, mock_registry, mock_runner, simple_pipeline_data, traverse_node
    ):
        """Should return error if seed_type is missing."""
        del traverse_node["seed_type"]
        ctx = {
            "state": {"source_dataset": simple_pipeline_data["datasets"]["d1"]},
            "inputs": {},
        }

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is False
        assert result["error"]["code"] == ErrorCode.TRAVERSE_INVALID_CONFIG

    @pytest.mark.asyncio
    async def test_uses_default_limits(
        self, handler, mock_registry, mock_runner, simple_pipeline_data, traverse_node
    ):
        """Should use default limits if not specified."""
        mock_registry.call_api = create_mock_api(simple_pipeline_data)

        del traverse_node["max_depth"]
        del traverse_node["max_per_level"]
        ctx = {
            "state": {"source_dataset": simple_pipeline_data["datasets"]["d1"]},
            "inputs": {},
        }

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is True
        # Should complete without error, using defaults


class TestExtractIds:
    """Tests for ID extraction patterns."""

    @pytest.fixture
    def handler(self):
        return TraverseHandler()

    def test_simple_field(self, handler):
        """Extract from simple field."""
        entity = {"creating_job": "j1"}
        result = handler._extract_ids(entity, "creating_job", {"id_field": "id"})
        assert result == ["j1"]

    def test_simple_field_none(self, handler):
        """Return empty for None value."""
        entity = {"creating_job": None}
        result = handler._extract_ids(entity, "creating_job", {"id_field": "id"})
        assert result == []

    def test_glob_pattern(self, handler):
        """Extract from glob pattern."""
        entity = {
            "inputs": {
                "param1": {"id": "d1", "src": "hda"},
                "param2": {"id": "d2", "src": "hda"},
            }
        }
        result = handler._extract_ids(entity, "inputs.*.id", {"id_field": "id"})
        assert set(result) == {"d1", "d2"}

    def test_glob_pattern_empty_dict(self, handler):
        """Return empty for empty dict."""
        entity = {"inputs": {}}
        result = handler._extract_ids(entity, "inputs.*.id", {"id_field": "id"})
        assert result == []

    def test_glob_pattern_missing_field(self, handler):
        """Return empty for missing field."""
        entity = {}
        result = handler._extract_ids(entity, "inputs.*.id", {"id_field": "id"})
        assert result == []
