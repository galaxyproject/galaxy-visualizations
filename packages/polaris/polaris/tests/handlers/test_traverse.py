"""Tests for traverse handler."""

import pytest
from unittest.mock import AsyncMock, MagicMock

from polaris.modules.constants import ErrorCode
from polaris.modules.handlers.traverse import TraverseHandler, MAX_FETCHES


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


class TestExtractRefs:
    """Tests for reference extraction patterns."""

    @pytest.fixture
    def handler(self):
        return TraverseHandler()

    def test_simple_field(self, handler):
        """Extract from simple field."""
        entity = {"creating_job": "j1"}
        result = handler._extract_refs(entity, "creating_job", "id", "id")
        assert result == [{"id": "j1"}]

    def test_simple_field_none(self, handler):
        """Return empty for None value."""
        entity = {"creating_job": None}
        result = handler._extract_refs(entity, "creating_job", "id", "id")
        assert result == []

    def test_glob_pattern_with_id_only(self, handler):
        """Extract from glob pattern with id field."""
        entity = {
            "inputs": {
                "param1": {"id": "d1", "src": "hda"},
                "param2": {"id": "d2", "src": "hda"},
            }
        }
        result = handler._extract_refs(entity, "inputs.*.id", "id", "id")
        ids = {r["id"] for r in result}
        assert ids == {"d1", "d2"}

    def test_glob_pattern_extracts_dedup_field(self, handler):
        """Extract both id and dedup (uuid) from objects."""
        entity = {
            "inputs": {
                "param1": {"id": "d1", "uuid": "uuid-1"},
                "param2": {"id": "d2", "uuid": "uuid-2"},
            }
        }
        # Extract full objects (inputs.*) with different dedup field
        result = handler._extract_refs(entity, "inputs.*", "id", "uuid")
        assert len(result) == 2
        refs_by_id = {r["id"]: r for r in result}
        assert refs_by_id["d1"]["dedup"] == "uuid-1"
        assert refs_by_id["d2"]["dedup"] == "uuid-2"

    def test_glob_pattern_same_uuid_different_ids(self, handler):
        """Extract refs where multiple inputs have same uuid."""
        entity = {
            "inputs": {
                "param1": {"id": "d1", "uuid": "uuid-shared"},
                "param2": {"id": "d2", "uuid": "uuid-shared"},
                "param3": {"id": "d3", "uuid": "uuid-other"},
            }
        }
        result = handler._extract_refs(entity, "inputs.*", "id", "uuid")
        assert len(result) == 3
        # All should have dedup values
        for ref in result:
            assert "dedup" in ref

    def test_glob_pattern_empty_dict(self, handler):
        """Return empty for empty dict."""
        entity = {"inputs": {}}
        result = handler._extract_refs(entity, "inputs.*", "id", "uuid")
        assert result == []

    def test_glob_pattern_missing_field(self, handler):
        """Return empty for missing field."""
        entity = {}
        result = handler._extract_refs(entity, "inputs.*", "id", "uuid")
        assert result == []

    def test_no_dedup_field_in_data(self, handler):
        """Handle case where dedup field doesn't exist in data."""
        entity = {
            "inputs": {
                "param1": {"id": "d1"},  # No uuid
            }
        }
        result = handler._extract_refs(entity, "inputs.*", "id", "uuid")
        assert result == [{"id": "d1"}]  # No dedup key


