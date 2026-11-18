"""Хранилище цифрового двойника склада в PostgreSQL.

Таблицы создаются командой `python -m app.warehouse_repo` (или автоматически при первом обращении к API)
и один раз наполняются демонстрационными данными из warehouse_data.py. Все демо-строки помечены
is_demo = TRUE, записи администратора — нет, поэтому демонстрация не смешивается с реальными данными.

Тяжёлые зависимости (пул соединений) импортируются внутри функций: модуль можно импортировать
в тестах без базы и сети.
"""
from __future__ import annotations

import json
import logging
import threading
from typing import Any

from app import warehouse_data as seed
from app.warehouse_logic import (
    EMPLOYEE_COLUMNS,
    build_schema_sql,
    employee_from_row,
    equipment_from_row,
    split_equipment,
)

logger = logging.getLogger("app.warehouse")

_ready = False
_ready_lock = threading.Lock()


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_or_none(value: Any) -> str | None:
    """None должен попасть в БД как SQL NULL, а не как JSON null: иначе COALESCE не сработает."""
    return None if value is None else _json(value)


# --- Строки БД -> объекты API ---------------------------------------------------------------------------

ZONE_COLUMNS = (
    "id, name, short_name, purpose, state, status, area_m2, load_percent, tone, icon, rect, "
    "access_node_id, responsible_ids"
)


def zone_from_row(row: tuple[Any, ...]) -> dict[str, Any]:
    (zone_id, name, short_name, purpose, state, status, area_m2, load_percent, tone, icon, rect,
     access_node_id, responsible_ids) = row
    return {
        "id": zone_id,
        "name": name,
        "shortName": short_name,
        "purpose": purpose,
        "state": state,
        "status": status,
        "areaM2": int(area_m2),
        "load": int(load_percent),
        "tone": tone,
        "icon": icon,
        "rect": dict(rect),
        "accessNodeId": access_node_id,
        "responsibleIds": list(responsible_ids or []),
    }


def node_from_row(row: tuple[Any, ...]) -> dict[str, Any]:
    node_id, x, y, label = row
    node: dict[str, Any] = {"id": node_id, "x": float(x), "y": float(y)}
    if label:
        node["label"] = label
    return node


# --- Схема и демо-данные --------------------------------------------------------------------------------

def _seed(conn) -> None:
    site = seed.SITE_ID
    for zone in seed.SEED_ZONES:
        rect = zone["rect"]
        conn.execute(
            """
            INSERT INTO warehouse_zones (site_id, id, name, short_name, purpose, state, status, area_m2,
                                         load_percent, tone, icon, rect, access_node_id, responsible_ids, is_demo)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb, TRUE)
            ON CONFLICT (site_id, id) DO NOTHING
            """,
            (site, zone["id"], zone["name"], zone["shortName"], zone["purpose"], zone["state"], zone["status"],
             zone["areaM2"], zone["load"], zone["tone"], zone["icon"], _json(rect), zone["accessNodeId"],
             _json(zone["responsibleIds"])),
        )
    for node in seed.SEED_GRAPH_NODES:
        conn.execute(
            """
            INSERT INTO warehouse_nodes (site_id, id, x, y, label, is_demo)
            VALUES (%s, %s, %s, %s, %s, TRUE)
            ON CONFLICT (site_id, id) DO NOTHING
            """,
            (site, node["id"], node["x"], node["y"], node.get("label")),
        )
    for from_node, to_node in seed.SEED_GRAPH_EDGES:
        conn.execute(
            """
            INSERT INTO warehouse_routes (site_id, from_node, to_node, is_demo)
            VALUES (%s, %s, %s, TRUE)
            ON CONFLICT (site_id, from_node, to_node) DO NOTHING
            """,
            (site, from_node, to_node),
        )
    for department in sorted({employee["department"] for employee in seed.SEED_EMPLOYEES}):
        conn.execute(
            """
            INSERT INTO employee_departments (site_id, name, is_demo)
            VALUES (%s, %s, TRUE)
            ON CONFLICT (site_id, name) DO NOTHING
            """,
            (site, department),
        )
    for employee in seed.SEED_EMPLOYEES:
        conn.execute(
            """
            INSERT INTO employees (site_id, id, first_name, last_name, position, role, department, zone_id,
                                   status, task, responsibilities, contact, avatar_tone, online, patrol,
                                   manual, is_demo, updated_at, updated_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s::jsonb,
                    FALSE, TRUE, 0, NULL)
            ON CONFLICT (site_id, id) DO NOTHING
            """,
            (site, employee["id"], employee["firstName"], employee["lastName"], employee["position"],
             employee["role"], employee["department"], employee["zoneId"], employee["status"],
             employee["task"], _json(employee["responsibilities"]), employee.get("contact"),
             employee.get("avatarTone"), employee.get("online", True), _json_or_none(employee.get("patrol"))),
        )
    for item in seed.SEED_EQUIPMENT:
        location, metrics = split_equipment(item)
        conn.execute(
            """
            INSERT INTO warehouse_equipment (site_id, id, name, kind, zone_id, status, task, location, metrics, is_demo)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, TRUE)
            ON CONFLICT (site_id, id) DO NOTHING
            """,
            (site, item["id"], item["name"], item["kind"], item["zoneId"], item["status"], item["task"],
             _json(location), _json(metrics)),
        )


