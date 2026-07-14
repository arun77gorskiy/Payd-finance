# PAYD Intelligence Platform — Supabase Migration

## Completed: 2026-07-14

### Что сделано
1. ✅ Восстановлен Supabase проект `fugfylbifzgqupayxzyr` (был INACTIVE → ACTIVE_HEALTHY)
2. ✅ Создана схема БД (10 таблиц): projects, snapshots, score_history, label_events, market_history, defi_history, unlocks_history, github_history, raw_responses, discrepancies
3. ✅ RLS policies: public read + public write (для MVP)
4. ✅ Создан `IntelligenceDatabaseSupabase.js` — обёртка с тем же API, async read-методами
5. ✅ Интегрирован в `bootstrap.js` (используется Supabase версия если доступна)
6. ✅ `_renderAlphaScores` и `renderScoresBlock` стали async
7. ✅ Засеяны 4 demo-проекта: RENDER, AKT, TAO, FIL
8. ✅ Засеяны 80 score snapshots (4 projects × 4 engines × 5 weekly snapshots)
9. ✅ Деплой + smoke-тест: URL https://vmor4wrms73x.space.minimax.io

### Supabase credentials (env)
- SUPABASE_URL=https://fugfylbifzgqupayxzyr.supabase.co
- SUPABASE_PROJECT_ID=fugfylbifzgqupayxzyr
- SUPABASE_ACCESS_TOKEN=sbp_oauth_8909625f4759809a3c99d93551ed67b8773ca03a
- ANON_KEY: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ1Z2Z5bGJpZnpncXVwYXl4enlyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkwMjc3MjcsImV4cCI6MjA5NDYwMzcyN30.Hhi8EE2Ka4VYAbSLof-BpXp3HIT_snujzHGHzMgZKKU

### Deploy URL
https://vmor4wrms73x.space.minimax.io

### Структура score_history
- RENDER: payd 88, conviction 87, alpha 87, discovery 87 (high conf)
- AKT: payd 85, conviction 86, alpha 87, discovery 85
- TAO: payd 92, conviction 92, alpha 95, discovery 93 (exceptional alpha)
- FIL: payd 80, conviction 80, alpha 71, discovery 79 (declining alpha)

### Файлы
- /workspace/public/js/intelligence/database/IntelligenceDatabaseSupabase.js (NEW)
- /workspace/public/js/intelligence/services/bootstrap.js (MODIFIED)
- /workspace/public/js/intelligence/intelligence-render.js (MODIFIED — async)
- /workspace/public/js/intelligence/intelligence-alpha-render.js (MODIFIED — async)
- /workspace/public/index.html (MODIFIED — добавлен script tag)
