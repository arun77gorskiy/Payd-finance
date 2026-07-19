import json
from playwright.sync_api import sync_playwright

def run_main_page():
    url = "https://z9pkc33iymx7.space.minimax.io/index.html"
    js_code = """
    (function() {
        const result = {
            pageURL: window.location.href,
            pageTitle: document.title,
            bodyText: document.body.innerText.slice(0, 2000),
            tokenCount: document.querySelectorAll('[class*="token"], [class*="Token"], [data-token]').length,
            projectCount: document.querySelectorAll('[class*="project"], [class*="Project"]').length,
            dataLayer: window.dataLayer ? JSON.stringify(window.dataLayer).slice(0, 500) : 'no dataLayer',
            tokenLists: Array.from(document.querySelectorAll('[id*="token"], [id*="Token"], [id*="list"]')).map(el => ({
                id: el.id,
                tag: el.tagName,
                className: el.className,
                childCount: el.children.length,
                textPreview: el.innerText?.slice(0, 200) || ''
            })).slice(0, 20),
            localStorageKeys: Object.keys(localStorage),
            localStorageData: Object.keys(localStorage).map(k => ({key: k, size: localStorage.getItem(k)?.length || 0}))
        };
        return result;
    })()
    """

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--no-sandbox', '--disable-setuid-sandbox'])
        context = browser.new_context()
        page = context.new_page()

        print(f"[*] Navigated to {url}")
        page.goto(url, wait_until='networkidle')
        print("[*] Waiting 3 seconds...")
        page.wait_for_timeout(3000)

        print("[*] Executing main page diagnostic...")
        result = page.evaluate(js_code)
        browser.close()
        return result

if __name__ == "__main__":
    result = run_main_page()
    print("\n" + "="*60)
    print("MAIN PAGE REPORT:")
    print("="*60)
    print(json.dumps(result, ensure_ascii=False, indent=2))
