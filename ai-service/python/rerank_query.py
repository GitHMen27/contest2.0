import re
import chromadb
from dotenv import load_dotenv
from google import genai
from rank_bm25 import BM25Okapi
from sentence_transformers import CrossEncoder

load_dotenv()
client = genai.Client()

# Загружаем кросс-энкодер.
# 'BAAI/bge-reranker-base' — одна из лучших и легких моделей для переранжирования
reranker = CrossEncoder("BAAI/bge-reranker-base")


def load_and_chunk_file(file_path: str) -> list[str]:
    """Читает файл и нарезает на чанки."""
    with open(file_path, "r", encoding="utf-8") as file:
        content = file.read()
        chunks = re.split(r"\n\s*\n", content)
        return [chunk.strip() for chunk in chunks if chunk.strip()]


def tokenize(text: str) -> list[str]:
    """Токенизация для BM25."""
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    return cleaned.split()


def get_embedding(text: str) -> list[float]:
    """Получает вектор через Gemini API."""
    response = client.models.embed_content(
        model="gemini-embedding-2",
        contents=text
    )
    return response.embeddings[0].values


def rerank_chunks(user_query: str, candidate_chunks: list[str], top_n: int = 2) -> list[str]:
    """
    Пропускает пары (Вопрос, Чанк) через Cross-Encoder
    и возвращает top_n самых релевантных.
    """
    if not candidate_chunks:
        return []

    # 1. Формируем пары: [(вопрос, чанк_1), (вопрос, чанк_2), ...]
    pairs = [[user_query, chunk] for chunk in candidate_chunks]

    # 2. Кросс-энкодер считает релевантность каждой пары
    # Возвращает массив чисел (scores), например: [0.89, -2.1, 4.35]
    scores = reranker.predict(pairs)

    # 3. Объединяем чанки с их оценками и сортируем по убыванию балла
    chunk_score_pairs = list(zip(candidate_chunks, scores))
    sorted_pairs = sorted(chunk_score_pairs, key=lambda x: x[1], reverse=True)

    # 4. Забираем только сам текст top_n лучших чанков
    top_chunks = [chunk for chunk, score in sorted_pairs[:top_n]]
    
    return top_chunks


def hybrid_search_with_rerank(
    user_query: str, 
    chunks: list[str], 
    collection, 
    fetch_k: int = 5, 
    final_top_n: int = 2
) -> list[str]:
    """
    1. Берет fetch_k кандидатов из BM25 и fetch_k из ChromaDB.
    2. Объединяет их (до 10 кандидатов).
    3. Переранжирует с помощью Cross-Encoder и отбирает final_top_n лучших.
    """
    # -------------------------------------------------------------
    # 1. ШАГ PULL (Забираем расширенный пул кандидатов)
    # -------------------------------------------------------------
    # BM25
    tokenized_corpus = [tokenize(chunk) for chunk in chunks]
    bm25 = BM25Okapi(tokenized_corpus)
    tokenized_query = tokenize(user_query)
    bm25_results = bm25.get_top_n(tokenized_query, chunks, n=fetch_k)

    # ChromaDB
    query_vector = get_embedding(user_query)
    chroma_raw = collection.query(query_embeddings=[query_vector], n_results=fetch_k)
    vector_results = chroma_raw["documents"][0]

    # Объединение пула
    candidates = []
    for chunk in vector_results + bm25_results:
        if chunk not in candidates:
            candidates.append(chunk)

    # -------------------------------------------------------------
    # 2. ШАГ RERANK (Переранжирование через Cross-Encoder)
    # -------------------------------------------------------------
    final_chunks = rerank_chunks(user_query, candidates, top_n=final_top_n)

    return final_chunks


def generate_answer(prompt: str) -> str:
    """Генерация ответа через Gemini."""
    response = client.models.generate_content(
        model="gemini-3.5-flash-lite",
        contents=prompt
    )
    return response.text


def main():
    chunks = load_and_chunk_file("../rule.txt")
    chroma_client = chromadb.PersistentClient(path="./chroma_db")
    collection = chroma_client.get_collection(name="company_rules")

    user_text = input("Введите запрос: ")

    # Извлекаем по 5 кандидатов из каждого поиска (всего до 10), 
    # а Reranker оставляет только 2 самых точных
    retrieved_chunks = hybrid_search_with_rerank(
        user_query=user_text,
        chunks=chunks,
        collection=collection,
        fetch_k=5,
        final_top_n=2
    )

    context_text = "\n\n--- ВЫРЕЗКА ИЗ ДОКУМЕНТА ---\n\n".join(retrieved_chunks)

    prompt = f"""Ответь на вопрос пользователя, используя ТОЛЬКО следующий контекст.

Контекст:
{context_text}

Вопрос: {user_text}"""

    answer = generate_answer(prompt)

    print("\n=== Итоговый ответ Gemini ===")
    print(answer)


if __name__ == "__main__":
    main()