def ensure_ready() -> None:
    """Создаёт таблицы и демо-данные (идемпотентно). Выполняется один раз за процесс."""
    global _ready
    if _ready:
        return
    with _ready_lock:
        if _ready:
            return
        from app.db import connection

        with connection() as conn:
            for statement in build_schema_sql():
                conn.execute(statement)
            _seed(conn)
        _ready = True
        logger.info("Схема цифрового двойника склада готова")


# --- Чтение ---------------------------------------------------------------------------------------------

def load_parts(site_id: str) -> dict[str, Any]:
    from app.db import connection

    ensure_ready()
    with connection() as conn:
        zones = [zone_from_row(r) for r in conn.execute(
            f"SELECT {ZONE_COLUMNS} FROM warehouse_zones WHERE site_id = %s ORDER BY id", (site_id,)).fetchall()]
        nodes = [node_from_row(r) for r in conn.execute(
            "SELECT id, x, y, label FROM warehouse_nodes WHERE site_id = %s ORDER BY id", (site_id,)).fetchall()]
        edges = [(r[0], r[1]) for r in conn.execute(
            "SELECT from_node, to_node FROM warehouse_routes WHERE site_id = %s ORDER BY from_node, to_node",
            (site_id,)).fetchall()]
        departments = [r[0] for r in conn.execute(
            "SELECT name FROM employee_departments WHERE site_id = %s ORDER BY name", (site_id,)).fetchall()]
        employees = [employee_from_row(r) for r in conn.execute(
            f"SELECT {EMPLOYEE_COLUMNS} FROM employees WHERE site_id = %s ORDER BY updated_at, id",
            (site_id,)).fetchall()]
        equipment = [equipment_from_row(r) for r in conn.execute(
            "SELECT id, name, kind, zone_id, status, task, location, metrics FROM warehouse_equipment "
            "WHERE site_id = %s ORDER BY id", (site_id,)).fetchall()]
    return {
        "zones": zones,
        "nodes": nodes,
        "edges": edges,
        "departments": departments,
        "employees": employees,
        "equipment": equipment,
    }


def zone_ids(site_id: str) -> list[str]:
    from app.db import connection

    ensure_ready()
    with connection() as conn:
        return [r[0] for r in conn.execute("SELECT id FROM warehouse_zones WHERE site_id = %s", (site_id,)).fetchall()]


def employee_ids(site_id: str) -> list[str]:
    from app.db import connection

    ensure_ready()
    with connection() as conn:
        return [r[0] for r in conn.execute("SELECT id FROM employees WHERE site_id = %s", (site_id,)).fetchall()]


# --- Запись сотрудников ---------------------------------------------------------------------------------

