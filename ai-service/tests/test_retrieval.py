from app.retrieval import build_or_query, rrf_fuse


def test_or_query_keeps_words_and_numbers_and_drops_noise():
    query = build_or_query("Сколько можно ехать после 4,5 часов? Перерыв 45 минут, а в, на!")
    assert query == "сколько | можно | ехать | после | часов | перерыв | 45 | минут"


def test_or_query_is_safe_for_tsquery_syntax():
    query = build_or_query("a & b | c' ; drop table; (x) <-> y")
    assert all(char not in query.replace(" | ", " ") for char in "&|'();<>-!:")


def test_or_query_removes_duplicates_and_can_be_empty():
    assert build_or_query("Перерыв перерыв ПЕРЕРЫВ") == "перерыв"
    assert build_or_query("а в и ?") == ""


def test_rrf_chunk_found_by_both_searches_wins():
    fused = rrf_fuse({"vector": [10, 20, 30], "fts": [20, 40]})
    assert [item for item, _ in fused][0] == 20          # есть в обоих списках
    assert {item for item, _ in fused} == {10, 20, 30, 40}


def test_rrf_scores_decrease_and_ties_keep_first_seen_order():
    fused = rrf_fuse({"vector": [1, 2], "fts": [3, 4]})
    assert [item for item, _ in fused] == [1, 3, 2, 4]    # равные очки: порядок появления
    scores = [score for _, score in fused]
    assert scores == sorted(scores, reverse=True)


def test_rrf_works_with_one_empty_list():
    assert [item for item, _ in rrf_fuse({"vector": [5, 6], "fts": []})] == [5, 6]
