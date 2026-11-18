"""Логика цифрового двойника склада без привязки к базе и FastAPI: схема, проверка данных, представления.

Здесь нет импортов psycopg и fastapi, поэтому модуль целиком покрывается тестами без базы и сети.
Работа с БД лежит в warehouse_repo.py, HTTP-эндпойнты — в warehouse.py.
"""
from __future__ import annotations

import math
import re
from typing import Any, Iterable

EMPLOYEE_STATUSES = ("working", "busy", "available", "break", "offline")
ZONE_TONES = ("amber", "teal", "blue", "violet", "green", "rose", "slate")
# Источники реальных координат. «demo» сюда не входит: симуляцию сервер не принимает как измерение.
POSITION_SOURCES = ("ble", "uwb", "mobile")

# Размеры схемы совпадают с MAP_WIDTH / MAP_HEIGHT на фронтенде (constants/warehouse.ts).
MAP_WIDTH = 1200
MAP_HEIGHT = 840

MAX_POSITIONS_PER_REQUEST = 200
MAX_RESPONSIBILITIES = 12
MAX_HISTORY_ENTRIES = 50

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,62}$")
_SITE_RE = re.compile(r"^[a-z0-9][a-z0-9_-]{1,31}$")


class WarehouseValidationError(ValueError):
    """Данные не прошли проверку. Текст безопасно показывать пользователю."""


# --- Схема БД -----------------------------------------------------------------------------------------

# Порядок важен: сначала таблицы без внешних ключей, затем зависимые.
SCHEMA_TABLES = (
    "employee_departments",
    "warehouse_zones",
    "warehouse_nodes",
    "warehouse_routes",
    "employees",
    "employee_locations",
    "warehouse_equipment",
)


