/* =================================================================
   PAYD Finance — Intelligence Utilities
   Форматирование, helpers, безопасные рендереры.
   ================================================================= */

const UNAVAILABLE = 'Unavailable';

const INTEL_UTILS = {
    /* === Доступность данных === */
    isAvailable(v) {
        return v !== null && v !== undefined && !(typeof v === 'number' && isNaN(v)) && v !== '';
    },

    /* === Number formatters === */
    fmtCompact(n) {
        if (!this.isAvailable(n)) return UNAVAILABLE;
        const abs = Math.abs(n);
        if (abs >= 1e9) return (n / 1e9).toFixed(abs >= 1e10 ? 1 : 2) + 'B';
        if (abs >= 1e6) return (n / 1e6).toFixed(abs >= 1e7 ? 1 : 2) + 'M';
        if (abs >= 1e3) return (n / 1e3).toFixed(abs >= 1e4 ? 1 : 2) + 'K';
        return n.toString();
    },

    fmtUSD(n) {
        if (!this.isAvailable(n)) return UNAVAILABLE;
        return '$' + this.fmtCompact(n);
    },

    fmtPct(n, withSign = true) {
        if (!this.isAvailable(n)) return UNAVAILABLE;
        const sign = withSign ? (n >= 0 ? '+' : '') : '';
        return sign + n.toFixed(1) + '%';
    },

    fmtNum(n) {
        if (!this.isAvailable(n)) return UNAVAILABLE;
        return n.toLocaleString('en-US');
    },

    /* === Date formatters === */
    fmtDate(iso) {
        if (!iso) return UNAVAILABLE;
        try {
            return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
        } catch (e) { return iso; }
    },

    fmtRelative(iso) {
        if (!iso) return UNAVAILABLE;
        const d = new Date(iso);
        const now = new Date();
        const diffMs = d - now;
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays < 0) return Math.abs(diffDays) + 'd ago';
        if (diffDays === 0) return 'today';
        if (diffDays === 1) return 'tomorrow';
        return 'in ' + diffDays + 'd';
    },

    /* === Score formatters (для V1 derived scores: ai_score, risk_score, rating_score) === */
    fmtScore(n) {
        if (!this.isAvailable(n)) return UNAVAILABLE;
        return Math.round(n).toString();
    },

    fmtRating(n) {
        if (!this.isAvailable(n)) return UNAVAILABLE;
        return n.toFixed(1) + ' / 5.0';
    },

    fmtRisk(n) {
        if (!this.isAvailable(n)) return UNAVAILABLE;
        return Math.round(n).toString();
    },

    fmtPctSafe(n, withSign = true) {
        if (!this.isAvailable(n)) return UNAVAILABLE;
        const sign = withSign ? (n >= 0 ? '+' : '') : '';
        return sign + n.toFixed(1) + '%';
    },

    fmtLabel(s) {
        if (!this.isAvailable(s)) return UNAVAILABLE;
        return String(s);
    },

    /**
     * Сравнение для сортировки по убыванию числового score-поля.
     * null/undefined значения уходят в конец списка.
     */
    compareByScoreDesc(getter) {
        return (a, b) => {
            const av = getter(a);
            const bv = getter(b);
            const aHas = this.isAvailable(av);
            const bHas = this.isAvailable(bv);
            if (!aHas && !bHas) return 0;
            if (!aHas) return 1;
            if (!bHas) return -1;
            return bv - av;
        };
    },

    /**
     * Безопасное значение для CSS width (в процентах).
     * Если значение недоступно — возвращает 0 (бар не отображается).
     */
    safeWidthPct(n) {
        return this.isAvailable(n) ? Math.max(0, Math.min(100, Number(n))) : 0;
    },

    /**
     * Безопасный доступ к вложенному свойству: safeGet(obj, 'a.b.c', default).
     * Если любой сегмент пути равен null/undefined — возвращает default.
     */
    safeGet(obj, path, defaultVal) {
        if (obj == null) return defaultVal;
        const parts = (typeof path === 'string') ? path.split('.') : path;
        let cur = obj;
        for (let i = 0; i < parts.length; i++) {
            if (cur == null) return defaultVal;
            cur = cur[parts[i]];
        }
        return (cur == null) ? defaultVal : cur;
    },

    /**
     * Безопасный доступ к полю sub-объекта проекта.
     * Например: projField(p, 'metrics', 'market_cap_usd') вернёт p.metrics.market_cap_usd
     * или null, если metrics или его поля нет.
     */
    projField(p, ...path) {
        if (p == null) return null;
        let cur = p;
        for (let i = 0; i < path.length; i++) {
            if (cur == null) return null;
            cur = cur[path[i]];
        }
        return (cur == null) ? null : cur;
    },

    /**
     * Безопасное приведение числа к строке с фиксированной точностью.
     * Если значение недоступно — возвращает UNAVAILABLE.
     */
    fmtFixed(n, digits) {
        if (!this.isAvailable(n) || typeof n !== 'number') return UNAVAILABLE;
        return n.toFixed(digits);
    },

    /**
     * Безопасное объединение массива в строку.
     * Если значение не массив — возвращает UNAVAILABLE.
     */
    fmtJoin(arr, sep = ', ') {
        if (!Array.isArray(arr) || arr.length === 0) return UNAVAILABLE;
        return arr.join(sep);
    },

    /**
     * Безопасный доступ к массиву (для ai_score_history и т.п.).
     * Если массив пустой — возвращает default.
     */
    safeArray(arr, defaultVal = []) {
        return Array.isArray(arr) ? arr : defaultVal;
    },

    /* === Score helpers === */
    scoreClass(score) {
        if (score == null) return 'is-mid';
        if (score >= 75) return 'is-high';
        if (score >= 55) return 'is-mid';
        return 'is-low';
    },

    ratingClass(rating) {
        if (!rating) return 'intel-rating-hold';
        const r = rating.toLowerCase();
        if (r.includes('strong buy')) return 'intel-rating-strongbuy';
        if (r.includes('buy'))        return 'intel-rating-buy';
        if (r.includes('hold'))       return 'intel-rating-hold';
        if (r.includes('speculative')) return 'intel-rating-spec';
        return 'intel-rating-hold';
    },

    riskClass(label) {
        if (!label) return 'intel-risk-medium';
        const r = label.toLowerCase();
        if (r === 'low')    return 'intel-risk-low';
        if (r === 'high')   return 'intel-risk-high';
        return 'intel-risk-medium';
    },

    severityClass(s) {
        if (!s) return 'intel-risk-medium';
        const r = s.toLowerCase();
        if (r === 'high')   return 'intel-risk-high';
        if (r === 'low')    return 'intel-risk-low';
        return 'intel-risk-medium';
    },

    deltaClass(n) {
        if (n == null) return 'is-flat';
        if (n > 0)  return 'is-up';
        if (n < 0)  return 'is-down';
        return 'is-flat';
    },

    deltaArrow(n) {
        if (n == null) return '—';
        if (n > 0)  return '▲';
        if (n < 0)  return '▼';
        return '—';
    },

    /* === HTML safety === */
    esc(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    /* === SVG sparkline === */
    sparkline(values, opts = {}) {
        const w = opts.width || 240;
        const h = opts.height || 60;
        const padding = 4;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;
        const stepX = (w - padding * 2) / (values.length - 1);

        const points = values.map((v, i) => {
            const x = padding + i * stepX;
            const y = h - padding - ((v - min) / range) * (h - padding * 2);
            return [x, y];
        });

        const pathD = points.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
        const areaD = pathD + ` L${points[points.length - 1][0]},${h} L${points[0][0]},${h} Z`;
        const last  = points[points.length - 1];

        const gradId = 'intel-spark-' + Math.random().toString(36).slice(2, 8);
        return `
            <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"   stop-color="#7C5CFF" stop-opacity="0.4"/>
                        <stop offset="100%" stop-color="#7C5CFF" stop-opacity="0"/>
                    </linearGradient>
                </defs>
                <path d="${areaD}" fill="url(#${gradId})"/>
                <path d="${pathD}" fill="none" stroke="#F3C94A" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                <circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="2.5" fill="#F3C94A"/>
            </svg>
        `;
    },

    /* === Reveal-on-scroll (использует существующий паттерн проекта) === */
    observeReveal(root) {
        const elements = root.querySelectorAll('.reveal-on-scroll');
        if (!('IntersectionObserver' in window)) {
            elements.forEach(el => el.classList.add('is-visible'));
            return;
        }
        const obs = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    obs.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

        elements.forEach(el => obs.observe(el));
    },
};

window.PAYD_INTEL_UTILS = INTEL_UTILS;
