"""ENA lookup: real download URLs and paired-ness, read rather than constructed."""

import asyncio
import json

import pytest

from olit.drivers.loop import ena
from olit.drivers.loop.tools import ToolSurface
from .fakes import FakeSubstrate

# A paired run, its real sharding: first six characters, then no numbered subdirectory.
PAIRED = (
    "run_accession\tlibrary_layout\tfastq_ftp\tfastq_md5\tfastq_bytes\tread_count\tscientific_name\n"
    "SRR390728\tPAIRED\t"
    "ftp.sra.ebi.ac.uk/vol1/fastq/SRR390/SRR390728/SRR390728_1.fastq.gz;"
    "ftp.sra.ebi.ac.uk/vol1/fastq/SRR390/SRR390728/SRR390728_2.fastq.gz\t"
    "aaa;bbb\t101304405;101858469\t7156186\tHomo sapiens\n"
)

# Named like a paired run and single-ended; the name cannot tell you which it is.
SINGLE = (
    "run_accession\tlibrary_layout\tfastq_ftp\tfastq_md5\tfastq_bytes\tread_count\tscientific_name\n"
    "SRR1031972\tSINGLE\t"
    "ftp.sra.ebi.ac.uk/vol1/fastq/SRR103/002/SRR1031972/SRR1031972.fastq.gz\t"
    "ccc\t770792599\t12000000\tMus musculus\n"
)

STUDY = (
    "run_accession\tlibrary_layout\tfastq_ftp\tfastq_md5\tfastq_bytes\tread_count\tscientific_name\n"
    + "".join(
        f"SRR1168499{i}\tPAIRED\t"
        f"ftp.sra.ebi.ac.uk/vol1/fastq/SRR116/09{i}/SRR1168499{i}/SRR1168499{i}_1.fastq.gz;"
        f"ftp.sra.ebi.ac.uk/vol1/fastq/SRR116/09{i}/SRR1168499{i}/SRR1168499{i}_2.fastq.gz\t"
        f"m{i};n{i}\t100;200\t21521133\tMus musculus\n"
        for i in range(4)
    )
)

EMPTY = "run_accession\tlibrary_layout\tfastq_ftp\n"


class FakeHttp:
    def __init__(self, answer):
        self.answer = answer
        self.calls = []

    async def request(self, method, url, headers=None, body=None):
        self.calls.append(url)
        if isinstance(self.answer, Exception):
            raise self.answer
        return self.answer


def net(monkeypatch, answer):
    client = FakeHttp(answer)
    monkeypatch.setattr(ena, "http", client)
    return client


def run(coro):
    return asyncio.run(coro)


def test_a_paired_run_returns_both_mates_as_fetchable_urls(monkeypatch):
    net(monkeypatch, PAIRED)
    out = run(ena._ena_runs({"accession": "SRR390728"}))

    assert out["count"] == 1
    only = out["runs"][0]
    assert only["paired"] is True
    # ENA lists paths with no scheme; upload_file_from_url needs one.
    assert only["urls"] == [
        "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR390/SRR390728/SRR390728_1.fastq.gz",
        "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR390/SRR390728/SRR390728_2.fastq.gz",
    ]
    assert only["md5"] == ["aaa", "bbb"]
    assert only["bytes"] == [101304405, 101858469]


def test_a_single_end_run_is_reported_as_one_file(monkeypatch):
    net(monkeypatch, SINGLE)
    out = run(ena._ena_runs({"accession": "SRR1031972"}))

    only = out["runs"][0]
    assert only["paired"] is False
    assert only["layout"] == "SINGLE"
    assert len(only["urls"]) == 1
    # The `_1` a constructed path would have asked for does not exist.
    assert not any(u.endswith("_1.fastq.gz") for u in only["urls"])


def test_a_study_returns_every_run_under_it(monkeypatch):
    net(monkeypatch, STUDY)
    out = run(ena._ena_runs({"accession": "PRJNA630239"}))

    assert out["count"] == 4
    assert [r["run"] for r in out["runs"]] == [f"SRR1168499{i}" for i in range(4)]
    assert all(r["paired"] for r in out["runs"])


def test_a_long_study_is_capped_and_says_so(monkeypatch):
    net(monkeypatch, STUDY)
    out = run(ena._ena_runs({"accession": "PRJNA630239", "limit": 2}))

    assert out["count"] == 2
    assert out["truncated"] is True
    assert "limit" in out["note"]


def test_the_limit_is_clamped_rather_than_trusted(monkeypatch):
    client = net(monkeypatch, STUDY)
    run(ena._ena_runs({"accession": "PRJNA630239", "limit": 10**6}))
    assert f"limit={ena.RUNS_MAX + 1}" in client.calls[0]


def test_an_accession_cannot_rewrite_the_query(monkeypatch):
    client = net(monkeypatch, EMPTY)
    run(ena._ena_runs({"accession": "SRR1&result=analysis"}))
    # One `result=` only: the accession is a value, never another parameter.
    assert client.calls[0].count("result=") == 1


def test_a_rejected_accession_reports_what_ena_said(monkeypatch):
    net(monkeypatch, RuntimeError("HTTP 400: Accession(s) NOPE not valid for search requests"))
    out = run(ena._ena_runs({"accession": "NOPE"}))

    assert "not valid" in out["error"]
    assert "runs" not in out


def test_a_long_error_is_trimmed(monkeypatch):
    net(monkeypatch, RuntimeError("HTTP 400: " + "x" * 5000))
    out = run(ena._ena_runs({"accession": "NOPE"}))

    assert len(out["error"]) <= ena.ERROR_MAX_CHARS + 4


def test_an_accession_with_no_runs_says_so_rather_than_failing(monkeypatch):
    net(monkeypatch, EMPTY)
    out = run(ena._ena_runs({"accession": "SAMN00000000"}))

    assert out["count"] == 0
    assert out["runs"] == []
    assert "no sequencing runs" in out["hint"]


def test_a_missing_accession_is_refused_before_any_fetch(monkeypatch):
    client = net(monkeypatch, PAIRED)
    out = run(ena._ena_runs({}))

    assert "required" in out["error"]
    assert client.calls == []


def test_the_result_points_at_the_importer_rather_than_at_url_uploads(monkeypatch):
    net(monkeypatch, PAIRED)
    out = run(ena._ena_runs({"accession": "SRR390728"}))

    assert "fasterq_dump" in out["hint"]
    assert "never edit or construct one" in out["hint"]


def test_the_tool_is_advertised_and_dispatchable(monkeypatch):
    net(monkeypatch, PAIRED)
    surface = ToolSurface(FakeSubstrate(capabilities=("llm", "local")))
    assert "ena_runs" in [t["function"]["name"] for t in surface.schemas()]

    out = json.loads(asyncio.run(surface.dispatch("ena_runs", {"accession": "SRR390728"})).text)
    assert out["runs"][0]["run"] == "SRR390728"


def test_the_schema_tells_the_model_not_to_construct_urls():
    description = ena.ENA_RUNS["function"]["description"]
    assert "cannot be derived" in description
    assert "guessing" in description
