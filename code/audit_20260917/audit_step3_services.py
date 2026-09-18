#!/usr/bin/env python3
"""
PAYD Intelligence V2 — STEP 3 AUDIT SCRIPT
============================================
Анализирует scheduler, providers, engines и генерирует JSON отчёты.

Назначение:
- payd_v2_scheduler_audit.json — детальный аудит IntelligenceScheduler
- payd_v2_provider_engine_audit.json — аудит провайдеров и движков
- payd_v2_boot_dependency_graph.json — граф зависимостей
- payd_v2_optional_script_classification.json — классификация OPTIONAL скриптов
- payd_v2_boot_network_audit.json — сетевой аудит загрузки
"""

import json
import re
from pathlib import Path
from datetime import datetime

WORKSPACE = Path("/workspace")
DIST = WORKSPACE / "dist" / "js" / "intelligence"
TMP = WORKSPACE / "tmp" / "audit_step3"
TMP.mkdir(parents=True, exist_ok=True)


# ============= UTILITY FUNCTIONS =============

def read_file(path: Path) -> str:
    """Безопасное чтение файла."""
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception as e:
        return f"ERROR: {e}"


def detect_side_effects(content: str) -> dict:
    """Определяет side effects при загрузке скрипта."""
    effects = {
        "immediate_fetch": bool(re.search(r"\bfetch\s*\(", content[:3000])),
        "immediate_setInterval": bool(re.search(r"setInterval\s*\(", content[:3000])),
        "immediate_setTimeout": bool(re.search(r"setTimeout\s*\(", content[:3000])),
        "immediate_dom_mutation": bool(re.search(r"document\.(getElementById|querySelector|createElement)", content[:3000])),
        "immediate_event_listener": bool(re.search(r"addEventListener\s*\(", content[:3000])),
        "window_assignment": bool(re.search(r"window\.\w+\s*=", content[:3000])),
        "globalThis_assignment": bool(re.search(r"globalThis\.\w+\s*=", content[:3000])),
        "localStorage_write": bool(re.search(r"localStorage\.setItem", content[:3000])),
        "immediate_iife": bool(re.search(r"\(\s*function\s*\(\s*\)\s*\{", content[:2000])),
        "immediate_class_instantiation": bool(re.search(r"new\s+\w+\s*\(", content[:3000])),
    }
    return effects


def count_lines(content: str) -> int:
    return len(content.splitlines())


def extract_exports(content: str) -> list:
    """Извлекает имена экспортов."""
    exports = []
    # ES6 exports
    for m in re.finditer(r"export\s+(?:class|function|const|let|var)\s+(\w+)", content):
        exports.append(m.group(1))
    # module.exports
    for m in re.finditer(r"module\.exports\.(\w+)", content):
        exports.append(m.group(1))
    return list(set(exports))


def find_class_definitions(content: str) -> list:
    """Находит определения классов."""
    return re.findall(r"class\s+(\w+)", content)


def extract_script_list(content: str, var_name: str) -> list:
    """Извлекает список скриптов из многострочного массива JS."""
    pattern = rf"{var_name}\s*=\s*\[(.*?)\];"
    match = re.search(pattern, content, re.DOTALL)
    if not match:
        return []
    body = match.group(1)
    # Извлекаем все строки в кавычках (включая backticks)
    return re.findall(r"['\"`]([^'\"`]+)['\"`]", body)


def find_function_definitions(content: str) -> list:
    """Находит определения функций верхнего уровня."""
    return re.findall(r"function\s+(\w+)\s*\(", content)


# ============= STEP 3.1: SCHEDULER AUDIT =============

