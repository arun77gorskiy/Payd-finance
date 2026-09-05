/**
 * ScenarioProgressTracker.js — независимый трекер прогресса пользователя.
 *
 * Хранит историю попыток прохождения сценариев в localStorage.
 * Используется для отображения статистики и прогресса обучения.
 *
 * API:
 *   window.ScenarioProgressTracker.load()                 — загрузить всё состояние
 *   window.ScenarioProgressTracker.save(state)            — сохранить состояние
 *   window.ScenarioProgressTracker.recordAttempt(a)       — записать попытку
 *   window.ScenarioProgressTracker.getProgress()          — получить текущий прогресс
 *   window.ScenarioProgressTracker.reset()                — сбросить все данные
 *
 * Попытка (attempt):
 *   { scenarioId, userDecision, correctDecision, result, time, isCorrect }
 */

(function (global) {
    'use strict';

    const STORAGE_KEY = 'payd_scenario_progress';

    /**
     * Загрузить состояние из localStorage.
     */
    function load() {
        try {
            const data = localStorage.getItem(STORAGE_KEY);
            if (data) return JSON.parse(data);
        } catch (e) {
            console.warn('[ScenarioProgress] Ошибка чтения:', e);
        }
        return { attempts: [], stats: {}, lastUpdated: null };
    }

    /**
     * Сохранить состояние в localStorage.
     */
    function save(state) {
        try {
            state.lastUpdated = new Date().toISOString();
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch (e) {
            console.warn('[ScenarioProgress] localStorage недоступен:', e);
        }
    }

    /**
     * Записать попытку пользователя.
     * Если сценарий уже встречался — обновляем запись.
     */
    function recordAttempt(attempt) {
        const state = load();
        const existing = state.attempts.find(function (a) {
            return a.scenarioId === attempt.scenarioId;
        });
        if (existing) {
            existing.attemptsCount = (existing.attemptsCount || 1) + 1;
            existing.lastUserDecision = attempt.userDecision;
            existing.lastResult = attempt.result;
            existing.lastTime = attempt.time;
            existing.lastAttemptAt = new Date().toISOString();
            existing.history = existing.history || [];
            existing.history.push({
                decision: attempt.userDecision,
                result: attempt.result,
                isCorrect: attempt.isCorrect,
                at: new Date().toISOString()
            });
        } else {
            state.attempts.push({
                scenarioId: attempt.scenarioId,
                correctDecision: attempt.correctDecision,
                attemptsCount: 1,
                lastUserDecision: attempt.userDecision,
                lastResult: attempt.result,
                lastTime: attempt.time,
                lastAttemptAt: new Date().toISOString(),
                history: [{
                    decision: attempt.userDecision,
                    result: attempt.result,
                    isCorrect: attempt.isCorrect,
                    at: new Date().toISOString()
                }]
            });
        }

        // Обновляем статистику
        const totalAttempts = state.attempts.reduce(function (sum, a) {
            return sum + (a.attemptsCount || 1);
        }, 0);
        const correctAttempts = state.attempts.reduce(function (sum, a) {
            const correct = (a.history || []).filter(function (h) { return h.isCorrect; }).length;
            return sum + correct;
        }, 0);
        state.stats = {
            totalAttempts: totalAttempts,
            correctAttempts: correctAttempts,
            accuracy: totalAttempts > 0 ? Math.round((correctAttempts / totalAttempts) * 100) : 0,
            uniqueScenarios: state.attempts.length
        };

        save(state);
        return state.stats;
    }

    /**
     * Получить текущий прогресс.
     */
    function getProgress() {
        return load();
    }

    /**
     * Сбросить все данные.
     */
    function reset() {
        try {
            localStorage.removeItem(STORAGE_KEY);
        } catch (e) {
            console.warn('[ScenarioProgress] Ошибка сброса:', e);
        }
        return { attempts: [], stats: {} };
    }

    global.ScenarioProgressTracker = {
        load: load,
        save: save,
        recordAttempt: recordAttempt,
        getProgress: getProgress,
        reset: reset
    };

    console.log('[ScenarioProgress] Tracker загружен.');

})(typeof window !== 'undefined' ? window : globalThis);