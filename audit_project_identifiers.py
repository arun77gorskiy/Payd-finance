#!/usr/bin/env python3
"""
PAYD INTELLIGENCE V2 — Project Identifier Audit Script
======================================================
Анализирует public/data/projects.json и рассчитывает:
- Полноту идентификаторов для каждого проекта
- Агрегированную статистику по 364 проектам
- Распределение по секторам

Использование:
    python3 audit_project_identifiers.py
"""

import json
import os
from collections import defaultdict
from pathlib import Path

# Путь к файлу данных
WORKSPACE = Path(__file__).parent
PROJECTS_FILE = WORKSPACE / "public" / "data" / "projects.json"

# Ключевые идентификаторы, которые мы проверяем
# (имя_поля, отображаемое_имя, критерий_валидности)
IDENTIFIERS = [
    ("coingeckoId",     "coingeckoId",     lambda v: v and isinstance(v, str) and len(v.strip()) > 0),
    ("cmcId",           "cmcId",           lambda v: v and (isinstance(v, int) or (isinstance(v, str) and v.strip().isdigit()))),
    ("githubOrg",       "githubOrg",       lambda v: v and isinstance(v, str) and len(v.strip()) > 0),
    ("defillama_slug",  "defillama_slug",  lambda v: v and isinstance(v, str) and len(v.strip()) > 0),
    ("xHandle",         "xHandle",         lambda v: v and isinstance(v, str) and len(v.strip()) > 0),
    ("website",         "website",         lambda v: v and isinstance(v, str) and v.startswith(("http://", "https://"))),
]

# Кастомный JSON encoder для поддержки set
def _json_default(obj):
    if isinstance(obj, set):
        return list(obj)
    raise TypeError(f"Type {type(obj)} not serializable")