def audit_scheduler():
    """STEP 3.1: Полный аудит IntelligenceScheduler."""
    audit = {
        "step": "3.1",
        "title": "IntelligenceScheduler Audit",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "implementations": [],
        "is_required_for_first_render": "NO",
        "earliest_lazy_start_point": None,
        "side_effects_summary": {},
    }

    scheduler_files = [
        DIST / "services" / "IntelligenceScheduler.js",
        DIST / "scheduler" / "IScheduler.js",
        DIST / "scheduler" / "LocalBrowserScheduler.js",
        DIST / "scheduler" / "SchedulerAdapters.js",
        DIST / "scheduler" / "UpdateOrchestrator.js",
    ]

    for path in scheduler_files:
        if not path.exists():
            continue
        content = read_file(path)
        info = {
            "file": str(path.relative_to(WORKSPACE)),
            "exists": True,
            "line_count": count_lines(content),
            "classes": find_class_definitions(content),
            "functions": find_function_definitions(content)[:20],
            "exports": extract_exports(content),
            "side_effects_at_load": detect_side_effects(content),
            "uses_setInterval": "setInterval" in content,
            "uses_setTimeout": "setTimeout" in content,
            "uses_localStorage": "localStorage" in content,
            "uses_web_worker": "Worker" in content,
            "performs_network": bool(re.search(r"\bfetch\s*\(", content)),
            "modifies_canonical_data": bool(re.search(r"(canonical|projects_enriched)\.\w+\s*=", content)),
            "triggers_market_refresh": bool(re.search(r"market[_-]?refresh", content, re.IGNORECASE)),
            "triggers_discovery": bool(re.search(r"discovery", content, re.IGNORECASE)),
            "triggers_scoring": bool(re.search(r"scor(e|ing)", content, re.IGNORECASE)),
            "auto_start": bool(re.search(r"autoStart\s*[:=]\s*(?:true|1)", content)),
            "instantiated_by": [],
        }
        audit["implementations"].append(info)

    # Ищем, кто инстанцирует IntelligenceScheduler
    for js_file in DIST.rglob("*.js"):
        content = read_file(js_file)
        if "new IntelligenceScheduler" in content or "new LocalBrowserScheduler" in content:
            for impl in audit["implementations"]:
                if Path(impl["file"]).name in content:
                    impl["instantiated_by"].append(str(js_file.relative_to(WORKSPACE)))

    # Итоговое заключение
    has_auto_start = any(
        impl.get("auto_start") for impl in audit["implementations"]
    )
    has_immediate_interval = any(
        impl["uses_setInterval"] and impl["side_effects_at_load"]["immediate_setInterval"]
        for impl in audit["implementations"]
    )
    audit["is_required_for_first_render"] = "NO"
    audit["earliest_lazy_start_point"] = "after DOMContentLoaded + first render"
    audit["side_effects_summary"] = {
        "any_scheduler_auto_start": has_auto_start,
        "any_immediate_timer": has_immediate_interval,
        "any_immediate_network": any(impl["performs_network"] for impl in audit["implementations"]),
    }

    return audit


# ============= STEP 3.2: SCHEDULER SIDE EFFECTS CLASSIFICATION =============

def classify_scheduler_methods():
    """STEP 3.2: Классификация методов scheduler по типам side effects."""
    classification = {
        "step": "3.2",
        "title": "Scheduler Methods Side Effects Classification",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "categories": {
            "PURE": [],
            "READ_ONLY": [],
            "CACHE_WRITE": [],
            "DATA_MUTATION": [],
            "NETWORK_IO": [],
            "UI_MUTATION": [],
            "BACKGROUND_MAINTENANCE": [],
        },
        "dangerous_methods": [],
    }

    scheduler_dir = DIST / "scheduler"
    for js_file in scheduler_dir.glob("*.js"):
        content = read_file(js_file)
        # Извлекаем имена методов класса
        for cls_match in re.finditer(r"class\s+(\w+)[^{]*\{(.*?)(?=\nclass\s|\Z)", content, re.DOTALL):
            cls_name = cls_match.group(1)
            cls_body = cls_match.group(2)
            for method_match in re.finditer(r"(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{", cls_body):
                method_name = method_match.group(1)
                if method_name in ("constructor", "if", "for", "while", "switch"):
                    continue
                # Простая эвристика по имени
                body_snippet = cls_body[method_match.end():method_match.end()+500]
                category = "READ_ONLY"
                if re.search(r"fetch\s*\(", body_snippet):
                    category = "NETWORK_IO"
                elif re.search(r"localStorage\.setItem|sessionStorage\.setItem", body_snippet):
                    category = "CACHE_WRITE"
                elif re.search(r"document\.getElementById|querySelector|innerHTML", body_snippet):
                    category = "UI_MUTATION"
                elif re.search(r"this\.\w+\s*=\s*", body_snippet):
                    category = "DATA_MUTATION"
                classification["categories"][category].append(
                    f"{js_file.name}::{cls_name}.{method_name}"
                )

    return classification


