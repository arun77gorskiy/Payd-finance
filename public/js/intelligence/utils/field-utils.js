/* =================================================================
   PAYD Finance — Project Field Utilities (V2)
   -----------------------------------------------------------------
   Нормализация доступа к полям проекта с поддержкой ОБОИХ вариантов
   именования: camelCase (verifiedStatus) и snake_case (verified_status).

   ВАЖНО: источник данных /public/data/projects.json использует
   camelCase (verifiedStatus, coingeckoId, cmcId, lastVerifiedAt).
   Многие внутренние сервисы исторически написаны в snake_case.
   Этот модуль устраняет разрыв: всегда проверяет оба варианта,
   первый найденный побеждает.

   Поддерживаемые алиасы:
     verifiedStatus / verified_status
     coingeckoId   / coingecko_id
     cmcId         / cmc_id
     lastVerifiedAt / last_verified_at
   ================================================================= */

(function (global) {
    'use strict';

    /**
     * Карта camelCase → [camelCase, snake_case].
     * Используется для определения эквивалентного snake_case-имени.
     */
    const CAMEL_TO_SNAKE = {
        verifiedStatus:  'verified_status',
        coingeckoId:     'coingecko_id',
        cmcId:           'cmc_id',
        lastVerifiedAt:  'last_verified_at',
    };

    /**
     * Карта snake_case → [snake_case, camelCase].
     */
    const SNAKE_TO_CAMEL = {
        verified_status:  'verifiedStatus',
        coingecko_id:     'coingeckoId',
        cmc_id:           'cmcId',
        last_verified_at: 'lastVerifiedAt',
    };

    /**
     * Возвращает эквивалентное имя поля.
     * Если name уже известно — возвращает оба варианта: [original, alias].
     * Если неизвестно — возвращает [name] (без алиаса).
     */
    function getAliases(name) {
        if (typeof name !== 'string' || !name) return [name];
        if (Object.prototype.hasOwnProperty.call(CAMEL_TO_SNAKE, name)) {
            return [name, CAMEL_TO_SNAKE[name]];
        }
        if (Object.prototype.hasOwnProperty.call(SNAKE_TO_CAMEL, name)) {
            return [name, SNAKE_TO_CAMEL[name]];
        }
        return [name];
    }

    /**
     * Универсальный геттер поля проекта.
     * Принимает имя в любом из двух стилей и возвращает значение,
     * проверяя оба варианта последовательно.
     *
     * @param {Object} project — объект проекта (или candidate)
     * @param {string} fieldName — имя поля (camelCase или snake_case)
     * @param {Object} [metadata] — опциональный объект metadata
     * @returns {*} значение поля или undefined
     */
    function getField(project, fieldName, metadata) {
        if (!project || !fieldName) return undefined;
        const aliases = getAliases(fieldName);
        // 1. Сначала ищем в самом project
        for (const k of aliases) {
            if (project[k] !== undefined && project[k] !== null) {
                return project[k];
            }
        }
        // 2. Затем в metadata (если передан)
        const meta = metadata || project.metadata;
        if (meta && typeof meta === 'object') {
            for (const k of aliases) {
                if (meta[k] !== undefined && meta[k] !== null) {
                    return meta[k];
                }
            }
        }
        return undefined;
    }

    /**
     * Удобный предикат: поле существует и непустое.
     */
    function hasField(project, fieldName, metadata) {
        const v = getField(project, fieldName, metadata);
        if (v === undefined || v === null) return false;
        if (typeof v === 'string') return v.trim().length > 0;
        if (Array.isArray(v)) return v.length > 0;
        return true;
    }

    /**
     * Проверяет, является ли статус проекта "verified".
     * Унифицирует проверку для camelCase и snake_case.
     */
    function isVerified(project) {
        if (!project) return false;
        const status = getField(project, 'verifiedStatus', project.metadata);
        return status === 'verified';
    }

    /**
     * Возвращает CoinGecko id (или null).
     */
    function getCoingeckoId(project) {
        return getField(project, 'coingeckoId', project.metadata) || null;
    }

    /**
     * Возвращает CoinMarketCap id (или null).
     */
    function getCmcId(project) {
        return getField(project, 'cmcId', project.metadata) || null;
    }

    /**
     * Возвращает timestamp последней верификации (или null).
     */
    function getLastVerifiedAt(project) {
        const v = getField(project, 'lastVerifiedAt', project.metadata);
        if (!v) return null;
        if (typeof v === 'number') return v;
        const ts = new Date(v).getTime();
        return isNaN(ts) ? null : ts;
    }

    // Экспорт
    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.FieldUtils = {
        CAMEL_TO_SNAKE,
        SNAKE_TO_CAMEL,
        getAliases,
        getField,
        hasField,
        isVerified,
        getCoingeckoId,
        getCmcId,
        getLastVerifiedAt,
    };

})(window);
