/* =================================================================
   PAYD Finance — Intelligence Services Init
   Инициализирует Verified Data Architecture после загрузки
   основного Intelligence модуля. Делает сервисы доступными
   через window.PAYD_INTEL.architecture.
   ================================================================= */

(function() {
    'use strict';

    function init() {
        if (typeof window.PAYD_INTEL === 'undefined' || typeof window.PAYD_INTEL.initDataArchitecture !== 'function') {
            console.warn('[PAYD Architecture] Bootstrap not loaded, services not available');
            return;
        }

        // Читаем конфиг из meta-тегов (если есть)
        const getMeta = (name) => {
            const el = document.querySelector(`meta[name="payd-${name}"]`);
            return el ? el.getAttribute('content') : null;
        };

        const config = {
            coinmarketcapApiKey: getMeta('cmc-key') || window.PAYD_CMC_KEY || null,
            githubToken: getMeta('github-token') || window.PAYD_GITHUB_TOKEN || null,
            // FIX: отключаем автозапуск синхронизации и scheduler при загрузке страницы.
            // Они запускают тяжёлые API-запросы, которые могут заблокировать UI.
            autoStartSync: false,
            autoStartScheduler: false,
            syncCategories: [],
        };

        try {
            const arch = window.PAYD_INTEL.initDataArchitecture(config);
            console.log('[PAYD Architecture] Initialized:', Object.keys(arch.services));
            console.log('[PAYD Architecture] Scheduler active:',
                arch.scheduler ? arch.scheduler.getStatus().isRunning : false);

            // Глобальный доступ для дебага и AI Research Layer
            window.PAYD_INTEL.architecture = arch;

            // Подписка на события scheduler для отладки
            if (arch.scheduler) {
                arch.scheduler.on('updateStart', (data) => {
                    console.log('[Scheduler] Update started:', data.trigger, data.types);
                });
                arch.scheduler.on('updateComplete', (data) => {
                    console.log('[Scheduler] Update complete:',
                        data.results.filter(r => r.success).length, 'ok,',
                        data.results.filter(r => !r.success).length, 'failed,',
                        'duration:', data.duration + 'ms');
                });
                arch.scheduler.on('updateError', (data) => {
                    console.error('[Scheduler] Update error:', data.error);
                });
            }

            // Сигнализируем, что архитектура готова
            window.dispatchEvent(new CustomEvent('payd:architecture-ready', { detail: arch }));
        } catch (err) {
            console.error('[PAYD Architecture] Init failed:', err);
        }
    }

    // Запускаем после полной загрузки страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