class TestDedupField:
    """Tests for dedup_field functionality."""

    @pytest.fixture
    def handler(self):
        return TraverseHandler()

    @pytest.fixture
    def mock_registry(self):
        registry = MagicMock()
        registry.call_api = AsyncMock()
        return registry

    @pytest.fixture
    def mock_runner(self):
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
    def collection_pipeline_data(self):
        """
        Pipeline with collection elements: same uuid, different ids.
        This simulates Galaxy collection behavior where collection elements
        have unique IDs but share the same underlying data UUID.

        D1 (collection element 1, uuid-shared) -> J1 -> D3
        D2 (collection element 2, uuid-shared) -> J1 -> D3
        """
        return {
            "datasets": {
                "d1": {
                    "id": "d1",
                    "uuid": "uuid-shared",
                    "name": "Collection Element 1",
                    "creating_job": None,
                },
                "d2": {
                    "id": "d2",
                    "uuid": "uuid-shared",  # Same UUID as d1
                    "name": "Collection Element 2",
                    "creating_job": None,
                },
                "d3": {
                    "id": "d3",
                    "uuid": "uuid-d3",
                    "name": "Output",
                    "creating_job": "j1",
                },
            },
            "jobs": {
                "j1": {
                    "id": "j1",
                    "tool_id": "tool",
                    "inputs": {
                        "input1": {"id": "d1", "uuid": "uuid-shared"},
                        "input2": {"id": "d2", "uuid": "uuid-shared"},
                    },
                    "outputs": {"output1": {"id": "d3", "uuid": "uuid-d3"}},
                },
            },
        }

    @pytest.mark.asyncio
    async def test_dedup_by_uuid_removes_duplicates(
        self, handler, mock_registry, mock_runner, collection_pipeline_data
    ):
        """With dedup_field=uuid, datasets with same uuid should be deduplicated."""
        mock_registry.call_api = create_mock_api(collection_pipeline_data)

        traverse_node = {
            "type": "traverse",
            "seed": {"$ref": "state.source_dataset"},
            "seed_type": "dataset",
            "max_depth": 10,
            "max_per_level": 10,
            "types": {
                "dataset": {
                    "id_field": "id",
                    "dedup_field": "uuid",  # Deduplicate by uuid
                    "fetch": {
                        "target": "galaxy.datasets.show.get",
                        "id_param": "dataset_id",
                    },
                    "relations": {
                        "creating_job": {"type": "job", "extract": "creating_job"},
                    },
                },
                "job": {
                    "id_field": "id",
                    "fetch": {
                        "target": "galaxy.jobs.show.get",
                        "id_param": "job_id",
                    },
                    "relations": {
                        "inputs": {"type": "dataset", "extract": "inputs.*.id"},
                    },
                },
            },
        }

        ctx = {
            "state": {"source_dataset": collection_pipeline_data["datasets"]["d3"]},
            "inputs": {},
        }

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is True
        datasets = result["result"]["dataset"]

        # With dedup_field=uuid, d1 and d2 share the same uuid
        # So only one of them should be collected (plus d3)
        assert len(datasets) == 2  # d3 + one of d1/d2

        # Verify we have exactly 2 unique UUIDs
        uuids = {d["uuid"] for d in datasets}
        assert uuids == {"uuid-d3", "uuid-shared"}

    @pytest.mark.asyncio
    async def test_dedup_by_id_keeps_same_uuid_datasets(
        self, handler, mock_registry, mock_runner, collection_pipeline_data
    ):
        """Without dedup_field (default), datasets with same uuid but different id are kept."""
        mock_registry.call_api = create_mock_api(collection_pipeline_data)

        traverse_node = {
            "type": "traverse",
            "seed": {"$ref": "state.source_dataset"},
            "seed_type": "dataset",
            "max_depth": 10,
            "max_per_level": 10,
            "types": {
                "dataset": {
                    "id_field": "id",
                    # No dedup_field - defaults to id_field
                    "fetch": {
                        "target": "galaxy.datasets.show.get",
                        "id_param": "dataset_id",
                    },
                    "relations": {
                        "creating_job": {"type": "job", "extract": "creating_job"},
                    },
                },
                "job": {
                    "id_field": "id",
                    "fetch": {
                        "target": "galaxy.jobs.show.get",
                        "id_param": "job_id",
                    },
                    "relations": {
                        "inputs": {"type": "dataset", "extract": "inputs.*.id"},
                    },
                },
            },
        }

        ctx = {
            "state": {"source_dataset": collection_pipeline_data["datasets"]["d3"]},
            "inputs": {},
        }

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is True
        datasets = result["result"]["dataset"]

        # Without dedup_field, both d1 and d2 are kept (different IDs)
        assert len(datasets) == 3  # d3 + d1 + d2

        dataset_ids = {d["id"] for d in datasets}
        assert dataset_ids == {"d1", "d2", "d3"}

    @pytest.mark.asyncio
    async def test_dedup_field_on_seed(
        self, handler, mock_registry, mock_runner, collection_pipeline_data
    ):
        """Seed dataset should also use dedup_field for visited tracking."""
        mock_registry.call_api = create_mock_api(collection_pipeline_data)

        # Create a scenario where seed has same uuid as another dataset
        collection_pipeline_data["datasets"]["d3"]["uuid"] = "uuid-shared"

        traverse_node = {
            "type": "traverse",
            "seed": {"$ref": "state.source_dataset"},
            "seed_type": "dataset",
            "max_depth": 10,
            "max_per_level": 10,
            "types": {
                "dataset": {
                    "id_field": "id",
                    "dedup_field": "uuid",
                    "fetch": {
                        "target": "galaxy.datasets.show.get",
                        "id_param": "dataset_id",
                    },
                    "relations": {
                        "creating_job": {"type": "job", "extract": "creating_job"},
                    },
                },
                "job": {
                    "id_field": "id",
                    "fetch": {
                        "target": "galaxy.jobs.show.get",
                        "id_param": "job_id",
                    },
                    "relations": {
                        "inputs": {"type": "dataset", "extract": "inputs.*.id"},
                    },
                },
            },
        }

        ctx = {
            "state": {"source_dataset": collection_pipeline_data["datasets"]["d3"]},
            "inputs": {},
        }

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is True
        datasets = result["result"]["dataset"]

        # d3, d1, d2 all have uuid-shared, so only one should be collected
        assert len(datasets) == 1
        # The seed (d3) should be the one collected
        assert datasets[0]["id"] == "d3"

    @pytest.mark.asyncio
    async def test_traverses_through_same_uuid_different_id(
        self, handler, mock_registry, mock_runner
    ):
        """
        Test collection extraction scenario: traverse through entity with same UUID but different ID.

        Scenario:
        - D_source (id: d_source, uuid: uuid-source) is the original input
        - J_collection creates collection element D_col (id: d_col, uuid: uuid-source)
        - J_extract extracts from collection, creating D_out (id: d_out, uuid: uuid-source)

        Starting from D_out, we should traverse:
        D_out -> J_extract -> D_col (same UUID, different ID) -> J_collection -> D_source

        The key issue: D_out and D_col have the same UUID. We must still traverse
        through D_col to reach J_collection and D_source, even though UUID was "visited".
        """
        pipeline_data = {
            "datasets": {
                "d_source": {
                    "id": "d_source",
                    "uuid": "uuid-original",
                    "name": "Original Source",
                    "creating_job": None,
                },
                "d_col": {
                    "id": "d_col",
                    "uuid": "uuid-source",  # UUID preserved in collection
                    "name": "Collection Element",
                    "creating_job": "j_collection",
                },
                "d_out": {
                    "id": "d_out",
                    "uuid": "uuid-source",  # Same UUID as d_col (extraction preserves UUID)
                    "name": "Extracted Output",
                    "creating_job": "j_extract",
                },
            },
            "jobs": {
                "j_collection": {
                    "id": "j_collection",
                    "tool_id": "collection_creator",
                    "inputs": {"input1": {"id": "d_source", "uuid": "uuid-original"}},
                    "outputs": {"output1": {"id": "d_col", "uuid": "uuid-source"}},
                },
                "j_extract": {
                    "id": "j_extract",
                    "tool_id": "__EXTRACT_DATASET__",
                    # Input is d_col, output is d_out - both have same UUID
                    "inputs": {"input1": {"id": "d_col", "uuid": "uuid-source"}},
                    "outputs": {"output1": {"id": "d_out", "uuid": "uuid-source"}},
                },
            },
        }

        mock_registry.call_api = create_mock_api(pipeline_data)

        traverse_node = {
            "type": "traverse",
            "seed": {"$ref": "state.source_dataset"},
            "seed_type": "dataset",
            "max_depth": 10,
            "max_per_level": 10,
            "types": {
                "dataset": {
                    "id_field": "id",
                    "dedup_field": "uuid",  # Dedup by UUID
                    "fetch": {
                        "target": "galaxy.datasets.show.get",
                        "id_param": "dataset_id",
                    },
                    "relations": {
                        "creating_job": {"type": "job", "extract": "creating_job"},
                    },
                },
                "job": {
                    "id_field": "id",
                    "fetch": {
                        "target": "galaxy.jobs.show.get",
                        "id_param": "job_id",
                    },
                    "relations": {
                        "inputs": {"type": "dataset", "extract": "inputs.*"},
                    },
                },
            },
        }

        ctx = {
            "state": {"source_dataset": pipeline_data["datasets"]["d_out"]},
            "inputs": {},
        }

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is True
        datasets = result["result"]["dataset"]
        jobs = result["result"]["job"]

        dataset_ids = {d["id"] for d in datasets}
        job_ids = {j["id"] for j in jobs}

        # Critical: We should have traversed through d_col to find j_collection and d_source
        # Even though d_out and d_col have the same UUID, we followed d_col's creating_job
        assert "j_extract" in job_ids, "Should find j_extract (d_out's creating job)"
        assert "j_collection" in job_ids, "Should find j_collection (d_col's creating job)"
        assert "d_source" in dataset_ids, "Should reach d_source through d_col -> j_collection"

        # Verify deduplication still works - only 2 datasets collected (d_out and d_source)
        # d_col has same UUID as d_out, so it shouldn't be in collected
        uuids = {d["uuid"] for d in datasets}
        assert len(uuids) == 2, "Should have 2 unique UUIDs"
        assert uuids == {"uuid-source", "uuid-original"}

    @pytest.mark.asyncio
    async def test_max_per_level_limits_fetches(
        self, handler, mock_registry, mock_runner
    ):
        """
        max_per_level limits total fetches per level to prevent runaway API calls.

        This ensures bounded behavior even with pathological data.
        """
        # Create data where job has 5 inputs
        pipeline_data = {
            "datasets": {
                "d_out": {"id": "d_out", "uuid": "uuid-out", "creating_job": "j1"},
                "d1": {"id": "d1", "uuid": "uuid-1", "creating_job": None},
                "d2": {"id": "d2", "uuid": "uuid-2", "creating_job": None},
                "d3": {"id": "d3", "uuid": "uuid-3", "creating_job": None},
                "d4": {"id": "d4", "uuid": "uuid-4", "creating_job": None},
                "d5": {"id": "d5", "uuid": "uuid-5", "creating_job": None},
            },
            "jobs": {
                "j1": {
                    "id": "j1",
                    "tool_id": "tool",
                    "inputs": {
                        "in1": {"id": "d1", "uuid": "uuid-1"},
                        "in2": {"id": "d2", "uuid": "uuid-2"},
                        "in3": {"id": "d3", "uuid": "uuid-3"},
                        "in4": {"id": "d4", "uuid": "uuid-4"},
                        "in5": {"id": "d5", "uuid": "uuid-5"},
                    },
                    "outputs": {"out": {"id": "d_out", "uuid": "uuid-out"}},
                },
            },
        }

        mock_registry.call_api = create_mock_api(pipeline_data)

        traverse_node = {
            "type": "traverse",
            "seed": {"$ref": "state.source_dataset"},
            "seed_type": "dataset",
            "max_depth": 10,
            "max_per_level": 3,  # Limit to 3 fetches per level
            "types": {
                "dataset": {
                    "id_field": "id",
                    "dedup_field": "uuid",
                    "fetch": {
                        "target": "galaxy.datasets.show.get",
                        "id_param": "dataset_id",
                    },
                    "relations": {
                        "creating_job": {"type": "job", "extract": "creating_job"},
                    },
                },
                "job": {
                    "id_field": "id",
                    "fetch": {
                        "target": "galaxy.jobs.show.get",
                        "id_param": "job_id",
                    },
                    "relations": {
                        "inputs": {"type": "dataset", "extract": "inputs.*"},
                    },
                },
            },
        }

        ctx = {
            "state": {"source_dataset": pipeline_data["datasets"]["d_out"]},
            "inputs": {},
        }

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is True
        datasets = result["result"]["dataset"]
        jobs = result["result"]["job"]

        # Should have: d_out (seed) + j1 (depth 1) + max 3 datasets (depth 2)
        assert len(jobs) == 1  # j1
        # Datasets: d_out (seed, not counted) + 3 from inputs (limited by max_per_level)
        # Total should be 4 (seed + 3 fetched)
        assert len(datasets) == 4, "Should have seed + 3 fetched datasets (limited by max_per_level)"