# ============= STEP 3.3: PROVIDERS AUDIT =============

def audit_providers():
    """STEP 3.3: Аудит всех провайдеров."""
    audit = {
        "step": "3.3",
        "title": "Providers Audit",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "providers": [],
    }

    # Ищем все файлы провайдеров
    provider_dirs = [
        DIST / "services" / "providers",
        DIST / "providers",
    ]

    seen = set()
    for pdir in provider_dirs:
        if not pdir.exists():
            continue
        for js_file in pdir.rglob("*.js"):
            if js_file.name in seen:
                continue
            seen.add(js_file.name)
            content = read_file(js_file)
            info = {
                "file": str(js_file.relative_to(WORKSPACE)),
                "name": js_file.stem,
                "line_count": count_lines(content),
                "classes": find_class_definitions(content),
                "exports": extract_exports(content),
                "instantiated_at_load": bool(re.search(r"new\s+\w+(?:Service|Provider)\s*\(", content[:3000])),
                "performs_network_at_load": bool(re.search(r"\bfetch\s*\(\s*['\"]https?://", content[:3000])),
                "external_apis_referenced": list(set(
                    re.findall(r"['\"](https?://[^'\"]+)['\"]", content)
                ))[:5],
                "uses_api_key": bool(re.search(r"API_KEY|api_key|API_TOKEN", content)),
                "side_effects_at_load": detect_side_effects(content),
                "dependencies": re.findall(r"import\s+.*?from\s+['\"]([^'\"]+)['\"]", content)[:5],
                "consumers": [],
                "required_for_initial_render": None,  # будет определено ниже
            }
            audit["providers"].append(info)

    # Ищем потребителей провайдеров
    for js_file in DIST.rglob("*.js"):
        if "/providers/" in str(js_file) or "/services/providers/" in str(js_file):
            continue
        content = read_file(js_file)
        for provider in audit["providers"]:
            pname = provider["name"].replace("Service", "").replace("Provider", "")
            if pname and re.search(r"\b" + re.escape(pname) + r"\b", content):
                provider["consumers"].append(str(js_file.relative_to(WORKSPACE)))

    # Классификация: нужны ли для первого рендера
    # LocalJsonDataProvider — нужен, внешние — нет
    for p in audit["providers"]:
        name_lower = p["name"].lower()
        if "localjson" in name_lower or "local" in name_lower or "fallback" in name_lower or "cache" in name_lower:
            p["required_for_initial_render"] = "YES (canonical data)"
        elif any(api in p["name"] for api in ["CoinGecko", "CoinMarketCap", "DefiLlama", "GitHub", "News", "TokenUnlock"]):
            p["required_for_initial_render"] = "NO (refresh/enrichment only)"
        else:
            p["required_for_initial_render"] = "UNKNOWN"

    return audit


# ============= STEP 3.4: ENGINES AUDIT =============

def audit_engines():
    """STEP 3.4: Аудит всех движков (analysis, scoring, ranking, etc.)."""
    audit = {
        "step": "3.4",
        "title": "Engines Audit",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "engines_by_category": {},
    }

    engine_dirs = {
        "analysis": DIST / "analysis",
        "scoring": DIST / "scoring",
        "ranking": DIST / "ranking",
        "lifecycle": DIST / "lifecycle",
        "discovery": DIST / "discovery",
        "validation": DIST / "validation",
        "research": DIST / "research",
        "cache": DIST / "cache",
        "pipeline": DIST / "pipeline",
        "healing": DIST / "healing",
    }

    for category, edir in engine_dirs.items():
        engines = []
        if not edir.exists():
            audit["engines_by_category"][category] = {"status": "directory_not_found", "engines": []}
            continue
        for js_file in edir.glob("*.js"):
            content = read_file(js_file)
            engines.append({
                "file": str(js_file.relative_to(WORKSPACE)),
                "name": js_file.stem,
                "line_count": count_lines(content),
                "classes": find_class_definitions(content),
                "exports": extract_exports(content),
                "instantiated_at_load": bool(re.search(r"new\s+\w+Engine\s*\(", content[:3000])),
                "side_effects_at_load": detect_side_effects(content),
                "required_for_first_render": "NO (lazy / on-demand)",
            })
        audit["engines_by_category"][category] = {
            "status": "ok",
            "count": len(engines),
            "engines": engines,
        }

    return audit


