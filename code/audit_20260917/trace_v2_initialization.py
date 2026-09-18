#!/usr/bin/env python3
"""
STEP 2 — TRACE V2 INITIALIZATION
================================
Строит точный граф вызовов от DOMContentLoaded (или IIFE-старта) до первого
рендера на странице intelligence-v2.html.

Анализирует:
  1. /workspace/dist/intelligence-v2.html          — порядок загрузки скриптов
  2. /workspace/dist/js/intelligence/intelligence-v2-bundle.js  — orchestrator
  3. /workspace/dist/js/intelligence/intelligence-data-preloader.js
  4. /workspace/dist/js/intelligence/canonical-normalizer.js
  5. /workspace/dist/js/intelligence/intelligence-v2-render.js

Выходы:
  - tmp/payd_v2_runtime_callgraph.json    — полный граф с фазами, событиями,
                                            window.*-регистрациями и связями
  - tmp/payd_v2_init_chain.txt            — читаемая цепочка вызовов
"""

import json
import re
from pathlib import Path

# ============================================================
# КОНФИГУРАЦИЯ ПУТЕЙ
# ============================================================
WORKSPACE = Path("/workspace")
OUT_DIR = WORKSPACE / "tmp"
OUT_DIR.mkdir(exist_ok=True)

V2_HTML_PATH          = WORKSPACE / "dist/intelligence-v2.html"
V2_BUNDLE_PATH        = WORKSPACE / "dist/js/intelligence/intelligence-v2-bundle.js"
PRELOADER_PATH        = WORKSPACE / "dist/js/intelligence/intelligence-data-preloader.js"
CANONICAL_PATH        = WORKSPACE / "dist/js/intelligence/canonical-normalizer.js"
V2_RENDER_PATH        = WORKSPACE / "dist/js/intelligence/intelligence-v2-render.js"
SERVICES_INIT_PATH    = WORKSPACE / "dist/js/intelligence/intelligence-services-init.js"

# ============================================================
# УТИЛИТЫ ПАРСИНГА
# ============================================================