def load_projects():
    """Загружает projects.json и возвращает список проектов."""
    if not PROJECTS_FILE.exists():
        raise FileNotFoundError(f"Файл не найден: {PROJECTS_FILE}")
    with open(PROJECTS_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "projects" not in data:
        raise KeyError("Ключ 'projects' отсутствует в JSON")
    return data["projects"]


def audit_projects(projects):
    """Выполняет аудит и возвращает словарь с результатами."""
    total = len(projects)

    # Счётчики пропущенных идентификаторов
    missing_counts = {name: 0 for _, name, _ in IDENTIFIERS}

    # Распределение по корзинам полноты
    bucket_high = 0   # > 80%
    bucket_mid  = 0   # 50-80%
    bucket_low  = 0   # < 50%

    total_completeness_sum = 0.0

    # Группировка по секторам
    sector_scores = defaultdict(list)  # sector -> [completeness, ...]

    # Детальный список по проектам (для возможного логирования)
    per_project = []

    for proj in projects:
        present = 0
        for field, name, validator in IDENTIFIERS:
            value = proj.get(field)
            if validator(value):
                present += 1
            else:
                missing_counts[name] += 1

        score = (present / len(IDENTIFIERS)) * 100.0
        total_completeness_sum += score

        if score > 80:
            bucket_high += 1
        elif score >= 50:
            bucket_mid += 1
        else:
            bucket_low += 1

        # Сектор (может быть строкой или списком)
        sectors = proj.get("sectors") or proj.get("sector")
        if isinstance(sectors, str):
            sectors = [sectors]
        elif not sectors:
            sectors = ["unknown"]
        for s in sectors:
            sector_scores[s].append(score)

        per_project.append({
            "id": proj.get("id", "?"),
            "symbol": proj.get("symbol", "?"),
            "name": proj.get("name", "?"),
            "sectors": sectors,
            "completeness_pct": round(score, 1),
            "present": present,
            "total_fields": len(IDENTIFIERS),
        })

    avg_completeness = (total_completeness_sum / total) if total > 0 else 0.0

    sector_stats = []
    for s, scores in sector_scores.items():
        sector_stats.append({
            "sector": s,
            "count": len(scores),
            "avg_completeness_pct": round(sum(scores) / len(scores), 1),
            "min_completeness_pct": round(min(scores), 1),
            "max_completeness_pct": round(max(scores), 1),
        })
    sector_stats.sort(key=lambda x: x["avg_completeness_pct"], reverse=True)

    return {
        "total_projects": total,
        "completeness_distribution": {
            "high_>_80_pct":   bucket_high,
            "mid_50_to_80_pct": bucket_mid,
            "low_<_50_pct":    bucket_low,
        },
        "average_completeness_pct": round(avg_completeness, 2),
        "missing_counts": missing_counts,
        "sector_stats": sector_stats,
        "per_project": per_project,
    }


def print_report(results):
    """Печатает отчёт в консоль."""
    print("=" * 78)
    print("PAYD INTELLIGENCE V2 — Project Identifier Audit Report")
    print("=" * 78)
    print()

    print(f"Всего проектов в наборе данных: {results['total_projects']}")
    print()

    print("--- Распределение по полноте идентификаторов ---")
    cd = results["completeness_distribution"]
    print(f"  • > 80% полнота (high):     {cd['high_>_80_pct']:>4} проектов "
          f"({cd['high_>_80_pct']/results['total_projects']*100:.1f}%)")
    print(f"  • 50-80% полнота (mid):     {cd['mid_50_to_80_pct']:>4} проектов "
          f"({cd['mid_50_to_80_pct']/results['total_projects']*100:.1f}%)")
    print(f"  • < 50% полнота (low):      {cd['low_<_50_pct']:>4} проектов "
          f"({cd['low_<_50_pct']/results['total_projects']*100:.1f}%)")
    print()

    print(f"Средняя полнота идентификаторов: {results['average_completeness_pct']:.2f}%")
    print()

    print("--- Частота пропуска идентификаторов ---")
    total = results["total_projects"]
    for name, count in results["missing_counts"].items():
        present = total - count
        pct = (present / total * 100.0) if total > 0 else 0.0
        print(f"  • {name:<18} отсутствует: {count:>4}/{total} раз "
              f"(присутствует в {pct:>5.1f}% проектов)")
    print()

    print("--- Полнота по секторам (сортировка по среднему убыванию) ---")
    print(f"  {'Сектор':<22} {'Проектов':>9} {'Средн. %':>10} {'Min %':>8} {'Max %':>8}")
    print("  " + "-" * 60)
    for s in results["sector_stats"]:
        print(f"  {s['sector']:<22} {s['count']:>9} {s['avg_completeness_pct']:>10.1f} "
              f"{s['min_completeness_pct']:>8.1f} {s['max_completeness_pct']:>8.1f}")
    print()

    # Топ-15 и Bottom-15 проектов по полноте
    pp = results["per_project"]
    pp_sorted_high = sorted(pp, key=lambda x: x["completeness_pct"], reverse=True)
    pp_sorted_low  = sorted(pp, key=lambda x: x["completeness_pct"])

    print("--- ТОП-15 проектов с наивысшей полнотой ---")
    print(f"  {'ID':<28} {'Символ':<8} {'Сектор':<10} {'Полнота':>8}")
    for p in pp_sorted_high[:15]:
        sec = ",".join(p["sectors"]) if p["sectors"] else "?"
        print(f"  {p['id']:<28} {p['symbol']:<8} {sec:<10} {p['completeness_pct']:>7.1f}%")
    print()

    print("--- 15 проектов с наименьшей полнотой ---")
    print(f"  {'ID':<28} {'Символ':<8} {'Сектор':<10} {'Полнота':>8}")
    for p in pp_sorted_low[:15]:
        sec = ",".join(p["sectors"]) if p["sectors"] else "?"
        print(f"  {p['id']:<28} {p['symbol']:<8} {sec:<10} {p['completeness_pct']:>7.1f}%")
    print()

    print("=" * 78)
    print("Конец отчёта")
    print("=" * 78)


def save_json(results, path):
    """Сохраняет результаты аудита в JSON для дальнейшего использования."""
    # per_project — большой список, сохраняем
    out = {
        "total_projects": results["total_projects"],
        "completeness_distribution": results["completeness_distribution"],
        "average_completeness_pct": results["average_completeness_pct"],
        "missing_counts": results["missing_counts"],
        "sector_stats": results["sector_stats"],
        "per_project": results["per_project"],
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2, default=_json_default)
    print(f"Детальные результаты сохранены в: {path}")


def main():
    print(f"Загружаю: {PROJECTS_FILE}")
    projects = load_projects()
    print(f"Загружено проектов: {len(projects)}")
    print()

    results = audit_projects(projects)
    print_report(results)

    # Сохраняем JSON
    out_path = WORKSPACE / "tmp" / "audit_project_identifiers_result.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    save_json(results, out_path)


if __name__ == "__main__":
    main()
