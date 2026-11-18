"""Тесты цифрового двойника склада: демо-данные, проверка ввода, схема БД, представления.

Тесты не требуют базы и сети: логика вынесена в warehouse_logic.py и warehouse_data.py.
"""
import pytest

from app import warehouse_data as seed
from app import warehouse_logic as logic
from app.warehouse_repo import node_from_row, zone_from_row

ZONE_IDS = [zone["id"] for zone in seed.SEED_ZONES]
EMPLOYEE_IDS = [employee["id"] for employee in seed.SEED_EMPLOYEES]
NOW = 1_800_000_000_000


def make_employee(**overrides):
    payload = {
        "id": "e-custom-1",
        "firstName": "Иван",
        "lastName": "Тестов",
        "position": "Кладовщик",
        "zoneId": "receiving",
        "status": "available",
    }
    payload.update(overrides)
    return payload


# --- демо-данные ---------------------------------------------------------------------------------------

def test_seed_sizes_match_frontend_demo():
    assert len(seed.SEED_ZONES) == 12
    assert len(seed.SEED_EMPLOYEES) == 15
    assert len(seed.SEED_EQUIPMENT) == 7
    assert len(seed.SEED_GRAPH_NODES) == 13


def test_seed_references_are_consistent():
    node_ids = {node["id"] for node in seed.SEED_GRAPH_NODES}
    for zone in seed.SEED_ZONES:
        assert zone["accessNodeId"] in node_ids
        assert set(zone["responsibleIds"]) <= set(EMPLOYEE_IDS)
    for employee in seed.SEED_EMPLOYEES:
        assert employee["zoneId"] in ZONE_IDS
        assert set(employee["patrol"]) <= set(ZONE_IDS)
        assert employee["status"] in logic.EMPLOYEE_STATUSES
    for item in seed.SEED_EQUIPMENT:
        assert item["zoneId"] in ZONE_IDS
    for left, right in seed.SEED_GRAPH_EDGES:
        assert left in node_ids and right in node_ids


def test_seed_employees_pass_validation():
    for employee in seed.SEED_EMPLOYEES:
        checked = logic.validate_employee(employee, ZONE_IDS, NOW)
        assert checked["id"] == employee["id"]
        assert checked["online"] == (employee["status"] != "offline")


# --- проверка сотрудника -------------------------------------------------------------------------------

def test_employee_defaults_and_whitelist():
    checked = logic.validate_employee(
        make_employee(location={"x": 1, "y": 2}, history=[1], currentZoneId="docs"), ZONE_IDS, NOW
    )
    assert checked["role"] == "Сотрудник склада"
    assert checked["department"] == "Смена"
    assert checked["task"] == "Задача не назначена"
    assert checked["responsibilities"] == []
    assert checked["updatedAt"] == NOW
    # вычисляемые поля симуляции на сервер не попадают
    assert "location" not in checked and "history" not in checked and "currentZoneId" not in checked


def test_offline_status_makes_employee_offline():
    assert logic.validate_employee(make_employee(status="offline"), ZONE_IDS, NOW)["online"] is False


@pytest.mark.parametrize(
    "bad",
    [
        {"firstName": ""},
        {"lastName": None},
        {"position": "   "},
        {"zoneId": "no-such-zone"},
        {"status": "sleeping"},
        {"id": "Bad Id"},
        {"id": "x"},
        {"firstName": "я" * 61},
        {"responsibilities": "not a list"},
        {"responsibilities": [1, 2]},
        {"responsibilities": ["д"] * 13},
        {"contact": 5},
    ],
)
def test_employee_validation_rejects_bad_input(bad):
    with pytest.raises(logic.WarehouseValidationError):
        logic.validate_employee(make_employee(**bad), ZONE_IDS, NOW)


def test_employee_payload_must_be_object():
    with pytest.raises(logic.WarehouseValidationError):
        logic.validate_employee(["not", "an", "object"], ZONE_IDS, NOW)


def test_unknown_tone_falls_back_and_patrol_is_filtered():
    checked = logic.validate_employee(
        make_employee(avatarTone="pink", patrol=["docs", "nowhere", 7]), ZONE_IDS, NOW
    )
    assert checked["avatarTone"] == "violet"
    assert checked["patrol"] == ["docs"]


# --- координаты ----------------------------------------------------------------------------------------

def position(**overrides):
    item = {"employeeId": "e-kozlov", "x": 100, "y": 200, "zoneId": "picking", "source": "ble"}
    item.update(overrides)
    return item


def test_positions_accept_measurements():
    result = logic.validate_positions({"positions": [position()]}, ZONE_IDS, EMPLOYEE_IDS)
    assert result[0]["x"] == 100.0 and result[0]["source"] == "ble" and result[0]["status"] == "working"


