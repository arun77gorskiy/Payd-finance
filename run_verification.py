import asyncio
import json
from playwright.sync_api import sync_playwright

def run_verification():
    url = "https://z9pkc33iymx7.space.minimax.io/intelligence-v2.html"
    js_code = """
    (function() {
        const result = {
            allProjects: null,
            verifiedProjects: null,
            excludedProjects: null,
            fieldUtilsExists: !!window.PAYD_INTEL?.FieldUtils,
            fieldUtilsMethods: window.PAYD_INTEL?.FieldUtils ? Object.keys(window.PAYD_INTEL.FieldUtils) : [],
            test1_camel: window.PAYD_INTEL?.FieldUtils?.getField({verifiedStatus: 'verified'}, 'verifiedStatus'),
            test1_snake: window.PAYD_INTEL?.FieldUtils?.getField({verified_status: 'verified'}, 'verifiedStatus'),
            test1_mixed: window.PAYD_INTEL?.FieldUtils?.getField({verifiedStatus: 'verified'}, 'verified_status'),
            totalCount: document.getElementById('payd-v2-stat-total')?.textContent,
            emergingCount: document.getElementById('payd-v2-stat-emerging')?.textContent,
            watchlistCount: document.getElementById('payd-v2-stat-watchlist')?.textContent,
            coreCount: document.getElementById('payd-v2-stat-core')?.textContent,
            archiveCount: document.getElementById('payd-v2-stat-archive')?.textContent,
            renderedCards: document.querySelectorAll('.payd-v2-project-card').length,
            renderedSectors: document.querySelectorAll('.payd-v2-sector-card').length,
            sectorNames: Array.from(document.querySelectorAll('.payd-v2-sector-name')).map(el => el.textContent.trim()),
        };

        // Also try to get project counts
        try {
            const projects = window.PAYD_INTEL?.ProjectRepository;
            if (projects && typeof projects.findAll === 'function') {
                const all = projects.findAll();
                result.allProjects = all ? all.length : null;
                if (all) {
                    result.verifiedProjects = all.filter(p => p.verifiedStatus === 'verified' || p.verified_status === 'verified').length;
                }
            } else if (projects && typeof projects.getAll === 'function') {
                const all = projects.getAll();
                result.allProjects = all ? all.length : null;
            }
        } catch(e) {
            result.projectError = String(e);
        }

        return result;
    })()
    """

    console_messages = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
        context = browser.new_context()
        page = context.new_page()

        # Collect console messages
        def handle_console(msg):
            console_messages.append({
                'type': msg.type,
                'text': msg.text
            })

        page.on('console', handle_console)
        page.on('pageerror', lambda err: console_messages.append({
            'type': 'pageerror',
            'text': str(err)
        }))

        print(f"[*] Navigated to {url}")
        page.goto(url, wait_until='networkidle')
        print("[*] Waiting 5 seconds for full initialization...")
        page.wait_for_timeout(5000)

        print("[*] Executing verification script...")
        result = page.evaluate(js_code)
        browser.close()
        return result, console_messages

if __name__ == "__main__":
    result, console_messages = run_verification()

    print("\n" + "="*60)
    print("VERIFICATION REPORT:")
    print("="*60)
    print(json.dumps(result, ensure_ascii=False, indent=2))

    # Filter messages related to PAYD-V2
    payd_messages = [m for m in console_messages if 'payd' in m['text'].lower() or 'PAYD' in m['text']]

    print("\n" + "="*60)
    print(f"ALL CONSOLE MESSAGES ({len(console_messages)} total):")
    print("="*60)
    for m in console_messages:
        print(f"[{m['type']}] {m['text'][:300]}")

    print("\n" + "="*60)
    print(f"PAYD-V2 RELATED MESSAGES ({len(payd_messages)}):")
    print("="*60)
    for m in payd_messages:
        print(f"[{m['type']}] {m['text'][:500]}")
