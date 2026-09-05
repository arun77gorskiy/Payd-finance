/* =================================================================
   PAYD Finance — IntelligenceDatabase
   Хранение verified данных + historical tracking.
   ВАЖНО: historical данные никогда не перезаписываются.
   Каждый snapshot — append-only запись.
   Использует localStorage как хранилище (100% local, no external deps).
   ================================================================= */

(function (global) {
    'use strict';

    const DB_PREFIX = 'payd_db_';
    const DB_INDEX_KEY = DB_PREFIX + 'index_v1';

    const TABLES = {
        projects: 'projects',           // справочник проектов + token identifiers
        snapshots: 'snapshots',         // Intelligence Snapshots (по дате обновления)
        score_history: 'score_history', // история score'ов (payd/conviction/alpha)
        label_events: 'label_events',   // события лейблов (promotion/demotion)
        market_history: 'market_history',
        defi_history: 'defi_history',
        unlocks_history: 'unlocks_history',
        github_history: 'github_history',
        raw_responses: 'raw_responses', // сырые ответы API
        discrepancies: 'discrepancies', // лог расхождений
    };

    const MAX_SNAPSHOTS_PER_PROJECT = 100;
    const MAX_RAW_RESPONSES = 500;
    const MAX_SCORE_HISTORY_PER_PROJECT = 200;

    class IntelligenceDatabase {
        constructor() {
            this._index = this._loadIndex();
        }

        // ===== Index management =====

        _loadIndex() {
            try {
                return JSON.parse(localStorage.getItem(DB_INDEX_KEY) || '{}');
            } catch (e) { return {}; }
        }

        _saveIndex() {
            try { localStorage.setItem(DB_INDEX_KEY, JSON.stringify(this._index)); }
            catch (e) { /* quota */ }
        }

        _tableKey(table, id) {
            return DB_PREFIX + table + ':' + id;
        }

        _getTableKey(table) {
            return DB_PREFIX + 'table:' + table;
        }

        _readTableIds(table) {
            try {
                const raw = localStorage.getItem(this._getTableKey(table));
                return raw ? JSON.parse(raw) : [];
            } catch (e) { return []; }
        }

        _writeTableIds(table, ids) {
            try {
                localStorage.setItem(this._getTableKey(table), JSON.stringify(ids));
            } catch (e) { /* quota */ }
        }

        // ===== Generic CRUD =====

        _insert(table, id, record) {
            const key = this._tableKey(table, id);
            try {
                localStorage.setItem(key, JSON.stringify(record));
                const ids = this._readTableIds(table);
                if (!ids.includes(id)) {
                    ids.push(id);
                    this._writeTableIds(table, ids);
                }
                this._index[key] = { table, id, timestamp: Date.now() };
                this._saveIndex();
                return true;
            } catch (e) {
                this._evictOldest(table);
                try {
                    localStorage.setItem(key, JSON.stringify(record));
                    return true;
                } catch (e2) { return false; }
            }
        }

        _get(table, id) {
            try {
                const raw = localStorage.getItem(this._tableKey(table, id));
                return raw ? JSON.parse(raw) : null;
            } catch (e) { return null; }
        }

        _append(table, id, record) {
            // Append-only: никогда не перезаписывает
            return this._insert(table, id, record);
        }

        _evictOldest(table) {
            const ids = this._readTableIds(table);
            if (ids.length === 0) return;
            // Удаляем самые старые записи (по timestamp в record)
            const records = ids.map(id => ({ id, rec: this._get(table, id) }))
                .filter(x => x.rec)
                .sort((a, b) => (a.rec.timestamp || 0) - (b.rec.timestamp || 0));
            const toRemove = Math.max(1, Math.floor(records.length * 0.1));
            for (let i = 0; i < toRemove; i++) {
                const r = records[i];
                localStorage.removeItem(this._tableKey(table, r.id));
                const idx = ids.indexOf(r.id);
                if (idx >= 0) ids.splice(idx, 1);
            }
            this._writeTableIds(table, ids);
        }

        // ===== Projects (registry) =====

        saveProject(projectMeta) {
            const id = projectMeta.id || projectMeta.coinId || projectMeta.symbol;
            if (!id) return false;
            const record = {
                id,
                ...projectMeta,
                timestamp: Date.now(),
                updatedAt: new Date().toISOString(),
            };
            return this._insert(TABLES.projects, id, record);
        }

        getProject(id) {
            return this._get(TABLES.projects, id);
        }

        getAllProjects() {
            const ids = this._readTableIds(TABLES.projects);
            return ids.map(id => this._get(TABLES.projects, id)).filter(Boolean);
        }

        // ===== Intelligence Snapshots =====

        /**
         * Сохраняет Intelligence Snapshot для проекта.
         * Append-only: каждый запуск scheduler добавляет новую запись.
         * @param {string} projectId
         * @param {Object} snapshot — полные verified данные + paidScore
         * @returns {string} snapshotId
         */
        saveSnapshot(projectId, snapshot) {
            const timestamp = Date.now();
            const dateStr = new Date(timestamp).toISOString().slice(0, 10);
            const snapshotId = `${projectId}_${timestamp}`;
            const record = {
                id: snapshotId,
                projectId,
                timestamp,
                date: dateStr,
                runId: snapshot.runId || null,
                schedulerRun: snapshot.schedulerRun || null,
                data: snapshot, // полные verified данные
                paidScore: snapshot.paidScore || null,
                confidence: this._computeOverallConfidence(snapshot),
                sources: this._collectSources(snapshot),
            };
            this._append(TABLES.snapshots, snapshotId, record);

            // Ограничиваем количество snapshots на проект
            this._pruneSnapshots(projectId);
            return snapshotId;
        }

        _pruneSnapshots(projectId) {
            const ids = this._readTableIds(TABLES.snapshots);
            const projectSnapshots = ids
                .map(id => ({ id, rec: this._get(TABLES.snapshots, id) }))
                .filter(x => x.rec && x.rec.projectId === projectId)
                .sort((a, b) => a.rec.timestamp - b.rec.timestamp);

            if (projectSnapshots.length > MAX_SNAPSHOTS_PER_PROJECT) {
                const toRemove = projectSnapshots.length - MAX_SNAPSHOTS_PER_PROJECT;
                for (let i = 0; i < toRemove; i++) {
                    localStorage.removeItem(this._tableKey(TABLES.snapshots, projectSnapshots[i].id));
                }
            }
        }

        /**
         * Возвращает последний snapshot проекта.
         */
        getLatestSnapshot(projectId) {
            const ids = this._readTableIds(TABLES.snapshots);
            const projectSnapshots = ids
                .map(id => ({ id, rec: this._get(TABLES.snapshots, id) }))
                .filter(x => x.rec && x.rec.projectId === projectId)
                .sort((a, b) => b.rec.timestamp - a.rec.timestamp);
            return projectSnapshots.length > 0 ? projectSnapshots[0].rec : null;
        }

        /**
         * Возвращает предыдущий snapshot (для отображения изменений).
         */
        getPreviousSnapshot(projectId) {
            const ids = this._readTableIds(TABLES.snapshots);
            const projectSnapshots = ids
                .map(id => ({ id, rec: this._get(TABLES.snapshots, id) }))
                .filter(x => x.rec && x.rec.projectId === projectId)
                .sort((a, b) => b.rec.timestamp - a.rec.timestamp);
            return projectSnapshots.length > 1 ? projectSnapshots[1].rec : null;
        }

        /**
         * Возвращает N последних snapshots проекта (для historical tracking).
         */
        getHistoricalSnapshots(projectId, limit = 20) {
            const ids = this._readTableIds(TABLES.snapshots);
            return ids
                .map(id => ({ id, rec: this._get(TABLES.snapshots, id) }))
                .filter(x => x.rec && x.rec.projectId === projectId)
                .sort((a, b) => b.rec.timestamp - a.rec.timestamp)
                .slice(0, limit)
                .map(x => x.rec);
        }

        // ===== Historical tracking per field =====

        /**
         * Записать историческое значение для конкретного поля.
         * Например: market.marketCap, defi.tvl, github.commits
         */
        recordHistorical(category, projectId, fieldName, verifiedValue) {
            const historyTable = TABLES[category + '_history'];
            if (!historyTable) return false;

            const recordId = `${projectId}_${fieldName}_${Date.now()}`;
            const record = {
                id: recordId,
                projectId,
                field: fieldName,
                category,
                value: verifiedValue.value,
                source: verifiedValue.source,
                confidence: verifiedValue.confidence,
                timestamp: verifiedValue.timestamp || Date.now(),
                date: new Date(verifiedValue.timestamp || Date.now()).toISOString(),
            };
            return this._append(historyTable, recordId, record);
        }

        /**
         * Получить историю конкретного поля за N дней.
         */
        getHistorical(category, projectId, fieldName, days = 30) {
            const historyTable = TABLES[category + '_history'];
            if (!historyTable) return [];
            const ids = this._readTableIds(historyTable);
            const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
            return ids
                .map(id => ({ id, rec: this._get(historyTable, id) }))
                .filter(x => x.rec && x.rec.projectId === projectId && x.rec.field === fieldName && x.rec.timestamp >= cutoff)
                .sort((a, b) => a.rec.timestamp - b.rec.timestamp)
                .map(x => x.rec);
        }

        // ===== Raw API responses (для аудита) =====

        saveRawResponse(provider, endpoint, params, rawData) {
            const recordId = `${provider}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const record = {
                id: recordId,
                provider,
                endpoint,
                params,
                data: rawData,
                timestamp: Date.now(),
                date: new Date().toISOString(),
            };
            const ok = this._append(TABLES.raw_responses, recordId, record);

            // Лимит raw_responses
            const ids = this._readTableIds(TABLES.raw_responses);
            if (ids.length > MAX_RAW_RESPONSES) {
                const all = ids.map(id => ({ id, rec: this._get(TABLES.raw_responses, id) }))
                    .filter(x => x.rec)
                    .sort((a, b) => a.rec.timestamp - b.rec.timestamp);
                const toRemove = all.length - MAX_RAW_RESPONSES;
                for (let i = 0; i < toRemove; i++) {
                    localStorage.removeItem(this._tableKey(TABLES.raw_responses, all[i].id));
                }
            }
            return ok;
        }

        getRawResponses(provider, limit = 20) {
            const ids = this._readTableIds(TABLES.raw_responses);
            return ids
                .map(id => ({ id, rec: this._get(TABLES.raw_responses, id) }))
                .filter(x => x.rec && (!provider || x.rec.provider === provider))
                .sort((a, b) => b.rec.timestamp - a.rec.timestamp)
                .slice(0, limit)
                .map(x => x.rec);
        }

        // ===== Discrepancies log =====

        saveDiscrepancy(discrepancy) {
            const recordId = `disc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const record = { id: recordId, ...discrepancy, timestamp: Date.now() };
            return this._append(TABLES.discrepancies, recordId, record);
        }

        getDiscrepancies(limit = 50) {
            const ids = this._readTableIds(TABLES.discrepancies);
            return ids
                .map(id => ({ id, rec: this._get(TABLES.discrepancies, id) }))
                .filter(x => x.rec)
                .sort((a, b) => b.rec.timestamp - a.rec.timestamp)
                .slice(0, limit)
                .map(x => x.rec);
        }

        // ===== Score History (payd/conviction/alpha/discovery) =====

        /**
         * Сохранить score snapshot для проекта.
         * @param {string} projectId
         * @param {string} engineName — 'payd' | 'conviction' | 'alpha' | 'discovery'
         * @param {Object} scoreResult — { value, breakdown, classification, explanation, confidence, confidenceScore }
         * @param {Object} [meta] — дополнительные метаданные (runId, trigger)
         * @returns {string} recordId
         */
        addScoreSnapshot(projectId, engineName, scoreResult, meta = {}) {
            if (!projectId || !engineName || !scoreResult) return null;
            const recordId = `${projectId}_${engineName}_${Date.now()}`;
            const record = {
                id: recordId,
                projectId,
                engine: engineName,
                value: scoreResult.value,
                breakdown: scoreResult.breakdown || {},
                classification: scoreResult.classification || null,
                explanation: scoreResult.explanation || '',
                confidence: scoreResult.confidence || 'medium',
                confidenceScore: scoreResult.confidenceScore || 50,
                sources: scoreResult.sources || [],
                labels: scoreResult.labels || null,
                events: scoreResult.events || null,
                opportunityScore: scoreResult.opportunityScore || null,
                runId: meta.runId || null,
                trigger: meta.trigger || null,
                timestamp: Date.now(),
                date: new Date().toISOString(),
            };
            const ok = this._append(TABLES.score_history, recordId, record);
            if (!ok) return null;
            this._pruneScoreHistory(projectId);
            return recordId;
        }

        /**
         * Bulk: сохранить все 4 score результата за один проход.
         * @param {string} projectId
         * @param {Object} scores — { payd, conviction, alpha, discovery }
         * @param {Object} [meta]
         */
        addScoreSnapshots(projectId, scores, meta = {}) {
            const ids = {};
            for (const engine in scores) {
                if (!scores[engine]) continue;
                const id = this.addScoreSnapshot(projectId, engine, scores[engine], meta);
                if (id) ids[engine] = id;

                // Если есть events (promotion/demotion) — логируем
                if (scores[engine].events && Array.isArray(scores[engine].events)) {
                    for (const evt of scores[engine].events) {
                        this._recordLabelEvent(projectId, engine, evt);
                    }
                }
            }
            return ids;
        }

        /**
         * Записать событие лейбла (promotion/demotion/milestone).
         */
        _recordLabelEvent(projectId, engine, event) {
            const recordId = `evt_${projectId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const record = {
                id: recordId,
                projectId,
                engine,
                type: event.type,
                from: event.from || null,
                to: event.to || null,
                threshold: event.threshold || null,
                delta: event.delta || null,
                timestamp: event.timestamp || Date.now(),
            };
            return this._append(TABLES.label_events, recordId, record);
        }

        /**
         * Получить историю score'ов по проекту и движку.
         * @param {string} projectId
         * @param {string} [engineName] — если не указан, вернёт все engines
         * @param {number} [limit=50]
         */
        getScoreHistory(projectId, engineName = null, limit = 50) {
            const ids = this._readTableIds(TABLES.score_history);
            return ids
                .map(id => ({ id, rec: this._get(TABLES.score_history, id) }))
                .filter(x => x.rec
                    && x.rec.projectId === projectId
                    && (!engineName || x.rec.engine === engineName))
                .sort((a, b) => a.rec.timestamp - b.rec.timestamp)
                .slice(-limit)
                .map(x => x.rec);
        }

        /**
         * Получить последний score по движку.
         */
        getLatestScore(projectId, engineName) {
            const history = this.getScoreHistory(projectId, engineName, 1);
            return history.length > 0 ? history[history.length - 1] : null;
        }

        /**
         * Получить все последние scores проекта (по 1 на engine).
         */
        getLatestScores(projectId) {
            const engines = ['payd', 'conviction', 'alpha', 'discovery'];
            const out = {};
            for (const e of engines) {
                const latest = this.getLatestScore(projectId, e);
                if (latest) out[e] = latest;
            }
            return out;
        }

        /**
         * Сравнить два последних snapshot'а — вычислить дельты.
         */
        compareLatestSnapshots(projectId) {
            const ids = this._readTableIds(TABLES.score_history);
            const projectScores = ids
                .map(id => ({ id, rec: this._get(TABLES.score_history, id) }))
                .filter(x => x.rec && x.rec.projectId === projectId)
                .sort((a, b) => b.rec.timestamp - a.rec.timestamp);

            if (projectScores.length < 2) {
                return { hasComparison: false };
            }

            const current = projectScores[0].rec;
            const previous = projectScores[1].rec;
            const delta = current.value - previous.value;

            return {
                hasComparison: true,
                current,
                previous,
                delta,
                deltaPct: previous.value !== 0 ? (delta / previous.value) * 100 : 0,
                timeDeltaMs: current.timestamp - previous.timestamp,
            };
        }

        /**
         * События лейблов (promotion/demotion/milestone).
         */
        getLabelEvents(projectId = null, limit = 50) {
            const ids = this._readTableIds(TABLES.label_events);
            return ids
                .map(id => ({ id, rec: this._get(TABLES.label_events, id) }))
                .filter(x => x.rec && (!projectId || x.rec.projectId === projectId))
                .sort((a, b) => b.rec.timestamp - a.rec.timestamp)
                .slice(0, limit)
                .map(x => x.rec);
        }

        _pruneScoreHistory(projectId) {
            const ids = this._readTableIds(TABLES.score_history);
            const projectScores = ids
                .map(id => ({ id, rec: this._get(TABLES.score_history, id) }))
                .filter(x => x.rec && x.rec.projectId === projectId)
                .sort((a, b) => a.rec.timestamp - b.rec.timestamp);

            if (projectScores.length > MAX_SCORE_HISTORY_PER_PROJECT) {
                const toRemove = projectScores.length - MAX_SCORE_HISTORY_PER_PROJECT;
                for (let i = 0; i < toRemove; i++) {
                    localStorage.removeItem(this._tableKey(TABLES.score_history, projectScores[i].id));
                }
            }
        }

        // ===== Utilities =====

        _computeOverallConfidence(snapshot) {
            const fields = [];
            const collect = (obj) => {
                if (!obj || typeof obj !== 'object') return;
                if (obj.confidence) fields.push(obj.confidence);
                for (const k of Object.keys(obj)) {
                    if (typeof obj[k] === 'object' && obj[k] !== null) collect(obj[k]);
                }
            };
            collect(snapshot);
            if (fields.length === 0) return 'none';
            const high = fields.filter(c => c === 'high').length;
            const ratio = high / fields.length;
            if (ratio >= 0.7) return 'high';
            if (ratio >= 0.4) return 'medium';
            return 'low';
        }

        _collectSources(snapshot) {
            const sources = new Set();
            const collect = (obj) => {
                if (!obj || typeof obj !== 'object') return;
                if (obj.source && obj.source !== 'unknown' && obj.source !== 'none') {
                    sources.add(obj.source);
                }
                for (const k of Object.keys(obj)) {
                    if (typeof obj[k] === 'object' && obj[k] !== null) collect(obj[k]);
                }
            };
            collect(snapshot);
            return Array.from(sources);
        }

        // ===== Stats / housekeeping =====

        getStats() {
            const tables = Object.values(TABLES);
            const stats = {};
            for (const t of tables) {
                const ids = this._readTableIds(t);
                stats[t] = ids.length;
            }
            return { tables: stats, totalKeys: Object.keys(this._index).length };
        }

        clearAll() {
            try {
                Object.keys(this._index).forEach(k => localStorage.removeItem(k));
                this._index = {};
                this._saveIndex();
                Object.values(TABLES).forEach(t => {
                    try { localStorage.removeItem(this._getTableKey(t)); } catch (e) {}
                });
            } catch (e) {}
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.IntelligenceDatabase = IntelligenceDatabase;

})(window);