def read_file(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except FileNotFoundError:
        return ""


def extract_script_tags_from_html(html: str) -> list:
    scripts = []
    pattern = re.compile(
        r'<script[^>]*\bsrc=["\']([^"\']+)["\'][^>]*>',
        re.IGNORECASE
    )
    for idx, match in enumerate(pattern.finditer(html)):
        full_tag = match.group(0)
        scripts.append({
            "order": idx,
            "src":   match.group(1),
            "defer": "defer" in full_tag.lower(),
            "async": "async" in full_tag.lower(),
        })
    return scripts


def extract_window_assignments(content: str) -> list:
    assigns = []
    pattern = re.compile(
        r"window\.([A-Za-z_][A-Za-z0-9_]*)(\.[A-Za-z_][A-Za-z0-9_]*)?\s*=",
        re.MULTILINE
    )
    for match in pattern.finditer(content):
        line_no = content[:match.start()].count("\n") + 1
        assigns.append({
            "line":    line_no,
            "key":     match.group(1),
            "subkey":  match.group(2).lstrip(".") if match.group(2) else None,
        })
    return assigns


def extract_event_dispatches(content: str) -> list:
    events = []
    pattern = re.compile(
        r"dispatchEvent\s*\(\s*new\s+CustomEvent\s*\(\s*['\"]([^'\"]+)['\"]",
        re.MULTILINE
    )
    for match in pattern.finditer(content):
        line_no = content[:match.start()].count("\n") + 1
        events.append({"line": line_no, "event": match.group(1)})
    return events


def extract_event_listeners(content: str) -> list:
    listeners = []
    pattern = re.compile(
        r"(window|document)\.addEventListener\s*\(\s*['\"]([^'\"]+)['\"]",
        re.MULTILINE
    )
    for match in pattern.finditer(content):
        line_no = content[:match.start()].count("\n") + 1
        listeners.append({
            "line":   line_no,
            "target": match.group(1),
            "event":  match.group(2),
        })
    return listeners


def extract_domcontent_hooks(content: str) -> list:
    found = []
    p1 = re.compile(r"document\.addEventListener\s*\(\s*['\"]DOMContentLoaded['\"]", re.MULTILINE)
    for match in p1.finditer(content):
        line_no = content[:match.start()].count("\n") + 1
        found.append({"line": line_no, "type": "addEventListener('DOMContentLoaded')"})
    p2 = re.compile(r"document\.readyState\s*[!=]==?\s*['\"]([^'\"]+)['\"]", re.MULTILINE)
    for match in p2.finditer(content):
        line_no = content[:match.start()].count("\n") + 1
        found.append({"line": line_no, "type": f"readyState check == '{match.group(1)}'"})
    return found


def extract_function_definitions(content: str, names: list) -> dict:
    out = {n: [] for n in names}
    for name in names:
        pattern = re.compile(rf"\b(?:async\s+)?function\s+{re.escape(name)}\s*\(", re.MULTILINE)
        for match in pattern.finditer(content):
            line_no = content[:match.start()].count("\n") + 1
            out[name].append(line_no)
    return out


def extract_critical_optional_arrays(content: str) -> dict:
    def extract_array(name):
        pattern = re.compile(rf"const\s+{name}\s*=\s*\[(.*?)\];", re.DOTALL)
        m = pattern.search(content)
        if not m:
            return []
        return re.findall(r"`\$\{V2_BASE\}/([^`]+)`", m.group(1))
    return {
        "CRITICAL_SCRIPTS_paths": extract_array("CRITICAL_SCRIPTS"),
        "OPTIONAL_SCRIPTS_paths":  extract_array("OPTIONAL_SCRIPTS"),
    }


def extract_data_fetches(content: str) -> list:
    fetches = []
    pattern = re.compile(r"fetch(?:WithTimeout)?\s*\(\s*[`'\"]([^`'\"]+)[`'\"]", re.MULTILINE)
    for match in pattern.finditer(content):
        line_no = content[:match.start()].count("\n") + 1
        fetches.append({"line": line_no, "url": match.group(1)})
    return fetches


def analyze_file(path: Path) -> dict:
    content = read_file(path)
    return {
        "path":                str(path.relative_to(WORKSPACE)),
        "size_bytes":          len(content.encode("utf-8")),
        "window_assignments":  extract_window_assignments(content),
        "event_dispatches":    extract_event_dispatches(content),
        "event_listeners":     extract_event_listeners(content),
        "domcontent_hooks":    extract_domcontent_hooks(content),
        "data_fetches":        extract_data_fetches(content),
    }


# ============================================================
# КЛАССИФИКАТОРЫ
# ============================================================

def _classify_direct_script_role(src: str) -> str:
    name = src.split("/")[-1].lower()
    if "preloader" in name:
        return "data-preloader"
    if "healing" in src.lower():
        return "self-healing module"
    if "bundle" in name:
        return "V2 orchestrator"
    return "unknown"


def _classify_critical_script(path: str) -> str:
    if "config" in path:                return "config"
    if "utils/" in path:                return "utility"
    if "IDataProvider" in path or "IMarketDataProvider" in path: return "interface"
    if "providers/" in path:            return "data-provider"
    if "DataProviderFactory" in path:   return "factory"
    if "repository/" in path:           return "repository"
    if "application/" in path:          return "application-service"
    if "render" in path:                return "renderer"
    return "other"


def _classify_optional_script(path: str) -> str:
    if "providers/" in path:            return "data-provider"
    if "application/" in path:          return "application-service"
    if "discovery/" in path:            return "discovery"
    if "scoring/" in path:              return "scoring"
    if "scheduler/" in path:            return "scheduler"
    if "validation/" in path:           return "validation"
    if "lifecycle/" in path:            return "lifecycle"
    if "history/" in path:              return "history"
    if "analysis/" in path:             return "analysis-engine"
    if "ranking/" in path:              return "ranking"
    if "IntelligenceGenerators" in path:return "intelligence-generator"
    if "pipeline/" in path:             return "pipeline"
    if "healing/" in path:              return "self-healing"
    if "pipeline-ui" in path:           return "pipeline-ui"
    return "other"


# ============================================================
# MAIN
# ============================================================

def main():
    print("=" * 70)
    print("STEP 2 — TRACE V2 INITIALIZATION CALL GRAPH")
    print("=" * 70)

    # ---------- 1. V2 HTML ----------
    print("\n[1/7] Parsing intelligence-v2.html ...")
    v2_html = read_file(V2_HTML_PATH)
    v2_scripts = extract_script_tags_from_html(v2_html)
    print(f"  Found {len(v2_scripts)} <script> tags in DOM order")

    # ---------- 2. V2 Bundle ----------
    print("\n[2/7] Parsing intelligence-v2-bundle.js ...")
    bundle_content = read_file(V2_BUNDLE_PATH)
    bundle_arrays = extract_critical_optional_arrays(bundle_content)
    bundle_analysis = analyze_file(V2_BUNDLE_PATH)
    print(f"  CRITICAL_SCRIPTS = {len(bundle_arrays['CRITICAL_SCRIPTS_paths'])}")
    print(f"  OPTIONAL_SCRIPTS  = {len(bundle_arrays['OPTIONAL_SCRIPTS_paths'])}")

    # ---------- 3. Preloader ----------
    print("\n[3/7] Parsing intelligence-data-preloader.js ...")
    preloader_analysis = analyze_file(PRELOADER_PATH)
    print(f"  Data fetches: {len(preloader_analysis['data_fetches'])}")
    print(f"  Event dispatches: {len(preloader_analysis['event_dispatches'])}")

    # ---------- 4. Canonical ----------
    print("\n[4/7] Parsing canonical-normalizer.js ...")
    canonical_analysis = analyze_file(CANONICAL_PATH)
    canonical_content = read_file(CANONICAL_PATH)
    canonical_fns = extract_function_definitions(
        canonical_content,
        ["buildCanonicalObject", "buildCanonicalRuntime", "getProjectsBySector",
         "crossSectorConsistencyCheck", "normalizeSectorKey", "computeSectorMemberships"]
    )
    print(f"  window.PAYD_INTEL assignments: {len(canonical_analysis['window_assignments'])}")

    # ---------- 5. V2 Render ----------
    print("\n[5/7] Parsing intelligence-v2-render.js ...")
    v2_render_content = read_file(V2_RENDER_PATH)
    v2_render_analysis = analyze_file(V2_RENDER_PATH)
    v2_render_fns = extract_function_definitions(
        v2_render_content,
        ["boot", "renderAll", "renderArchitectureStatus", "renderStats",
         "renderSectors", "renderProjects", "renderTimeline",
         "createPreloaderService", "waitForServicesAndRerender",
         "filterVerified", "isProjectVerified"]
    )
    print(f"  boot() defined at line(s): {v2_render_fns['boot']}")
    print(f"  renderAll() defined at line(s): {v2_render_fns['renderAll']}")
    print(f"  Event listeners: {len(v2_render_analysis['event_listeners'])}")

    # ---------- 6. Services Init (НЕ загружается на V2) ----------
    print("\n[6/7] Parsing intelligence-services-init.js ...")
    services_init_analysis = analyze_file(SERVICES_INIT_PATH)
    services_init_content = read_file(SERVICES_INIT_PATH)
    init_calls = re.findall(
        r"window\.PAYD_INTEL\.initDataArchitecture\s*\(",
        services_init_content
    )
    print(f"  initDataArchitecture() calls: {len(init_calls)}")

    # ---------- 7. Bundle raw extract ----------
    print("\n[7/7] Extracting Phase 1 + Phase 2 details ...")
    critical = bundle_arrays["CRITICAL_SCRIPTS_paths"]
    optional = bundle_arrays["OPTIONAL_SCRIPTS_paths"]

    # ============================================================
    # СБОРКА ГРАФА
    # ============================================================
    call_graph = {
        "metadata": {
            "purpose": "Trace exact V2 initialization chain from HTML parse to first render",
            "pages_analyzed": ["intelligence-v2.html"],
            "files_analyzed": [
                "intelligence-v2.html",
                "intelligence-v2-bundle.js",
                "intelligence-data-preloader.js",
                "canonical-normalizer.js",
                "intelligence-v2-render.js",
            ],
            "critical_finding": (
                "intelligence-services-init.js is NOT loaded on intelligence-v2.html. "
                "Therefore window.PAYD_INTEL.architecture is NEVER created on the V2 page. "
                "V2 render depends solely on PAYD_INTEL_CACHED_DATA.canonical (built by canonical-normalizer)."
            ),
        },

        "phase_0_html_script_load": {
            "description": "Direct <script src=...> tags in intelligence-v2.html (DOM order)",
            "scripts": [
                {
                    "order":      s["order"],
                    "src":        s["src"],
                    "defer":      s["defer"],
                    "async":      s["async"],
                    "phase_role": _classify_direct_script_role(s["src"]),
                }
                for s in v2_scripts
            ],
        },

        "phase_1_bundle_critical_scripts": {
            "description": (
                "Bundle loads these SEQUENTIALLY (for-loop + await loadOne). "
                "Each must finish before the next starts. dispatchReady blocks until done."
            ),
            "load_strategy":        "sequential (for-loop with await loadOne)",
            "timeout_per_script_ms": 5000,
            "scripts": [
                {
                    "order":     i + 1,
                    "path":      f"/js/intelligence/{p}",
                    "filename":  p.split("/")[-1],
                    "category":  _classify_critical_script(p),
                }
                for i, p in enumerate(critical)
            ],
        },

        "phase_2_bundle_optional_scripts": {
            "description": (
                "After Phase 1, these load in PARALLEL via Promise.allSettled. "
                "Fire-and-forget; UI does NOT wait."
            ),
            "load_strategy":        "parallel (Promise.allSettled)",
            "timeout_per_script_ms": 5000,
            "scripts": [
                {
                    "order":     i + 1,
                    "path":      f"/js/intelligence/{p}",
                    "filename":  p.split("/")[-1],
                    "category":  _classify_optional_script(p),
                }
                for i, p in enumerate(optional)
            ],
        },

        "phase_3_global_registrations": {
            "description": "Each script's contribution to window.* globals (in load order)",
            "registrations": [
                {
                    "script":     "canonical-normalizer.js",
                    "registered_via": "IIFE (defer, loaded directly by HTML)",
                    "globals": [
                        {"key": "window.PAYD_INTEL.Canonical", "methods": [
                            "normalize", "build", "getBySector", "crossSectorCheck", "fmt"
                        ]},
                    ],
                },
                {
                    "script":     "intelligence-data-preloader.js",
                    "registered_via": "IIFE (defer, loaded directly by HTML)",
                    "globals": [
                        {"key": "window.PAYD_INTEL_CACHED_DATA", "shape": {
                            "projects":   "dict<tk, project>",
                            "overview":   "stats object",
                            "canonical":  "{ projects: Map, list, sectorIndex, stats, _ready }",
                            "depin":      "{ projects: [...] }",
                            "_preloaded": "bool",
                        }},
                    ],
                },
                {
                    "script":     "5 healing/* modules",
                    "registered_via": "defer (HTML)",
                    "globals":    ["window.PAYD_INTEL.SectorIntegrityChecker", "window.PAYD_INTEL.AutoDiscoveryService",
                                   "window.PAYD_INTEL.SectorClassifier", "window.PAYD_INTEL.AutoEnrichmentService",
                                   "window.PAYD_INTEL.SelfHealingEngine"],
                },
                {
                    "script":     "intelligence-v2-bundle.js",
                    "registered_via": "IIFE (defer, last in HTML)",
                    "globals": [
                        {"key": "window.__PAYD_V2_DEBUG__",  "type": "object"},
                        {"key": "window.__PAYD_V2_READY__",  "type": "boolean"},
                    ],
                },
                {
                    "script":     "Phase-1 critical scripts (12)",
                    "registered_via": "Bundle's sequential for-loop",
                    "globals": [
                        {"key": "window.PAYD_INTEL.FieldUtils"},
                        {"key": "window.PAYD_INTEL.LocalJsonDataProvider"},
                        {"key": "window.PAYD_INTEL.ApiDataProvider (opt)"},
                        {"key": "window.PAYD_INTEL.DataProviderFactory"},
                        {"key": "window.PAYD_INTEL.ProjectRepository"},
                        {"key": "window.PAYD_INTEL.ScoreRepository"},
                        {"key": "window.PAYD_INTEL.DiscoveryRepository"},
                        {"key": "window.PAYD_INTEL.ProjectService"},
                        {"key": "window.PAYD_INTEL.ScoreService"},
                        {"key": "window.PAYD_INTEL.V2Render"},
                    ],
                },
            ],
        },

        "phase_4_custom_events": {
            "description": "Custom events for cross-script coordination",
            "events": [
                {
                    "name":     "payd:preloader-ready",
                    "dispatched_by": "intelligence-data-preloader.js",
                    "dispatched_when": (
                        "After Promise.allSettled resolves for the 3 JSON fetches "
                        "(projects.json, score_history.json, projects_enriched.json). "
                        "Detail payload includes projects count, canonical_total, sectors."
                    ),
                    "listened_by": "Possibly legacy V1 main.js (not V2 render)",
                    "note": "V2 render reads PAYD_INTEL_CACHED_DATA._preloaded, not this event.",
                },
                {
                    "name":     "payd-v2-ready",
                    "dispatched_by": "intelligence-v2-bundle.js (dispatchReady)",
                    "dispatched_when": (
                        "After Phase 1 (12 critical scripts) finishes loading — "
                        "guarded by PAYD_INTEL.ProjectRepository existence. "
                        "Watchdog 1 fires at 8s; Watchdog 2 at 15s as failsafes."
                    ),
                    "listened_by": "intelligence-v2-render.js (auto-start at line ~855)",
                    "critical": True,
                },
                {
                    "name":     "payd:architecture-ready",
                    "dispatched_by": "intelligence-services-init.js",
                    "dispatched_when": "ONLY on index.html (homepage) — services-init not on V2 page",
                    "listened_by": "Various V1 modules on HOMEPAGE",
                    "v2_page_relevant": False,
                },
            ],
        },

        "phase_5_first_render_path": {
            "description": "Exact chain from script load to first DOM update on V2 page",
            "chain": [
                {
                    "step":   1,
                    "actor":  "Browser",
                    "action": "Parses intelligence-v2.html; all <script> tags have `defer`",
                    "effect": "Begins parallel HTTP fetches for the 7 defer scripts",
                },
                {
                    "step":   2,
                    "actor":  "Browser",
                    "action": "Builds DOM skeleton (header, sections, footer)",
                    "effect": "User sees static structure with 'Loading…' placeholders",
                },
                {
                    "step":   3,
                    "actor":  "canonical-normalizer.js",
                    "action": "IIFE executes (after DOMContentLoaded)",
                    "effect": "window.PAYD_INTEL.Canonical registered (normalize, build, getBySector, ...)",
                },
                {
                    "step":   4,
                    "actor":  "intelligence-data-preloader.js",
                    "action": "IIFE executes — creates EMPTY PAYD_INTEL_CACHED_DATA shell",
                    "effect": "window.PAYD_INTEL_CACHED_DATA exists with empty placeholders",
                },
                {
                    "step":   5,
                    "actor":  "intelligence-data-preloader.js",
                    "action": "Promise.allSettled — fires 3 fetch() calls in parallel (4s, 3s, 3s)",
                    "effect": "Network: /data/projects.json, /data/score_history.json, /data/projects_enriched.json",
                },
                {
                    "step":   6,
                    "actor":  "intelligence-data-preloader.js",
                    "action": (
                        "On Promise resolution — if enriched.projects exists, calls "
                        "PAYD_INTEL.Canonical.build(enriched.projects) "
                        "(guarded — only if Canonical module loaded, else _deferred)"
                    ),
                    "effect": "PAYD_INTEL_CACHED_DATA.canonical = {_ready:true, projects:Map(354), ...}",
                },
                {
                    "step":   7,
                    "actor":  "intelligence-data-preloader.js",
                    "action": "Dispatches 'payd:preloader-ready' CustomEvent",
                    "effect": "Legacy listeners (if any) notified; V2 render ignores this event",
                },
                {
                    "step":   8,
                    "actor":  "5 healing/* modules",
                    "action": "defer IIFE — registers globals on window.PAYD_INTEL",
                    "effect": "Healing services available for SectorIntegrityChecker etc.",
                },
                {
                    "step":   9,
                    "actor":  "intelligence-v2-bundle.js",
                    "action": (
                        "IIFE — if !isV2Page return. Defines CRITICAL_SCRIPTS (12) and "
                        "OPTIONAL_SCRIPTS (41). Sets 8s and 15s watchdogs."
                    ),
                    "effect": "Bundle ready to start Phase 1",
                },
                {
                    "step":  10,
                    "actor":  "intelligence-v2-bundle.js → boot()",
                    "action": (
                        "Phase 1 — for-loop with await loadOne() for each of 12 CRITICAL_SCRIPTS. "
                        "BLOCKS dispatchReady until ALL finish (or timeout)."
                    ),
                    "effect": (
                        "window.PAYD_INTEL has: DataProviderFactory, LocalJsonDataProvider, "
                        "ProjectRepository, ScoreRepository, DiscoveryRepository, "
                        "ProjectService, ScoreService, V2Render"
                    ),
                },
                {
                    "step":  11,
                    "actor":  "intelligence-v2-bundle.js",
                    "action": (
                        "Calls dispatchReady('critical-done') (after 100ms grace). "
                        "Concurrently fires Phase 2 (loadGroup on 41 OPTIONAL_SCRIPTS) — fire-and-forget."
                    ),
                    "effect": (
                        "window.__PAYD_V2_READY__ = true; "
                        "window.dispatchEvent(new CustomEvent('payd-v2-ready'))"
                    ),
                },
                {
                    "step":  12,
                    "actor":  "intelligence-v2-render.js — boot()",
                    "action": (
                        "Listener fires (registered at module bottom: "
                        "addEventListener('payd-v2-ready', boot, { once: true }))"
                    ),
                    "effect": "boot() begins execution",
                },
                {
                    "step":  13,
                    "actor":  "intelligence-v2-render.js — boot()",
                    "action": (
                        "Checks PAID.ProjectService && PAID.DataProviderFactory. "
                        "If both present → full path. "
                        "If missing but PAYD_INTEL_CACHED_DATA._preloaded → createPreloaderService fallback."
                    ),
                    "effect": "Enters renderAll() with either real services or preloader fallback",
                },
                {
                    "step":  14,
                    "actor":  "intelligence-v2-render.js — renderAll()",
                    "action": (
                        "Promise.all of 5 render calls: renderArchitectureStatus, "
                        "renderStats, renderSectors, renderProjects, renderTimeline"
                    ),
                    "effect": "DOM updates: provider badge, stats counters, sectors, projects, timeline",
                },
                {
                    "step":  15,
                    "actor":  "intelligence-v2-render.js — attachEventHandlers()",
                    "action": (
                        "Wires filter buttons (status), run-discovery btn, "
                        "evaluate-lifecycle btn, refresh btn"
                    ),
                    "effect": "UI becomes interactive",
                },
                {
                    "step":  16,
                    "actor":  "OPTIONAL_SCRIPTS (Phase 2)",
                    "action": (
                        "Continue loading in background (DiscoveryService, ReportService, "
                        "PipelineBootstrap, analysis engines, healing modules, etc.)"
                    ),
                    "effect": "Discovery buttons, scheduler, analysis become progressively available",
                },
            ],
        },

        "phase_6_symbol_dependency_map": {
            "description": "Where each critical symbol is REGISTERED vs. CONSUMED",
            "symbols": {
                "window.PAYD_INTEL.Canonical": {
                    "registered_by": "canonical-normalizer.js",
                    "consumed_by": [
                        "intelligence-data-preloader.js (build)",
                        "intelligence-v2-render.js (indirectly via cached.canonical)",
                    ],
                    "required_for_first_render": True,
                    "v2_page_status": "LOADED",
                },
                "window.PAYD_INTEL_CACHED_DATA": {
                    "registered_by": "intelligence-data-preloader.js",
                    "consumed_by": [
                        "intelligence-v2-render.js (filterVerified, fallback)",
                        "Various V1 modules (legacy)",
                    ],
                    "required_for_first_render": True,
                    "v2_page_status": "LOADED",
                },
                "window.PAYD_INTEL.V2Render": {
                    "registered_by": "intelligence-v2-render.js (CRITICAL)",
                    "consumed_by": ["intelligence-v2-bundle.js (via event)"],
                    "required_for_first_render": True,
                    "v2_page_status": "LOADED",
                },
                "window.PAYD_INTEL.ProjectService": {
                    "registered_by": "application/ProjectService.js (CRITICAL)",
                    "consumed_by": ["intelligence-v2-render.js (boot)"],
                    "required_for_first_render": True,
                    "v2_page_status": "LOADED",
                },
                "window.PAYD_INTEL.DataProviderFactory": {
                    "registered_by": "data/DataProviderFactory.js (CRITICAL)",
                    "consumed_by": ["intelligence-v2-render.js (boot)"],
                    "required_for_first_render": True,
                    "v2_page_status": "LOADED",
                },
                "window.PAYD_INTEL.ProjectRepository": {
                    "registered_by": "data/repository/ProjectRepository.js (CRITICAL)",
                    "consumed_by": ["intelligence-v2-render.js (boot, guard)"],
                    "required_for_first_render": True,
                    "v2_page_status": "LOADED",
                },
                "window.PAYD_INTEL.ScoreRepository": {
                    "registered_by": "data/repository/ScoreRepository.js (CRITICAL)",
                    "consumed_by": ["intelligence-v2-render.js (boot)"],
                    "required_for_first_render": True,
                    "v2_page_status": "LOADED",
                },
                "window.PAYD_INTEL.DiscoveryRepository": {
                    "registered_by": "data/repository/DiscoveryRepository.js (CRITICAL)",
                    "consumed_by": ["intelligence-v2-render.js (boot)"],
                    "required_for_first_render": True,
                    "v2_page_status": "LOADED",
                },
                "window.PAYD_INTEL.FieldUtils": {
                    "registered_by": "utils/field-utils.js (CRITICAL)",
                    "consumed_by": ["intelligence-v2-render.js (FieldUtils.getField)"],
                    "required_for_first_render": False,
                    "v2_page_status": "LOADED (with graceful fallback)",
                },
                "window.PAYD_INTEL.LocalJsonDataProvider": {
                    "registered_by": "data/providers/LocalJsonDataProvider.js (CRITICAL)",
                    "consumed_by": ["DataProviderFactory"],
                    "required_for_first_render": True,
                    "v2_page_status": "LOADED",
                },
                "window.PAYD_INTEL.ApiDataProvider": {
                    "registered_by": "data/providers/ApiDataProvider.js (OPTIONAL)",
                    "consumed_by": ["DataProviderFactory (fallback)"],
                    "required_for_first_render": False,
                    "v2_page_status": "LOADED (Phase 2, parallel)",
                },
                "window.PAYD_INTEL.DiscoveryEngineV2": {
                    "registered_by": "scoring/DiscoveryEngineV2.js (OPTIONAL)",
                    "consumed_by": [
                        "intelligence-v2-render.js (only if DiscoveryServiceApplication instantiated)",
                    ],
                    "required_for_first_render": False,
                    "v2_page_status": "LOADED (Phase 2, parallel)",
                },
                "window.PAYD_INTEL.architecture": {
                    "registered_by": (
                        "intelligence-services-init.js → PAYD_INTEL.initDataArchitecture()"
                    ),
                    "consumed_by": [
                        "Various V1 modules on HOMEPAGE only (scheduler handlers)",
                    ],
                    "required_for_first_render": False,
                    "v2_page_status": (
                        "NOT LOADED on V2 page (services-init.js absent from intelligence-v2.html)"
                    ),
                },
            },
        },

        "phase_7_architecture_usage_on_v2_page": {
            "description": "Cross-check: does V2 page ever set window.PAYD_INTEL.architecture?",
            "intelligence_services_init_loaded":  False,
            "initDataArchitecture_invoked":        False,
            "window_PAYD_INTEL_architecture_set": False,
            "evidence": {
                "grep_in_v2_html":   "no matches",
                "grep_in_bundle_js": "no matches",
                "grep_in_v2_render": "no matches",
                "explanation": (
                    "intelligence-services-init.js (which calls "
                    "window.PAYD_INTEL.initDataArchitecture and assigns "
                    "window.PAYD_INTEL.architecture) is NOT loaded by intelligence-v2.html. "
                    "It is loaded only by HOMEPAGE index.html at line ~166099."
                ),
            },
            "consequence": (
                "On V2 page, the entire scheduler/provider/engines backend is NEVER "
                "instantiated. V2 render relies exclusively on PAYD_INTEL_CACHED_DATA.canonical "
                "for first paint."
            ),
        },

        "summary": {
            "total_critical_scripts":     len(critical),
            "total_optional_scripts":     len(optional),
            "direct_html_scripts":        len(v2_scripts),
            "total_scripts_for_v2_page":  len(v2_scripts) + len(critical) + len(optional),
            "key_data_fetches": [
                "/data/projects.json            (timeout 4s)",
                "/data/score_history.json       (timeout 3s)",
                "/data/projects_enriched.json   (timeout 3s)",
            ],
            "first_render_event":     "payd-v2-ready",
            "first_render_actor":     "intelligence-v2-render.js boot() → renderAll()",
            "first_render_blocker": (
                "Phase 1 of bundle: 12 CRITICAL_SCRIPTS loaded SEQUENTIALLY via for-loop "
                "with 5s timeout each. Total worst-case = 60s. "
                "Watchdog 1 (8s) and Watchdog 2 (15s) force dispatchReady as failsafe."
            ),
            "services_init_loaded_on_v2":      False,
            "architecture_initialized_on_v2":  False,
        },

        "raw": {
            "v2_html_scripts":        v2_scripts,
            "v2_bundle_arrays":       bundle_arrays,
            "v2_bundle_analysis":     bundle_analysis,
            "preloader_analysis":     preloader_analysis,
            "canonical_analysis":     canonical_analysis,
            "canonical_fns":          canonical_fns,
            "v2_render_analysis":     v2_render_analysis,
            "v2_render_fns":          v2_render_fns,
            "services_init_analysis": services_init_analysis,
        },
    }

    # ---------- СОХРАНЕНИЕ ----------
    out_json = OUT_DIR / "payd_v2_runtime_callgraph.json"
    out_json.write_text(
        json.dumps(call_graph, indent=2, ensure_ascii=False),
        encoding="utf-8"
    )
    print(f"\n[OK] Saved: {out_json.relative_to(WORKSPACE)} "
          f"({out_json.stat().st_size:,} bytes)")

    # ---------- Текстовая цепочка ----------
    txt = OUT_DIR / "payd_v2_init_chain.txt"
    lines = []
    lines.append("=" * 78)
    lines.append("PAYD V2 INITIALIZATION CHAIN (human-readable)")
    lines.append("=" * 78)
    lines.append("")
    lines.append("HTML direct <script> tags (in DOM order):")
    for s in v2_scripts:
        defer_tag = " [defer]" if s["defer"] else ""
        lines.append(f"  {s['order']+1:>2}. {s['src']}{defer_tag}")
    lines.append("")
    lines.append(f"Bundle CRITICAL_SCRIPTS ({len(critical)}, sequential, blocks dispatchReady):")
    for i, p in enumerate(critical):
        lines.append(f"  C{i+1:>2}. /js/intelligence/{p}")
    lines.append("")
    lines.append(f"Bundle OPTIONAL_SCRIPTS ({len(optional)}, parallel, fire-and-forget):")
    for i, p in enumerate(optional):
        lines.append(f"  O{i+1:>2}. /js/intelligence/{p}")
    lines.append("")
    lines.append("FIRST-RENDER CALL CHAIN:")
    lines.append("-" * 78)
    for step in call_graph["phase_5_first_render_path"]["chain"]:
        lines.append(f"  Step {step['step']:>2}: [{step['actor']}]")
        lines.append(f"          {step['action']}")
        lines.append(f"          -> {step['effect']}")
        lines.append("")
    lines.append("=" * 78)
    lines.append("CRITICAL FINDING:")
    lines.append("  * window.PAYD_INTEL.architecture is NEVER set on intelligence-v2.html")
    lines.append("  * intelligence-services-init.js is absent from this page")
    lines.append("  * V2 render does NOT depend on architecture/services-init for first paint")
    lines.append("  * V2 render uses PAYD_INTEL_CACHED_DATA.canonical")
    lines.append("    (built from projects_enriched.json via canonical-normalizer)")
    lines.append("  * Services (ProjectService, etc.) required for full render,")
    lines.append("    but preloader fallback works without them")
    lines.append("=" * 78)

    txt.write_text("\n".join(lines), encoding="utf-8")
    print(f"[OK] Saved: {txt.relative_to(WORKSPACE)} ({txt.stat().st_size:,} bytes)")

    print("\n" + "=" * 70)
    print("STEP 2 COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    main()
