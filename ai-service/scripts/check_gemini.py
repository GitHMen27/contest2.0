"""Устаревший скрипт. Сервис работает на GigaChat, а не на Gemini.

Раньше здесь проверялся доступ к Gemini, но на деле вызывался embed_query из app.embeddings, то есть GigaChat.
Чтобы не вводить в заблуждение, скрипт теперь просто запускает полную диагностику GigaChat.

Запуск из папки ai-service/ (с активированным .venv):
    python scripts/check_gigachat.py
"""
from __future__ import annotations

import sys
from pathlib import Path

# Скрипт лежит в ai-service/scripts/, а пакет scripts — в ai-service/.
PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from scripts.check_gigachat import main  # noqa: E402

if __name__ == "__main__":
    print("check_gemini.py устарел: сервис использует GigaChat. Запускаю check_gigachat.py\n")
    sys.exit(main())
