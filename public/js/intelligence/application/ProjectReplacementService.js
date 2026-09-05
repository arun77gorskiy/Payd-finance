/* =================================================================
   PAYD Finance — ProjectReplacementService
   Application Layer (V2): автозамена исключённых проектов.

   Когда проект исключается (data_unavailable / не прошёл QualityFilter),
   сервис ищет next-best кандидата в том же секторе из verified-пула
   и возвращает его для подъёма в активный universe.

   Не зависит от рендеринга и UI. Возвращает только данные.
   ================================================================= */

(function (global) {
    'use strict';

    const FieldUtils = (global.PAYD_INTEL && global.PAYD_INTEL.FieldUtils) || null;

    function _readField(project, name) {
        if (FieldUtils && typeof FieldUtils.getField === 'function') {
            return FieldUtils.getField(project, name, project && project.metadata);
        }
        if (!project) return undefined;
        const meta = project.metadata;
        if (project[name] !== undefined && project[name] !== null) return project[name];
        const snake = name.replace(/([A-Z])/g, '_$1').toLowerCase();
        if (project[snake] !== undefined && project[snake] !== null) return project[snake];
        if (meta) {
            if (meta[name] !== undefined && meta[name] !== null) return meta[name];
            if (meta[snake] !== undefined && meta[snake] !== null) return meta[snake];
        }
        return undefined;
    }

    class ProjectReplacementService {
        /**
         * @param {Object} deps
         * @param {Object} deps.projectRepository  — ProjectRepository
         * @param {Object} deps.qualityFilter      — QualityFilter
         * @param {Object} [deps.validationService] — MarketDataValidationService
         * @param {number} [deps.minTargetPerSector=25]
         */
        constructor(deps = {}) {
            if (!deps.projectRepository) {
                throw new Error('[ProjectReplacementService] projectRepository is required');
            }
            if (!deps.qualityFilter) {
                throw new Error('[ProjectReplacementService] qualityFilter is required');
            }
            this.projects = deps.projectRepository;
            this.filter = deps.qualityFilter;
            this.validation = deps.validationService || null;
            this.minTarget = deps.minTargetPerSector || 25;
        }

        /**
         * Подбирает replacements для сектора.
         * @param {string} sector
         * @param {number} [count=1]
         * @returns {Promise<Object[]>} — массив проектов-замен
         */
        async findReplacementsForSector(sector, count = 1) {
            if (!sector) return [];

            // Все проекты в секторе
            const allInSector = await this.projects.getBySector(sector);

            // Разделяем на active (verified, проходит quality bar) и candidate pool
            const active = [];
            const candidatePool = [];

            for (const p of allInSector) {
                if (this._isActive(p)) {
                    active.push(p);
                } else {
                    candidatePool.push(p);
                }
            }

            // Если active уже >= minTarget, replacement не нужен
            if (active.length >= this.minTarget) {
                return [];
            }

            const shortfall = this.minTarget - active.length;
            const needed = Math.max(count, shortfall);

            // Сортируем candidatePool по quality score (descending)
            candidatePool.sort((a, b) => {
                const sa = this._scoreCandidate(a);
                const sb = this._scoreCandidate(b);
                return sb - sa;
            });

            // Берём top-N, проверяем quality и возвращаем
            const replacements = [];
            for (const candidate of candidatePool) {
                if (replacements.length >= needed) break;
                if (this._passesQuality(candidate)) {
                    replacements.push(candidate);
                }
            }

            return replacements;
        }

        /**
         * Заменяет проект в активном universe: помечает старый как data_unavailable
         * и поднимает нового кандидата в active.
         * @param {string} excludedProjectId
         * @returns {Promise<{replaced: boolean, replacement: Object|null, reason: string}>}
         */
        async replaceExcluded(excludedProjectId) {
            const excluded = await this.projects.getById(excludedProjectId);
            if (!excluded) {
                return { replaced: false, replacement: null, reason: 'project_not_found' };
            }

            const sector = excluded.sector;
            const replacements = await this.findReplacementsForSector(sector, 1);
            if (replacements.length === 0) {
                // Нет замены — помечаем excluded как data_unavailable внутренне
                await this.projects.update(excludedProjectId, {
                    verifiedStatus: 'data_unavailable',
                    archivedAt: Date.now(),
                });
                return { replaced: false, replacement: null, reason: 'no_replacement_available' };
            }

            const replacement = replacements[0];

            // Помечаем excluded как data_unavailable
            await this.projects.update(excludedProjectId, {
                verifiedStatus: 'data_unavailable',
                archivedAt: Date.now(),
            });

            // Поднимаем replacement (если был pending → verified)
            await this.projects.update(replacement.id, {
                verifiedStatus: 'verified',
                promotedAt: Date.now(),
            });

            return { replaced: true, replacement, reason: 'ok' };
        }

        // -------- internal helpers --------

        _isActive(project) {
            const status = _readField(project, 'verifiedStatus');
            return status === 'verified' && this._passesQuality(project);
        }

        _passesQuality(project) {
            try {
                if (typeof this.filter.meetsThreshold === 'function') {
                    return this.filter.meetsThreshold(project).qualified;
                }
                return project.quality_score >= 70;
            } catch (e) {
                return false;
            }
        }

        _scoreCandidate(project) {
            // Базовый score = quality_score; бонус за новизну, штраф за возраст
            const base = project.quality_score || 0;
            const hasCgId = !!_readField(project, 'coingeckoId');
            return base + (hasCgId ? 5 : 0);
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.ProjectReplacementService = ProjectReplacementService;

})(window);
