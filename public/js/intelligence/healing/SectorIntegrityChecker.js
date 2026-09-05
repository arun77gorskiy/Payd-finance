/* =================================================================
   PAYD Finance — SectorIntegrityChecker (V2.3)
   Проверяет целостность датасета: для каждого сектора из
   sector_config.json подсчитывает количество проектов.
   Если сектор ниже min_projects — помечает его как GAP
   (нуждающийся в автоматическом восстановлении).

   Используется SelfHealingEngine на каждой инициализации.
   ================================================================= */

(function (global) {
    'use strict';

    /**
     * Полный список поддерживаемых секторов.
     * Должен совпадать с sector_config.json на сервере.
     * Это single source of truth для клиентской логики.
     */
    const SUPPORTED_SECTORS = [
        { sector: 'Layer1',         minProjects: 30, description: 'Base-layer blockchains (Ethereum, Solana, etc.)' },
        { sector: 'Layer2',         minProjects: 30, description: 'Layer 2 scaling solutions (Arbitrum, Optimism, etc.)' },
        { sector: 'DeFi',           minProjects: 30, description: 'Decentralized Finance protocols' },
        { sector: 'RWA',            minProjects: 25, description: 'Real World Assets tokenization' },
        { sector: 'AI',             minProjects: 30, description: 'AI and Machine Learning protocols' },
        { sector: 'Gaming',         minProjects: 25, description: 'Web3 Gaming and metaverse' },
        { sector: 'DePIN',          minProjects: 30, description: 'Decentralized Physical Infrastructure Networks' },
        { sector: 'Infrastructure', minProjects: 25, description: 'Cross-chain, oracle, indexing, middleware' },
        { sector: 'Oracles',        minProjects: 15, description: 'Oracle networks (Chainlink, Band, etc.)' },
        { sector: 'Privacy',        minProjects: 15, description: 'Privacy-focused protocols' },
        { sector: 'Stablecoins',    minProjects: 15, description: 'Stablecoin issuers and protocols' },
        { sector: 'DEX',            minProjects: 20, description: 'Decentralized exchanges' },
        { sector: 'Lending',        minProjects: 20, description: 'Lending and borrowing protocols' },
        { sector: 'Derivatives',    minProjects: 15, description: 'Derivatives and perpetuals' },
        { sector: 'Restaking',      minProjects: 15, description: 'Restaking and liquid restaking' },
        { sector: 'Liquid Staking', minProjects: 15, description: 'Liquid staking derivatives' },
        { sector: 'Payments',       minProjects: 15, description: 'Payment networks and protocols' },
        { sector: 'Bitcoin Ecosystem', minProjects: 20, description: 'Bitcoin L2s, BRC-20, Ordinals' },
        { sector: 'Meme',           minProjects: 15, description: 'Meme tokens and community coins' },
        { sector: 'SocialFi',       minProjects: 15, description: 'Social finance and decentralized social' },
        { sector: 'DeSci',          minProjects: 20, description: 'Decentralized Science' },
        { sector: 'ZK',             minProjects: 20, description: 'Zero-Knowledge proof projects' },
    ];

    /**
     * Нормализует название сектора: "layer 1" → "Layer1", "DePIN" → "DePIN", и т.д.
     * Это нужно потому, что в разных источниках формат может отличаться.
     */
    function normalizeSectorKey(s) {
        if (!s) return '';
        const trimmed = String(s).trim();
        if (!trimmed) return '';
        // Убираем пробелы внутри, делаем CamelCase только для слов в нижнем регистре
        const lower = trimmed.toLowerCase();
        // Словари специальных форм
        const special = {
            'layer1':       'Layer1',
            'layer 1':      'Layer1',
            'layer_1':      'Layer1',
            'layer2':       'Layer2',
            'layer 2':      'Layer2',
            'layer_2':      'Layer2',
            'depin':        'DePIN',
            'ai':           'AI',
            'defi':         'DeFi',
            'rwa':          'RWA',
            'desci':        'DeSci',
            'dex':          'DEX',
            'zk':           'ZK',
            'socialfi':     'SocialFi',
        };
        if (special[lower]) return special[lower];
        // Capitalize: первая буква заглавная, остальные строчные
        return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
    }

    class SectorIntegrityChecker {
        constructor() {
            this.sectors = SUPPORTED_SECTORS.map(s => ({
                ...s,
                normalizedKey: normalizeSectorKey(s.sector),
            }));
        }

        /**
         * Подсчитывает количество проектов в каждом секторе.
         * Принимает массив V2 проектов (из projects.json) и (опционально)
         * enriched map (из projects_enriched.json) для дополнительной проверки.
         *
         * @param {Array} projectsArray - массив V2 проектов
         * @param {Map} [enrichedMap] - опциональный Map enriched data
         * @returns {Object} { sectorKey: count }
         */
        countProjectsBySector(projectsArray, enrichedMap) {
            const counts = {};
            // Инициализируем все поддерживаемые сектора нулём
            this.sectors.forEach(s => {
                counts[s.normalizedKey] = 0;
            });

            if (!Array.isArray(projectsArray)) {
                return counts;
            }

            projectsArray.forEach(p => {
                if (!p || p.status === 'archive') return;
                const sectorRaw = p.sector || (Array.isArray(p.sectors) && p.sectors[0]) || null;
                if (!sectorRaw) return;
                const key = normalizeSectorKey(sectorRaw);
                if (counts[key] != null) {
                    counts[key]++;
                } else {
                    counts[key] = 1; // unknown sector — начинаем с 1
                }
            });

            return counts;
        }

        /**
         * Запускает полную проверку целостности датасета.
         * Возвращает детальный отчёт со списком GAP-секторов.
         *
         * @param {Array} projectsArray - массив V2 проектов
         * @param {Map} [enrichedMap] - опциональный Map enriched data
         * @param {Array} [sectorConfig] - опциональный override секторов с сервера
         * @returns {Object} report { sectors, gaps, totalProjects, healthy }
         */
        check(projectsArray, enrichedMap, sectorConfig) {
            const configToUse = (Array.isArray(sectorConfig) && sectorConfig.length > 0)
                ? sectorConfig
                : SUPPORTED_SECTORS;

            const counts = this.countProjectsBySector(projectsArray, enrichedMap);

            const sectorReports = configToUse.map(cfg => {
                const key = normalizeSectorKey(cfg.sector);
                const current = counts[key] || 0;
                const min = cfg.min_projects || cfg.minProjects || 30;
                const gap = Math.max(0, min - current);
                const isHealthy = current >= min;
                return {
                    sector: cfg.sector,
                    normalizedKey: key,
                    current,
                    min,
                    gap,
                    isHealthy,
                    weight: cfg.weight || 1.0,
                    description: cfg.description || '',
                };
            });

            const gaps = sectorReports.filter(r => !r.isHealthy);
            const totalProjects = Object.values(counts).reduce((a, b) => a + b, 0);

            const report = {
                timestamp: new Date().toISOString(),
                totalProjects,
                totalSectors: sectorReports.length,
                healthySectors: sectorReports.filter(r => r.isHealthy).length,
                gapsCount: gaps.length,
                gaps,
                sectors: sectorReports,
                healthy: gaps.length === 0,
            };

            console.log(
                '[SectorIntegrityChecker] Report:',
                `${totalProjects} projects across ${sectorReports.length} sectors; ` +
                `${report.healthySectors} healthy, ${gaps.length} gap(s).`
            );
            if (gaps.length > 0) {
                console.warn(
                    '[SectorIntegrityChecker] GAP sectors:',
                    gaps.map(g => `${g.sector}=${g.current}/${g.min} (need +${g.gap})`).join(', ')
                );
            }

            return report;
        }

        /**
         * Возвращает только GAP-сектора, отсортированные по приоритету.
         * Приоритет = наибольший gap, потом по weight.
         */
        getRecoveryTargets(report) {
            return (report.gaps || [])
                .sort((a, b) => (b.gap - a.gap) || (b.weight - a.weight));
        }

        /**
         * Возвращает список всех поддерживаемых секторов (для использования
         * в discovery process).
         */
        getAllSectors() {
            return this.sectors.map(s => s.normalizedKey);
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.SectorIntegrityChecker = SectorIntegrityChecker;
    global.PAYD_INTEL.SectorIntegrityChecker_SUPPORTED_SECTORS = SUPPORTED_SECTORS;
    global.PAYD_INTEL.normalizeSectorKey = normalizeSectorKey;
})(window);
