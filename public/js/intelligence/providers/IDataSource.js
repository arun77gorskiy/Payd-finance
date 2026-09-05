/* =================================================================
   PAYD Intelligence — IDataSource
   Единый интерфейс для всех источников данных.
   Любой провайдер (CoinGecko, GitHub, RSS, mock, ...) реализует
   один и тот же набор методов, что позволяет:
     - Легко заменять mock на реальный REST API клиент
     - Комбинировать провайдеры в fallback chain
     - Тестировать без реальных сетевых вызовов

   Методы:
     - getName()             : string
     - isAvailable()         : boolean
     - getMarketData(id)     : Promise<MarketData | null>
     - getDefiData(id)       : Promise<DefiData | null>
     - getGithubData(id)     : Promise<GithubData | null>
     - getUnlockSchedule(id) : Promise<UnlockSchedule | null>
     - getNews(id)           : Promise<NewsItem[]>
     - getSocialData(id)     : Promise<SocialData | null>

   Все методы возвращают Promise.
   null означает, что данные недоступны (провайдер должен быть пропущен).
   Ошибки провайдеров не должны пробрасываться — оборачиваются в null.
   ================================================================= */

(function (global) {
    'use strict';

    const REQUIRED_METHODS = [
        'getName', 'isAvailable',
        'getMarketData', 'getDefiData',
        'getGithubData', 'getUnlockSchedule',
        'getNews', 'getSocialData',
    ];

    function isIDataSource(obj) {
        if (!obj || typeof obj !== 'object') return false;
        for (const m of REQUIRED_METHODS) {
            if (typeof obj[m] !== 'function') return false;
        }
        return true;
    }

    /**
     * Стандартные схемы данных, которые должны возвращать все провайдеры.
     * Используются для type-checking и валидации.
     */
    const SCHEMAS = {
        MarketData: {
            marketCap: 'number',
            fdv: 'number',
            price: 'number',
            volume24h: 'number',
            circulatingSupply: 'number',
            totalSupply: 'number',
            maxSupply: 'number|null',
            change24h: 'number|null',
            change7d: 'number|null',
            rank: 'number|null',
            ath: 'number|null',
            atl: 'number|null',
            lastUpdated: 'string',
        },
        DefiData: {
            tvl: 'number',
            tvlChange24h: 'number|null',
            revenue24h: 'number|null',
            fees24h: 'number|null',
            activeUsers24h: 'number|null',
            nodes: 'number|null',
            liquidityUsd: 'number|null',
            lastUpdated: 'string',
        },
        GithubData: {
            stars: 'number',
            forks: 'number',
            commits30d: 'number',
            contributors30d: 'number',
            pullRequests30d: 'number',
            issues30d: 'number',
            developerScore: 'number|null',
            lastUpdated: 'string',
        },
        UnlockSchedule: {
            nextUnlockAt: 'string|null',
            nextUnlockAmount: 'number|null',
            nextUnlockPercent: 'number|null',
            totalUnlockedPercent: 'number|null',
            remainingLockedPercent: 'number|null',
            upcomingUnlocks: 'Array<Object>',
            lastUpdated: 'string',
        },
        NewsItem: {
            id: 'string',
            title: 'string',
            url: 'string',
            source: 'string',
            publishedAt: 'string',
            summary: 'string',
        },
        SocialData: {
            twitterFollowers: 'number|null',
            twitterEngagement30d: 'number|null',
            partnershipCount30d: 'number|null',
            investmentRounds: 'Array<Object>',
            lastUpdated: 'string',
        },
    };

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.IDataSource = {
        isIDataSource,
        REQUIRED_METHODS,
        SCHEMAS,
    };

})(window);
