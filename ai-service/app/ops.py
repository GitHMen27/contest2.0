"""Детерминированный AI-анализ операционного снимка.

Сервис не вызывает внешнюю модель для операционных предложений: решение должно быть
воспроизводимым и проверяемым на демо-данных. Снимок присылает фронтенд, а предложения
возвращаются как черновики. Любое изменение выполняется только через /ai/action после
подтверждения администратора и попадает в аудит-журнал.
"""
from __future__ import annotations

import hashlib
import json
import time
from typing import Any

SEVERITY_RANK = {"critical": 0, "high": 1, "medium": 2, "low": 3}
OPEN_TASK_STATUSES = {"new", "in_progress", "blocked"}
FREE_EMPLOYEE_STATUSES = {"available"}
FREE_EQUIPMENT_STATUSES = {"idle"}


def _list(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [item for item in value if isinstance(item, dict)]


def _text(value: Any, default: str = "") -> str:
    return value.strip() if isinstance(value, str) else default


def _num(value: Any, default: float = 0) -> float:
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else default


def _name(employee: dict[str, Any]) -> str:
    full = _text(employee.get("name"))
    if full:
        return full
    parts = [_text(employee.get("firstName")), _text(employee.get("lastName"))]
    return " ".join(part for part in parts if part) or "Сотрудник"


def _hub_name(snapshot: dict[str, Any], hub_id: str) -> str:
    for hub in _list(snapshot.get("hubs")):
        if _text(hub.get("id")) == hub_id:
            return _text(hub.get("name"), hub_id)
    return hub_id or "РЦ"


def _zone_name(snapshot: dict[str, Any], zone_id: str) -> str:
    for zone in _list(snapshot.get("zones")):
        if _text(zone.get("id")) == zone_id:
            return _text(zone.get("shortName") or zone.get("name"), zone_id)
    return zone_id or "зона"


def _make_proposal(
    kind: str,
    title: str,
    description: str,
    reason: str,
    summary: str,
    payload: dict[str, Any],
) -> dict[str, Any]:
    raw = f"{kind}:{title}:{json.dumps(payload, sort_keys=True, ensure_ascii=False)}"
    proposal_id = "ai-" + hashlib.sha1(raw.encode("utf-8")).hexdigest()[:12]
    return {
        "id": proposal_id,
        "kind": kind,
        "title": title,
        "description": description,
        "reason": reason,
        "summary": summary,
        "payload": payload,
        "requiresAdmin": True,
    }


def _pick_employee(employees: list[dict[str, Any]], preferred_zone: str = "") -> dict[str, Any] | None:
    free = [item for item in employees if _text(item.get("status")) in FREE_EMPLOYEE_STATUSES]
    if not free:
        return None
    for employee in free:
        if preferred_zone and _text(employee.get("zoneId")) == preferred_zone:
            return employee
    return free[0]


def analyze(snapshot: dict[str, Any], question: str) -> dict[str, Any]:
    """Возвращает ответ, наблюдения и безопасные черновики действий."""
    now = int(time.time() * 1000)
    hubs = _list(snapshot.get("hubs"))
    zones = _list(snapshot.get("zones"))
    employees = _list(snapshot.get("employees"))
    equipment = _list(snapshot.get("equipment"))
    incidents = _list(snapshot.get("incidents"))
    tasks = _list(snapshot.get("tasks"))

    open_incidents = sorted(
        [item for item in incidents if _text(item.get("status")) != "resolved"],
        key=lambda item: (
            SEVERITY_RANK.get(_text(item.get("severity")), 9),
            -_num(item.get("updatedAt")),
        ),
    )
    critical_incidents = [item for item in open_incidents if _text(item.get("severity")) == "critical"]
    overloaded_hubs = [item for item in hubs if _num(item.get("load")) >= 85]
    overloaded_zones = [
        item
        for item in zones
        if _text(item.get("id")) != "corridors" and _num(item.get("load")) >= 85
    ]
    free_employees = [item for item in employees if _text(item.get("status")) in FREE_EMPLOYEE_STATUSES]
    free_equipment = [item for item in equipment if _text(item.get("status")) in FREE_EQUIPMENT_STATUSES]
    faulty_equipment = [
        item
        for item in equipment
        if _text(item.get("fault")) or _text(item.get("status")) == "maintenance"
    ]
    unassigned_tasks = [
        item
        for item in tasks
        if _text(item.get("status")) in OPEN_TASK_STATUSES and not _text(item.get("assigneeId"))
    ]
    overdue_tasks = [
        item
        for item in tasks
        if _text(item.get("status")) in OPEN_TASK_STATUSES and _num(item.get("dueAt")) < now
    ]

    findings: list[str] = []
    findings.append(f"Открытых инцидентов: {len(open_incidents)}, критических: {len(critical_incidents)}.")
    findings.append(
        f"Свободных сотрудников: {len(free_employees)}"
        + (f" ({', '.join(_name(item) for item in free_employees[:3])})" if free_employees else "")
        + "."
    )
    findings.append(
        f"Свободной техники: {len(free_equipment)}"
        + (f" ({', '.join(_text(item.get('name')) for item in free_equipment[:3])})" if free_equipment else "")
        + "."
    )
    if overloaded_hubs:
        findings.append(
            "Перегружены РЦ: "
            + ", ".join(f"{_text(item.get('name'))} {round(_num(item.get('load')))}%" for item in overloaded_hubs[:3])
            + "."
        )
    if overloaded_zones:
        findings.append(
            "Зоны выше 85%: "
            + ", ".join(
                f"{_text(item.get('shortName') or item.get('name'))} {round(_num(item.get('load')))}%"
                for item in overloaded_zones[:4]
            )
            + "."
        )
    if faulty_equipment:
        findings.append(
            "Требует внимания техника: "
            + ", ".join(_text(item.get("name"), "без имени") for item in faulty_equipment[:3])
            + "."
        )
    if unassigned_tasks:
        findings.append(f"Задач без исполнителя: {len(unassigned_tasks)}.")
    if overdue_tasks:
        findings.append(f"Просроченных открытых задач: {len(overdue_tasks)}.")

    proposals: list[dict[str, Any]] = []
    seen_titles: set[str] = set()

    def add(proposal: dict[str, Any]) -> None:
        if proposal["title"] in seen_titles or len(proposals) >= 3:
            return
        seen_titles.add(proposal["title"])
        proposals.append(proposal)

    question_lower = question.lower()

    # Явная просьба зафиксировать новый инцидент по самой загруженной точке.
    if "инцидент" in question_lower and any(
        word in question_lower for word in ("создай", "создать", "зафиксируй", "открой")
    ):
        if hubs:
            worst_hub = max(hubs, key=lambda item: _num(item.get("load")))
            hub_load = round(_num(worst_hub.get("load")))
            owner = _pick_employee(employees)
            add(
                _make_proposal(
                    "create_incident",
                    f"Зафиксировать инцидент: перегрузка {_text(worst_hub.get('name'), 'РЦ')}",
                    f"Загрузка РЦ достигла {hub_load}%. Нужно зафиксировать событие и назначить ответственного.",
                    "Инцидент создаётся как черновик: данные изменятся только после подтверждения.",
                    f"Инцидент · {_text(worst_hub.get('name'), 'РЦ')} · {hub_load}%",
                    {
                        "title": f"Перегрузка {_text(worst_hub.get('name'), 'РЦ')}: {hub_load}%",
                        "description": f"Загрузка {hub_load}% создаёт очередь на доки и риск просрочки SLA.",
                        "severity": "critical" if hub_load >= 95 else "high",
                        "category": "hub",
                        "hubId": _text(worst_hub.get("id")),
                        "owner": _name(owner) if owner else "AI-диспетчер",
                        "recommendation": "Перераспределить часть потока на менее загруженный РЦ и контролировать окна доставки.",
                    },
                )
            )

    # Явная просьба создать задачу по перегруженной зоне.
    if "задач" in question_lower and any(
        word in question_lower for word in ("создай", "создать", "поставь")
    ):
        zone = overloaded_zones[0] if overloaded_zones else (zones[0] if zones else None)
        if zone:
            zone_id = _text(zone.get("id"))
            employee = _pick_employee(employees, zone_id)
            add(
                _make_proposal(
                    "create_task",
                    f"Создать задачу: {_text(zone.get('shortName') or zone.get('name'), 'зона склада')}",
                    "Задача на проверку зоны, очередь операций и свободные проходы.",
                    "Явный запрос на создание задачи; выполнение требует подтверждения.",
                    f"Задача · {_zone_name(snapshot, zone_id)}",
                    {
                        "title": f"Проверить зону {_text(zone.get('shortName') or zone.get('name'), '')}".strip(),
                        "description": "Проверить загрузку, очередь операций и свободные проходы.",
                        "assigneeId": _text(employee.get("id")) if employee else "",
                        "zoneId": zone_id,
                        "priority": "high",
                        "dueAt": now + 2 * 3_600_000,
                    },
                )
            )

    # 1. Критический инцидент: перевести в работу, если он ещё новый.
    for incident in critical_incidents:
        if _text(incident.get("status")) == "new":
            add(
                _make_proposal(
                    "change_incident_status",
                    f"Взять в работу: {_text(incident.get('title'), 'критический инцидент')}",
                    "Инцидент остаётся новым, хотя имеет критический приоритет. "
                    "Перевод в работу фиксирует ответственного и запускает таймер SLA.",
                    "Критический инцидент без реакции повышает риск просрочки и потерь.",
                    f"Инцидент · {_hub_name(snapshot, _text(incident.get('hubId')))}",
                    {"incidentId": _text(incident.get("id")), "status": "in_progress"},
                )
            )
            break

    # 2. Неисправная техника: задача на осмотр.
    for item in faulty_equipment:
        zone_id = _text(item.get("zoneId"), "picking")
        employee = _pick_employee(employees, zone_id)
        equipment_id = _text(item.get("id"))
        fault = _text(item.get("fault"), "требуется диагностика")
        add(
            _make_proposal(
                "create_task",
                f"Проверить технику: {_text(item.get('name'), 'без имени')}",
                f"Осмотреть оборудование, проверить отклик датчиков и зафиксировать результат. "
                f"Причина: {fault}.",
                "Техника с неисправностью снижает пропускную способность участка.",
                f"Задача · {_zone_name(snapshot, zone_id)}",
                {
                    "title": f"Проверить технику {_text(item.get('name'), '')}".strip(),
                    "description": f"Диагностика: {fault}. Проверить датчики и вернуть технику в работу.",
                    "assigneeId": _text(employee.get("id")) if employee else "",
                    "zoneId": zone_id,
                    "equipmentId": equipment_id,
                    "priority": "high",
                    "dueAt": now + 2 * 3_600_000,
                },
            )
        )
        break

    # 3. Свободный сотрудник и задача без исполнителя.
    if free_employees and unassigned_tasks:
        task = unassigned_tasks[0]
        employee = _pick_employee(employees, _text(task.get("zoneId"))) or free_employees[0]
        add(
            _make_proposal(
                "assign_employee",
                f"Назначить {_name(employee)} на задачу",
                f"Задача «{_text(task.get('title'), 'без названия')}» не имеет исполнителя.",
                "Свободный сотрудник может закрыть задачу без дополнительной нагрузки на смену.",
                f"Назначение · {_zone_name(snapshot, _text(task.get('zoneId')))}",
                {
                    "taskId": _text(task.get("id")),
                    "assigneeId": _text(employee.get("id")),
                    "note": "Назначено по предложению AI после подтверждения администратора.",
                },
            )
        )

    # 4. Перегруженная зона склада: задача на разгрузку.
    if overloaded_zones:
        zone = overloaded_zones[0]
        zone_id = _text(zone.get("id"))
        employee = _pick_employee(employees, zone_id)
        add(
            _make_proposal(
                "create_task",
                f"Разгрузить зону: {_text(zone.get('shortName') or zone.get('name'), 'зона')}",
                "Загрузка зоны превышает 85%. Нужно перераспределить поток и освободить проходы.",
                "Высокая загрузка зоны создаёт очередь и повышает риск ошибок комплектации.",
                f"Задача · {_zone_name(snapshot, zone_id)} · {round(_num(zone.get('load')))}%",
                {
                    "title": f"Разгрузить зону {_text(zone.get('shortName') or zone.get('name'), '')}".strip(),
                    "description": "Перераспределить поток, освободить проходы и проверить очередь операций.",
                    "assigneeId": _text(employee.get("id")) if employee else "",
                    "zoneId": zone_id,
                    "priority": "high",
                    "dueAt": now + 3 * 3_600_000,
                },
            )
        )

    # 5. Если критический инцидент уже в работе, предложить задачу по его зоне.
    if len(proposals) < 3 and critical_incidents:
        incident = critical_incidents[0]
        if _text(incident.get("zoneId")):
            zone_id = _text(incident.get("zoneId"))
            employee = _pick_employee(employees, zone_id)
            add(
                _make_proposal(
                    "create_task",
                    f"Отработать инцидент: {_text(incident.get('title'), 'критический инцидент')}",
                    "Закрепить действия по инциденту отдельной задачей с исполнителем и сроком.",
                    "Инцидент уже в работе, но действия не оформлены как задача.",
                    f"Задача · {_zone_name(snapshot, zone_id)}",
                    {
                        "title": f"Отработать: {_text(incident.get('title'), 'инцидент')}",
                        "description": _text(incident.get("recommendation")) or _text(incident.get("description")),
                        "assigneeId": _text(employee.get("id")) if employee else "",
                        "zoneId": zone_id,
                        "equipmentId": _text(incident.get("equipmentId")) or None,
                        "priority": "urgent",
                        "dueAt": now + 3_600_000,
                    },
                )
            )

    # 6. Нет свободных сотрудников, но есть просроченная задача: предложить смену статуса.
    if len(proposals) < 3 and overdue_tasks and not free_employees:
        task = overdue_tasks[0]
        add(
            _make_proposal(
                "change_task_status",
                f"Заблокировать просроченную задачу: {_text(task.get('title'), 'задача')}",
                "Свободных сотрудников нет, задача просрочена. Блокировка привлечёт внимание руководителя.",
                "Просрочка без реакции скрывает реальный риск SLA.",
                "Статус задачи · требует решения руководителя",
                {"taskId": _text(task.get("id")), "status": "blocked"},
            )
        )

    if "свобод" in question_lower and free_employees:
        findings.insert(
            0,
            "Кто свободен: "
            + ", ".join(f"{_name(item)} ({_text(item.get('position'), 'смена')})" for item in free_employees[:5])
            + ".",
        )

    if proposals:
        action_text = "Предложения готовы как черновики: " + "; ".join(item["title"] for item in proposals) + "."
    else:
        action_text = "Критических действий не требуется: продолжайте наблюдение и проверьте инциденты в центре управления."

    causes: list[str] = []
    for incident in open_incidents[:2]:
        description = _text(incident.get("description"))
        if description:
            causes.append(f"{_text(incident.get('title'), 'Инцидент')}: {description[:160]}")
    if not causes:
        causes.append("Явных причин в снимке нет: инциденты закрыты или отсутствуют.")

    answer_lines = [
        "Оперативный срез по демо-снимку сети и склада.",
        "",
        "Что вижу:",
        *[f"• {item}" for item in findings],
        "",
        "Вероятные причины:",
        *[f"• {item}" for item in causes],
        "",
        "Что предлагаю:",
        *([f"• {item['title']} — {item['reason']}" for item in proposals] if proposals else [f"• {action_text}"]),
        "",
        "Черновики не меняют данные. Создание задач, инцидентов и изменение статусов выполняются только после подтверждения администратора и фиксируются в аудите.",
    ]

    return {
        "answer": "\n".join(answer_lines),
        "findings": findings,
        "proposals": proposals,
        "generatedAt": now,
    }
