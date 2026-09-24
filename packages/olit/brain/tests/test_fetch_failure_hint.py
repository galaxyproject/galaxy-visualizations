"""A failed url fetch earns triage, not a second guess."""

import asyncio
import json

import pytest

from olit.drivers.loop import fetch_failure_hint as hint
from olit.drivers.loop.tools import ToolSurface

from .fakes import FakeSubstrate

# The shape Galaxy returned in the session this exists for.
ENA_FAILURE = {
    "id": "d1",
    "name": "SRR390728_1.fastq.gz",
    "state": "error",
    "misc_info": (
        "Failed to fetch url https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR390728/001/"
        "SRR390728_1.fastq.gz. 404 Client Error: Not Found for url: "
        "https://ftp.sra.ebi.ac.uk/vol1/fastq/SRR390728/001/SRR390728_1.fastq.gz"
    ),
}

OTHER_FAILURE = {
    "id": "d2",
    "name": "1.fastq.gz",
    "state": "error",
    "misc_info": (
        "Failed to fetch url https://raw.githubusercontent.com/galaxyproject/training-data/"
        "master/short-read/fastq/1.fastq.gz. 404 Client Error: Not Found"
    ),
}

RUNNING = {"id": "d3", "name": "SRR390728_1.fastq.gz", "state": "running", "misc_info": None}


def test_an_archive_fetch_failure_names_the_lookup():
    out = hint.for_result(ENA_FAILURE)

    assert "ena_runs" in out
    assert "not derivable" in out
    assert "fasterq_dump" in out


def test_any_other_fetch_failure_still_refuses_a_second_guess():
    out = hint.for_result(OTHER_FAILURE)

    assert "from memory" in out
    # The archive advice would be wrong here; there is no accession to look up.
    assert "ena_runs" not in out


def test_an_accession_in_the_url_is_enough_to_recognise_an_archive():
    mirrored = dict(ENA_FAILURE, misc_info="Failed to fetch url https://mirror.invalid/SRR390728_1.fastq.gz. 404")

    assert "ena_runs" in hint.for_result(mirrored)


def test_a_healthy_result_earns_nothing():
    assert hint.for_result(RUNNING) is None
    assert hint.for_result({"id": "d4", "state": "ok"}) is None
    assert hint.for_result([]) is None


def test_an_error_that_is_not_a_fetch_failure_earns_nothing():
    failed_job = {"id": "d5", "state": "error", "misc_info": "Job was killed by the cluster"}

    assert hint.for_result(failed_job) is None


@pytest.mark.parametrize("key", ["outputs", "contents", "datasets"])
def test_a_nested_dataset_is_found_whatever_the_tool_calls_the_list(key):
    assert "ena_runs" in hint.for_result({key: [RUNNING, ENA_FAILURE]})


def test_a_history_listing_is_searched_too():
    assert "ena_runs" in hint.for_result([RUNNING, ENA_FAILURE])


class FailingGalaxy:
    async def get(self, path):
        return ENA_FAILURE


def test_the_hint_rides_the_tool_result_without_deforming_it():
    substrate = FakeSubstrate(galaxy=FailingGalaxy(), capabilities=("llm", "local", "read"))
    surface = ToolSurface(substrate)
    text = asyncio.run(surface.dispatch("get_dataset_details", {"dataset_id": "d1"})).text

    payload, _, appended = text.partition("\n\n")
    # The model still gets parseable JSON; the hint sits after it, as loom appends its own.
    assert json.loads(payload)["state"] == "error"
    assert appended.startswith("[olit]")
    assert "ena_runs" in appended
