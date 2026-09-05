/* =================================================================
   PAYD Finance — DataProviderFactory
   Фабрика, которая инстанцирует нужный IDataProvider по конфигу.
   Никто выше этого слоя не должен инстанцировать провайдеры напрямую.
   ================================================================= */

(function (global) {
    'use strict';

    class DataProviderFactory {
        static async create(providerName = null) {
            const DataProviderConfig = global.PAYD_INTEL.DataProviderConfig;
            const name = providerName || DataProviderConfig.getActiveProvider();
            const config = DataProviderConfig.getProviderConfig(name);

            let provider;

            switch (name) {
                case 'local-json': {
                    const Cls = global.PAYD_INTEL.LocalJsonDataProvider;
                    if (!Cls) {
                        throw new Error('[DataProviderFactory] LocalJsonDataProvider not loaded');
                    }
                    provider = new Cls(config);
                    break;
                }
                case 'api': {
                    const Cls = global.PAYD_INTEL.ApiDataProvider;
                    if (!Cls) {
                        throw new Error('[DataProviderFactory] ApiDataProvider not loaded (architecture stub)');
                    }
                    provider = new Cls(config);
                    break;
                }
                case 'database': {
                    const Cls = global.PAYD_INTEL.DatabaseProvider;
                    if (!Cls) {
                        throw new Error('[DataProviderFactory] DatabaseProvider not loaded (architecture stub)');
                    }
                    provider = new Cls(config);
                    break;
                }
                default:
                    throw new Error(`[DataProviderFactory] Unknown provider: ${name}`);
            }

            await provider.connect();
            if (DataProviderConfig.FEATURES.logProviderEvents) {
                console.log(`[DataProviderFactory] Active provider: ${name} → ${provider.name}`);
            }
            return provider;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.DataProviderFactory = DataProviderFactory;

})(window);
