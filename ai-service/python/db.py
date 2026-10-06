import re
import chromadb
from dotenv import load_dotenv
from google import genai

load_dotenv()
client = genai.Client()


def load_and_chunk_file(file_path: str) -> list[str]:
    """Читает файл и нарезает его на параграфы по пустым строкам."""
    with open(file_path, "r", encoding="utf-8") as file:
        content = file.read()
        chunks = re.split(r"\n\s*\n", content)
        return [chunk.strip() for chunk in chunks if chunk.strip()]


def get_embedding(text: str) -> list[float]:
    """Получает 768-мерный вектор для текста через Gemini API."""
    response = client.models.embed_content(
        model="gemini-embedding-2",
        contents=text
    )
    return response.embeddings[0].values


def init_vector_store():
    # 1. Читаем и нарезаем документ
    file_path = "../rule.txt"
    chunks = load_and_chunk_file(file_path)

    # 2. Инициализируем persistent-клиент ChromaDB (сохраняет данные в локальную папку)
    chroma_client = chromadb.PersistentClient(path="./chroma_db")

    # 3. Создаем или получаем коллекцию (аналог таблицы в SQL)
    collection = chroma_client.get_or_create_collection(name="company_rules")

    # 4. Генерируем векторы для каждого чанка
    print("Генерация эмбеддингов для чанков...")
    embeddings = [get_embedding(chunk) for chunk in chunks]

    # 5. Подготавливаем уникальные ID (ChromaDB требует текстовые ID для каждой записи)
    ids = [f"chunk_{i}" for i in range(len(chunks))]

    # 6. Загружаем всё в векторную БД
    collection.add(
        documents=chunks,     # Исходные тексты чанков
        embeddings=embeddings, # Намного лучше передавать готовые векторы
        ids=ids               # Список уникальных ID ["chunk_0", "chunk_1", ...]
    )

    print(f"Успешно сохранено {len(chunks)} чанков в ChromaDB!")


if __name__ == "__main__":
    init_vector_store()