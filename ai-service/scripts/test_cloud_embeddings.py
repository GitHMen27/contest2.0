import os
from pathlib import Path

from openai import OpenAI
from dotenv import load_dotenv

# Скрипт лежит в ai-service/scripts/, а .env — в ai-service/.
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

api_key = os.getenv("CLOUD_API_KEY")

if not api_key:
    raise RuntimeError("CLOUD_API_KEY не найден в .env")
client = OpenAI(
    api_key=os.environ["CLOUD_API_KEY"],
    base_url="https://foundation-models.api.cloud.ru/v1"
)

response = client.embeddings.create(
    model="ai-sage/Giga-Embeddings-instruct-480M",
    input=["Проверка эмбеддингов для RAG проекта"]
)

embedding = response.data[0].embedding

print("Успешно!")
print("Размерность:", len(embedding))
print("Первые 5 значений:", embedding[:5])