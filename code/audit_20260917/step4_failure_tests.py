#!/usr/bin/env python3
"""
STEP 4.16: Failure tests.
A: one non-critical lazy script fails -> V2 table usable
B: one POST_RENDER module fails -> base V2 table usable
C: canonical data fetch fails -> error/fallback, no infinite loader
D: critical renderer script fails -> deterministic boot error, no 60s stall
"""

import json
import time
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

URL_BASE = "http://localhost:9876/intelligence-v2.html"


def run_failure_test(test_name, route_blocker=None, route_modifier=None):
    """Запустить один failure test."""
    print(f"\n--- Test {test_name} ---")
    with sync_playwright() as p:
        browser = p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        context = browser.new_context()
        page = context.new_page()

        errors = []
        warnings = []
        page.on("pageerror", lambda exc: errors.append(str(exc)))
        page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else warnings.append(msg.text) if msg.type == "warning" else None)

        # Setup route interception
        if route_blocker or route_modifier:
            def handler(route):
                url = route.request.url
                if route_blocker and route_blocker(url):
                    print(f"  BLOCKING: {url.split('/')[-1]}")
                    route.fulfill(status=404, body="Not Found")
                elif route_modifier and route_modifier(url):
                    print(f"  MODIFYING: {url.split('/')[-1]}")
                    route.continue_()
                else:
                    route.continue_()
            page.route("**/*.js", handler)

        t_start = time.time()
        try:
            page.goto(URL_BASE, wait_until="networkidle", timeout=20000)
        except Exception as e:
            print(f"  Nav exception: {e}")
        t_total = time.time() - t_start

        # Wait for ready with timeout
        try:
            page.wait_for_function("window.__PAYD_V2_READY__ === true", timeout=10000)
            ready = True
        except:
            ready = False

        # Wait a bit more for any post-render
        page.wait_for_timeout(1500)

        # Check critical state
        result = page.evaluate("""() => ({
            ready: !!window.__PAYD_V2_READY__,
            paydIntel: !!window.PAYD_INTEL,
            dataReady: !!(window.PAYD_INTEL_CACHED_DATA && window.PAYD_INTEL_CACHED_DATA.projects),
            projectCount: (window.PAYD_INTEL_CACHED_DATA && window.PAYD_INTEL_CACHED_DATA.projects) ? window.PAYD_INTEL_CACHED_DATA.projects.length : 0,
            projectService: !!(window.PAYD_INTEL && window.PAYD_INTEL.ProjectService),
            dataProviderFactory: !!(window.PAYD_INTEL && window.PAYD_INTEL.DataProviderFactory),
            gridExists: !!document.querySelector('#payd-v2-arch-grid'),
            gridContentLength: document.querySelector('#payd-v2-arch-grid') ? document.querySelector('#payd-v2-arch-grid').innerText.length : 0,
        })""")

        context.close()
        browser.close()

        result.update({
            "test": test_name,
            "duration_s": round(t_total, 2),
            "ready": ready,
            "console_errors_count": len(errors),
            "console_errors_sample": errors[:3],
            "table_usable": result["gridExists"] and result["gridContentLength"] > 0,
        })

        print(f"  Duration: {result['duration_s']}s, ready={result['ready']}, gridExists={result['gridExists']}")
        print(f"  Project count: {result['projectCount']}, grid content length: {result['gridContentLength']}")

        # Determine pass/fail
        if test_name == "A" or test_name == "B":
            # V2 table must be usable
            result["pass"] = result["table_usable"] and result["ready"] and result["dataReady"]
        elif test_name == "C":
            # Canonical data fails -> error/fallback expected, NOT infinite loader
            # Pass if: ready set AND duration < 15s AND grid exists (shows fallback)
            result["pass"] = result["ready"] and result["duration_s"] < 15 and result["gridExists"]
        elif test_name == "D":
            # Critical renderer fails -> deterministic boot error, no 60s stall
            # Pass if: ready set AND duration < 15s (watchdog forces ready quickly)
            result["pass"] = result["ready"] and result["duration_s"] < 15

        print(f"  PASS: {result['pass']}")
        return result


def main():
    tests = [
        # Test A: one non-critical lazy script fails -> V2 table usable
        run_failure_test("A", route_blocker=lambda url: "MockDataSource.js" in url),
        # Test B: one POST_RENDER module fails -> base V2 table usable
        run_failure_test("B", route_blocker=lambda url: "PipelineBootstrap.js" in url),
        # Test C: canonical data fetch fails -> error/fallback, no infinite loader
        run_failure_test("C", route_blocker=lambda url: "/data/" in url and ".json" in url),
        # Test D: critical renderer script fails -> deterministic boot error, no 60s stall
        run_failure_test("D", route_blocker=lambda url: "intelligence-v2-render.js" in url),
    ]

    # Save
    out_path = Path("/workspace/tmp/payd_v2_step4_failure_tests.json")
    summary = {
        "all_pass": all(t["pass"] for t in tests),
        "tests": tests,
        "summary": {
            "A_pass": tests[0]["pass"],
            "B_pass": tests[1]["pass"],
            "C_pass": tests[2]["pass"],
            "D_pass": tests[3]["pass"],
        }
    }
    with open(out_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"\n=== Failure tests saved to {out_path} ===")
    print(f"  All PASS: {summary['all_pass']}")


if __name__ == "__main__":
    main()