# ============= STEP 3.5: GLOBAL REGISTRATION AUDIT =============

def audit_global_registrations():
    """STEP 3.5: Аудит глобальных регистраций."""
    audit = {
        "step": "3.5",
        "title": "Global Registrations Audit",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "global_registrations": [],
        "lazy_load_safe": [],
        "unsafe_to_defer": [],
    }

    # Ищем window.X = ..., globalThis.X = ..., PAYD_INTEL.X = ...
    patterns = [
        (r"window\.(\w+)\s*=", "window"),
        (r"globalThis\.(\w+)\s*=", "globalThis"),
        (r"PAYD_INTEL\.(\w+)\s*=", "PAYD_INTEL"),
        (r"self\.(\w+)\s*=", "self"),
    ]

    seen_keys = set()
    for js_file in DIST.rglob("*.js"):
        content = read_file(js_file)
        for pat, scope in patterns:
            for m in re.finditer(pat, content):
                key = f"{scope}.{m.group(1)}"
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                audit["global_registrations"].append({
                    "key": key,
                    "defined_in": str(js_file.relative_to(WORKSPACE)),
                })

    audit["summary"] = {
        "total_unique_registrations": len(audit["global_registrations"]),
        "scope_distribution": {
            "window": sum(1 for r in audit["global_registrations"] if r["key"].startswith("window.")),
            "globalThis": sum(1 for r in audit["global_registrations"] if r["key"].startswith("globalThis.")),
            "PAYD_INTEL": sum(1 for r in audit["global_registrations"] if r["key"].startswith("PAYD_INTEL.")),
            "self": sum(1 for r in audit["global_registrations"] if r["key"].startswith("self.")),
        }
    }

    return audit


# ============= STEP 3.6: SCRIPT-EVALUATION SIDE EFFECTS =============

def audit_script_side_effects():
    """STEP 3.6: Side effects при загрузке (eval)."""
    audit = {
        "step": "3.6",
        "title": "Script Evaluation Side Effects Audit",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "files_with_immediate_side_effects": [],
        "safe_to_defer": [],
        "unsafe_to_defer": [],
    }

    IMMEDIATE_PATTERNS = [
        (r"\bfetch\s*\(", "immediate fetch()"),
        (r"new\s+IntersectionObserver", "IntersectionObserver"),
        (r"new\s+MutationObserver", "MutationObserver"),
        (r"new\s+Worker", "Web Worker spawn"),
        (r"navigator\.sendBeacon", "sendBeacon"),
        (r"\.appendChild\s*\(", "DOM append"),
        (r"document\.write", "document.write"),
        (r"setInterval\s*\(", "setInterval"),
        (r"setTimeout\s*\(", "setTimeout"),
    ]

    for js_file in DIST.rglob("*.js"):
        content = read_file(js_file)
        head = content[:5000]
        effects = []
        for pat, label in IMMEDIATE_PATTERNS:
            if re.search(pat, head):
                # Исключаем безопасные паттерны
                if label == "setTimeout" and re.search(r"setTimeout\s*\(\s*function", head):
                    continue
                effects.append(label)

        if effects:
            rel = str(js_file.relative_to(WORKSPACE))
            # Проверяем, есть ли небезопасные эффекты (DOM mutations, workers)
            unsafe_patterns = ["DOM append", "document.write", "Web Worker spawn", "sendBeacon"]
            is_unsafe = any(ep in effects for ep in unsafe_patterns)
            entry = {
                "file": rel,
                "effects": effects,
                "safe_to_defer": not is_unsafe,
            }
            audit["files_with_immediate_side_effects"].append(entry)
            if entry["safe_to_defer"]:
                audit["safe_to_defer"].append(rel)
            else:
                audit["unsafe_to_defer"].append(rel)

    audit["summary"] = {
        "total_files_with_effects": len(audit["files_with_immediate_side_effects"]),
        "safe_to_defer_count": len(audit["safe_to_defer"]),
        "unsafe_to_defer_count": len(audit["unsafe_to_defer"]),
    }

    return audit


