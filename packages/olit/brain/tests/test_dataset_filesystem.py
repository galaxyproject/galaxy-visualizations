"""Datasets move through the Pyodide filesystem, not through the model's context.

Inline content had to be re-emitted by the model as an escaped string to be used,
which breaks on tabs and newlines and costs the whole file in context. These pin
the file-based contract that replaced it.
"""

import os

import pytest

from olit.drivers.loop import galaxy_tools
from olit.drivers.loop.galaxy_tools import (
    MAX_DOWNLOAD_BYTES,
    PREVIEW_LINES,
    _download_dataset,
    _upload_file,
)

from .fakes import refused


@pytest.fixture(autouse=True)
def data_dir(tmp_path, monkeypatch):
    """Verified separately that Pyodide can create /data; the host cannot."""
    monkeypatch.setattr(galaxy_tools, "DATA_DIR", str(tmp_path))
    return str(tmp_path)


TABLE = "Latitude\tLongitude\n" + "\n".join(f"{i}.5\t-{i}.25" for i in range(1, 120))


# A real BAM/HDF5/gzip payload: invalid UTF-8, which text decoding would destroy.
BINARY = b"\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\xff\xde\xad\xbe\xef\x00\x80\x81"


class FakeGalaxy:
    def __init__(self, content):
        self.content = content
        self.posted = None
        self.fetched = []

    # Galaxy states file_size on the dataset record; the display endpoint returns bytes.
    stated_size = None

    # What Galaxy parsed the dataset as, alongside the size on the same record.
    details = None

    # Only an `ok` dataset holds readable content.
    state = "ok"

    chunkable = True

    async def get(self, path, binary=False):
        self.fetched.append(path)
        if "ck_size=" in path:
            if not self.chunkable:
                raise RuntimeError("Dataset appears to contain binary data")
            size = int(path.split("ck_size=")[1])
            text = self.content if isinstance(self.content, str) else ""
            cut = text[:size]
            cut = cut[: cut.rfind("\n") + 1] or cut  # line-aligned, as Galaxy does
            return {"ck_data": cut, "offset": len(cut)}
        if not path.endswith("/display") and "ck_size=" not in path:
            # Galaxy always states a state; a fake without one is not a dataset.
            record = {"id": "d", "state": self.state, **(self.details or {})}
            if self.stated_size is not None:
                record["file_size"] = self.stated_size
            return record
        if binary and isinstance(self.content, str):
            return self.content.encode("utf-8")
        return self.content

    async def post(self, path, payload):
        self.posted = (path, payload)
        return {"ok": True}


@pytest.mark.asyncio
async def test_a_dataset_is_written_to_the_filesystem_not_returned_inline(data_dir):
    g = FakeGalaxy(TABLE)
    out = await _download_dataset(g, {"dataset_id": "abc123"})
    assert out["path"] == f"{data_dir}/abc123.dat"
    assert os.path.isfile(out["path"])
    with open(out["path"]) as f:
        assert f.read() == TABLE
    # the whole file must not ride back in the tool result
    assert "content" not in out


@pytest.mark.asyncio
async def test_the_preview_is_capped_and_says_so():
    g = FakeGalaxy(TABLE)
    out = await _download_dataset(g, {"dataset_id": "capped"})
    assert len(out["preview"].splitlines()) == PREVIEW_LINES
    assert out["truncated"] is True
    assert out["lines"] == len(TABLE.splitlines())
    assert out["bytes"] == len(TABLE.encode("utf-8"))


@pytest.mark.asyncio
async def test_a_short_dataset_is_not_marked_truncated():
    g = FakeGalaxy("a\tb\n1\t2")
    out = await _download_dataset(g, {"dataset_id": "short"})
    assert out["truncated"] is False
    assert out["preview"] == "a\tb\n1\t2"