def build_schema_sql() -> list[str]:
    """DDL сущностей цифрового двойника (ТЗ, раздел 11).

    site_id совпадает с id хаба на карте сети (frontend/src/constants/hubs.ts), то есть новые сущности
    привязаны к существующим распределительным центрам. Внешний ключ на справочную таблицу hubs не ставится:
    в рабочей базе её может не быть. Колонка is_demo отделяет демонстрационные данные от реальных.
    """
    return [
        """
        CREATE TABLE IF NOT EXISTS employee_departments (
            site_id  TEXT NOT NULL,
            name     TEXT NOT NULL,
            is_demo  BOOLEAN NOT NULL DEFAULT FALSE,
            PRIMARY KEY (site_id, name)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS warehouse_zones (
            site_id          TEXT NOT NULL,
            id               TEXT NOT NULL,
            name             TEXT NOT NULL,
            short_name       TEXT NOT NULL,
            purpose          TEXT NOT NULL,
            state            TEXT NOT NULL,
            status           TEXT NOT NULL,
            area_m2          INTEGER NOT NULL,
            load_percent     INTEGER NOT NULL,
            tone             TEXT NOT NULL,
            icon             TEXT NOT NULL,
            rect             JSONB NOT NULL,
            access_node_id   TEXT NOT NULL,
            responsible_ids  JSONB NOT NULL DEFAULT '[]'::jsonb,
            is_demo          BOOLEAN NOT NULL DEFAULT FALSE,
            PRIMARY KEY (site_id, id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS warehouse_nodes (
            site_id  TEXT NOT NULL,
            id       TEXT NOT NULL,
            x        DOUBLE PRECISION NOT NULL,
            y        DOUBLE PRECISION NOT NULL,
            label    TEXT,
            is_demo  BOOLEAN NOT NULL DEFAULT FALSE,
            PRIMARY KEY (site_id, id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS warehouse_routes (
            site_id    TEXT NOT NULL,
            from_node  TEXT NOT NULL,
            to_node    TEXT NOT NULL,
            is_demo    BOOLEAN NOT NULL DEFAULT FALSE,
            PRIMARY KEY (site_id, from_node, to_node),
            FOREIGN KEY (site_id, from_node) REFERENCES warehouse_nodes (site_id, id) ON DELETE CASCADE,
            FOREIGN KEY (site_id, to_node) REFERENCES warehouse_nodes (site_id, id) ON DELETE CASCADE
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS employees (
            site_id           TEXT NOT NULL,
            id                TEXT NOT NULL,
            first_name        TEXT NOT NULL,
            last_name         TEXT NOT NULL,
            position          TEXT NOT NULL,
            role              TEXT NOT NULL,
            department        TEXT NOT NULL,
            zone_id           TEXT NOT NULL,
            status            TEXT NOT NULL,
            task              TEXT NOT NULL,
            responsibilities  JSONB NOT NULL DEFAULT '[]'::jsonb,
            contact           TEXT,
            avatar_tone       TEXT,
            online            BOOLEAN NOT NULL DEFAULT TRUE,
            patrol            JSONB,
            manual            BOOLEAN NOT NULL DEFAULT FALSE,
            is_demo           BOOLEAN NOT NULL DEFAULT FALSE,
            updated_at        BIGINT NOT NULL,
            updated_by        TEXT,
            PRIMARY KEY (site_id, id),
            FOREIGN KEY (site_id, zone_id) REFERENCES warehouse_zones (site_id, id)
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS employee_locations (
            id           BIGSERIAL PRIMARY KEY,
            site_id      TEXT NOT NULL,
            employee_id  TEXT NOT NULL,
            x            DOUBLE PRECISION NOT NULL,
            y            DOUBLE PRECISION NOT NULL,
            zone_id      TEXT NOT NULL,
            status       TEXT NOT NULL,
            source       TEXT NOT NULL,
            is_demo      BOOLEAN NOT NULL DEFAULT FALSE,
            recorded_at  BIGINT NOT NULL,
            FOREIGN KEY (site_id, employee_id) REFERENCES employees (site_id, id) ON DELETE CASCADE
        )
        """,
        """
        CREATE INDEX IF NOT EXISTS employee_locations_lookup
            ON employee_locations (site_id, employee_id, recorded_at DESC)
        """,
        """
        CREATE TABLE IF NOT EXISTS warehouse_equipment (
            site_id  TEXT NOT NULL,
            id       TEXT NOT NULL,
            name     TEXT NOT NULL,
            kind     TEXT NOT NULL,
            zone_id  TEXT NOT NULL,
            status   TEXT NOT NULL,
            task     TEXT NOT NULL,
            location JSONB NOT NULL,
            metrics  JSONB NOT NULL DEFAULT '{}'::jsonb,
            is_demo  BOOLEAN NOT NULL DEFAULT FALSE,
            PRIMARY KEY (site_id, id),
            FOREIGN KEY (site_id, zone_id) REFERENCES warehouse_zones (site_id, id)
        )
        """,
    ]


# --- Проверка входных данных ----------------------------------------------------------------------------

def validate_site_id(value: str) -> str:
    site = (value or "").strip().lower()
    if not _SITE_RE.match(site):
        raise WarehouseValidationError("Некорректный идентификатор склада.")
    return site


def validate_employee_id(value: Any) -> str:
    employee_id = value.strip() if isinstance(value, str) else ""
    if not _ID_RE.match(employee_id):
        raise WarehouseValidationError(
            "Идентификатор сотрудника: 2–63 символа, латиница в нижнем регистре, цифры, «-» и «_»."
        )
    return employee_id


def _text(payload: dict[str, Any], key: str, label: str, *, max_len: int, required: bool = False,
          default: str | None = None) -> str | None:
    value = payload.get(key)
    if value is None or (isinstance(value, str) and not value.strip()):
        if required:
            raise WarehouseValidationError(f"Поле «{label}» обязательно.")
        return default
    if not isinstance(value, str):
        raise WarehouseValidationError(f"Поле «{label}» должно быть строкой.")
    text = " ".join(value.split())
    if len(text) > max_len:
        raise WarehouseValidationError(f"Поле «{label}» длиннее {max_len} символов.")
    return text


