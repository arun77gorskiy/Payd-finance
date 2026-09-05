/* =================================================================
   PAYD Finance — DatabaseProvider (ARCHITECTURE STUB)
   Это ЗАГЛУШКА. Реализация НЕ создана.
   Провайдер предназначен для будущих интеграций с БД:
     - PostgreSQL
     - Firebase
     - MongoDB
     - Neon
     - PlanetScale
   Когда он будет реализован, остальной код менять НЕ нужно.
   ================================================================= */

(function (global) {
    'use strict';

    const IDataProvider = global.PAYD_INTEL.IDataProvider;

    class DatabaseProvider extends IDataProvider {
        constructor(config = {}) {
            super(config);
            this.name = 'DatabaseProvider';
            this.connectionString = config.connectionString || '';
            this.poolSize = config.poolSize || 5;
            this._stats = {
                connections: 0,
                queries: 0,
            };
        }

        async connect() {
            // TODO: future — open connection pool, run migrations
            this.connected = true;
            return { connected: true, provider: this.name, mode: 'stub' };
        }

        async disconnect() {
            // TODO: future — close pool
            this.connected = false;
            return { disconnected: true };
        }

        _notImplemented(method) {
            throw new Error(
                `[DatabaseProvider] Method "${method}" is not implemented. ` +
                `This is an architecture stub. To enable, set ACTIVE_PROVIDER to 'local-json' ` +
                `or implement DatabaseProvider for: PostgreSQL, Firebase, ` +
                `MongoDB, Neon, PlanetScale.`
            );
        }

        // -------- Generic CRUD --------

        async query() { this._notImplemented('query'); }
        async insert() { this._notImplemented('insert'); }
        async update() { this._notImplemented('update'); }
        async remove() { this._notImplemented('remove'); }
        async transaction() { this._notImplemented('transaction'); }

        getStats() {
            return {
                ...super.getStats(),
                mode: 'stub',
                futureDatabases: [
                    'PostgreSQL',
                    'Firebase',
                    'MongoDB',
                    'Neon',
                    'PlanetScale',
                ],
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DatabaseProvider = DatabaseProvider;

})(window);
