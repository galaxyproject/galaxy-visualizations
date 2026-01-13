import pytest
from datetime import datetime
from vintent.modules.profiler import (
    profile_csv,
    profile_tabular,
    detect_delimiter,
    rows_from_tab,
    rows_from_tabular,
    MAX_ENUM_VALUES,
)

def test_basic_profile_counts():
    csv_text="a,b,c\n1,x,2024-01-01\n2,y,2024-01-02\n3,x,2024-01-03\n"
    profile=profile_csv(csv_text)
    assert profile["row_count"]==3
    assert set(profile["fields"].keys())=={"a","b","c"}

def test_quantitative_field():
    csv_text="a\n1\n2\n3\n"
    profile=profile_csv(csv_text)
    f=profile["fields"]["a"]
    assert f["type"]=="quantitative"
    assert f["cardinality"]==3
    assert f["min"]==1.0
    assert f["max"]==3.0
    assert f["values"] is None
    assert f["values_truncated"] is False

def test_nominal_enum_under_limit():
    csv_text="a\nx\ny\nx\n"
    profile=profile_csv(csv_text)
    f=profile["fields"]["a"]
    assert f["type"]=="nominal"
    assert f["cardinality"]==2
    assert set(f["values"])=={"x","y"}
    assert f["values_truncated"] is False

def test_nominal_enum_over_limit():
    values=[f"v{i}" for i in range(MAX_ENUM_VALUES+1)]
    csv_text="a\n"+"\n".join(values)
    profile=profile_csv(csv_text)
    f=profile["fields"]["a"]
    assert f["type"]=="nominal"
    assert f["cardinality"]==MAX_ENUM_VALUES+1
    assert f["values"] is None
    assert f["values_truncated"] is True

def test_temporal_field():
    csv_text="t\n2024-01-01\n2024-01-02\n"
    profile=profile_csv(csv_text)
    f=profile["fields"]["t"]
    assert f["type"]=="temporal"
    assert f["cardinality"]==2
    assert f["values"] is None

def test_mixed_type_collapse_to_nominal():
    csv_text="a\n1\nx\n"
    profile=profile_csv(csv_text)
    f=profile["fields"]["a"]
    assert f["type"]=="nominal"
    assert f["cardinality"]==2

def test_missing_values():
    csv_text="a\n1\n\n2\n"
    profile=profile_csv(csv_text)
    f=profile["fields"]["a"]
    assert f["missing_ratio"]==0.0
    assert profile["row_count"]==2

def test_enum_order_is_stable():
    csv_text="a\nb\na\nc\n"
    profile1=profile_csv(csv_text)
    profile2=profile_csv(csv_text)
    assert profile1["fields"]["a"]["values"]==profile2["fields"]["a"]["values"]


# Tab-delimited parsing tests

def test_detect_delimiter_csv():
    csv_text = "a,b,c\n1,2,3\n"
    assert detect_delimiter(csv_text) == ","


def test_detect_delimiter_tab():
    tab_text = "1\t2\t3\n4\t5\t6\n"
    assert detect_delimiter(tab_text) == "\t"


def test_rows_from_tab_generates_column_names():
    tab_text = "1\t2\t3\n4\t5\t6\n"
    rows = rows_from_tab(tab_text)
    assert len(rows) == 2
    assert set(rows[0].keys()) == {"col:1", "col:2", "col:3"}
    assert rows[0]["col:1"] == 1.0
    assert rows[0]["col:2"] == 2.0
    assert rows[0]["col:3"] == 3.0


def test_rows_from_tab_handles_strings():
    tab_text = "apple\tbanana\tcherry\n"
    rows = rows_from_tab(tab_text)
    assert len(rows) == 1
    assert rows[0]["col:1"] == "apple"
    assert rows[0]["col:2"] == "banana"
    assert rows[0]["col:3"] == "cherry"


def test_rows_from_tab_handles_empty_values():
    tab_text = "1\t\t3\n"
    rows = rows_from_tab(tab_text)
    assert rows[0]["col:1"] == 1.0
    assert rows[0]["col:2"] is None
    assert rows[0]["col:3"] == 3.0


def test_rows_from_tabular_auto_detects_csv():
    csv_text = "a,b\n1,2\n"
    rows = rows_from_tabular(csv_text)
    assert set(rows[0].keys()) == {"a", "b"}


def test_rows_from_tabular_auto_detects_tab():
    tab_text = "1\t2\n3\t4\n"
    rows = rows_from_tabular(tab_text)
    assert set(rows[0].keys()) == {"col:1", "col:2"}


def test_profile_tabular_with_tab_data():
    tab_text = "1\t2\t3\n4\t5\t6\n7\t8\t9\n"
    profile = profile_tabular(tab_text)
    assert profile["row_count"] == 3
    assert set(profile["fields"].keys()) == {"col:1", "col:2", "col:3"}
    assert profile["fields"]["col:1"]["type"] == "quantitative"
    assert profile["fields"]["col:1"]["min"] == 1.0
    assert profile["fields"]["col:1"]["max"] == 7.0


def test_profile_tabular_with_csv_data():
    csv_text = "a,b\n1,2\n3,4\n"
    profile = profile_tabular(csv_text)
    assert profile["row_count"] == 2
    assert set(profile["fields"].keys()) == {"a", "b"}
