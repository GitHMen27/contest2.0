r"""Evals для RAG по регламентам: измеряем качество поиска и ответов на размеченном наборе вопросов.

Запуск из папки ai-service/ (с активированным .venv и заполненной базой):
    python ..\evals\run_evals.py retrieval                      # только поиск: быстро, без чат-модели
    python ..\evals\run_evals.py retrieval --compare-instruction  # поиск с инструкцией для вопросов и без неё
    python ..\evals\run_evals.py answer                         # полный цикл /rag/ask: ответы, ссылки, отказы
    python ..\evals\run_evals.py all                            # всё сразу

Полезные параметры:
    --only q01 q07         только эти вопросы
    --category numeric     только категория (factual, numeric, colloquial, paraphrase, out_of_scope, near_miss, injection)
    --limit 5              первые N вопросов (для быстрой проверки)
    --pause 1.5            пауза между запросами к чат-модели, если упираетесь в лимиты
    --fail-under 0.9       код выхода 1, если главная метрика ниже порога (для автоматических проверок)

Результаты сохраняются в evals/results/ (папка в .gitignore). Ключи в отчёты не попадают.
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT.parent / "ai-service"))
sys.path.insert(0, str(ROOT))

import scoring  # noqa: E402

DATASET = ROOT / "dataset.json"
RESULTS_DIR = ROOT / "results"
TOP_FETCH = 8  # сколько результатов берём для метрик; приложение показывает первые 4
APP_TOP_N = 4


# --------------------------------------------------------------------------------------------------
# Набор вопросов
# --------------------------------------------------------------------------------------------------
def load_questions(path: Path, only: list[str] | None, category: str | None, limit: int | None) -> list[dict]:
    questions = json.loads(path.read_text(encoding="utf-8"))["questions"]
    if only:
        wanted = set(only)
        questions = [q for q in questions if q["id"] in wanted]
    if category:
        questions = [q for q in questions if q["category"] == category]
    if limit:
        questions = questions[:limit]
    return questions


# --------------------------------------------------------------------------------------------------
# Поиск
# --------------------------------------------------------------------------------------------------
def run_retrieval(questions: list[dict], instruction: str | None = None) -> list[dict]:
    """instruction: None = как в .env; строка (в том числе пустая) подменяет инструкцию для вопросов на время прогона."""
    from app.config import get_settings
    from app.retrieval import search

    settings = get_settings()
    original = settings.embedding_query_instruction
    if instruction is not None:
        settings.embedding_query_instruction = instruction
    rows: list[dict] = []
    try:
        for question in questions:
            started = time.time()
            error = None
            try:
                hits = search(question["question"], top_n=TOP_FETCH, fetch_k=10)
            except Exception as exc:  # noqa: BLE001
                hits, error = [], f"{type(exc).__name__}: {exc}"
            found = [{"doc": h.doc, "section": h.section, "via": h.via, "score": h.score} for h in hits]
            rows.append({
                "id": question["id"],
                "category": question["category"],
                "question": question["question"],
                "expected": question["expected"],
                "doc_rank": scoring.doc_rank(found, question["expected"]),
                "section_rank": scoring.section_rank(found, question["expected"]),
                "found": found[:APP_TOP_N],
                "error": error,
                "seconds": round(time.time() - started, 2),
            })
    finally:
        settings.embedding_query_instruction = original
    return rows


def summarize_rows(rows: list[dict]) -> dict:
    return scoring.summarize_retrieval([r["doc_rank"] for r in rows], [r["section_rank"] for r in rows])


def print_retrieval(label: str, rows: list[dict]) -> dict:
    summary = summarize_rows(rows)
    print(f"\n=== ПОИСК: {label} ({summary['questions']} вопросов) ===")
    print(f"  документ найден на 1-м месте:   {scoring.percent(summary['doc_hit@1'])}")
    print(f"  документ в первых 3:            {scoring.percent(summary['doc_hit@3'])}")
    print(f"  документ в первых 4 (как в UI): {scoring.percent(summary['doc_hit@4'])}")
    print(f"  нужный РАЗДЕЛ в первых 4:       {scoring.percent(summary['section_hit@4'])}")
    print(f"  MRR (чем ближе к 1, тем лучше): {summary['mrr']:.3f}")
    categories = sorted({r["category"] for r in rows})
    if len(categories) > 1:
        print("  по категориям (документ в первых 4):")
        for category in categories:
            part = [r for r in rows if r["category"] == category]
            print(f"    {category:<12} {scoring.percent(scoring.hit_rate([r['doc_rank'] for r in part], APP_TOP_N)):>5}  ({len(part)})")
    errors = [r for r in rows if r["error"]]
    if errors:
        print(f"  ОШИБОК запросов: {len(errors)}; первая: {errors[0]['error'][:200]}")
    misses = [r for r in rows if not r["error"] and (r["doc_rank"] is None or r["doc_rank"] > APP_TOP_N)]
    if misses:
        print(f"  промахи ({len(misses)}):")
        for r in misses:
            expected = "; ".join(f"{e['doc']} / {e.get('section', '')}" for e in r["expected"])
            got = "; ".join(f"{f['doc']} / {f['section']}" for f in r["found"][:2]) or "ничего"
            print(f"    [{r['id']}] {r['question']}")
            print(f"        ждали: {expected}")
            print(f"        нашли: {got}")
    return summary


# --------------------------------------------------------------------------------------------------
# Полный цикл (/rag/ask)
# --------------------------------------------------------------------------------------------------
def run_answers(questions: list[dict], pause: float) -> list[dict]:
    from app.rag import ask

    rows: list[dict] = []
    for index, question in enumerate(questions):
        if index and pause:
            time.sleep(pause)
        started = time.time()
        error = None
        try:
            result = ask(question["question"])
            text, hits, retrieved, refused = result.text, result.sources, result.retrieved, result.refused
        except Exception as exc:  # noqa: BLE001
            text, hits, retrieved, refused, error = "", [], [], False, f"{type(exc).__name__}: {exc}"
        sources = [{"doc": h.doc, "section": h.section} for h in hits]
        found = [{"doc": h.doc, "section": h.section} for h in retrieved]
        row = {
            "id": question["id"],
            "category": question["category"],
            "question": question["question"],
            "answerable": question["answerable"],
            "answer": text,
            "sources": sources,
            "retrieved": found,
            "refused": refused,
            "error": error,
            "seconds": round(time.time() - started, 2),
        }
        if question["answerable"]:
            row["keywords_ok"] = scoring.answer_matches(text, question.get("must_contain", []))
            row["citations_ok"] = (not refused) and scoring.citations_valid(text, len(hits))
            # искал ли поиск нужный документ (не зависит от того, ответила ли модель)
            row["source_ok"] = scoring.doc_rank(found, question["expected"]) is not None
            row["must_contain"] = question.get("must_contain", [])
            row["passed"] = error is None and (not refused) and row["keywords_ok"]
        else:
            row["passed"] = error is None and refused and not hits
        rows.append(row)
        print(f"  [{question['id']}] {'OK  ' if row['passed'] else 'FAIL'} {row['seconds']:>5.1f} с  {question['question'][:70]}")
    return rows


def print_answers(rows: list[dict]) -> dict:
    positives = [r for r in rows if r["answerable"]]
    negatives = [r for r in rows if not r["answerable"]]
    errors = [r for r in rows if r["error"]]
    summary: dict = {"questions": len(rows), "errors": len(errors)}
    print(f"\n=== ОТВЕТЫ ({len(rows)} вопросов: {len(positives)} с ответом, {len(negatives)} без ответа) ===")
    if positives:
        passed = sum(r["passed"] for r in positives)
        answered = [r for r in positives if not r["refused"] and not r["error"]]
        summary.update({
            "accuracy": passed / len(positives),
            "false_refusal_rate": sum(r["refused"] and not r["error"] for r in positives) / len(positives),
            "citations_valid_rate": (sum(r["citations_ok"] for r in answered) / len(answered)) if answered else 0.0,
            "source_hit_rate": sum(r["source_ok"] for r in positives) / len(positives),
        })
        print(f"  верные ответы (нужные факты есть в тексте): {scoring.percent(summary['accuracy'])}  ({passed}/{len(positives)})")
        print(f"  ложные отказы (ответ есть, а модель отказала): {scoring.percent(summary['false_refusal_rate'])}")
        print(f"  ссылки [1], [2] на реальные источники:        {scoring.percent(summary['citations_valid_rate'])}")
        print(f"  нужный документ найден поиском (даже при отказе): {scoring.percent(summary['source_hit_rate'])}")
        refused_rows = [r for r in positives if r["refused"] and not r["error"]]
        if refused_rows:
            with_context = sum(r["source_ok"] for r in refused_rows)
            summary["false_refusals_with_right_context"] = with_context
            print(f"  из {len(refused_rows)} ложных отказов нужный фрагмент в контексте БЫЛ у {with_context}: "
                  f"это ошибка модели/промпта, а не поиска")
    if negatives:
        correct = sum(r["passed"] for r in negatives)
        summary["refusal_rate"] = correct / len(negatives)
        print(f"  верные отказы (нет ответа -> отказ, без источников): {scoring.percent(summary['refusal_rate'])}  ({correct}/{len(negatives)})")
    if rows:
        summary["avg_seconds"] = round(sum(r["seconds"] for r in rows) / len(rows), 2)
        print(f"  среднее время ответа: {summary['avg_seconds']} с")
    categories = sorted({r["category"] for r in rows})
    if len(categories) > 1:
        print("  по категориям (доля пройденных):")
        for category in categories:
            part = [r for r in rows if r["category"] == category]
            print(f"    {category:<12} {scoring.percent(sum(r['passed'] for r in part) / len(part)):>5}  ({len(part)})")
    if errors:
        print(f"  ОШИБОК запросов: {len(errors)}; первая: {errors[0]['error'][:200]}")
    failed = [r for r in rows if not r["passed"] and not r["error"]]
    if failed:
        print(f"  не пройдено ({len(failed)}):")
        for r in failed:
            print(f"    [{r['id']}] {r['question']}")
            if r["answerable"]:
                reason = ("модель отказала, хотя нужный фрагмент был в контексте" if r["source_ok"]
                          else "модель отказала, но поиск не нашёл нужный документ") if r["refused"] \
                    else "нет нужных фактов " + json.dumps(r["must_contain"], ensure_ascii=False)
            else:
                reason = "должен быть отказ без источников, а получено: " + (f"{len(r['sources'])} источн." if r["sources"] else "ответ")
            print(f"        причина: {reason}")
            print(f"        ответ:   {r['answer'].strip()[:200]!r}")
    return summary


# --------------------------------------------------------------------------------------------------
def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("mode", choices=["retrieval", "answer", "all"], help="что проверять")
    parser.add_argument("--compare-instruction", action="store_true", help="сравнить поиск с инструкцией для вопросов и без неё")
    parser.add_argument("--only", nargs="+", metavar="ID", help="только эти вопросы")
    parser.add_argument("--category", help="только эта категория")
    parser.add_argument("--limit", type=int, help="первые N вопросов")
    parser.add_argument("--pause", type=float, default=0.0, help="пауза между запросами к чат-модели, секунды")
    parser.add_argument("--fail-under", type=float, help="код выхода 1, если главная метрика ниже порога (0..1)")
    parser.add_argument("--dataset", type=Path, default=DATASET, help="другой файл с вопросами")
    parser.add_argument("--no-save", action="store_true", help="не сохранять отчёт в evals/results/")
    args = parser.parse_args()

    questions = load_questions(args.dataset, args.only, args.category, args.limit)
    if not questions:
        print("Нет вопросов под заданные фильтры.")
        return 1
    answerable = [q for q in questions if q["answerable"]]

    from app.config import get_settings

    settings = get_settings()
    instruction_on = bool(settings.embedding_query_instruction.strip())
    print("Конфигурация (секреты не показываются):")
    print(f"  эмбеддинги: {settings.embedding_provider} / "
          f"{settings.cloud_embedding_model if settings.embedding_provider == 'cloudru' else settings.gigachat_embedding_model}")
    print(f"  инструкция для вопросов: {'включена' if instruction_on else 'выключена'}")
    print(f"  чат: {settings.llm_provider} / "
          f"{settings.cloud_chat_model if settings.llm_provider == 'cloudru' else settings.gigachat_model}")

    report: dict = {
        "created": datetime.now().isoformat(timespec="seconds"),
        "mode": args.mode,
        "config": {
            "embedding_provider": settings.embedding_provider,
            "embedding_model": settings.cloud_embedding_model if settings.embedding_provider == "cloudru" else settings.gigachat_embedding_model,
            "query_instruction": instruction_on,
            "llm_provider": settings.llm_provider,
            "llm_model": settings.cloud_chat_model if settings.llm_provider == "cloudru" else settings.gigachat_model,
        },
    }
    primaries: list[tuple[str, float]] = []

    try:
        if args.mode in ("retrieval", "all"):
            if not answerable:
                print("\nДля проверки поиска нужны вопросы с ответом (answerable=true).")
            elif args.compare_instruction:
                if settings.embedding_provider != "cloudru":
                    print("\n--compare-instruction работает только при EMBEDDING_PROVIDER=cloudru; запускаю обычный прогон.")
                    rows = run_retrieval(answerable)
                    report["retrieval"] = {"summary": print_retrieval("как в .env", rows), "rows": rows}
                else:
                    default_instruction = settings.embedding_query_instruction
                    with_rows = run_retrieval(answerable, instruction=default_instruction)
                    without_rows = run_retrieval(answerable, instruction="")
                    with_summary = print_retrieval("С ИНСТРУКЦИЕЙ", with_rows)
                    without_summary = print_retrieval("БЕЗ ИНСТРУКЦИИ", without_rows)
                    print("\n=== СРАВНЕНИЕ ===")
                    print(f"  {'метрика':<18}{'с инструкцией':>15}{'без неё':>10}")
                    for key in ("doc_hit@1", "doc_hit@4", "section_hit@4"):
                        print(f"  {key:<18}{scoring.percent(with_summary[key]):>15}{scoring.percent(without_summary[key]):>10}")
                    print(f"  {'mrr':<18}{with_summary['mrr']:>15.3f}{without_summary['mrr']:>10.3f}")
                    better = "с инструкцией" if with_summary["mrr"] >= without_summary["mrr"] else "без инструкции"
                    print(f"  по MRR лучше: {better}. Включить/выключить: EMBEDDING_QUERY_INSTRUCTION в .env "
                          "(переиндексация не нужна).")
                    report["retrieval_compare"] = {
                        "with_instruction": {"summary": with_summary, "rows": with_rows},
                        "without_instruction": {"summary": without_summary, "rows": without_rows},
                    }
                    primaries.append(("поиск: документ в первых 4", with_summary["doc_hit@4"]))
            else:
                rows = run_retrieval(answerable)
                summary = print_retrieval("как в .env", rows)
                report["retrieval"] = {"summary": summary, "rows": rows}
                primaries.append(("поиск: документ в первых 4", summary["doc_hit@4"]))

        if args.mode in ("answer", "all"):
            print(f"\nЗапускаю полный цикл на {len(questions)} вопросах (каждый: поиск + запрос к чат-модели)...")
            rows = run_answers(questions, args.pause)
            summary = print_answers(rows)
            report["answer"] = {"summary": summary, "rows": rows}
            positives = [r for r in rows if r["answerable"]]
            if positives:
                primaries.append(("ответы: верные", summary["accuracy"]))
            if any(not r["answerable"] for r in rows):
                primaries.append(("ответы: верные отказы", summary["refusal_rate"]))
    finally:
        try:
            from app.db import close_pool
            close_pool()
        except Exception:  # noqa: BLE001
            pass

    if not args.no_save:
        RESULTS_DIR.mkdir(exist_ok=True)
        path = RESULTS_DIR / f"{datetime.now():%Y%m%d_%H%M%S}_{args.mode}.json"
        path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nОтчёт сохранён: {path}")

    if args.fail_under is not None:
        weak = [(name, value) for name, value in primaries if value < args.fail_under]
        if weak:
            for name, value in weak:
                print(f"НИЖЕ ПОРОГА {args.fail_under:.2f}: {name} = {value:.2f}")
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
