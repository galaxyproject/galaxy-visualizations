"""The lineage diagram survives what a dataset can be named."""

from olite.registry.extensions.lineage.bridge import generate_mermaid


def test_a_quote_in_a_name_does_not_end_the_label():
    nodes = [{"src": "hda", "id": "d1", "name": 'reads "run 2".fastq'}]
    diagram = generate_mermaid(nodes=nodes, edges=[], seed_id="d1")
    assert 'hda_d1["*reads #quot;run 2#quot;.fastq"]' in diagram
    assert diagram.count('"') == 2


def test_jobs_and_datasets_get_their_shapes_and_edges():
    nodes = [{"src": "hda", "id": "a", "name": "in"}, {"src": "job", "id": "j", "tool_name": "cat"},
             {"src": "hda", "id": "b", "name": "out"}]
    edges = [{"source": {"src": "hda", "id": "a"}, "target": {"src": "job", "id": "j"}},
             {"source": {"src": "job", "id": "j"}, "target": {"src": "hda", "id": "b"}}]
    diagram = generate_mermaid(nodes=nodes, edges=edges, seed_id="b")
    assert 'job_j(["cat"])' in diagram
    assert "hda_a --> job_j" in diagram and "job_j --> hda_b" in diagram
    assert 'hda_b["*out"]' in diagram
