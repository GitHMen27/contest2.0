"""Нарезка markdown-регламентов на чанки.

Одна функция нарезки для ВСЕГО проекта (ингест, поиск, evals). Так тексты в БД и в поиске
всегда совпадают (в старом коде db.py и rerank_query.py резали по-разному).

Идея: режем по смыслу, а не по числу символов: документ -> разделы (## Заголовок) -> абзацы.
Мелкие абзацы склеиваем до MAX_CHARS, слишком длинные режем по предложениям.
К каждому чанку добавляем префикс «Документ — Раздел»: так чанк понятен без остального текста.
Строки-цитаты (начинаются с «>») считаются пометками автора и в индекс не попадают.
Модуль не использует сторонних библиотек, поэтому его легко тестировать.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

MAX_CHARS = 900

_HEADING = re.compile(r"^(#{1,3})\s+(.+?)\s*$")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+")
_BLANK_LINE = re.compile(r"\n\s*\n")


@dataclass(frozen=True)
class Chunk:
    doc: str           # название документа
    section: str       # название раздела
    content: str       # префикс + текст (именно это эмбеддим, ищем и показываем модели)
    content_hash: str  # sha256 от content: ключ для upsert и защита от дублей


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _split_long(paragraph: str, max_chars: int) -> list[str]:
    """Режет слишком длинный абзац по предложениям; если предложение длиннее лимита, режет жёстко."""
    pieces: list[str] = []
    current = ""
    for sentence in _SENTENCE_END.split(paragraph):
        while len(sentence) > max_chars:
            if current:
                pieces.append(current)
                current = ""
            pieces.append(sentence[:max_chars])
            sentence = sentence[max_chars:]
        if current and len(current) + 1 + len(sentence) > max_chars:
            pieces.append(current)
            current = sentence
        else:
            current = f"{current} {sentence}".strip()
    if current:
        pieces.append(current)
    return pieces


def _pack(paragraphs: list[str], max_chars: int) -> list[str]:
    """Склеивает абзацы в куски не длиннее max_chars."""
    packed: list[str] = []
    current = ""
    for paragraph in paragraphs:
        parts = _split_long(paragraph, max_chars) if len(paragraph) > max_chars else [paragraph]
        for part in parts:
            if current and len(current) + 2 + len(part) > max_chars:
                packed.append(current)
                current = part
            else:
                current = f"{current}\n\n{part}" if current else part
    if current:
        packed.append(current)
    return packed


def _split_sections(text: str) -> tuple[str, list[tuple[str, str]]]:
    """Возвращает (название документа, [(название раздела, текст раздела), ...])."""
    title = ""
    sections: list[tuple[str, str]] = []
    section = "Введение"
    buffer: list[str] = []

    def flush() -> None:
        body = "\n".join(buffer).strip()
        if body:
            sections.append((section, body))

    for line in text.splitlines():
        if line.lstrip().startswith(">"):  # пометка автора (например, «Учебный документ»)
            continue
        match = _HEADING.match(line)
        if match:
            level, heading = len(match.group(1)), match.group(2)
            if level == 1 and not title:  # первый «# Заголовок» = название документа
                title = heading
                continue
            flush()
            buffer.clear()
            section = heading
            continue
        buffer.append(line)
    flush()
    return title, sections


def chunk_markdown(fallback_name: str, text: str, max_chars: int = MAX_CHARS) -> list[Chunk]:
    """Нарезает один markdown-документ на чанки."""
    title, sections = _split_sections(text)
    doc = title or fallback_name
    chunks: list[Chunk] = []
    seen: set[str] = set()
    for section, body in sections:
        paragraphs = [p.strip() for p in _BLANK_LINE.split(body) if p.strip()]
        for piece in _pack(paragraphs, max_chars):
            content = f"{doc} — {section}\n{piece}"
            content_hash = _hash(content)
            if content_hash in seen:
                continue
            seen.add(content_hash)
            chunks.append(Chunk(doc=doc, section=section, content=content, content_hash=content_hash))
    return chunks


def load_corpus(directory: Path) -> list[Chunk]:
    """Читает все *.md из папки и возвращает чанки всех документов."""
    chunks: list[Chunk] = []
    seen: set[str] = set()
    for path in sorted(directory.glob("*.md")):
        text = path.read_text(encoding="utf-8-sig")  # utf-8-sig: безопасно, если редактор добавил BOM
        for chunk in chunk_markdown(path.stem, text):
            if chunk.content_hash not in seen:
                seen.add(chunk.content_hash)
                chunks.append(chunk)
    return chunks
