import pytest

from app.setup_db import build_schema_sql


def test_schema_uses_requested_dimension():
    sql = " ".join(build_schema_sql(1024))
    assert "vector(1024)" in sql and "hnsw" in sql and "gin" in sql and "to_tsvector('russian'" in sql


def test_long_vectors_get_table_without_hnsw_index():
    # индекс HNSW в pgvector поддерживает не больше 2000 измерений; для 2048 поиск идёт перебором
    sql = " ".join(build_schema_sql(2048))
    assert "vector(2048)" in sql and "gin" in sql
    assert "hnsw" not in sql


def test_dimension_2000_still_gets_index():
    assert "hnsw" in " ".join(build_schema_sql(2000))


@pytest.mark.parametrize("bad", [0, -5, 16001, "1024; DROP TABLE x", 10.5, True, None])
def test_schema_rejects_unsafe_dimension(bad):
    with pytest.raises(ValueError):
        build_schema_sql(bad)
