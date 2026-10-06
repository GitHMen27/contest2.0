import re
import chromadb
from dotenv import load_dotenv
from google import genai
from rank_bm25 import BM25Okapi

load_dotenv()
client = genai.Client()


def load_and_chunk_file(file_path: str) -> list[str]:
    """Читает файл и нарезает на чанки (нужно для создания индекса BM25)."""
    with open(file_path, "r", encoding="utf-8") as file:
        content = file.read()
        chunks = re.split(r"\n\s*\n", content)
        return [chunk.strip() for chunk in chunks if chunk.strip()]


def tokenize(text: str) -> list[str]:
    """
    Разбивает текст на очищенные слова (токенизация для BM25).
    Пример: "Пункт 4.12.1!" -> ["пункт", "4", "12", "1"]
    """
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return cleaned.split()


def get_embedding(text: str) -> list[float]:
    """Получает вектор через Gemini API."""
    response = client.models.embed_content(
        model="gemini-embedding-2",
        contents=text
    )
    return response.embeddings[0].values


def hybrid_search(user_query: str, chunks: list[str], collection, top_k: int = 2) -> list[str]:
    """
    Гибридный поиск: комбинация BM25 (точный текст) и ChromaDB (семантика).
    """
    # -------------------------------------------------------------
    # 1. КЛЮЧЕВОЙ ПОИСК (BM25)
    # -------------------------------------------------------------
    # Подготавливаем корпус текстов для BM25: список списков слов
    tokenized_corpus = [tokenize(chunk) for chunk in chunks]
    bm25 = BM25Okapi(tokenized_corpus)

    # Токенизируем вопрос пользователя и ищем top_k лучших чанков по ключам
    tokenized_query = tokenize(user_query)
    bm25_results = bm25.get_top_n(tokenized_query, chunks, n=top_k)

    # -------------------------------------------------------------
    # 2. ВЕКТОРНЫЙ ПОИСК (ChromaDB)
    # -------------------------------------------------------------
    query_vector = get_embedding(user_query)
    chroma_raw_results = collection.query(
        query_embeddings=[query_vector],
        n_results=top_k
    )
    vector_results = chroma_raw_results["documents"][0]

    # -------------------------------------------------------------
    # 3. ОБЪЕДИНЕНИЕ И ДЕДУБЛИКАЦИЯ (Fusion)
    # -------------------------------------------------------------
    # Собираем уникальные чанки из обоих источников, сохраняя порядок
    combined_results = []
    
    # Сначала добавляем результаты векторного поиска, затем BM25
    for chunk in vector_results + bm25_results:
        if chunk not in combined_results:
            combined_results.append(chunk)

    return combined_results


def generate_answer(prompt: str) -> str:
    """Генерация итогового ответа через Gemini."""
    response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=prompt
    )
    return response.text


def main():
    # Загружаем чанки (нужны для BM25) и подключаемся к ChromaDB
    chunks = load_and_chunk_file("../rule.txt")
    
    chroma_client = chromadb.PersistentClient(path="./chroma_db")
    collection = chroma_client.get_collection(name="company_rules")

    user_text = input("Введите запрос (попробуй точные цифры или названия): ")

    # Выполняем гибридный поиск
    retrieved_chunks = hybrid_search(user_text, chunks, collection, top_k=2)

    # Склеиваем найденные чанки в один блок контекста
    context_text = "\n\n--- ВЫРЕЗКА ИЗ ДОКУМЕНТА ---\n\n".join(retrieved_chunks)

    prompt = f"""Ответь на вопрос пользователя, используя ТОЛЬКО следующий контекст.

Контекст:
{context_text}

Вопрос: {user_text}"""

    answer = generate_answer(prompt)

    print("\n=== Итоговый ответ Gemini ===")
    print(answer)
    
    print(f"\n=== Найдено уникальных чанков для контекста: {len(retrieved_chunks)} ===")
    for i, chunk in enumerate(retrieved_chunks, 1):
        print(f"\n[Чанк #{i}]:\n{chunk}")


if __name__ == "__main__":
    main()