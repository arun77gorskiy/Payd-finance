# PAYD Display Name Enrichment — Validation Report

**Date:** 2026-09-09
**Stage:** Phase 1 — Step 1 (Display Name Enrichment)
**Status:** ✅ PASSED

## Summary

Успешно обогащены все 354 проекта в `public/data/projects_enriched.json` человеко-читаемыми `display_name`. Оригинальное поле `name` сохранено без изменений.

## Methodology

Трёхуровневый pipeline:

1. **Curated (252 / 71.2%)** — Курируемая таблица `KNOWN_NAMES` (821 запись) для известных брендов.
   - Включает override для ticker-проектов: `1inch`, `io.net`, `USDC`, `BNB`, `API3`, `GMX`, `EOS`, `NEO`, `SUI`, `UMA`, `WAX`, `XAI`, `BOB`.
   - Включает override для проблемных `inherited` случаев: `franklin-templeton` ("benji" → "Franklin Templeton"), `mantra-dao` ("mantra" → "MANTRA DAO"), `realio-network` ("realio" → "Realio").
   - Обрабатывает CoinGecko disambiguators (`-2`, `-3`, `-4`): `avalanche-2` → "Avalanche", `aave-v3` → "Aave V3", `injective-protocol` → "Injective".

2. **Inherited (4 / 1.1%)** — Существующее `name` уже в Title Case и не содержит raw slug-паттернов.
   - Проходит жёсткую проверку: name должно содержать хотя бы одну заглавную букву, не совпадать с `id`, не совпадать с `symbol`, не быть коротким ticker-подобным словом.
   - Примеры: `apecoin` → "ApeCoin", `internet-computer` → "Internet Computer", `mintchain` → "Mintchain", `ozone-chain` → "Ozone Chain".

3. **Generated (98 / 27.7%)** — Smart slug-to-title fallback.
   - Разбивает по дефисам/подчёркиваниям
   - Сохраняет числа как есть
   - Поднимает в uppercase короткие ticker-подобные части (≤4 букв)
   - Title case для остальных

## Statistics

```
Всего проектов:                 354
С display_name:                 354 (100%)
Без display_name:               0
Дубликаты display_name:         0
display_name == name:           28  (8% — правильные имена)
display_name != name:           326 (92% — улучшены)

Источники:
  curated:                      252 (71.2%)
  generated:                    98  (27.7%)
  inherited:                    4   (1.1%)
```

## Data Integrity

| Проверка | Результат |
|---|---|
| Валидный JSON | ✅ |
| Все 354 проекта имеют `display_name` | ✅ |
| Все 354 проекта сохранили оригинальный `name` | ✅ |
| Все 61 multi-sector проектов обогащены | ✅ |
| Дубликаты display_name | ✅ 0 |
| Backup создан | ✅ `backups/projects_enriched_pre_display_name_*.json` |

## Multi-Sector Project Check

Все 61 multi-sector проект корректно обогащены (display_name одинаков для всех секторов):

| id | name (old) | display_name (new) | sectors |
|---|---|---|---|
| bitcoin | bitcoin | Bitcoin | layer1 |
| ethereum | ethereum | Ethereum | layer1 |
| bittensor | Bittensor | Bittensor | desci, ai, layer1 |
| render | render | Render | depin, ai |
| helium | helium | Helium | depin |
| akash | Akash Network | Akash Network | ai, depin |
| aethir | aethir | Aethir | ai, depin, infrastructure |
| filecoin | Filecoin | Filecoin | layer1, depin, infrastructure |

## Sector Coverage

| Сектор | Проектов | С display_name |
|---|---|---|
| defi | 47 | 47 |
| layer1 | 45 | 45 |
| rwa | 42 | 42 |
| ai | 38 | 38 |
| layer2 | 37 | 37 |
| gaming | 35 | 35 |
| infrastructure | 33 | 33 |
| depin | 33 | 33 |
| desci | 31 | 31 |
| ZK | 13 | 13 |

## Files Modified

- `public/data/projects_enriched.json` — добавлены поля `display_name`, `display_name_source`, `display_name_provenance`
- `code/enrich_display_names.py` — основной скрипт обогащения (864 строки)
- `code/verify_display_names.py` — скрипт валидации (56 строк)
- `backups/projects_enriched_pre_display_name_*.json` — резервные копии

## Known Limitations

- 4 проекта с `inherited` статусом (ApeCoin, Internet Computer, Mintchain, Ozone Chain) — все корректные, Title Case.
- 98 сгенерированных имён в основном представляют нишевые DePIN/DeSci/инфраструктурные проекты, где slug-to-title алгоритм работает корректно.
- 1 проект `ipfs` имеет несоответствие symbol (FIL — это символ Filecoin, не IPFS), но display_name="IPFS" корректен. Это потенциальная задача для Phase 1 step 4 (DefiLlama enrichment).

## Next Steps

Переход к **Phase 1 Step 2**: GitHub verified mapping (github_org/repo with provenance).