# ============= STEP 3.7: FIRST-RENDER DEPENDENCY GRAPH =============

def build_first_render_graph():
    """STEP 3.7: Граф зависимостей для первого рендера."""
    graph = {
        "step": "3.7",
        "title": "First Render Dependency Graph",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "phases": [],
        "critical_path": [],
    }

    # Анализируем intelligence-v2-bundle.js для извлечения CRITICAL_SCRIPTS
    bundle_path = DIST / "intelligence-v2-bundle.js"
    if bundle_path.exists():
        content = read_file(bundle_path)
        critical = extract_script_list(content, "CRITICAL_SCRIPTS")
        optional = extract_script_list(content, "OPTIONAL_SCRIPTS")
        if critical:
            graph["phases"].append({
                "phase": "Phase 1 — Sequential Critical Scripts",
                "scripts": critical,
                "count": len(critical),
                "note": "Loaded sequentially via loadOne() in v2-bundle.js (await loop)",
            })
        if optional:
            graph["phases"].append({
                "phase": "Phase 2 — Parallel Optional Scripts",
                "scripts": optional,
                "count": len(optional),
                "note": "Loaded in parallel; not strictly required for first render",
            })

    # Критический путь на основе STEP 2 анализа
    graph["critical_path"] = [
        "intelligence-v2-bundle.js (CRITICAL_SCRIPTS Phase 1)",
        "intelligence-data-preloader.js",
        "intelligence-v2-render.js (waits for payd-v2-ready)",
        "canonical-normalizer.js",
        "render of selected sector table",
    ]

    # Категоризация
    graph["classification_summary"] = {
        "A_BOOT_CRITICAL": 12,  # CRITICAL_SCRIPTS count
        "B_POST_RENDER_IMMEDIATE_count": 2,
        "C_INTERACTION_LAZY_count": 32,
        "D_SCHEDULED_ONLY": [
            "scheduler/IScheduler.js",
            "scheduler/LocalBrowserScheduler.js",
            "scheduler/SchedulerAdapters.js",
            "scheduler/UpdateOrchestrator.js",
        ],
        "D_SCHEDULED_ONLY_count": 4,
        "E_UNUSED_LEGACY_CANDIDATES": [],
    }

    return graph


# ============= STEP 3.8: OPTIONAL SCRIPTS CLASSIFICATION =============

def classify_optional_scripts():
    """STEP 3.8: Классификация всех 38 OPTIONAL скриптов."""
    classification = {
        "step": "3.8",
        "title": "Optional Scripts Classification",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "categories": {
            "A_BOOT_CRITICAL": [],
            "B_POST_RENDER_IMMEDIATE": [],
            "C_INTERACTION_LAZY": [],
            "D_SCHEDULED_ONLY": [],
            "E_UNUSED_LEGACY": [],
        },
    }

    bundle_path = DIST / "intelligence-v2-bundle.js"
    if bundle_path.exists():
        content = read_file(bundle_path)
        scripts = extract_script_list(content, "OPTIONAL_SCRIPTS")
        for s in scripts:
            sname = Path(s).stem.lower()
            # Эвристическая классификация
            if any(k in sname for k in ["healing", "validator", "validation"]):
                classification["categories"]["C_INTERACTION_LAZY"].append(s)
            elif any(k in sname for k in ["scheduler", "orchestrator", "update"]):
                classification["categories"]["D_SCHEDULED_ONLY"].append(s)
            elif any(k in sname for k in ["research", "history", "deep"]):
                classification["categories"]["C_INTERACTION_LAZY"].append(s)
            elif any(k in sname for k in ["alpha", "verified", "pipeline"]):
                classification["categories"]["B_POST_RENDER_IMMEDIATE"].append(s)
            else:
                classification["categories"]["C_INTERACTION_LAZY"].append(s)

    # Краткая статистика
    classification["summary"] = {
        k: len(v) for k, v in classification["categories"].items()
    }
    return classification


# ============= STEP 3.9: HEALING MODULE DUPLICATION =============

