/* =================================================================
   PAYD Finance — TokenUnlockService
   Календарь анлоков: investor/team/treasury unlocks.
   Endpoint: tokenunlocks.app (публичный CORS API).
   Без ключа: возвращает структуру с missing полями и
   graceful degradation к локальному календарю.
   ================================================================= */

(function (global) {
    'use strict';

    const ServiceBase = global.PAYD_INTEL.ServiceBase;
    const DataModel = global.PAYD_INTEL.DataModel;

    class TokenUnlockService extends ServiceBase {
        constructor(config = {}) {
            super({
                name: 'tokenunlocks',
                baseUrl: 'https://tokenunlocks.app/api',
                cacheTtlMs: 24 * 60 * 60 * 1000, // 1 день
                rateLimit: { requests: 30, perMs: 60 * 1000 },
                ...config,
            });
        }

        /**
         * Получает информацию об анлоках для проекта.
         */
        async getUnlocks(symbol) {
            if (!symbol) return null;
            const url = `${this.baseUrl}/unlocks/${encodeURIComponent(symbol.toLowerCase())}`;
            const response = await this.fetch(url);
            if (!response.ok) {
                return this._estimateFromSymbol(symbol);
            }
            return this._mapUnlocks(response.data, symbol);
        }

        /**
         * Календарь ближайших анлоков.
         */
        async getUpcoming(days = 30) {
            const url = `${this.baseUrl}/upcoming?days=${days}`;
            const response = await this.fetch(url);
            if (!response.ok) return [];
            return Array.isArray(response.data) ? response.data : [];
        }

        async getField(field, args = {}) {
            const symbol = args.symbol || args.coinId;
            if (!symbol) return DataModel.missing(this.name, 'no_symbol');
            const data = await this.getUnlocks(symbol);
            if (!data) return DataModel.missing(this.name, 'fetch_failed');
            const value = data[field];
            if (!value || value.missing) {
                return DataModel.missing(this.name, 'field_missing');
            }
            return value;
        }

        _mapUnlocks(raw, symbol) {
            const out = { source: this.name, timestamp: Date.now() };
            const ts = Date.now();
            if (typeof raw.unlockedPct === 'number') {
                out.unlockedPct = DataModel.verified(raw.unlockedPct, this.name, ts);
            } else {
                out.unlockedPct = DataModel.missing(this.name, 'no_unlockedPct');
            }
            if (typeof raw.lockedSupply === 'number') {
                out.lockedSupply = DataModel.verified(raw.lockedSupply, this.name, ts);
            } else {
                out.lockedSupply = DataModel.missing(this.name, 'no_lockedSupply');
            }
            if (raw.nextUnlock && raw.nextUnlock.date) {
                out.nextUnlockDate = DataModel.verified(raw.nextUnlock.date, this.name, ts);
                out.nextUnlockAmount = DataModel.verified(raw.nextUnlock.amount || 0, this.name, ts);
            } else {
                out.nextUnlockDate = DataModel.missing(this.name, 'no_nextUnlock');
                out.nextUnlockAmount = DataModel.missing(this.name, 'no_nextUnlock');
            }
            if (Array.isArray(raw.calendar)) {
                out.calendar = DataModel.verified(raw.calendar, this.name, ts);
                out.upcoming = DataModel.verified(
                    raw.calendar.filter(e => new Date(e.date) > new Date()),
                    this.name, ts
                );
            } else {
                out.calendar = DataModel.missing(this.name, 'no_calendar');
                out.upcoming = DataModel.missing(this.name, 'no_upcoming');
            }
            if (raw.investorUnlocks) {
                out.investorUnlocks = DataModel.verified(raw.investorUnlocks, this.name, ts);
            } else {
                out.investorUnlocks = DataModel.missing(this.name, 'no_investor_data');
            }
            if (raw.teamUnlocks) {
                out.teamUnlocks = DataModel.verified(raw.teamUnlocks, this.name, ts);
            } else {
                out.teamUnlocks = DataModel.missing(this.name, 'no_team_data');
            }
            if (raw.treasuryUnlocks) {
                out.treasuryUnlocks = DataModel.verified(raw.treasuryUnlocks, this.name, ts);
            } else {
                out.treasuryUnlocks = DataModel.missing(this.name, 'no_treasury_data');
            }
            out.riskLevel = this._evaluateRisk(out);
            return out;
        }

        /**
         * Оценка риска анлоков — ВЫЧИСЛЕНИЕ на основе verified данных.
         * НЕ генерация AI-ом — детерминированная формула.
         */
        _evaluateRisk(unlocksObj) {
            const unlockedPct = DataModel.unwrap(unlocksObj.unlockedPct);
            const nextAmount = DataModel.unwrap(unlocksObj.nextUnlockAmount);
            const locked = DataModel.unwrap(unlocksObj.lockedSupply);

            if (unlockedPct === null && nextAmount === null && locked === null) {
                return DataModel.missing(this.name, 'insufficient_data_for_risk');
            }

            // Простая, прозрачная формула риска
            let riskScore = 0;
            if (unlockedPct !== null) {
                if (unlockedPct < 30) riskScore += 3;
                else if (unlockedPct < 60) riskScore += 2;
                else riskScore += 1;
            }
            if (nextAmount !== null && locked !== null && locked > 0) {
                const unlockRatio = nextAmount / locked;
                if (unlockRatio > 0.1) riskScore += 3;
                else if (unlockRatio > 0.05) riskScore += 2;
                else if (unlockRatio > 0) riskScore += 1;
            }

            let level = 'Low';
            if (riskScore >= 5) level = 'High';
            else if (riskScore >= 3) level = 'Medium';
            return DataModel.verified(level, this.name + '.risk_evaluator');
        }

        _estimateFromSymbol(symbol) {
            return {
                source: this.name,
                timestamp: Date.now(),
                unlockedPct: DataModel.missing(this.name, 'api_unreachable_no_estimate'),
                lockedSupply: DataModel.missing(this.name, 'api_unreachable_no_estimate'),
                nextUnlockDate: DataModel.missing(this.name, 'api_unreachable_no_estimate'),
                nextUnlockAmount: DataModel.missing(this.name, 'api_unreachable_no_estimate'),
                calendar: DataModel.missing(this.name, 'api_unreachable_no_estimate'),
                upcoming: DataModel.missing(this.name, 'api_unreachable_no_estimate'),
                investorUnlocks: DataModel.missing(this.name, 'api_unreachable_no_estimate'),
                teamUnlocks: DataModel.missing(this.name, 'api_unreachable_no_estimate'),
                treasuryUnlocks: DataModel.missing(this.name, 'api_unreachable_no_estimate'),
                riskLevel: DataModel.missing(this.name, 'api_unreachable_no_estimate'),
            };
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.TokenUnlockService = TokenUnlockService;

})(window);
