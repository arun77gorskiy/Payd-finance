# PAYD Intelligence V2 — RWA Sector + Mapping Fix (2026-07-20)

## Завершённые задачи
- ✅ Создан централизованный FIELD_MAPPING v2.0 в `public/js/intelligence/intelligence-data.js`
- ✅ Реализована автоматическая адаптация V2 → V1 (22 поля)
- ✅ Финансовые метрики → null = "Unavailable" в UI
- ✅ RWA сектор расширен с ~36 до 46 проектов
- ✅ Добавлены: ONDO, MKR, Centrifuge, Maple, Goldfinch, Clearpool, Plume, OpenEden, Backed Finance, Hashnote, Superstate, Ethena, BENJI, BKN, BPRO, FASSET, LNDX, LOFTY, MCO2, JCA, CREDIT, DGX, EL, KLIMA и др.

## Исправлен баг с дубликатами тикеров
**Проблема:** Проекты 'tao' и 'bittensor' имели одинаковый symbol 'TAO'. 
При сборке словаря `projects[ticker]` второй перезаписывал первый, 
и проект 'tao' (имеющий реальные оценки в score_history) терял данные.

**Решение в `buildProjectsDict()`:**
- Группируем V1-проекты по тикеру
- При конфликте ищем проект, у которого есть `_v2_source.id` в `scoresByProjectId`
- Если такой есть — оставляем его, остальные логируются как пропущенные
- Если ни у одного нет скоров — берём первый по порядку

**Результат логирования:**
```
[intelligence-data] Ticker conflict for "TAO": keeping "tao" (has real scores); skipping ["bittensor"]
```
TAO теперь: payd_score=88, alpha_score=92.

## Обнаружены и обработаны 12 других конфликтов тикеров:
AKT, MOR, LYRA, FIL, GENE, APE, GFI, IMX, MINT, ICP, MINA, POLY

## Проблема с деплоем
Деплой тайм-аутится (5.3 МБ index.html + 16 МБ всего).
Локальная проверка прошла успешно.

## Файлы изменены
- `public/js/intelligence/intelligence-data.js` — FIELD_MAPPING + ticker conflict resolution
- `public/data/projects.json` — RWA сектор расширен

## Тестирование
Все тесты прошли. TAO получает реальные оценки. RWA содержит 46 проектов.