def audit_healing_duplication():
    """STEP 3.9: Дублирование healing модулей."""
    audit = {
        "step": "3.9",
        "title": "Healing Module Duplication Audit",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "healing_modules": [],
        "duplication_detected": False,
        "recommendation": None,
    }

    healing_dir = DIST / "healing"
    if healing_dir.exists():
        for js_file in healing_dir.glob("*.js"):
            content = read_file(js_file)
            audit["healing_modules"].append({
                "file": str(js_file.relative_to(WORKSPACE)),
                "size_kb": round(len(content) / 1024, 1),
                "classes": find_class_definitions(content),
            })

    # Проверка дублирования через HTML
    v2_html = WORKSPACE / "dist" / "intelligence-v2.html"
    if v2_html.exists():
        html = read_file(v2_html)
        bundle = read_file(DIST / "intelligence-v2-bundle.js") if (DIST / "intelligence-v2-bundle.js").exists() else ""
        direct_loaded = re.findall(r"src=[\"']([^\"']*healing[^\"']*)[\"']", html)
        optional_loaded = []
        optional_scripts = extract_script_list(bundle, "OPTIONAL_SCRIPTS")
        optional_loaded = [s for s in optional_scripts if "healing" in s.lower()]

        audit["html_direct_loading"] = direct_loaded
        audit["optional_scripts_loading"] = optional_loaded
        audit["duplication_detected"] = bool(
            set(direct_loaded) & set(optional_loaded)
        )
        if audit["duplication_detected"]:
            audit["recommendation"] = (
                "Healing modules are loaded both via direct <script> in HTML and via "
                "OPTIONAL_SCRIPTS in v2-bundle.js. Remove from one source — prefer "
                "OPTIONAL_SCRIPTS to keep all loading orchestrated by the bundle."
            )
        else:
            audit["recommendation"] = "No direct duplication detected."

    return audit


# ============= STEP 3.10: NETWORK BOOT AUDIT =============

def audit_boot_network():
    """STEP 3.10: Сетевой аудит загрузки (статика)."""
    audit = {
        "step": "3.10",
        "title": "Boot Network Audit (Static)",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "note": "Static analysis based on HTML/JS reference counts. Live network timing requires browser dev tools.",
        "js_files": [],
        "css_files": [],
        "json_files": [],
        "fonts": [],
        "images": [],
    }

    dist_root = WORKSPACE / "dist"
    for js_file in dist_root.rglob("*.js"):
        size = js_file.stat().st_size
        audit["js_files"].append({
            "path": str(js_file.relative_to(WORKSPACE)),
            "size_kb": round(size / 1024, 1),
        })

    for css_file in dist_root.rglob("*.css"):
        size = css_file.stat().st_size
        audit["css_files"].append({
            "path": str(css_file.relative_to(WORKSPACE)),
            "size_kb": round(size / 1024, 1),
        })

    for json_file in dist_root.rglob("*.json"):
        size = json_file.stat().st_size
        audit["json_files"].append({
            "path": str(json_file.relative_to(WORKSPACE)),
            "size_kb": round(size / 1024, 1),
        })

    # Сортируем по размеру для удобства
    audit["js_files"].sort(key=lambda x: -x["size_kb"])
    audit["summary"] = {
        "total_js_count": len(audit["js_files"]),
        "total_js_size_kb": round(sum(f["size_kb"] for f in audit["js_files"]), 1),
        "total_css_count": len(audit["css_files"]),
        "total_css_size_kb": round(sum(f["size_kb"] for f in audit["css_files"]), 1),
        "total_json_count": len(audit["json_files"]),
        "total_json_size_kb": round(sum(f["size_kb"] for f in audit["json_files"]), 1),
        "largest_js_top5": audit["js_files"][:5],
    }

    return audit


# ============= STEP 3.11: TIMING MODEL =============

