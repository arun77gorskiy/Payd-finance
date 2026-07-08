# Console Logs from https://2e9e3ettxw9n.space.minimax.io/#edu/trading-lab/0

## ⚠️ ВАЖНО: Инструмент `get_page_consoles` возвращает только первые 20 записей.
Все логи после STEP 4a обрезаны и недоступны через стандартный API.

## Все полученные логи (20 из ~28+ ожидаемых):

| # | Type | Message | Timestamp |
|---|------|---------|-----------|
| 1 | console.log | [edu-nav-delegate] обработчик зарегистрирован (capture) | 2026-07-07T22:24:06.706Z |
| 2 | console.log | [RealHistoricalData] Загружено 48 реальных исторических сегментов (9600 свечей) с 8 символов | 2026-07-07T22:24:07.180Z |
| 3 | console.log | [ScenarioLibrary] Загрузка реальных данных завершена: 140/140 сценариев имеют реальные исторические свечи, не удалось: 0 | 2026-07-07T22:24:07.203Z |
| 4 | console.log | [ScenarioLibrary] Использовано уникальных сегментов: 38 / распределение: [object Object] | 2026-07-07T22:24:07.204Z |
| 5 | console.log | [ScenarioLibrary] Загружено сценариев: 140 | 2026-07-07T22:24:07.204Z |
| 6 | console.log | [ScenarioLibrary] По категориям: [object Object] | 2026-07-07T22:24:07.204Z |
| 7 | console.log | [ScenarioProgress] Tracker загружен. | 2026-07-07T22:24:07.206Z |
| 8 | console.log | [switchEduTab] tabName= how-it-works | 2026-07-07T22:24:07.793Z |
| 9 | console.log | [switchEduTab] scrollIntoView вызван для edu-content-how-it-works | 2026-07-07T22:24:07.885Z |
| 10 | console.log | [openTradingLab] moduleIndex= 0 | 2026-07-07T22:24:40.756Z |
| 11 | console.log | [switchEduTab] tabName= trading-lab | 2026-07-07T22:24:40.758Z |
| 12 | console.log | [switchEduTab] scrollIntoView вызван для edu-content-trading-lab | 2026-07-07T22:24:40.800Z |
| 13 | console.log | **[LabTrainer] mount() ВХОД, containerId=module-terminal-mount** | 2026-07-07T22:24:41.158Z |
| 14 | console.log | **[LabTrainer] mount() STEP 1 done** | 2026-07-07T22:24:41.180Z |
| 15 | console.log | **[LabTrainer] mount() STEP 2 done, container=module-terminal-mount** | 2026-07-07T22:24:41.180Z |
| 16 | console.log | **[LabTrainer] mount() STEP 3a: about to await ensureLightweightCharts()** | 2026-07-07T22:24:41.180Z |
| 17 | console.log | [LabTrainer] start() ВХОД, moduleIndex=0, mounted=false | 2026-07-07T22:24:41.182Z |
| 18 | console.log | **[LabTrainer] mount() STEP 3b: ensureLightweightCharts() resolved** | 2026-07-07T22:24:41.309Z |
| 19 | console.log | **[LabTrainer] mount() STEP 3 done** | 2026-07-07T22:24:41.309Z |
| 20 | console.log | **[LabTrainer] mount() STEP 4a: _renderShell()** | 2026-07-07T22:24:41.309Z |

## Искомые логи, которые должны быть дальше (но НЕ ВИДНЫ из-за лимита в 20):
- [LabTrainer] mount() STEP 4b (предположительно)
- [LabTrainer] _bindUIEvents
- [LabTrainer] mount() ЗАВЕРШЕН

## Подтверждение работы UI:
Скриншот показывает, что LabTrainer UI полностью отрендерен:
- BTC/USDT график с свечами виден
- Pin Bar (Бычий пин-бар) сигнал отображается
- Все контролы (Long/Short/Wait/No Trade, Подтвердить решение, Дальше, Сброс) видны
- Панель "Trading Position" справа
- Это значит, что mount() ЗАВЕРШЕН успешно выполнился, но лог обрезан лимитом API

## Состояние страницы (визуальный анализ):
- Тема: тёмная, профессиональная
- URL: https://2e9e3ettxw9n.space.minimax.io/#edu/trading-lab/0
- Заголовок страницы: "PAYD FINANCE | AI Crypto Trading & Education"
- Модуль: Module 1 — "Почему уровень сам по себе ничего не значит"
- Статус: "LIVE", "INTERMEDIATE"
- Сигнал: "Bullish Pin Bar"
- Ценовой диапазон: ~78,400 до 81,200 USDT
- Ошибок или состояний загрузки не видно