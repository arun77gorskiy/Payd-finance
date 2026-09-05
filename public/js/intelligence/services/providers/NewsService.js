/* =================================================================
   PAYD Finance — NewsService
   Агрегация официальных новостей: блоги проектов, Medium, X,
   плюс индустриальные медиа (CoinDesk, Cointelegraph, The Block, Decrypt).
   Endpoint: rss2json.com (CORS-friendly прокси для RSS).
   ================================================================= */

(function (global) {
    'use strict';

    const ServiceBase = global.PAYD_INTEL.ServiceBase;
    const DataModel = global.PAYD_INTEL.DataModel;

    const INDUSTRY_FEEDS = [
        { name: 'CoinDesk',     url: 'https://www.coindesk.com/arc/outboundfeeds/rss/' },
        { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss' },
        { name: 'The Block',    url: 'https://www.theblock.co/rss.xml' },
        { name: 'Decrypt',      url: 'https://decrypt.co/feed' },
    ];

    class NewsService extends ServiceBase {
        constructor(config = {}) {
            super({
                name: 'news',
                baseUrl: 'https://api.rss2json.com/v1/api.json',
                cacheTtlMs: 15 * 60 * 1000, // 15 мин
                rateLimit: { requests: 20, perMs: 60 * 1000 },
                ...config,
            });
            this._seenHashes = this._loadSeen();
            this._industryFeeds = config.industryFeeds || INDUSTRY_FEEDS;
        }

        /**
         * Получает RSS-ленту через rss2json прокси.
         */
        async getFeed(feedUrl) {
            const url = `${this.baseUrl}?rss_url=${encodeURIComponent(feedUrl)}&count=20`;
            const response = await this.fetch(url);
            if (!response.ok || !response.data || response.data.status !== 'ok') return [];
            return Array.isArray(response.data.items) ? response.data.items : [];
        }

        /**
         * Получает официальные новости конкретного проекта.
         */
        async getProjectNews(blogUrl) {
            if (!blogUrl) return [];
            return await this.getFeed(blogUrl);
        }

        /**
         * Получает отраслевые новости.
         */
        async getIndustryNews() {
            const results = await Promise.all(
                this._industryFeeds.map(f => this.getFeed(f.url).then(items => ({ source: f.name, items })))
            );
            const all = [];
            for (const r of results) {
                for (const item of r.items) {
                    all.push({ ...item, _source: r.source });
                }
            }
            return this._deduplicate(all);
        }

        async getField(field, args = {}) {
            if (field === 'articles') {
                const news = await this.getIndustryNews();
                return DataModel.verified(news, this.name);
            }
            return DataModel.missing(this.name, 'unknown_field');
        }

        _deduplicate(items) {
            const seen = new Set();
            const out = [];
            for (const item of items) {
                const hash = this._hashItem(item);
                if (seen.has(hash)) continue;
                seen.add(hash);
                if (this._isSeen(hash)) continue;
                this._markSeen(hash);
                out.push(item);
            }
            return out.sort((a, b) => {
                const da = a.pubDate ? new Date(a.pubDate).getTime() : 0;
                const db = b.pubDate ? new Date(b.pubDate).getTime() : 0;
                return db - da;
            });
        }

        _hashItem(item) {
            const url = item.link || item.url || '';
            const title = item.title || '';
            const str = (url + '|' + title).toLowerCase().replace(/\s+/g, '');
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
            }
            return String(hash);
        }

        _loadSeen() {
            try {
                return JSON.parse(localStorage.getItem('payd_news_seen') || '{}');
            } catch (e) { return {}; }
        }

        _isSeen(hash) {
            return !!this._seenHashes[hash];
        }

        _markSeen(hash) {
            this._seenHashes[hash] = Date.now();
            // Хранить только записи за последние 30 дней
            const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
            Object.keys(this._seenHashes).forEach(k => {
                if (this._seenHashes[k] < cutoff) delete this._seenHashes[k];
            });
            try {
                localStorage.setItem('payd_news_seen', JSON.stringify(this._seenHashes));
            } catch (e) {}
        }

        clearCache() {
            super.clearCache();
            try { localStorage.removeItem('payd_news_seen'); } catch (e) {}
            this._seenHashes = {};
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.NewsService = NewsService;

})(window);
