"""Showing a visualization renders it; saving is what puts an object in Galaxy."""
import asyncio
from urllib.parse import parse_qs, urlparse

from olite.drivers.loop.galaxy_tools import _save_visualization, _show_visualization

INSTALLED = [{"name": "atlas"}, {"name": "aladin"}]


class Galaxy:
    def __init__(self, compatible=("atlas",)):
        self.compatible, self.posted, self.put_to = compatible, None, None

    async def get(self, path, **kwargs):
        if path.startswith("api/datasets/"):
            return {"extension": "tabular", "name": "sample.tabular"}
        if path.startswith("api/plugins?"):
            return [{"name": n} for n in self.compatible]
        if path == "api/plugins":
            return INSTALLED
        return []

    async def post(self, path, body):
        self.posted = (path, body)
        return {"id": "v1"}

    async def put(self, path, body=None):
        self.put_to = (path, body)
        return {"id": path.rsplit("/", 1)[-1]}


def show(g, **args):
    return asyncio.run(_show_visualization(g, {"dataset_id": "d1", **args}))


def save(g, **args):
    return asyncio.run(_save_visualization(g, {"dataset_id": "d1", **args}))


def query_of(result):
    return parse_qs(urlparse(result["artifact"]["url"]).query)


def test_showing_puts_nothing_in_galaxy():
    g = Galaxy()
    out = show(g, visualization="atlas")
    assert out["shown"] is True
    assert g.posted is None, "rendering must not create a saved visualization"


def test_the_shown_address_names_the_plugin():
    """Galaxy reads the plugin name from the query; without it the page renders nothing."""
    g = Galaxy()
    q = query_of(show(g, visualization="atlas"))
    assert q["visualization"] == ["atlas"]
    assert q["dataset_id"] == ["d1"]
    assert "visualization_id" not in q


def test_the_shown_address_asks_for_a_bare_page():
    g = Galaxy()
    q = query_of(show(g, visualization="atlas"))
    assert q["hide_panels"] == ["true"] and q["hide_masthead"] == ["true"]


def test_the_saved_address_names_the_plugin_beside_the_id():
    g = Galaxy()
    q = query_of(save(g, visualization="atlas"))
    assert q["visualization"] == ["atlas"] and q["visualization_id"] == ["v1"]


def test_a_visualization_the_server_does_not_have_is_refused_either_way():
    for call, key in ((show, "shown"), (save, "saved")):
        g = Galaxy()
        out = call(g, visualization="not_installed")
        assert out[key] is False and g.posted is None
        assert "not an installed visualization" in out["error"]


def test_an_installed_visualization_that_cannot_render_the_dataset_is_refused_either_way():
    for call, key in ((show, "shown"), (save, "saved")):
        g = Galaxy(compatible=("atlas",))
        out = call(g, visualization="aladin")
        assert out[key] is False and g.posted is None
        assert out["can_render_it"] == ["atlas"]


def test_saving_records_the_dataset_in_its_config():
    g = Galaxy()
    out = save(g, visualization="atlas", title="A table")
    assert out["saved"] is True
    path, body = g.posted
    assert path == "api/visualizations"
    assert body["type"] == "atlas" and body["title"] == "A table"
    assert body["config"] == {"dataset_id": "d1"}


def test_a_missing_title_falls_back_to_the_dataset_name():
    g = Galaxy()
    assert save(g, visualization="atlas") and g.posted[1]["title"] == "atlas of sample.tabular"
    assert show(Galaxy(), visualization="atlas")["title"] == "atlas of sample.tabular"


def test_settings_and_tracks_reach_the_saved_config():
    g = Galaxy()
    save(g, visualization="atlas", settings={"x_axis_label": "Time"}, tracks=[{"x": "1"}])
    config = g.posted[1]["config"]
    assert config["settings"] == {"x_axis_label": "Time"}
    assert config["tracks"] == [{"x": "1"}]


def test_nothing_optional_is_sent_when_not_given():
    g = Galaxy()
    save(g, visualization="atlas")
    assert g.posted[1]["config"] == {"dataset_id": "d1"}


def test_a_saved_visualization_is_revised_rather_than_duplicated():
    """Settings can only ride in a saved config, so changing them must not add a row."""
    g = Galaxy()
    out = save(g, visualization="atlas", visualization_id="v9",
               settings={"x_axis_label": "Time"})

    assert g.posted is None, "revising must not create a second visualization"
    path, body = g.put_to
    assert path == "api/visualizations/v9"
    assert body["config"]["settings"] == {"x_axis_label": "Time"}
    assert out["visualization_id"] == "v9"


def test_the_revised_address_still_names_the_plugin():
    g = Galaxy()
    q = query_of(save(g, visualization="atlas", visualization_id="v9"))
    assert q["visualization"] == ["atlas"] and q["visualization_id"] == ["v9"]


IGV_PLUGIN = {
    "name": "igv",
    "settings": [{"name": "locus", "type": "text"}],
    "tracks": [{"name": "urlDataset", "type": "data"}, {"name": "displayMode", "type": "select"}],
}


class DeclaringGalaxy(Galaxy):
    async def get(self, path, **kwargs):
        if path == "api/plugins/igv":
            return IGV_PLUGIN
        if path.startswith("api/plugins?"):
            return [{"name": "igv"}]
        if path == "api/plugins":
            return [{"name": "igv"}]
        return await super().get(path, **kwargs)


def test_a_track_key_the_plugin_does_not_declare_is_refused():
    """The shape is published; inventing a key produces a track no plugin reads."""
    g = DeclaringGalaxy()
    out = save(g, visualization="igv", tracks=[{"dataset_id": "d1"}])

    assert out["saved"] is False and g.posted is None
    assert "dataset_id" in out["error"]
    assert "urlDataset" in out["declared"]
    assert "get_visualization_details" in out["hint"]


def test_the_declared_track_key_is_accepted():
    g = DeclaringGalaxy()
    out = save(g, visualization="igv", tracks=[{"urlDataset": {"id": "d1"}, "displayMode": "EXPANDED"}])
    assert out["saved"] is True and g.posted is not None


def test_a_plugin_declaring_nothing_is_not_treated_as_allowing_nothing():
    g = Galaxy()
    assert save(g, visualization="atlas", settings={"anything": 1})["saved"] is True
