"""Grouping loose datasets into collection elements."""

import io
import zipfile

from olite.registry.extensions.collections.bridge import group_datasets


def ds(name, i=None):
    return {"id": f"id_{i if i is not None else name}", "name": name}


def names(files):
    return [ds(f, i) for i, f in enumerate(files)]


SRA = [f"SRR100{n}_{m}.fastq.gz" for n in range(1, 4) for m in (1, 2)]
ILLUMINA = [f"sample{n}_R{m}_001.fastq.gz" for n in range(1, 3) for m in (1, 2)]
ZIP_FLAT = [f"reads/run_{n}.fastq.gz" for n in range(1, 5)]


def test_sra_names_pair_into_list_paired():
    out = group_datasets(datasets=names(SRA))
    assert out["structure"] == "list:paired"
    assert [e["identifier"] for e in out["elements"]] == ["SRR1001", "SRR1002", "SRR1003"]
    assert out["unmatched"] == []


def test_illumina_r1_r2_pairs():
    out = group_datasets(datasets=names(ILLUMINA))
    assert out["structure"] == "list:paired"
    assert [e["identifier"] for e in out["elements"]] == ["sample1_001", "sample2_001"]


def test_forward_and_reverse_carry_the_right_ids():
    out = group_datasets(datasets=[ds("s_1.fastq.gz", 0), ds("s_2.fastq.gz", 1)])
    element = out["elements"][0]
    assert element["forward"] == "id_0" and element["reverse"] == "id_1"


def test_unpaired_files_fall_back_to_a_flat_list():
    out = group_datasets(datasets=names(ZIP_FLAT))
    assert out["structure"] == "list"
    assert len(out["elements"]) == 4


def test_a_half_pair_does_not_silently_drop_the_odd_file():
    out = group_datasets(datasets=names(["s1_1.fq.gz", "s1_2.fq.gz", "s2_1.fq.gz"]))
    assert out["structure"] == "list"
    assert len(out["elements"]) == 3


def test_mixing_paired_and_unpaired_stays_flat():
    out = group_datasets(datasets=names(["a_1.fastq.gz", "a_2.fastq.gz", "notes.txt"]))
    assert out["structure"] == "list"


def test_structure_paired_forces_pairing_and_reports_leftovers():
    out = group_datasets(datasets=names(["s1_1.fq", "s1_2.fq", "extra.fq"]), structure="paired")
    assert out["structure"] == "list:paired"
    assert [e["identifier"] for e in out["elements"]] == ["s1"]
    assert out["unmatched"] == ["extra.fq"]


def test_r1_wins_over_a_trailing_1_on_the_same_name():
    out = group_datasets(datasets=names(["lane1_R1.fastq.gz", "lane1_R2.fastq.gz"]))
    assert [e["identifier"] for e in out["elements"]] == ["lane1"]


def test_empty_input_is_an_empty_flat_list():
    out = group_datasets(datasets=[])
    assert out == {"structure": "list", "elements": [], "unmatched": [], "items": []}


# An unzip tool deposits one dataset per member, named after the member.


def zipped(members):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for member in members:
            archive.writestr(member, b"@r\nACGT\n+\n!!!!\n")
    with zipfile.ZipFile(buf) as archive:
        entries = [m for m in archive.namelist() if not m.endswith("/")]
    return names(entries)


def test_a_zip_of_paired_reads_pairs():
    out = group_datasets(datasets=zipped(f"run/{n}" for n in SRA))
    assert out["structure"] == "list:paired"
    assert [e["identifier"] for e in out["elements"]] == ["SRR1001", "SRR1002", "SRR1003"]


def test_a_zip_of_single_end_reads_lists():
    out = group_datasets(datasets=zipped(f"reads/s{n}.fastq.gz" for n in range(3)))
    assert out["structure"] == "list"
    assert [e["identifier"] for e in out["elements"]] == ["s0.fastq.gz", "s1.fastq.gz", "s2.fastq.gz"]


def test_nested_archive_directories_do_not_reach_the_identifiers():
    out = group_datasets(datasets=zipped(["a/b/c/SRR1_1.fastq.gz", "a/b/c/SRR1_2.fastq.gz"]))
    assert [e["identifier"] for e in out["elements"]] == ["SRR1"]


def test_an_archive_holding_both_shapes_lists_rather_than_dropping_a_file():
    members = ["p_1.fastq.gz", "p_2.fastq.gz", "notes.txt"]
    out = group_datasets(datasets=zipped(members))
    assert out["structure"] == "list"
    assert len(out["elements"]) == 3
