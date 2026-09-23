"""Actionable triage when a dataset fails to fetch its source url.

Follows loom's `invocation-failure-hint`: append the imperative to a result that already
reports the failure, rather than refusing the call that caused it. Galaxy names the url and
the status; what it cannot say is that guessing another url is the wrong next move.
"""

import re

FAILED_FETCH = re.compile(r"Failed to fetch url\s+(?P<url>\S+)")
# ENA and SRA read paths, whose sharding is not derivable from an accession.
ARCHIVE_HOSTS = ("ftp.sra.ebi.ac.uk", "ftp.ncbi.nlm.nih.gov", "sra-pub", "sra-download")
ACCESSION = re.compile(r"\b[EDS]RR\d{6,}")

ARCHIVE_HINT = (
    "A sequencing-archive fetch failed. Do not construct another url: ENA and SRA fastq "
    "paths are not derivable from an accession, and whether a run is paired is a property "
    "of the run rather than its name. Call `ena_runs` with the accession to read the exact "
    "urls, checksums and layout. For more than a couple of runs, submit the accessions to "
    "fastq_dump/fasterq_dump in one call instead of fetching urls at all."
)

GENERIC_HINT = (
    "A url fetch failed. Do not retry with another url written from memory; a url that was "
    "not read from a tool result or given by the user is a guess. Establish the real "
    "location first, or tell the user what you could not find."
)


def _datasets(result):
    """Every dataset-shaped mapping in a tool result, however the tool nests them."""
    if isinstance(result, dict):
        yield result
        for key in ("outputs", "contents", "datasets"):
            value = result.get(key)
            if isinstance(value, list):
                for item in value:
                    if isinstance(item, dict):
                        yield item
    elif isinstance(result, list):
        for item in result:
            if isinstance(item, dict):
                yield item


def failed_url(result):
    """The source url a dataset in this result failed to fetch, or None."""
    for dataset in _datasets(result):
        if dataset.get("state") != "error":
            continue
        found = FAILED_FETCH.search(str(dataset.get("misc_info") or ""))
        if found:
            return found.group("url")
    return None


def for_result(result):
    """The triage line this result earns, or None when nothing failed to fetch."""
    url = failed_url(result)
    if url is None:
        return None
    archive = any(host in url for host in ARCHIVE_HOSTS) or bool(ACCESSION.search(url))
    hint = ARCHIVE_HINT if archive else GENERIC_HINT
    return f"[olit] {hint}"
