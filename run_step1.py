import asyncio
import json
from playwright.sync_api import sync_playwright

def run_step1():
    url = "https://z9pkc33iymx7.space.minimax.io/intelligence-v2.html"
    js_code = """
    (function() {
        const result = {
            pageURL: window.location.href,
            pageTitle: document.title,
            dataProvider: window.PAYD_INTEL?.DataProviderFactory ? 'Factory loaded' : 'NOT LOADED',
            activeProvider: window.PAYD_INTEL?.DataProviderFactory?.activeProviderName || 'unknown',
            localStorage: {
                keys: Object.keys(localStorage),
                paydKeys: Object.keys(localStorage).filter(k => k.toLowerCase().includes('payd') || k.toLowerCase().includes('intel') || k.toLowerCase().includes('project')),
                paydData: Object.keys(localStorage)
                    .filter(k => k.toLowerCase().includes('payd') || k.toLowerCase().includes('intel') || k.toLowerCase().includes('project'))
                    .map(k => ({ key: k, size: localStorage.getItem(k)?.length || 0, preview: (localStorage.getItem(k) || '').slice(0, 200) }))
            },
            sessionStorage: {
                keys: Object.keys(sessionStorage),
                paydKeys: Object.keys(sessionStorage).filter(k => k.toLowerCase().includes('payd') || k.toLowerCase().includes('intel') || k.toLowerCase().includes('project'))
            },
            globalState: {
                PAYD_INTEL_keys: window.PAYD_INTEL ? Object.keys(window.PAYD_INTEL) : [],
                V2Render_state: window.PAYD_INTEL?.V2Render?.getState ? window.PAYD_INTEL.V2Render.getState() : null,
                DEBUG_events: window.__PAYD_V2_DEBUG__?.events?.length || 0,
                DEBUG_recentEvents: window.__PAYD_V2_DEBUG__?.events?.slice(-5) || []
            },
            ui: {
                total: document.getElementById('payd-v2-stat-total')?.textContent,
                core: document.getElementById('payd-v2-stat-core')?.textContent,
                cards: document.querySelectorAll('.payd-v2-project-card').length,
                sectors: document.querySelectorAll('.payd-v2-sector-card').length,
                firstCardId: document.querySelector('.payd-v2-project-card')?.dataset?.projectId,
                lastCardId: Array.from(document.querySelectorAll('.payd-v2-project-card')).pop()?.dataset?.projectId
            }
        };
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
        print("[*] Waiting 5 seconds...")
        page.wait_for_timeout(5000)

        print("[*] Executing step1 diagnostic...")
        result = page.evaluate(js_code)
        browser.close()
        return result, console_messages

if __name__ == "__main__":
    result, console_messages = run_step1()

    print("\n" + "="*60)
    print("STEP1 REPORT:")
    print("="*60)
    print(json.dumps(result, ensure_ascii=False, indent=2))

    # Filter messages related to PAYD
    payd_messages = [m for m in console_messages if 'payd' in m['text'].lower() or 'PAYD' in m['text']]

    print("\n" + "="*60)
    print(f"ALL CONSOLE MESSAGES ({len(console_messages)} total):")
    print("="*60)
    for m in console_messages:
        print(f"[{m['type']}] {m['text'][:300]}")

    print("\n" + "="*60)
    print(f"PAYD-RELATED MESSAGES ({len(payd_messages)}):")
    print("="*60)
    for m in payd_messages:
        print(f"[{m['type']}] {m['text'][:500]}")

    # Group by type
    type_counts = {}
    for m in payd_messages:
        t = m['type']
        type_counts[t] = type_counts.get(t, 0) + 1
    print("\n" + "="*60)
    print("PAYD MESSAGE TYPE COUNTS:")
    print("="*60)
    print(json.dumps(type_counts, indent=2))
