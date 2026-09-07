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
    assert [e["name"] for e in out["elements"]] == ["SRR1001", "SRR1002", "SRR1003"]
    assert out["unmatched"] == []


def test_illumina_r1_r2_pairs():
    out = group_datasets(datasets=names(ILLUMINA))
    assert out["structure"] == "list:paired"
    assert [e["name"] for e in out["elements"]] == ["sample1_001", "sample2_001"]


def test_a_pair_is_a_nested_collection_the_api_accepts():
    out = group_datasets(datasets=[ds("s_R1.fastq.gz", 0), ds("s_R2.fastq.gz", 1)])
    element = out["elements"][0]
    assert element["src"] == "new_collection" and element["collection_type"] == "paired"
    assert element["element_identifiers"] == [
        {"name": "forward", "src": "hda", "id": "id_0"},
        {"name": "reverse", "src": "hda", "id": "id_1"},
    ]


def test_a_flat_element_points_straight_at_the_dataset():
    out = group_datasets(datasets=names(["s0.fastq.gz", "s1.fastq.gz"]))
    assert out["elements"][0] == {"name": "s0.fastq.gz", "src": "hda", "id": "id_0"}


def test_run_numbers_are_not_mistaken_for_mates():
    """run_1..run_4 pair two files at most; that is a minority, so the shape is a list."""
    out = group_datasets(datasets=names(ZIP_FLAT))
    assert out["structure"] == "list"
    assert len(out["elements"]) == 4 and out["unmatched"] == []


def test_a_half_pair_is_named_as_a_leftover_not_dropped():
    out = group_datasets(datasets=names(["s1_R1.fq.gz", "s1_R2.fq.gz", "s2_R1.fq.gz"]))
    assert out["structure"] == "list:paired"
    assert [e["name"] for e in out["elements"]] == ["s1"]
    assert out["unmatched"] == ["s2_R1.fq.gz"]
    assert out["has_leftovers"] is True


def test_a_non_read_file_becomes_a_leftover():
    out = group_datasets(datasets=names(["a_R1.fastq.gz", "a_R2.fastq.gz", "notes.txt"]))
    assert out["structure"] == "list:paired"
    assert out["unmatched"] == ["notes.txt"]


def test_structure_paired_forces_pairing_past_the_majority_rule():
    out = group_datasets(datasets=names(["a.fq", "b.fq", "c.fq", "s_1.fq", "s_2.fq"]), structure="paired")
    assert out["structure"] == "list:paired"
    assert [e["name"] for e in out["elements"]] == ["s"]
    assert out["unmatched"] == ["a.fq", "b.fq", "c.fq"]


def test_r1_wins_over_a_trailing_1_on_the_same_name():
    out = group_datasets(datasets=names(["lane1_R1.fastq.gz", "lane1_R2.fastq.gz"]))
    assert [e["name"] for e in out["elements"]] == ["lane1"]


def test_empty_input_reports_empty_so_the_graph_can_stop():
    out = group_datasets(datasets=[])
    assert out["empty"] is True and out["elements"] == []


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
    assert [e["name"] for e in out["elements"]] == ["SRR1001", "SRR1002", "SRR1003"]


def test_a_zip_of_single_end_reads_lists():
    out = group_datasets(datasets=zipped(f"reads/s{n}.fastq.gz" for n in range(3)))
    assert out["structure"] == "list"
    assert [e["name"] for e in out["elements"]] == ["s0.fastq.gz", "s1.fastq.gz", "s2.fastq.gz"]


def test_nested_archive_directories_do_not_reach_the_identifiers():
    out = group_datasets(datasets=zipped(["a/b/c/SRR1_R1.fastq.gz", "a/b/c/SRR1_R2.fastq.gz"]))
    assert [e["name"] for e in out["elements"]] == ["SRR1"]


def test_an_archive_holding_both_shapes_keeps_the_odd_member():
    out = group_datasets(datasets=zipped(["p_R1.fastq.gz", "p_R2.fastq.gz", "notes.txt"]))
    assert out["structure"] == "list:paired"
    assert out["unmatched"] == ["notes.txt"]


