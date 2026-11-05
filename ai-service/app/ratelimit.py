"""Простой ограничитель запросов «не больше N за минуту с одного адреса» (в памяти процесса).

Нужен, чтобы чужие не сожгли твои токены GigaChat через открытый API. Для одного сервера этого достаточно.
"""
from __future__ import annotations

import time
from collections import deque
from collections.abc import Callable


class RateLimiter:
    def __init__(self, limit: int, window: float = 60.0, clock: Callable[[], float] = time.monotonic) -> None:
        self.limit = limit
        self.window = window
        self._clock = clock
        self._hits: dict[str, deque[float]] = {}

    def allow(self, key: str) -> bool:
        now = self._clock()
        queue = self._hits.setdefault(key, deque())
        while queue and now - queue[0] >= self.window:  # выкидываем устаревшие запросы
            queue.popleft()
        if len(queue) >= self.limit:
            return False
        queue.append(now)
        return True
