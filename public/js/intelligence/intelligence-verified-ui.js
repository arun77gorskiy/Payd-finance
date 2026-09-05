/* =================================================================
   PAYD Finance — VerifiedDataUI
   UI-компоненты для отображения verified-значений.
   Каждое значение в UI показывает:
   - value (само число)
   - source (источник данных)
   - timestamp (когда обновлено)
   - verified badge (зелёный = verified, серый = missing)
   ================================================================= */

(function (global) {
    'use strict';

    const DataModel = global.PAYD_INTEL && global.PAYD_INTEL.DataModel;

    /**
     * Рендерит verified-значение с индикаторами.
     * @param {Object} verifiedObj — verified-обёртка
     * @param {Object} options — { formatter, className, showSource, showTimestamp, fallback }
     */
    function renderVerified(verifiedObj, options = {}) {
        const formatter = options.formatter || (v => String(v));
        const fallback = options.fallback || '—';
        const showSource = options.showSource !== false;
        const showTimestamp = options.showTimestamp !== false;
        const className = options.className || '';

        if (!verifiedObj || (verifiedObj.missing && !verifiedObj.value)) {
            return `<span class="intel-verified intel-verified--missing ${className}" title="No verified data available">${fallback}</span>`;
        }

        const value = formatter(verifiedObj.value);
        const isVerified = verifiedObj.verified !== false;
        const isStale = verifiedObj.stale === true;
        const source = verifiedObj.source || 'unknown';
        const ts = verifiedObj.lastUpdated || new Date(verifiedObj.timestamp || Date.now()).toISOString();

        const stateClass = isStale ? 'intel-verified--stale' : (isVerified ? 'intel-verified--ok' : 'intel-verified--warn');
        const badge = isStale ? '⏱' : (isVerified ? '✓' : '!');

        let meta = '';
        if (showSource) {
            meta += `<span class="intel-verified__source" title="Data source">${escapeHtml(source)}</span>`;
        }
        if (showTimestamp) {
            const dt = new Date(ts);
            const formatted = isNaN(dt) ? ts : dt.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
            meta += `<span class="intel-verified__ts" title="Last updated">${formatted}</span>`;
        }

        return `<span class="intel-verified ${stateClass} ${className}" data-source="${escapeHtml(source)}" data-verified="${isVerified}">
            <span class="intel-verified__value">${value}</span>
            <span class="intel-verified__badge" title="${isVerified ? 'Verified data' : 'Unverified'}">${badge}</span>
            ${meta ? `<span class="intel-verified__meta">${meta}</span>` : ''}
        </span>`;
    }

    /**
     * Компактный рендер verified для таблиц (без meta).
     */
    function renderVerifiedCompact(verifiedObj, formatter, fallback = '—') {
        if (!verifiedObj || verifiedObj.missing) {
            return `<span class="intel-vd intel-vd--missing" title="Missing data">${fallback}</span>`;
        }
        const v = formatter ? formatter(verifiedObj.value) : String(verifiedObj.value);
        const src = verifiedObj.source || 'unknown';
        return `<span class="intel-vd intel-vd--ok" data-source="${escapeHtml(src)}" title="Source: ${escapeHtml(src)}">${v}</span>`;
    }

    /**
     * Бейдж для risk/quality/rating.
     */
    function renderBadge(text, level) {
        const cls = 'intel-badge--' + (level || 'neutral');
        return `<span class="intel-badge ${cls}">${escapeHtml(text)}</span>`;
    }

    /**
     * HTML-escape.
     */
    function escapeHtml(s) {
        if (s === null || s === undefined) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * Форматтеры по умолчанию.
     */
    const formatters = {
        usd: (v) => {
            if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B';
            if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M';
            if (v >= 1e3) return '$' + (v / 1e3).toFixed(2) + 'K';
            if (v >= 1) return '$' + v.toFixed(2);
            if (v > 0) return '$' + v.toFixed(4);
            return '$0';
        },
        usdFull: (v) => '$' + Number(v).toLocaleString('en-US', { maximumFractionDigits: 0 }),
        pct: (v) => (v >= 0 ? '+' : '') + v.toFixed(2) + '%',
        num: (v) => {
            if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
            if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
            if (v >= 1e3) return (v / 1e3).toFixed(2) + 'K';
            return v.toFixed(0);
        },
        date: (v) => {
            const d = new Date(v);
            if (isNaN(d)) return String(v);
            return d.toISOString().slice(0, 10);
        },
    };

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.VerifiedUI = {
        renderVerified,
        renderVerifiedCompact,
        renderBadge,
        formatters,
        escapeHtml,
    };

})(window);