def test_include_puts_a_non_read_file_beyond_reach():
    out = group_datasets(
        datasets=names(["a_R1.fastq.gz", "a_R2.fastq.gz", "notes.txt"]), include="*.fastq.gz"
    )
    assert out["out_of_scope"] == ["notes.txt"]
    assert out["unmatched"] == [] and out["has_leftovers"] is False
    assert len(out["items"]) == 2


def test_items_cover_leftovers_so_a_datatype_write_reaches_them():
    out = group_datasets(datasets=names(["s1_R1.fq.gz", "s1_R2.fq.gz", "s2_R1.fq.gz"]))
    assert len(out["items"]) == 3


# --- Evidence for pairing --------------------------------------------------------
# A bare 1/2 can be a sample number; R1/read2/forward cannot.


def test_two_unrelated_samples_are_not_married_into_a_pair():
    """patient_1 and patient_2 are people, not mates. This is the dangerous case."""
    out = group_datasets(datasets=names(["patient_1.fastq.gz", "patient_2.fastq.gz"]))
    assert out["structure"] == "list"
    assert [e["name"] for e in out["elements"]] == ["patient_1.fastq.gz", "patient_2.fastq.gz"]


def test_an_explicit_marker_pairs_a_single_sample():
    out = group_datasets(datasets=names(["patient_R1.fastq.gz", "patient_R2.fastq.gz"]))
    assert out["structure"] == "list:paired"
    assert [e["name"] for e in out["elements"]] == ["patient"]


def test_a_bare_marker_pairs_once_a_second_sample_shows_the_convention():
    out = group_datasets(datasets=names(["a_1.fq", "a_2.fq", "b_1.fq", "b_2.fq"]))
    assert out["structure"] == "list:paired"
    assert [e["name"] for e in out["elements"]] == ["a", "b"]


def test_structure_paired_overrides_the_evidence_rule():
    out = group_datasets(datasets=names(["patient_1.fq", "patient_2.fq"]), structure="paired")
    assert out["structure"] == "list:paired"


def test_word_markers_are_recognised():
    for forward, reverse in (("forward", "reverse"), ("fwd", "rev"), ("read1", "read2")):
        out = group_datasets(datasets=names([f"s_{forward}.fq", f"s_{reverse}.fq"]))
        assert out["structure"] == "list:paired", (forward, reverse)
        assert [e["name"] for e in out["elements"]] == ["s"]


# --- Identifier collisions -------------------------------------------------------
# Galaxy rejects a collection with duplicate element identifiers (HTTP 400).


def test_per_sample_directories_pair_without_colliding():
    members = [f"Sample{k}/reads_R{m}.fq.gz" for k in (1, 2, 3) for m in (1, 2)]
    out = group_datasets(datasets=zipped(members))
    assert out["structure"] == "list:paired"
    assert [e["name"] for e in out["elements"]] == ["Sample1_reads", "Sample2_reads", "Sample3_reads"]


def test_a_flat_list_of_colliding_names_is_qualified_by_directory():
    out = group_datasets(datasets=zipped(["A/notes.txt", "B/notes.txt"]))
    assert [e["name"] for e in out["elements"]] == ["A_notes.txt", "B_notes.txt"]


def test_identifiers_are_unique_across_every_layout():
    layouts = [
        [f"SRR100{n}_{m}.fastq.gz" for n in range(1, 4) for m in (1, 2)],
        [f"S{n}_S1_L001_R{m}_001.fastq.gz" for n in range(1, 4) for m in (1, 2)],
        [f"Sample{k}/reads_R{m}.fq.gz" for k in (1, 2) for m in (1, 2)],
        [f"lane{k}/S{n}_R{m}.fq" for k in (1, 2) for n in (1, 2) for m in (1, 2)],
        ["A/notes.txt", "B/notes.txt", "C/notes.txt"],
    ]
    for layout in layouts:
        out = group_datasets(datasets=names(layout))
        identifiers = [e["name"] for e in out["elements"]]
        assert len(set(identifiers)) == len(identifiers), (layout, identifiers)
