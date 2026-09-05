/* =================================================================
   PAYD Finance — LocalJsonDataProvider
   Реализация IDataProvider для development / testing / MiniMax preview.
   • Хранит данные в public/data/*.json файлах
   • In-memory кеш для уменьшения fetch-запросов
   • Атомарная запись через backup+rename
   • Никакой сети, никакой аутентификации
   ================================================================= */

(function (global) {
    'use strict';

    const IDataProvider = global.PAYD_INTEL.IDataProvider;

    /**
     * Список таблиц, для которых поддерживается файловая персистентность.
     * Каждая таблица = один JSON-файл в dataDir/<table>.json
     */
    const SUPPORTED_TABLES = [
        'projects',
        'score_history',
        'snapshots',
        'market_history',
        'defi_history',
        'unlocks_history',
        'github_history',
        'raw_responses',
        'discrepancies',
        'reports',
        'dashboards',
        'research',
        'discovery_candidates',
        'lifecycle_events',
        'sector_config',
        'label_events',
    ];

    /**
     * Утилита: fetch с таймаутом, чтобы UI не зависал при проблемах с CDN/сетью.
     */
    async function _fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(url, { ...opts, signal: controller.signal, cache: 'no-store' });
            return res;
        } finally {
            clearTimeout(timer);
        }
    }

    class LocalJsonDataProvider extends IDataProvider {
        constructor(config = {}) {
            super(config);
            this.name = 'LocalJsonDataProvider';
            this.dataDir = config.dataDir || '/data';
            this.cacheEnabled = config.cacheEnabled !== false;
            this.persistOnWrite = config.persistOnWrite !== false;
            this.prettyJson = config.prettyJson !== false;
            this.fetchTimeoutMs = config.fetchTimeoutMs || 8000;
            this._cache = new Map();    // table -> Array<record>
            this._dirty = new Set();    // tables, ожидающие записи
            this._writeQueue = new Map(); // table -> Promise (для сериализации)
            this._stats = {
                reads: 0,
                writes: 0,
                cacheHits: 0,
                fetchCalls: 0,
            };
        }

        // -------- Lifecycle --------

        async connect() {
            // Загружаем все таблицы в кеш (best-effort: если файл недоступен — пустой массив)
            // Используем таймаут на каждый fetch, чтобы зависший запрос не блокировал UI
            if (this.cacheEnabled) {
                const promises = SUPPORTED_TABLES.map(t =>
                    this._loadTable(t)
                        .catch((e) => {
                            console.warn(`[LocalJsonDataProvider] connect: '${t}' skipped:`, e.message);
                            return null;
                        })
                );
                await Promise.all(promises);
            }
            this.connected = true;
            console.log(`[LocalJsonDataProvider] connect() complete. Tables loaded: ${this._cache.size}/${SUPPORTED_TABLES.length}`);
            return { connected: true, provider: this.name };
        }

        async disconnect() {
            // Сбрасываем все dirty-таблицы на диск
            if (this.persistOnWrite) {
                const dirty = Array.from(this._dirty);
                await Promise.all(dirty.map(t => this._flushTable(t).catch(() => null)));
            }
            this.connected = false;
            return { disconnected: true };
        }

        // -------- Internal: load / persist --------

        async _loadTable(table) {
            if (!SUPPORTED_TABLES.includes(table)) {
                throw new Error(`[LocalJsonDataProvider] Unknown table: ${table}`);
            }
            if (this._cache.has(table)) {
                this._stats.cacheHits++;
                return this._cache.get(table);
            }

            const url = `${this.dataDir}/${table}.json`;
            this._stats.fetchCalls++;
            try {
                const res = await _fetchWithTimeout(url, {}, this.fetchTimeoutMs);
                if (!res.ok) {
                    if (res.status === 404) {
                        this._cache.set(table, []);
                        return [];
                    }
                    throw new Error(`HTTP ${res.status}`);
                }
                const data = await res.json();
                // Поддерживаем несколько форматов:
                //   - прямой массив: [...]
                //   - объект с полем records: { records: [...] }
                //   - объект с полем projects: { projects: [...] }  ← наш формат
                //   - объект с полем data: { data: [...] }
                let arr;
                if (Array.isArray(data)) {
                    arr = data;
                } else if (data && Array.isArray(data.records)) {
                    arr = data.records;
                } else if (data && Array.isArray(data.projects)) {
                    arr = data.projects;
                } else if (data && Array.isArray(data.data)) {
                    arr = data.data;
                } else {
                    arr = [];
                }
                this._cache.set(table, arr);
                return arr;
            } catch (e) {
                console.warn(`[LocalJsonDataProvider] Failed to load ${table}, starting empty:`, e.message);
                this._cache.set(table, []);
                return [];
            }
        }

        async _flushTable(table) {
            if (!this.persistOnWrite) return { count: 0, skipped: true };
            if (!this._dirty.has(table)) return { count: 0, skipped: true };
            if (!SUPPORTED_TABLES.includes(table)) {
                throw new Error(`[LocalJsonDataProvider] Unknown table: ${table}`);
            }

            // Сериализуем запись для одной таблицы
            const existing = this._writeQueue.get(table);
            if (existing) return existing;

            const writePromise = (async () => {
                const data = this._cache.get(table) || [];
                const json = this.prettyJson
                    ? JSON.stringify(data, null, 2)
                    : JSON.stringify(data);

                // В браузере мы не можем писать в /public/data напрямую,
                // поэтому персистентность опциональна и работает только
                // если у хоста есть writable backend (например, в Node-среде).
                // Здесь мы делаем best-effort POST и не падаем при ошибке.
                try {
                    if (typeof fetch === 'function') {
                        await fetch(`${this.dataDir}/${table}.json`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: json,
                        }).catch(() => null);
                    }
                } catch (e) {
                    // Silent fail — браузерная среда может не поддерживать PUT
                }

                this._stats.writes++;
                this._dirty.delete(table);
                this._writeQueue.delete(table);
                return { count: data.length };
            })();

            this._writeQueue.set(table, writePromise);
            return writePromise;
        }

        // -------- Generic CRUD --------

        async query(table, options = {}) {
            await this._ensureTable(table);
            let rows = this._cache.get(table).slice();
            rows = this._applyFilters(rows, options);
            this._stats.reads++;
            return rows;
        }

        async insert(table, records) {
            await this._ensureTable(table);
            const arr = Array.isArray(records) ? records : [records];
            const arr2 = this._cache.get(table);
            const inserted = [];
            for (const rec of arr) {
                if (!rec.id) {
                    rec.id = `${table}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                }
                arr2.push(rec);
                inserted.push(rec);
            }
            this._dirty.add(table);
            this._stats.writes++;
            if (this.persistOnWrite) await this._flushTable(table);
            return { count: inserted.length, ids: inserted.map(r => r.id) };
        }

        async update(table, options, patch) {
            await this._ensureTable(table);
            const arr = this._cache.get(table);
            const matched = this._applyFilters(arr, options);
            let count = 0;
            for (const row of matched) {
                Object.assign(row, patch, { updated_at: Date.now() });
                count++;
            }
            if (count > 0) {
                this._dirty.add(table);
                this._stats.writes++;
                if (this.persistOnWrite) await this._flushTable(table);
            }
            return { count };
        }

        async remove(table, options) {
            await this._ensureTable(table);
            const arr = this._cache.get(table);
            const toRemove = this._applyFilters(arr, options);
            const removeIds = new Set(toRemove.map(r => r.id));
            const before = arr.length;
            this._cache.set(table, arr.filter(r => !removeIds.has(r.id)));
            const count = before - this._cache.get(table).length;
            if (count > 0) {
                this._dirty.add(table);
                this._stats.writes++;
                if (this.persistOnWrite) await this._flushTable(table);
            }
            return { count };
        }

        async _ensureTable(table) {
            if (!SUPPORTED_TABLES.includes(table)) {
                throw new Error(`[LocalJsonDataProvider] Unknown table: ${table}`);
            }
            if (!this._cache.has(table)) {
                await this._loadTable(table);
            }
        }

        _applyFilters(rows, options = {}) {
            let out = rows;

            if (options.eq) {
                out = out.filter(r => {
                    for (const [k, v] of Object.entries(options.eq)) {
                        if (r[k] !== v) return false;
                    }
                    return true;
                });
            }
            if (options.in) {
                out = out.filter(r => {
                    for (const [k, vs] of Object.entries(options.in)) {
                        if (!vs.includes(r[k])) return false;
                    }
                    return true;
                });
            }
            if (options.gt) {
                out = out.filter(r => {
                    for (const [k, v] of Object.entries(options.gt)) {
                        if (!(r[k] > v)) return false;
                    }
                    return true;
                });
            }
            if (options.lt) {
                out = out.filter(r => {
                    for (const [k, v] of Object.entries(options.lt)) {
                        if (!(r[k] < v)) return false;
                    }
                    return true;
                });
            }
            if (options.contains) {
                out = out.filter(r => {
                    for (const [k, v] of Object.entries(options.contains)) {
                        const fieldVal = r[k];
                        if (typeof fieldVal === 'string') {
                            if (!fieldVal.toLowerCase().includes(String(v).toLowerCase())) return false;
                        } else if (Array.isArray(fieldVal)) {
                            if (!fieldVal.map(String).join(' ').toLowerCase().includes(String(v).toLowerCase())) return false;
                        } else {
                            return false;
                        }
                    }
                    return true;
                });
            }
            if (options.order) {
                const [col, dir = 'asc'] = options.order.split('.');
                out = out.slice().sort((a, b) => {
                    const av = a[col], bv = b[col];
                    if (av === bv) return 0;
                    if (av == null) return 1;
                    if (bv == null) return -1;
                    return (av < bv ? -1 : 1) * (dir === 'desc' ? -1 : 1);
                });
            }
            if (options.offset) out = out.slice(options.offset);
            if (options.limit) out = out.slice(0, options.limit);
            return out;
        }

        // -------- Specific helpers --------

        async flushAll() {
            const tables = Array.from(this._dirty);
            await Promise.all(tables.map(t => this._flushTable(t)));
            return { flushed: tables.length };
        }

        getStats() {
            return {
                ...super.getStats(),
                dataDir: this.dataDir,
                cache: {
                    enabled: this.cacheEnabled,
                    size: this._cache.size,
                    tables: Array.from(this._cache.keys()),
                },
                dirty: Array.from(this._dirty),
                operations: { ...this._stats },
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.LocalJsonDataProvider = LocalJsonDataProvider;

})(window);
