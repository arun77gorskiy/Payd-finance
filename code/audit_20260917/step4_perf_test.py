#!/usr/bin/env python3
"""
STEP 4.14, 4.15: Performance measurement + validation script.
Использует Playwright для измерения BEFORE/AFTER метрик.
"""

import json
import time
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL_BASE = "http://localhost:9876/intelligence-v2.html"
RESULTS = {
    "warm_runs": [],
    "cold_runs": [],
    "validation": {},
    "console_errors": [],
    "console_warnings": [],
}


def measure_performance(page, label):
    """Получить метрики из window.__PAYD_V2_DEBUG__ + performance API."""
    metrics = page.evaluate("""() => {
        const debug = window.__PAYD_V2_DEBUG__ || {};
        const loader = window.PAYD_V2_LOADER || {};
        const perf = window.performance;
        const marks = {};
        try {
            perf.getEntriesByType('mark').forEach(m => { marks[m.name] = m.startTime; });
        } catch(_) {}
        const measures = {};
        try {
            perf.getEntriesByType('measure').forEach(m => { measures[m.name] = m.duration; });
        } catch(_) {}
        const nav = perf.getEntriesByType('navigation')[0] || {};
        return {
            bundleVersion: loader.version || 'unknown',
            ready: !!window.__PAYD_V2_READY__,
            paydIntel: !!window.PAYD_INTEL,
            paydIntelCached: !!window.PAYD_INTEL_CACHED_DATA,
            dataReady: !!(window.PAYD_INTEL_CACHED_DATA && window.PAYD_INTEL_CACHED_DATA.projects),
            marks: marks,
            measures: measures,
            events: debug.events || [],
            domContentLoaded: nav.domContentLoadedEventEnd - nav.domContentLoadedEventStart,
            loadComplete: nav.loadEventEnd - nav.loadEventStart,
            now: Date.now(),
            loaderGetMetrics: typeof loader.getMetrics === 'function' ? loader.getMetrics() : null,
        };
    }""")
    return metrics


def validate_page(page):
    """Проверить основные DOM элементы и состояния."""
    result = {
        "html_present": page.locator("html").count() > 0,
        "payd_v2_arch_grid_present": page.locator("#payd-v2-arch-grid").count() > 0,
        "table_rows": page.evaluate("""() => {
            const rows = document.querySelectorAll('tr, .payd-v2-row, [data-row-id]');
            return rows.length;
        }"""),
        "PAYD_INTEL_keys": page.evaluate("""() => {
            if (!window.PAYD_INTEL) return null;
            return Object.keys(window.PAYD_INTEL).slice(0, 30);
        }"""),
        "rendered_text_sample": page.evaluate("""() => {
            const grid = document.querySelector('#payd-v2-arch-grid');
            return grid ? grid.innerText.slice(0, 500) : '';
        }"""),
    }
    return result


def capture_console(page):
    """Слушать console."""
    errors = []
    warnings = []
    page.on("pageerror", lambda exc: errors.append(str(exc)))
    def on_console(msg):
        if msg.type == "error":
            errors.append(msg.text)
        elif msg.type == "warning":
            warnings.append(msg.text)
    page.on("console", on_console)
    return errors, warnings


def run_test(browser, is_cold=False, label="test"):
    """Один прогон: cold/warm."""
    context = browser.new_context()
    page = context.new_page()
    errors, warnings = capture_console(page)

    t_start = time.time()
    try:
        page.goto(URL_BASE, wait_until="networkidle", timeout=30000)
    except Exception as e:
        print(f"  [{label}] navigation timeout/exception: {e}", file=sys.stderr)
    t_nav_done = time.time() - t_start

    # Ждём ещё немного для завершения post-render
    try:
        page.wait_for_function("window.__PAYD_V2_READY__ === true", timeout=15000)
    except Exception as e:
        print(f"  [{label}] ready timeout: {e}", file=sys.stderr)

    # Дать ещё секунду на отложенные модули
    page.wait_for_timeout(2000)

    metrics = measure_performance(page, label)
    validation = validate_page(page)
    t_total = time.time() - t_start

    # Extract key timings
    marks = metrics.get("marks", {})
    result = {
        "label": label,
        "is_cold": is_cold,
        "nav_duration_s": round(t_nav_done, 3),
        "total_duration_s": round(t_total, 3),
        "bundle_version": metrics.get("bundleVersion"),
        "ready": metrics.get("ready"),
        "payd_intel": metrics.get("paydIntel"),
        "payd_intel_cached": metrics.get("paydIntelCached"),
        "data_ready": metrics.get("dataReady"),
        "marks": marks,
        "measures": metrics.get("measures", {}),
        "validation": validation,
        "console_errors_count": len(errors),
        "console_warnings_count": len(warnings),
        "console_errors_sample": errors[:5],
        "console_warnings_sample": warnings[:5],
        "first_render_ms": marks.get("payd_first_render"),
        "interactive_ms": marks.get("payd_interactive"),
        "critical_complete_ms": marks.get("payd_critical_complete"),
        "data_ready_ms": marks.get("payd_data_ready"),
        "post_render_complete_ms": marks.get("payd_post_render_complete"),
    }

    context.close()
    return result


def main(mode="after"):
    """Запустить 3 cold + 3 warm прогона."""
    results = []
    print(f"=== Running {mode.upper()} performance tests ===")
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])

        # Cold runs: каждый раз новый context = чистый cache
        print("\n--- Cold runs (3x) ---")
        for i in range(3):
            print(f"  Cold run {i+1}/3...")
            r = run_test(browser, is_cold=True, label=f"cold-{i+1}")
            results.append(r)
            print(f"    nav={r['nav_duration_s']}s, total={r['total_duration_s']}s, ready={r['ready']}")

        # Warm runs: переиспользуем browser context
        print("\n--- Warm runs (3x) ---")
        for i in range(3):
            print(f"  Warm run {i+1}/3...")
            r = run_test(browser, is_cold=False, label=f"warm-{i+1}")
            results.append(r)
            print(f"    nav={r['nav_duration_s']}s, total={r['total_duration_s']}s, ready={r['ready']}")

        browser.close()

    # Сохраняем
    out_path = Path(f"/workspace/tmp/payd_v2_step4_{mode}_metrics.json")
    with open(out_path, "w") as f:
        json.dump({
            "mode": mode,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "url": URL_BASE,
            "runs": results,
            "summary": summarize(results),
        }, f, indent=2)
    print(f"\n=== Results saved to {out_path} ===")
    return results


def summarize(results):
    cold = [r for r in results if r["is_cold"]]
    warm = [r for r in results if not r["is_cold"]]
    return {
        "cold_count": len(cold),
        "warm_count": len(warm),
        "cold_nav_median_s": sorted([r["nav_duration_s"] for r in cold])[len(cold)//2] if cold else None,
        "warm_nav_median_s": sorted([r["nav_duration_s"] for r in warm])[len(warm)//2] if warm else None,
        "cold_first_render_median_ms": sorted([r["first_render_ms"] or 9999 for r in cold])[len(cold)//2] if cold else None,
        "warm_first_render_median_ms": sorted([r["first_render_ms"] or 9999 for r in warm])[len(warm)//2] if warm else None,
        "all_ready": all(r["ready"] for r in results),
        "all_data_ready": all(r["data_ready"] for r in results),
        "avg_console_errors": sum(r["console_errors_count"] for r in results) / max(1, len(results)),
    }


if __name__ == "__main__":
    mode = sys.argv[1] if len(sys.argv) > 1 else "after"
    main(mode)
