/* =================================================================
   PAYD Intelligence — EnhancedProjectReplacementService
   Сервис замены невалидированных проектов на новых кандидатов.
   Работает с discovery candidates (payd_discovery.json) и
   поддерживает минимальный размер сектора.

   Контракт:
     - replaceProject(invalid) — заменить один проект
     - ensureMinSectorSize(sector, minSize) — добрать проекты до минимума
     - getReplacementHistory() — лог замен
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

    class EnhancedProjectReplacementService {
        constructor(config = {}) {
            this.discoveryCandidates = config.discoveryCandidates || [];
            this.minSectorSize = config.minSectorSize || 30;
            this.lifecycleLogger = config.lifecycleLogger || null;
            this.projects = config.projects || []; // текущий список
            this._usedCandidates = new Set();
            this._replacementHistory = [];
        }

        setProjects(projects) {
            this.projects = Array.isArray(projects) ? projects.slice() : [];
        }

        setDiscoveryCandidates(candidates) {
            this.discoveryCandidates = Array.isArray(candidates) ? candidates.slice() : [];
        }

        /**
         * Заменить невалидированный проект на нового кандидата.
         * @param {Object} invalid — { projectId, reasons, sector }
         * @returns {Promise<{success, removed, added}>}
         */
        async replaceProject(invalid) {
            if (!invalid || !invalid.projectId) {
                return { success: false, error: 'invalid_input' };
            }

            // Найти сектор проекта
            const sector = invalid.sector
                || this._findSector(invalid.projectId);

            // Найти подходящего кандидата
            const candidate = this._findBestCandidate(sector);
            if (!candidate) {
                if (this.lifecycleLogger) {
                    this.lifecycleLogger.log({
                        type: 'replaced',
                        projectId: invalid.projectId,
                        sector,
                        reason: 'no_candidate_available',
                        success: false,
                    });
                }
                return { success: false, error: 'no_candidate_available' };
            }

            // Удалить старый, добавить нового
            this.projects = this.projects.filter(p =>
                (p.id || p.symbol) !== invalid.projectId
            );
            const newProject = {
                id: candidate.id || candidate.symbol,
                name: candidate.name || candidate.id,
                symbol: candidate.symbol,
                sector,
                coingeckoId: _readField(candidate, 'coingeckoId'),
                verifiedStatus: 'verified',
                source: 'discovery_replacement',
                addedAt: new Date().toISOString(),
            };
            this.projects.push(newProject);
            this._usedCandidates.add(candidate.id || candidate.symbol);

            const entry = {
                removed: invalid.projectId,
                added: newProject.id,
                sector,
                reasons: invalid.reasons,
                cycleId: invalid.cycleId,
                replacedAt: new Date().toISOString(),
            };
            this._replacementHistory.push(entry);

            if (this.lifecycleLogger) {
                this.lifecycleLogger.log({
                    type: 'replaced',
                    projectId: invalid.projectId,
                    replacementId: newProject.id,
                    sector,
                    reason: (invalid.reasons || []).join(', '),
                    cycleId: invalid.cycleId,
                });
            }

            return { success: true, removed: invalid.projectId, added: newProject.id };
        }

        /**
         * Убедиться, что в каждом секторе минимум minSize проектов.
         * Добрать недостающих из кандидатов.
         */
        async ensureMinSectorSize() {
            const sectors = new Set();
            for (const p of this.projects) {
                if (p.sector) sectors.add(p.sector);
            }
            const results = {};
            for (const sector of sectors) {
                const count = this.projects.filter(p => p.sector === sector).length;
                const needed = Math.max(0, this.minSectorSize - count);
                if (needed === 0) {
                    results[sector] = { added: 0, total: count };
                    continue;
                }
                let added = 0;
                for (let i = 0; i < needed; i++) {
                    const candidate = this._findBestCandidate(sector);
                    if (!candidate) break;
                    this.projects.push({
                        id: candidate.id || candidate.symbol,
                        name: candidate.name || candidate.id,
                        symbol: candidate.symbol,
                        sector,
                        coingeckoId: _readField(candidate, 'coingeckoId'),
                        verifiedStatus: 'verified',
                        source: 'discovery_topup',
                        addedAt: new Date().toISOString(),
                    });
                    this._usedCandidates.add(candidate.id || candidate.symbol);
                    added++;
                }
                if (this.lifecycleLogger && added > 0) {
                    this.lifecycleLogger.log({
                        type: 'sector_topped_up',
                        sector,
                        added,
                        total: count + added,
                    });
                }
                results[sector] = { added, total: count + added };
            }
            return results;
        }

        getProjects() {
            return this.projects.slice();
        }

        getReplacementHistory() {
            return this._replacementHistory.slice();
        }

        // -------------------- внутренние --------------------

        _findSector(projectId) {
            const p = this.projects.find(pp =>
                (pp.id || pp.symbol) === projectId
            );
            return p ? p.sector : null;
        }

        _findBestCandidate(sector) {
            for (const c of this.discoveryCandidates) {
                const cid = c.id || c.symbol;
                if (this._usedCandidates.has(cid)) continue;
                if (sector && c.sector && c.sector !== sector) continue;
                // Поддержка verifiedStatus (camelCase) и verified_status (snake_case)
                const verifiedStatus = _readField(c, 'verifiedStatus');
                if (verifiedStatus && verifiedStatus !== 'verified') continue;
                const cgId  = _readField(c, 'coingeckoId');
                const cmcId = _readField(c, 'cmcId');
                if (!cgId && !cmcId) continue;
                return c;
            }
            return null;
        }
    }

    global.PAYD_INTEL = global.PAYD_INTEL || {};
    global.PAYD_INTEL.EnhancedProjectReplacementService = EnhancedProjectReplacementService;

})(window);