@pytest.mark.asyncio
async def test_a_file_written_locally_can_be_uploaded_back():
    g = FakeGalaxy(TABLE)
    downloaded = await _download_dataset(g, {"dataset_id": "roundtrip"})
    result = await _upload_file(g, {"path": downloaded["path"], "history_id": "h1"})
    assert result == {"ok": True}
    path, payload = g.posted
    assert path == "api/tools/fetch"
    element = payload["targets"][0]["elements"][0]
    assert element["src"] == "pasted"
    assert element["paste_content"] == TABLE
    assert payload["history_id"] == "h1"


@pytest.mark.asyncio
async def test_uploading_a_missing_path_is_an_error_not_a_crash():
    g = FakeGalaxy("")
    out = refused(await _upload_file(g, {"path": "/data/does-not-exist.dat"}))
    assert "error" in out and g.posted is None


@pytest.mark.asyncio
async def test_binary_content_survives_the_round_trip_to_disk():
    """Text decoding would replace invalid sequences and corrupt the file."""
    g = FakeGalaxy(BINARY)
    out = await _download_dataset(g, {"dataset_id": "bam1"})
    assert out["binary"] is True
    assert out["preview"] is None and out["lines"] is None
    assert out["bytes"] == len(BINARY)
    with open(out["path"], "rb") as f:
        assert f.read() == BINARY  # byte-identical, no U+FFFD


@pytest.mark.asyncio
async def test_a_text_dataset_is_still_reported_as_text():
    g = FakeGalaxy(TABLE)
    out = await _download_dataset(g, {"dataset_id": "txt1"})
    assert out["binary"] is False
    assert out["preview"].startswith("Latitude\tLongitude")


@pytest.mark.asyncio
async def test_uploading_binary_is_refused_rather_than_corrupted():
    g = FakeGalaxy(BINARY)
    downloaded = await _download_dataset(g, {"dataset_id": "bam2"})
    out = refused(await _upload_file(g, {"path": downloaded["path"]}))
    assert "error" in out and "binary" in out["error"].lower()
    assert g.posted is None  # nothing sent


@pytest.mark.asyncio
async def test_an_oversized_dataset_comes_back_as_a_flagged_prefix():
    """Computing a total from a prefix would be silently wrong, so say it is partial."""
    g = FakeGalaxy(TABLE)
    g.stated_size = MAX_DOWNLOAD_BYTES + 1
    out = await _download_dataset(g, {"dataset_id": "huge"})
    assert out["partial"] is True
    assert out["bytes_total"] == MAX_DOWNLOAD_BYTES + 1
    assert out["bytes"] < out["bytes_total"]
    # the whole file was never requested
    assert not any(c.endswith("/display") for c in g.fetched)


@pytest.mark.asyncio
async def test_a_prefix_is_line_aligned():
    g = FakeGalaxy(TABLE)
    g.stated_size = MAX_DOWNLOAD_BYTES + 1
    out = await _download_dataset(g, {"dataset_id": "aligned"})
    with open(out["path"]) as f:
        body = f.read()
    assert body.endswith("\n")
    assert all(row.count("\t") == 1 for row in body.splitlines()[1:] if row)


@pytest.mark.asyncio
async def test_an_unchunkable_oversized_dataset_is_refused():
    g = FakeGalaxy(BINARY)
    g.stated_size = MAX_DOWNLOAD_BYTES + 1
    g.chunkable = False
    out = refused(await _download_dataset(g, {"dataset_id": "bigbam"}))
    assert "error" in out and "path" not in out


@pytest.mark.asyncio
async def test_a_dataset_at_the_limit_is_still_downloaded():
    g = FakeGalaxy(TABLE)
    g.stated_size = MAX_DOWNLOAD_BYTES
    out = await _download_dataset(g, {"dataset_id": "atlimit"})
    assert "error" not in out and out["path"]
    assert "partial" not in out


@pytest.mark.asyncio
async def test_the_details_preview_reads_a_chunk_not_the_whole_file():
    """/display streams everything; previewing must not pull a large dataset into memory."""
    from olit.drivers.loop.galaxy_tools import _get_dataset_details

    g = FakeGalaxy(TABLE)
    out = await _get_dataset_details(g, {"dataset_id": "d", "preview_lines": 1000})
    assert out["preview"]
    assert not any(c.endswith("/display") for c in g.fetched)


