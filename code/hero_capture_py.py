#!/usr/bin/env python3
"""
Захват трёх скриншотов элемента #payd-hero-3d для разных моментов анимации.

Стратегия: для каждого кадра перезагружаем страницу, ждём готовности,
вызываем window.__forceRender(n) и затем сохраняем bounding box.
"""
import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright, TimeoutError as PWTimeout

URL = "https://pnz0g46p7ivf.space.minimax.io"

CLIP = {
    "x": 745,
    "y": 129,
    "width": 582,
    "height": 460,
}

# (forceRender index, имя файла)
FRAMES = [
    (8,  "hero_frame_8s.png"),
    (11, "hero_frame_11s.png"),
    (2,  "hero_frame_2s.png"),
]

OUT_DIR = Path("/workspace/code/hero_screenshots")
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Каждый кадр захватываем на свежей странице
NAV_TIMEOUT = 180_000   # 180 сек на навигацию
READY_WAIT = 9          # 9 сек — прогрев после загрузки
FORCE_TIMEOUT = 60_000  # 60 сек на __forceRender
SHOT_TIMEOUT = 240_000  # 240 сек на скриншот (тяжёлая 3D-анимация)
RETRIES = 2             # количество повторов при ошибке


def capture_frame(p, n: int, out_path: Path) -> bool:
    """Создаём свежую страницу, рендерим кадр n и сохраняем скриншот."""
    chromium_path = p.chromium.executable_path
    browser = p.chromium.launch(
        executable_path=chromium_path,
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--disable-gpu",
            "--use-gl=swiftshader",
            "--disable-features=VizDisplayCompositor",
        ],
    )
    try:
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=1,
        )
        page = context.new_page()
        page.set_default_navigation_timeout(NAV_TIMEOUT)
        page.set_default_timeout(SHOT_TIMEOUT)

        last_err = None
        for attempt in range(1, RETRIES + 2):  # первая попытка + RETRIES повторов
            try:
                print(f"  [ATTEMPT {attempt}] Переход на {URL}")
                try:
                    page.goto(URL, wait_until="domcontentloaded",
                              timeout=NAV_TIMEOUT)
                except PWTimeout as e:
                    print(f"  [WARN] goto timeout: {e}")

                # Прокрутка наверх
                page.evaluate("() => window.scrollTo(0, 0)")

                # Ожидание прикрепления элемента
                print(f"  [ATTEMPT {attempt}] Ожидание #payd-hero-3d")
                page.wait_for_selector("#payd-hero-3d", state="attached",
                                       timeout=NAV_TIMEOUT)

                # Прогрев анимации
                print(f"  [ATTEMPT {attempt}] Прогрев {READY_WAIT}с")
                time.sleep(READY_WAIT)

                # Проверка функции
                ok = page.evaluate("() => typeof window.__forceRender === 'function'")
                print(f"  [ATTEMPT {attempt}] __forceRender доступна: {ok}")
                if not ok:
                    raise RuntimeError("window.__forceRender is not a function")

                # Вызов рендера кадра
                print(f"  [ATTEMPT {attempt}] window.__forceRender({n})")
                page.evaluate(f"() => window.__forceRender({n})")
                time.sleep(1.5)

                # Скриншот bounding box
                print(f"  [ATTEMPT {attempt}] screenshot -> {out_path.name}")
                page.screenshot(
                    path=str(out_path),
                    clip=CLIP,
                    timeout=SHOT_TIMEOUT,
                    animations="disabled",
                    caret="initial",
                )
                size = out_path.stat().st_size
                print(f"  [OK] {out_path} сохранён ({size} байт)")
                return True

            except Exception as e:
                last_err = e
                print(f"  [WARN] attempt {attempt} провалился: {e}")
                try:
                    page.reload(wait_until="domcontentloaded", timeout=NAV_TIMEOUT)
                except Exception:
                    pass
                time.sleep(2)

        print(f"  [ERROR] Все попытки исчерпаны. Последняя ошибка: {last_err}",
              file=sys.stderr)
        return False

    finally:
        browser.close()


def main() -> int:
    with sync_playwright() as p:
        chromium_path = p.chromium.executable_path
        print(f"[INFO] Chromium executable: {chromium_path}")
        if not Path(chromium_path).exists():
            print(f"[ERROR] Браузер не найден: {chromium_path}", file=sys.stderr)
            return 1

        success_count = 0
        for n, filename in FRAMES:
            out_path = OUT_DIR / filename
            print(f"\n[FRAME] === {n}с -> {filename} ===")
            if capture_frame(p, n, out_path):
                success_count += 1

        print(f"\n[DONE] Успешно захвачено {success_count}/{len(FRAMES)} кадров")
        return 0 if success_count == len(FRAMES) else 2


if __name__ == "__main__":
    sys.exit(main())