class TestMaxFetchesLimit:
    """Tests for MAX_FETCHES hard limit on total API calls."""

    @pytest.fixture
    def handler(self):
        return TraverseHandler()

    @pytest.fixture
    def mock_registry(self):
        registry = MagicMock()
        registry.call_api = AsyncMock()
        return registry

    @pytest.fixture
    def mock_runner(self):
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

    @pytest.mark.asyncio
    async def test_max_fetches_limits_total_api_calls(
        self, handler, mock_registry, mock_runner
    ):
        """
        MAX_FETCHES limits total API calls across all levels to prevent overload.

        This test creates a deep pipeline that would require more than MAX_FETCHES
        API calls if unbounded, and verifies the traversal stops at the limit.
        """
        # Create a linear chain of datasets/jobs that exceeds MAX_FETCHES
        # Each step: dataset -> job -> dataset -> job -> ...
        # We need MAX_FETCHES + 10 entities to ensure we hit the limit
        num_datasets = MAX_FETCHES + 10
        num_jobs = num_datasets - 1

        datasets = {}
        jobs = {}

        # Create linear chain: d0 -> j0 -> d1 -> j1 -> d2 -> ...
        for i in range(num_datasets):
            datasets[f"d{i}"] = {
                "id": f"d{i}",
                "uuid": f"uuid-{i}",
                "name": f"Dataset {i}",
                "creating_job": f"j{i-1}" if i > 0 else None,
            }

        for i in range(num_jobs):
            jobs[f"j{i}"] = {
                "id": f"j{i}",
                "tool_id": "tool",
                "inputs": {f"input": {"id": f"d{i}", "uuid": f"uuid-{i}"}},
                "outputs": {f"output": {"id": f"d{i+1}", "uuid": f"uuid-{i+1}"}},
            }

        pipeline_data = {"datasets": datasets, "jobs": jobs}

        # Track API calls
        api_call_count = 0

        async def counting_mock_api(ctx, spec):
            nonlocal api_call_count
            api_call_count += 1

            target = spec.get("target", "")
            input_data = spec.get("input", {})

            if "datasets" in target:
                dataset_id = input_data.get("dataset_id")
                if dataset_id in pipeline_data["datasets"]:
                    return {"ok": True, "result": pipeline_data["datasets"][dataset_id]}
                return {"ok": False, "error": {"message": f"Dataset not found: {dataset_id}"}}

            if "jobs" in target:
                job_id = input_data.get("job_id")
                if job_id in pipeline_data["jobs"]:
                    return {"ok": True, "result": pipeline_data["jobs"][job_id]}
                return {"ok": False, "error": {"message": f"Job not found: {job_id}"}}

            return {"ok": False, "error": {"message": f"Unknown target: {target}"}}

        mock_registry.call_api = counting_mock_api

        # Start from the last dataset to traverse the whole chain
        last_dataset_id = f"d{num_datasets - 1}"

        traverse_node = {
            "type": "traverse",
            "seed": {"$ref": "state.source_dataset"},
            "seed_type": "dataset",
            "max_depth": 100,  # High depth to not limit by depth
            "max_per_level": 100,  # High per-level to not limit by level
            "types": {
                "dataset": {
                    "id_field": "id",
                    "fetch": {
                        "target": "galaxy.datasets.show.get",
                        "id_param": "dataset_id",
                    },
                    "relations": {
                        "creating_job": {"type": "job", "extract": "creating_job"},
                    },
                },
                "job": {
                    "id_field": "id",
                    "fetch": {
                        "target": "galaxy.jobs.show.get",
                        "id_param": "job_id",
                    },
                    "relations": {
                        "inputs": {"type": "dataset", "extract": "inputs.*.id"},
                    },
                },
            },
        }

        ctx = {
            "state": {"source_dataset": pipeline_data["datasets"][last_dataset_id]},
            "inputs": {},
        }

        result = await handler.execute(traverse_node, ctx, mock_registry, mock_runner)

        assert result["ok"] is True

        # Verify API calls were limited by MAX_FETCHES
        assert api_call_count <= MAX_FETCHES, (
            f"API calls ({api_call_count}) should not exceed MAX_FETCHES ({MAX_FETCHES})"
        )

        # Verify we actually hit the limit (not just finishing early)
        assert api_call_count == MAX_FETCHES, (
            f"Should have made exactly MAX_FETCHES ({MAX_FETCHES}) API calls, made {api_call_count}"
        )
