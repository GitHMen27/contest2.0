"""REST API цифрового двойника склада: данные, сотрудники, координаты, история.

Подключается в main.py (router-level guard: X-API-Key и rate limit). Права:
  - чтение состояния и координат: любой вошедший пользователь (роль определяет состав полей);
  - изменение сотрудников, история перемещений, приём координат: только администратор.
Данные хранятся в PostgreSQL (warehouse_repo.py); демонстрационные записи помечены is_demo.
"""
from __future__ import annotations

import logging
import time
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, Query

from app import warehouse_data as seed
from app import warehouse_logic as logic
from app import warehouse_repo as repo
from app.auth import current_user, require_admin

logger = logging.getLogger("app.warehouse")

router = APIRouter(prefix="/warehouse", tags=["warehouse"])


def _now_ms() -> int:
    return int(time.time() * 1000)


def _site(site_id: str) -> str:
    try:
        site = logic.validate_site_id(site_id)
    except logic.WarehouseValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    if site != seed.SITE_ID:
        raise HTTPException(status_code=404, detail="Цифровой двойник для этого РЦ ещё не подключён.")
    return site


def _storage_error(error: Exception) -> HTTPException:
    logger.exception("Хранилище цифрового двойника недоступно")
    return HTTPException(status_code=503, detail="Хранилище склада недоступно, попробуйте позже.")


@router.get("/{site_id}")
def warehouse_state(site_id: str, user: dict = Depends(current_user)) -> dict[str, Any]:
    """Зоны, граф проходов, отделы, сотрудники и техника склада одним ответом."""
    site = _site(site_id)
    try:
        parts = repo.load_parts(site)
    except Exception as error:  # noqa: BLE001
        raise _storage_error(error) from error
    return logic.build_state(
        site_info=seed.SITE_INFO,
        zones=parts["zones"],
        nodes=parts["nodes"],
        edges=parts["edges"],
        departments=parts["departments"],
        employees=parts["employees"],
        equipment=parts["equipment"],
        role=user["role"],
        generated_at=_now_ms(),
    )


@router.put("/{site_id}/employees/{employee_id}")
def save_employee(
    site_id: str,
    employee_id: str,
    payload: Any = Body(...),
    admin: dict = Depends(require_admin),
) -> dict[str, Any]:
    """Создать или обновить сотрудника (администратор). Идентификатор берётся из пути."""
    site = _site(site_id)
    try:
        logic.validate_employee_id(employee_id)
        if not isinstance(payload, dict):
            raise logic.WarehouseValidationError("Ожидался объект сотрудника.")
        employee = logic.validate_employee({**payload, "id": employee_id}, repo.zone_ids(site), _now_ms())
        stored = repo.upsert_employee(site, employee, admin["sub"])
    except logic.WarehouseValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001
        raise _storage_error(error) from error
    logger.info("Сотрудник %s сохранён администратором %s", employee_id, admin["sub"])
    return logic.employee_view(stored, "admin")


@router.delete("/{site_id}/employees/{employee_id}")
def remove_employee(site_id: str, employee_id: str, admin: dict = Depends(require_admin)) -> dict[str, Any]:
    """Удалить сотрудника, добавленного администратором. Демо-сотрудника можно только отключить."""
    site = _site(site_id)
    try:
        logic.validate_employee_id(employee_id)
        outcome = repo.delete_employee(site, employee_id)
    except logic.WarehouseValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001
        raise _storage_error(error) from error
    if outcome == "demo":
        raise HTTPException(status_code=409, detail="Демонстрационного сотрудника нельзя удалить: отключите его статусом «Не в сети».")
    if outcome == "missing":
        raise HTTPException(status_code=404, detail="Сотрудник не найден.")
    logger.info("Сотрудник %s удалён администратором %s", employee_id, admin["sub"])
    return {"deleted": True, "id": employee_id}


@router.get("/{site_id}/employees/{employee_id}/history")
def employee_history(
    site_id: str,
    employee_id: str,
    limit: int = Query(20, ge=1, le=logic.MAX_HISTORY_ENTRIES),
    _admin: dict = Depends(require_admin),
) -> dict[str, Any]:
    """История перемещений по реальным координатам (только администратор). Симуляцию сервер не хранит."""
    site = _site(site_id)
    try:
        logic.validate_employee_id(employee_id)
        entries = repo.employee_history(site, employee_id, limit)
    except logic.WarehouseValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001
        raise _storage_error(error) from error
    return {"employeeId": employee_id, "entries": entries, "count": len(entries)}


@router.get("/{site_id}/positions")
def latest_positions(site_id: str, _user: dict = Depends(current_user)) -> dict[str, Any]:
    """Последние реальные координаты сотрудников. Пока датчиков нет, список пуст и source = demo."""
    site = _site(site_id)
    try:
        positions = repo.latest_positions(site)
    except Exception as error:  # noqa: BLE001
        raise _storage_error(error) from error
    return {"positions": positions, "source": "live" if positions else "demo", "generatedAt": _now_ms()}


@router.post("/{site_id}/positions")
def ingest_positions(
    site_id: str,
    payload: Any = Body(...),
    admin: dict = Depends(require_admin),
) -> dict[str, Any]:
    """Приём координат от BLE/UWB-шлюза или мобильного приложения.

    Принимает только измерения (источник ble, uwb или mobile): демонстрационную симуляцию сервер не пишет.
    """
    site = _site(site_id)
    try:
        positions = logic.validate_positions(payload, repo.zone_ids(site), repo.employee_ids(site))
        stored = repo.record_positions(site, positions, _now_ms())
    except logic.WarehouseValidationError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    except Exception as error:  # noqa: BLE001
        raise _storage_error(error) from error
    logger.info("Принято %d координат от %s", stored, admin["sub"])
    return {"stored": stored}