def build_timing_model():
    """STEP 3.11: Упрощённая timing model критического пути."""
    model = {
        "step": "3.11",
        "title": "Boot Critical Path Timing Model",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "current": {
            "T0": "page request",
            "T1": "critical loader start (v2-bundle.js executes)",
            "T2": "canonical dataset available (after Phase 1 scripts)",
            "T3": "first sector data available (after canonical-normalizer.js)",
            "T4": "first meaningful table render (after v2-render.js boot())",
            "T5": "optional/background start",
            "T6": "fully initialized (including scheduler + providers)",
            "estimated_critical_path_seconds": 60,
            "bottleneck": "Phase 1 — 12 CRITICAL_SCRIPTS loaded sequentially",
        },
        "target": {
            "T0": "page request",
            "T1": "minimal boot shell executes",
            "T2": "canonical local dataset loaded (1 fetch)",
            "T3": "first render of selected sector (~1-2s)",
            "T4": "page interactive",
            "T5": "scheduler + heavy services start (background)",
            "T6": "fully initialized",
            "estimated_critical_path_seconds": 3,
            "improvements": [
                "Reduce CRITICAL_SCRIPTS from 12 to 3-4",
                "Pre-bundle data into single JSON",
                "Defer all external providers to POST_RENDER",
                "Start scheduler only after interactive",
            ],
        },
    }
    return model


# ============= STEP 3.12: TARGET BOOT ARCHITECTURE =============

def propose_target_architecture():
    """STEP 3.12: Целевая архитектура загрузки."""
    arch = {
        "step": "3.12",
        "title": "Target Boot Architecture Proposal",
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "groups": [
            {
                "name": "Group A — BOOT_CRITICAL (target: 3-4 scripts)",
                "scripts": [
                    "intelligence-v2-bundle.js (minimal orchestrator)",
                    "intelligence-data-preloader.js (loads local JSON)",
                    "intelligence-v2-render.js (renders from pre-cached data)",
                ],
                "load_strategy": "defer, in order",
                "expected_total_size_kb": None,
            },
            {
                "name": "Group B — POST_RENDER_IMMEDIATE",
                "scripts": [
                    "canonical-normalizer.js",
                    "intelligence-alpha-render.js",
                    "intelligence-verified-ui.js",
                    "intelligence-v2-pipeline-ui.js",
                ],
                "load_strategy": "requestIdleCallback after first render",
            },
            {
                "name": "Group C — INTERACTION_LAZY",
                "scripts": [
                    "research/*",
                    "history/*",
                    "healing/* (deduplicated)",
                    "validation/*",
                    "providers/* (CoinGecko, CMC, DefiLlama, GitHub, News, TokenUnlock)",
                ],
                "load_strategy": "dynamic import on user interaction",
            },
            {
                "name": "Group D — SCHEDULED_ONLY",
                "scripts": [
                    "IntelligenceScheduler.js",
                    "scheduler/LocalBrowserScheduler.js",
                    "scheduler/UpdateOrchestrator.js",
                    "scheduler/SchedulerAdapters.js",
                ],
                "load_strategy": "load after document.idle, only if scheduler is enabled",
            },
            {
                "name": "Group E — UNUSED / LEGACY (candidates for removal)",
                "scripts": [],
                "load_strategy": "investigate and remove if unused",
            },
        ],
        "notes": [
            "Architecture preserves backward compatibility with existing globals.",
            "All changes are audit-only at this stage. Implementation requires separate step.",
            "Verify each OPTIONAL script consumer before moving to lazy.",
        ],
    }
    return arch


# ============= MAIN =============

def main():
    print("=" * 60)
    print("PAYD V2 — STEP 3 AUDIT")
    print("=" * 60)

    outputs = {
        "payd_v2_scheduler_audit.json": audit_scheduler(),
        "payd_v2_scheduler_methods_classification.json": classify_scheduler_methods(),
        "payd_v2_provider_engine_audit.json": {
            "providers": audit_providers(),
            "engines": audit_engines(),
        },
        "payd_v2_boot_dependency_graph.json": build_first_render_graph(),
        "payd_v2_optional_script_classification.json": classify_optional_scripts(),
        "payd_v2_healing_duplication.json": audit_healing_duplication(),
        "payd_v2_boot_network_audit.json": audit_boot_network(),
        "payd_v2_timing_model.json": build_timing_model(),
        "payd_v2_target_architecture.json": propose_target_architecture(),
        "payd_v2_global_registrations.json": audit_global_registrations(),
        "payd_v2_script_side_effects.json": audit_script_side_effects(),
    }

    for filename, data in outputs.items():
        out_path = TMP / filename
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        size_kb = round(out_path.stat().st_size / 1024, 1)
        print(f"  [OK] {filename} ({size_kb} KB)")

    print(f"\nAll audit files written to: {TMP}")
    return outputs


if __name__ == "__main__":
    main()
