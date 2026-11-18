"""Тесты нарезки. Запуск из ai-service/:  python -m pytest -q"""
from app.chunking import MAX_CHARS, chunk_markdown

SAMPLE = """# Тестовый регламент

## Первый раздел

Абзац один.

Абзац два.

## Второй раздел

Текст второго раздела.
"""


def test_sections_become_separate_chunks_with_prefix():
    chunks = chunk_markdown("fallback", SAMPLE)
    assert [c.section for c in chunks] == ["Первый раздел", "Второй раздел"]
    assert all(c.doc == "Тестовый регламент" for c in chunks)
    assert chunks[0].content.startswith("Тестовый регламент — Первый раздел\n")
    assert "Абзац один." in chunks[0].content and "Абзац два." in chunks[0].content


def test_hash_is_stable_and_unique():
    first = chunk_markdown("x", SAMPLE)
    second = chunk_markdown("x", SAMPLE)
    assert [c.content_hash for c in first] == [c.content_hash for c in second]
    assert len({c.content_hash for c in first}) == len(first)


def test_long_paragraph_is_split_by_sentences():
    # предложения должны быть РАЗНЫМИ: одинаковые чанки схлопываются дедупликацией по хэшу
    text = "# Док\n\n## Раздел\n\n" + " ".join(f"Это предложение регламента номер {i}." for i in range(60))
    chunks = chunk_markdown("x", text, max_chars=300)
    assert len(chunks) > 1
    prefix_len = len("Док — Раздел\n")
    assert all(len(c.content) - prefix_len <= 300 for c in chunks)


def test_title_falls_back_to_file_name():
    chunks = chunk_markdown("my_file", "## Раздел\n\nТекст.")
    assert chunks[0].doc == "my_file"


def test_default_limit_is_respected():
    text = "# Док\n\n## Раздел\n\n" + "\n\n".join(f"Абзац номер {i}. " * 10 for i in range(30))
    for chunk in chunk_markdown("x", text):
        assert len(chunk.content) <= MAX_CHARS + 100


def test_blockquote_notes_are_not_indexed():
    text = "# Док\n\n> Пометка автора, не контент.\n\n## Раздел\n\nНастоящий текст."
    chunks = chunk_markdown("x", text)
    assert len(chunks) == 1
    assert "Пометка автора" not in chunks[0].content
