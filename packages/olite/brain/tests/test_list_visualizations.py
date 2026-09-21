"""Matching a dataset to the visualizations Galaxy can render it with."""
import asyncio
from olite.drivers.loop.galaxy_tools import _list_visualizations

COMPATIBLE = [
    {"name": "plotly", "description": "based on Plotly", "tags": ["Plotly"],
     "tracks": [{"name": "x", "type": "data_column"}], "settings": []},
    {"name": "atlas", "description": "table browser", "tags": []},
]


class Galaxy:
    def __init__(self, dataset, compatible=None, preferred=()):
        self.dataset = dataset
        self.compatible = COMPATIBLE if compatible is None else compatible
        self.preferred = preferred

    async def get(self, path, **kwargs):
        if path.startswith("api/datasets/"):
            return self.dataset
        if path.startswith("api/plugins"):
            return self.compatible
        if path.endswith("/visualizations"):
            return [{"visualization": name} for name in self.preferred]
        return []


def run(dataset, compatible=None, preferred=()):
    return asyncio.run(_list_visualizations(Galaxy(dataset, compatible, preferred), {"dataset_id": "d1"}))


def test_the_server_decides_what_is_compatible():
    out = run({"extension": "tabular", "metadata_columns": 3, "metadata_column_types": ["int", "float", "str"]})
    assert [v["name"] for v in out["visualizations"]] == ["plotly", "atlas"]


def test_the_datatype_preference_is_marked_and_ranked_first():
    out = run({"extension": "tabular", "metadata_columns": 2, "metadata_column_types": ["int", "int"]},
              preferred=("atlas",))
    assert out["visualizations"][0]["name"] == "atlas"
    assert out["visualizations"][0]["preferred_for_datatype"] is True
    assert "preferred_for_datatype" not in out["visualizations"][1]


def test_a_dataset_without_numeric_columns_is_told_why_and_what_else_to_try():
    out = run({"extension": "tabular", "metadata_columns": 1, "metadata_column_types": ["list"]})
    assert "no numeric columns" in out["hint"]
    assert "vintent_dataset" in out["hint"]


def test_numeric_columns_need_no_hint():
    out = run({"extension": "tabular", "metadata_columns": 2, "metadata_column_types": ["int", "float"]})
    assert "hint" not in out


def test_a_datatype_nothing_can_render_says_so_rather_than_returning_nothing():
    out = run({"extension": "bam", "metadata_columns": None, "metadata_column_types": []}, compatible=[])
    assert out["visualizations"] == []
    assert "No installed visualization accepts" in out["hint"]


def test_column_parameters_are_reported_so_the_agent_knows_what_must_be_filled():
    out = run({"extension": "tabular", "metadata_columns": 2, "metadata_column_types": ["int", "int"]})
    plotly = next(v for v in out["visualizations"] if v["name"] == "plotly")
    assert plotly["column_parameters"] == ["x"]


def test_it_answers_only_what_can_render_the_dataset():
    """Columns belong to get_dataset_details.

    Carrying them here made a column lookup double as a plugin advertisement, and tabular
    charting drifted off vintent_dataset toward whichever plugin the listing surfaced.
    """
    out = run({"extension": "tabular", "metadata_columns": 3,
               "metadata_column_types": ["int", "float", "str"]})
    assert "columns" not in out
    assert "column_types" not in out
    assert set(out) <= {"dataset_id", "extension", "visualizations", "hint"}