def validate_employee(payload: Any, zone_ids: Iterable[str], now_ms: int) -> dict[str, Any]:
    """Проверяет карточку сотрудника и возвращает только известные поля.

    Лишние ключи (например, вычисляемые поля симуляции location или history) отбрасываются: сервер
    хранит данные сотрудника, а не состояние интерфейса.
    """
    if not isinstance(payload, dict):
        raise WarehouseValidationError("Ожидался объект сотрудника.")
    zones = set(zone_ids)

    first_name = _text(payload, "firstName", "Имя", max_len=60, required=True)
    last_name = _text(payload, "lastName", "Фамилия", max_len=60, required=True)
    position = _text(payload, "position", "Должность", max_len=120, required=True)
    role = _text(payload, "role", "Роль", max_len=80, default="Сотрудник склада")
    department = _text(payload, "department", "Отдел", max_len=80, default="Смена")
    task = _text(payload, "task", "Задача", max_len=200, default="Задача не назначена")
    contact = _text(payload, "contact", "Контакт", max_len=60, default=None)

    zone_id = payload.get("zoneId")
    if not isinstance(zone_id, str) or zone_id not in zones:
        raise WarehouseValidationError("Указана несуществующая зона склада.")

    status = payload.get("status", "available")
    if status not in EMPLOYEE_STATUSES:
        raise WarehouseValidationError("Недопустимый статус сотрудника.")

    tone = payload.get("avatarTone", "violet")
    if tone not in ZONE_TONES:
        tone = "violet"

    raw_duties = payload.get("responsibilities", [])
    if not isinstance(raw_duties, list):
        raise WarehouseValidationError("Обязанности должны быть списком строк.")
    duties: list[str] = []
    for item in raw_duties:
        if not isinstance(item, str):
            raise WarehouseValidationError("Обязанности должны быть списком строк.")
        text = " ".join(item.split())
        if text:
            if len(text) > 120:
                raise WarehouseValidationError("Обязанность длиннее 120 символов.")
            duties.append(text)
    if len(duties) > MAX_RESPONSIBILITIES:
        raise WarehouseValidationError(f"Обязанностей не больше {MAX_RESPONSIBILITIES}.")

    patrol_raw = payload.get("patrol")
    patrol: list[str] | None = None
    if isinstance(patrol_raw, list):
        patrol = [zone for zone in patrol_raw if isinstance(zone, str) and zone in zones][:12] or None

    return {
        "id": validate_employee_id(payload.get("id")),
        "firstName": first_name,
        "lastName": last_name,
        "position": position,
        "role": role,
        "department": department,
        "zoneId": zone_id,
        "status": status,
        "task": task,
        "responsibilities": duties,
        "contact": contact,
        "avatarTone": tone,
        "online": status != "offline",
        "patrol": patrol,
        "updatedAt": int(now_ms),
    }


def _finite(value: Any, label: str, low: float, high: float) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise WarehouseValidationError(f"Координата «{label}» должна быть числом.")
    number = float(value)
    if not math.isfinite(number) or number < low or number > high:
        raise WarehouseValidationError(f"Координата «{label}» вне схемы склада.")
    return number


def validate_positions(payload: Any, zone_ids: Iterable[str], employee_ids: Iterable[str]) -> list[dict[str, Any]]:
    """Проверка пакета координат от источника позиционирования (BLE, UWB или мобильное приложение)."""
    if not isinstance(payload, dict) or not isinstance(payload.get("positions"), list):
        raise WarehouseValidationError("Ожидался объект вида {\"positions\": [...]}.")
    items = payload["positions"]
    if not items:
        raise WarehouseValidationError("Список координат пуст.")
    if len(items) > MAX_POSITIONS_PER_REQUEST:
        raise WarehouseValidationError(f"За один запрос можно передать не больше {MAX_POSITIONS_PER_REQUEST} координат.")

    zones = set(zone_ids)
    employees = set(employee_ids)
    result: list[dict[str, Any]] = []
    for item in items:
        if not isinstance(item, dict):
            raise WarehouseValidationError("Каждая координата должна быть объектом.")
        employee_id = item.get("employeeId")
        if not isinstance(employee_id, str) or employee_id not in employees:
            raise WarehouseValidationError("Указан неизвестный сотрудник.")
        zone_id = item.get("zoneId")
        if not isinstance(zone_id, str) or zone_id not in zones:
            raise WarehouseValidationError("Указана несуществующая зона склада.")
        status = item.get("status", "working")
        if status not in EMPLOYEE_STATUSES:
            raise WarehouseValidationError("Недопустимый статус сотрудника.")
        source = item.get("source")
        if source not in POSITION_SOURCES:
            raise WarehouseValidationError("Источник координат должен быть ble, uwb или mobile.")
        recorded_at = item.get("recordedAt")
        if recorded_at is not None and (isinstance(recorded_at, bool) or not isinstance(recorded_at, int)):
            raise WarehouseValidationError("recordedAt должен быть целым числом (Unix ms).")
        result.append({
            "employeeId": employee_id,
            "x": _finite(item.get("x"), "x", 0, MAP_WIDTH),
            "y": _finite(item.get("y"), "y", 0, MAP_HEIGHT),
            "zoneId": zone_id,
            "status": status,
            "source": source,
            "recordedAt": recorded_at,
        })
    return result