def upsert_employee(site_id: str, employee: dict[str, Any], actor: str) -> dict[str, Any]:
    """Создаёт или обновляет сотрудника. Запись администратора помечается manual = TRUE."""
    from app.db import connection

    ensure_ready()
    with connection() as conn:
        conn.execute(
            """
            INSERT INTO employee_departments (site_id, name, is_demo)
            VALUES (%s, %s, FALSE)
            ON CONFLICT (site_id, name) DO NOTHING
            """,
            (site_id, employee["department"]),
        )
        row = conn.execute(
            f"""
            INSERT INTO employees (site_id, id, first_name, last_name, position, role, department, zone_id,
                                   status, task, responsibilities, contact, avatar_tone, online, patrol,
                                   manual, is_demo, updated_at, updated_by)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, %s::jsonb,
                    TRUE, FALSE, %s, %s)
            ON CONFLICT (site_id, id) DO UPDATE SET
                first_name = EXCLUDED.first_name,
                last_name = EXCLUDED.last_name,
                position = EXCLUDED.position,
                role = EXCLUDED.role,
                department = EXCLUDED.department,
                zone_id = EXCLUDED.zone_id,
                status = EXCLUDED.status,
                task = EXCLUDED.task,
                responsibilities = EXCLUDED.responsibilities,
                contact = EXCLUDED.contact,
                avatar_tone = EXCLUDED.avatar_tone,
                online = EXCLUDED.online,
                patrol = COALESCE(EXCLUDED.patrol, employees.patrol),
                manual = TRUE,
                updated_at = EXCLUDED.updated_at,
                updated_by = EXCLUDED.updated_by
            RETURNING {EMPLOYEE_COLUMNS}
            """,
            (site_id, employee["id"], employee["firstName"], employee["lastName"], employee["position"],
             employee["role"], employee["department"], employee["zoneId"], employee["status"], employee["task"],
             _json(employee["responsibilities"]), employee["contact"], employee["avatarTone"],
             employee["online"], _json_or_none(employee["patrol"]), employee["updatedAt"], actor),
        ).fetchone()
    return employee_from_row(row)


def delete_employee(site_id: str, employee_id: str) -> str:
    """Удаляет сотрудника, добавленного администратором.

    Возвращает "deleted", "demo" (демо-сотрудника удалять нельзя: его можно отключить) или "missing".
    """
    from app.db import connection

    ensure_ready()
    with connection() as conn:
        deleted = conn.execute(
            "DELETE FROM employees WHERE site_id = %s AND id = %s AND is_demo = FALSE RETURNING id",
            (site_id, employee_id),
        ).fetchone()
        if deleted:
            return "deleted"
        exists = conn.execute(
            "SELECT 1 FROM employees WHERE site_id = %s AND id = %s", (site_id, employee_id)
        ).fetchone()
    return "demo" if exists else "missing"


# --- Координаты и история -------------------------------------------------------------------------------

def record_positions(site_id: str, positions: list[dict[str, Any]], now_ms: int) -> int:
    from app.db import connection

    ensure_ready()
    rows = [
        (site_id, p["employeeId"], p["x"], p["y"], p["zoneId"], p["status"], p["source"],
         p["recordedAt"] if p["recordedAt"] is not None else now_ms)
        for p in positions
    ]
    with connection() as conn:
        with conn.cursor() as cursor:
            cursor.executemany(
                """
                INSERT INTO employee_locations (site_id, employee_id, x, y, zone_id, status, source, is_demo, recorded_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, FALSE, %s)
                """,
                rows,
            )
    return len(rows)


def latest_positions(site_id: str) -> list[dict[str, Any]]:
    from app.db import connection

    ensure_ready()
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT DISTINCT ON (employee_id) employee_id, x, y, zone_id, status, source, recorded_at
            FROM employee_locations
            WHERE site_id = %s
            ORDER BY employee_id, recorded_at DESC
            """,
            (site_id,),
        ).fetchall()
    return [
        {"employeeId": r[0], "x": float(r[1]), "y": float(r[2]), "zoneId": r[3], "status": r[4],
         "source": r[5], "updatedAt": int(r[6])}
        for r in rows
    ]


def employee_history(site_id: str, employee_id: str, limit: int) -> list[dict[str, Any]]:
    from app.db import connection

    ensure_ready()
    with connection() as conn:
        rows = conn.execute(
            """
            SELECT zone_id, recorded_at, source
            FROM employee_locations
            WHERE site_id = %s AND employee_id = %s
            ORDER BY recorded_at DESC
            LIMIT %s
            """,
            (site_id, employee_id, limit),
        ).fetchall()
    return [{"zoneId": r[0], "at": int(r[1]), "source": r[2]} for r in rows]


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ensure_ready()
    print("Таблицы цифрового двойника созданы, демо-данные загружены.")