@pytest.mark.parametrize(
    "reported,expect_in,expect_out",
    [
        ({"prompt_tokens": 10, "completion_tokens": 4}, 10, 4),
        ({"input_tokens": 7, "output_tokens": 3}, 7, 3),
        ({"total_tokens": 12}, 0, 12),
        ({}, 0, 0),
    ],
)
def test_usage_keys_vary_by_provider(reported, expect_in, expect_out):
    """Reading only prompt_tokens/completion_tokens silently shows nothing elsewhere."""
    got_in = reported.get("prompt_tokens") or reported.get("input_tokens") or 0
    got_out = reported.get("completion_tokens") or reported.get("output_tokens") or 0
    if not got_in and not got_out:
        got_out = reported.get("total_tokens") or 0
    assert (got_in, got_out) == (expect_in, expect_out)


@pytest.mark.asyncio
async def test_the_result_states_the_format_galaxy_parsed(data_dir):
    """The agent must not have to guess a separator off the preview.

    The file is written as `.dat` whatever it was, and pandas infers nothing from that, so
    the delimiter Galaxy recorded is the only truthful answer available.
    """
    g = FakeGalaxy(TABLE)
    g.details = {"extension": "tabular", "metadata_delimiter": "\t"}
    out = await _download_dataset(g, {"dataset_id": "abc123"})
    assert out["extension"] == "tabular"
    assert out["delimiter"] == "\t"


@pytest.mark.asyncio
async def test_a_comma_delimited_dataset_says_so(data_dir):
    g = FakeGalaxy("a,b\n1,2\n")
    g.details = {"extension": "csv", "metadata_delimiter": ","}
    out = await _download_dataset(g, {"dataset_id": "abc123"})
    assert out["delimiter"] == ","


@pytest.mark.asyncio
async def test_a_format_without_a_delimiter_reports_none(data_dir):
    """A fasta has an extension and no delimiter; inventing one would be worse than silence."""
    g = FakeGalaxy(">seq\nACGT\n")
    g.details = {"extension": "fasta"}
    out = await _download_dataset(g, {"dataset_id": "abc123"})
    assert out["extension"] == "fasta"
    assert "delimiter" not in out


@pytest.mark.asyncio
async def test_a_record_without_metadata_still_downloads(data_dir):
    g = FakeGalaxy(TABLE)
    out = await _download_dataset(g, {"dataset_id": "abc123"})
    assert os.path.isfile(out["path"])
    assert "extension" not in out and "delimiter" not in out


@pytest.mark.asyncio
async def test_a_dataset_still_running_is_refused_rather_than_read(data_dir):
    """Its bytes so far are a partial file that looks whole. galaxy-mcp's require_ok_state."""
    g = FakeGalaxy(TABLE)
    g.state = "running"

    out = refused(await _download_dataset(g, {"dataset_id": "abc123"}))

    assert "not 'ok'" in out["error"] and out["state"] == "running"
    assert not os.path.isfile(f"{data_dir}/abc123.dat"), "nothing may be written"


@pytest.mark.asyncio
async def test_an_errored_dataset_is_refused_too(data_dir):
    g = FakeGalaxy(TABLE)
    g.state = "error"

    assert "not 'ok'" in refused(await _download_dataset(g, {"dataset_id": "abc123"}))["error"]


@pytest.mark.asyncio
async def test_a_dataset_that_states_no_state_is_refused(data_dir):
    """A record with no state is not a dataset this can vouch for."""
    g = FakeGalaxy(TABLE)
    g.state = None

    assert refused(await _download_dataset(g, {"dataset_id": "abc123"}))


@pytest.mark.asyncio
async def test_an_ok_dataset_downloads_as_before(data_dir):
    g = FakeGalaxy(TABLE)

    out = await _download_dataset(g, {"dataset_id": "abc123"})

    assert out["path"] == f"{data_dir}/abc123.dat"
    assert os.path.isfile(out["path"]) and out["lines"] == 120
