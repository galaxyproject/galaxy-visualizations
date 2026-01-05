import pytest
from datetime import datetime
from vintent.modules.profiler import profile_csv, MAX_ENUM_VALUES

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