@pytest.mark.parametrize(
    "bad",
    [
        {"source": "demo"},          # симуляцию сервер не принимает как измерение
        {"source": None},
        {"employeeId": "e-ghost"},
        {"zoneId": "nowhere"},
        {"x": -1},
        {"y": logic.MAP_HEIGHT + 1},
        {"x": "100"},
        {"x": True},
        {"x": float("nan")},
        {"recordedAt": 1.5},
    ],
)
def test_positions_reject_bad_input(bad):
    with pytest.raises(logic.WarehouseValidationError):
        logic.validate_positions({"positions": [position(**bad)]}, ZONE_IDS, EMPLOYEE_IDS)


def test_positions_batch_limits():
    for payload in ({}, {"positions": []}, {"positions": [position()] * (logic.MAX_POSITIONS_PER_REQUEST + 1)}):
        with pytest.raises(logic.WarehouseValidationError):
            logic.validate_positions(payload, ZONE_IDS, EMPLOYEE_IDS)


# --- идентификаторы ------------------------------------------------------------------------------------

def test_site_id_validation():
    assert logic.validate_site_id(" Shushary ") == "shushary"
    for bad in ("", "a", "bad id", "../etc", "x" * 40):
        with pytest.raises(logic.WarehouseValidationError):
            logic.validate_site_id(bad)


# --- схема БД ------------------------------------------------------------------------------------------

def test_schema_defines_every_entity_from_the_task():
    sql = " ".join(logic.build_schema_sql()).lower()
    for table in ("warehouse_zones", "employees", "employee_locations", "employee_departments",
                  "warehouse_equipment", "warehouse_routes"):
        assert f"create table if not exists {table}" in sql
    assert sql.count("is_demo") >= 6  # демо-данные отделены от реальных во всех таблицах
    assert "site_id" in sql


def test_schema_tables_are_created_in_dependency_order():
    statements = [s.lower() for s in logic.build_schema_sql() if "create table" in s.lower()]
    created = []
    for statement in statements:
        name = statement.split("create table if not exists")[1].split("(")[0].strip()
        for dependency in ("warehouse_zones", "warehouse_nodes", "employees"):
            if f"references {dependency}" in statement:
                assert dependency in created, f"{name} зависит от {dependency}"
        created.append(name)
    assert tuple(created) == logic.SCHEMA_TABLES


# --- представления -------------------------------------------------------------------------------------

def stored_employee():
    return {
        "id": "e-x", "firstName": "А", "lastName": "Б", "position": "П", "role": "Р", "department": "О",
        "zoneId": "docs", "status": "available", "task": "Т", "responsibilities": ["а"], "contact": None,
        "avatarTone": "blue", "online": True, "patrol": None, "manual": True, "isDemo": False,
        "updatedAt": 5, "updatedBy": "admin",
    }


def test_visitor_does_not_get_admin_fields():
    visitor = logic.employee_view(stored_employee(), "user")
    admin = logic.employee_view(stored_employee(), "admin")
    assert "updatedBy" not in visitor and "isDemo" not in visitor
    assert admin["updatedBy"] == "admin" and admin["isDemo"] is False
    # пустые необязательные поля не уходят на фронтенд как null
    assert "contact" not in visitor and "patrol" not in visitor


def test_employee_row_roundtrip():
    row = ("e-x", "А", "Б", "П", "Р", "О", "docs", "available", "Т", ["а"], "+7", "blue", True,
           ["docs"], False, True, 0, None)
    employee = logic.employee_from_row(row)
    assert employee["patrol"] == ["docs"] and employee["isDemo"] is True and employee["updatedBy"] is None


def test_zone_and_node_rows():
    zone = zone_from_row(("z", "Имя", "Кратко", "Назначение", "Работает", "active", 480, 58, "amber", "⇣",
                          {"x": 1, "y": 2, "width": 3, "height": 4}, "top-185", ["e-a"]))
    assert zone["areaM2"] == 480 and zone["load"] == 58 and zone["rect"]["width"] == 3
    assert node_from_row(("n", 1, 2, None)) == {"id": "n", "x": 1.0, "y": 2.0}


def test_equipment_metrics_split_and_merge():
    item = seed.SEED_EQUIPMENT[2]
    location, metrics = logic.split_equipment(item)
    assert metrics["fault"] == "Датчик вил не отвечает" and location == item["location"]
    merged = logic.equipment_from_row((item["id"], item["name"], item["kind"], item["zoneId"], item["status"],
                                        item["task"], location, metrics))
    assert merged == item


def test_state_marks_demo_mode_and_hides_nothing_needed():
    employees = [dict(stored_employee(), isDemo=True)]
    state = logic.build_state(site_info=seed.SITE_INFO, zones=seed.SEED_ZONES, nodes=seed.SEED_GRAPH_NODES,
                              edges=seed.SEED_GRAPH_EDGES, departments=["О"], employees=employees,
                              equipment=seed.SEED_EQUIPMENT, role="user", generated_at=NOW)
    assert state["dataMode"] == "demo" and state["positionSource"] == "demo"
    assert state["graph"]["edges"][0] == ["top-185", "top-345"]
    assert "isDemo" not in state["employees"][0]
