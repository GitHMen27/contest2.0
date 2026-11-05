"""Устаревший скрипт. Сервис работает на GigaChat, а не на Gemini.

Раньше здесь проверялся доступ к Gemini, но на деле вызывался embed_query из app.embeddings, то есть GigaChat.
Чтобы не вводить в заблуждение, скрипт теперь просто запускает полную диагностику GigaChat.

Запуск из папки ai-service/ (с активированным .venv):
    python check_gigachat.py
"""
from __future__ import annotations

import sys

from check_gigachat import main

if __name__ == "__main__":
    print("check_gemini.py устарел: сервис использует GigaChat. Запускаю check_gigachat.py\n")
    sys.exit(main())
