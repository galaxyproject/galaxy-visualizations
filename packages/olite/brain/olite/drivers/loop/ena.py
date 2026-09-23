"""ENA accession lookup: the real download URLs for a run, experiment, sample or study.

ENA's fastq paths are not derivable from an accession -- the shard directory is its first
six characters and the numbered subdirectory depends on its length -- and whether a run is
paired at all is a property of the run, not of its name. Both are read from ENA here rather
than constructed, because a constructed path 404s and the agent cannot tell which part it
got wrong.
"""

import logging
from urllib.parse import quote

from olite.substrate.http import http

logger = logging.getLogger(__name__)

ENA_HOST = "www.ebi.ac.uk"
ENA_API = f"https://{ENA_HOST}/ena/portal/api/filereport"
FIELDS = ("run_accession,library_layout,fastq_ftp,fastq_md5,fastq_bytes,"
          "read_count,scientific_name")
# A study can hold thousands of runs; enough to plan with, and `limit` raises it.
RUNS_DEFAULT = 25
RUNS_MAX = 500
ERROR_MAX_CHARS = 400


def _urls(field):
    """ENA lists paths without a scheme, semicolon-separated; https serves all of them."""
    return [f"https://{p}" for p in (field or "").split(";") if p]


def _rows(table):
    """The TSV ENA answers with, as dicts; an empty body means no runs matched."""
    lines = (table or "").strip().splitlines()
    if len(lines) < 2:
        return []
    header = lines[0].split("\t")
    return [dict(zip(header, line.split("\t"))) for line in lines[1:]]


async def _ena_runs(args):
    accession = ((args or {}).get("accession") or "").strip()
    if not accession:
        return {"error": "An ENA or SRA accession is required."}
    limit = (args or {}).get("limit") or RUNS_DEFAULT
    try:
        limit = max(1, min(int(limit), RUNS_MAX))
    except (TypeError, ValueError):
        limit = RUNS_DEFAULT

    url = (f"{ENA_API}?accession={quote(accession, safe='')}&result=read_run&fields={FIELDS}"
           f"&format=tsv&limit={limit + 1}")
    try:
        table = await http.request("GET", url)
    except Exception as exc:
        # ENA answers a bad accession with 400 and names the accession types it takes,
        # which is the most useful thing we could say here anyway.
        detail = str(exc)
        return {"accession": accession,
                "error": detail[:ERROR_MAX_CHARS] + (" ..." if len(detail) > ERROR_MAX_CHARS else "")}

    rows = _rows(table if isinstance(table, str) else str(table))
    if not rows:
        return {"accession": accession, "count": 0, "runs": [],
                "hint": "ENA holds no sequencing runs under this accession."}

    truncated = len(rows) > limit
    runs = []
    for row in rows[:limit]:
        urls = _urls(row.get("fastq_ftp"))
        runs.append({
            "run": row.get("run_accession"),
            "layout": row.get("library_layout"),
            "paired": len(urls) >= 2,
            "urls": urls,
            "md5": [m for m in (row.get("fastq_md5") or "").split(";") if m],
            "bytes": [int(b) for b in (row.get("fastq_bytes") or "").split(";") if b.isdigit()],
            "read_count": row.get("read_count"),
            "organism": row.get("scientific_name"),
        })

    out = {"accession": accession, "count": len(runs), "runs": runs}
    if truncated:
        out["truncated"] = True
        out["note"] = f"Showing {limit} runs; raise `limit` for more."
    out["hint"] = ("Submit these run accessions to fastq_dump/fasterq_dump in one call. "
                   "The urls are exact and are for the cases that need a direct fetch; "
                   "never edit or construct one.")
    return out


ENA_RUNS = {
    "type": "function",
    "function": {
        "name": "ena_runs",
        "description": (
            "Look up the sequencing runs ENA holds under an accession, with their exact "
            "FASTQ download URLs, checksums, sizes and whether each run is paired or single "
            "end. Takes a run (SRR/ERR/DRR), experiment (SRX/ERX/DRX), sample (SAM*/SRS), "
            "study (PRJ*/SRP) or submission accession. ENA's FASTQ paths cannot be derived "
            "from an accession - always read them here rather than constructing or guessing "
            "a URL, and never assume a run is paired without checking."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "accession": {
                    "type": "string",
                    "description": "ENA or SRA accession, e.g. 'SRR390728' or 'PRJNA630239'",
                },
                "limit": {
                    "type": "integer",
                    "description": f"Runs to return; defaults to {RUNS_DEFAULT}, at most {RUNS_MAX}.",
                },
            },
            "required": ["accession"],
        },
    },
}

HANDLERS = {"ena_runs": _ena_runs}


def tool_schemas():
    return [ENA_RUNS]


def get_handler(name):
    return HANDLERS.get(name)