# --- Строки БД -> объекты API ---------------------------------------------------------------------------

EMPLOYEE_COLUMNS = (
    "id, first_name, last_name, position, role, department, zone_id, status, task, "
    "responsibilities, contact, avatar_tone, online, patrol, manual, is_demo, updated_at, updated_by"
)


def employee_from_row(row: tuple[Any, ...]) -> dict[str, Any]:
    """Порядок колонок задаёт EMPLOYEE_COLUMNS. jsonb psycopg уже возвращает как list."""
    (employee_id, first_name, last_name, position, role, department, zone_id, status, task,
     responsibilities, contact, avatar_tone, online, patrol, manual, is_demo, updated_at, updated_by) = row
    return {
        "id": employee_id,
        "firstName": first_name,
        "lastName": last_name,
        "position": position,
        "role": role,
        "department": department,
        "zoneId": zone_id,
        "status": status,
        "task": task,
        "responsibilities": list(responsibilities or []),
        "contact": contact,
        "avatarTone": avatar_tone,
        "online": bool(online),
        "patrol": list(patrol) if patrol else None,
        "manual": bool(manual),
        "isDemo": bool(is_demo),
        "updatedAt": int(updated_at),
        "updatedBy": updated_by,
    }


ADMIN_ONLY_EMPLOYEE_FIELDS = ("updatedBy", "isDemo")


def employee_view(employee: dict[str, Any], role: str) -> dict[str, Any]:
    """Посетитель видит рабочую информацию; кто и когда правил запись, видит только администратор."""
    view = dict(employee)
    if role != "admin":
        for field in ADMIN_ONLY_EMPLOYEE_FIELDS:
            view.pop(field, None)
    if view.get("contact") is None:
        view.pop("contact", None)
    if view.get("patrol") is None:
        view.pop("patrol", None)
    return view


def equipment_from_row(row: tuple[Any, ...]) -> dict[str, Any]:
    equipment_id, name, kind, zone_id, status, task, location, metrics = row
    item: dict[str, Any] = {
        "id": equipment_id,
        "name": name,
        "kind": kind,
        "zoneId": zone_id,
        "status": status,
        "task": task,
        "location": dict(location),
    }
    item.update(dict(metrics or {}))
    return item


EQUIPMENT_METRIC_KEYS = ("engineHours", "lastServiceDaysAgo", "serviceIntervalDays", "fault", "idleHours")


def split_equipment(item: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Делит технику на основные поля и необязательные показатели обслуживания (в колонку metrics)."""
    metrics = {key: item[key] for key in EQUIPMENT_METRIC_KEYS if key in item}
    return item["location"], metrics


def build_state(
    *,
    site_info: dict[str, Any],
    zones: list[dict[str, Any]],
    nodes: list[dict[str, Any]],
    edges: list[tuple[str, str]],
    departments: list[str],
    employees: list[dict[str, Any]],
    equipment: list[dict[str, Any]],
    role: str,
    generated_at: int,
) -> dict[str, Any]:
    """Ответ GET /warehouse/{site}: всё, что нужно интерфейсу, одним запросом."""
    has_demo = any(employee.get("isDemo") for employee in employees)
    return {
        "site": site_info,
        "zones": zones,
        "graph": {"nodes": nodes, "edges": [list(edge) for edge in edges]},
        "departments": departments,
        "employees": [employee_view(employee, role) for employee in employees],
        "equipment": equipment,
        # Явная пометка режима данных: интерфейс обязан показывать, что координаты симулируются.
        "dataMode": "demo" if has_demo else "live",
        "positionSource": "demo",
        "generatedAt": int(generated_at),
    }
