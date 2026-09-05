/**
 * LearningCenterUI.js
 *
 * UI-компонент для вкладки "Learning Center" в PAYD Trading Lab.
 * 6 уровней × 6 уроков = 36 уроков теории.
 *
 * Структура:
 *   mode-levels   — список 6 уровней (карточки)
 *   mode-lessons  — список 6 уроков выбранного уровня
 *   mode-lesson   — содержимое урока (теория, чек-листы, ошибки, кнопка практики)
 */
(function (global) {
    'use strict';

    if (!global) throw new Error('[LearningCenterUI] global is required');
    if (!global.EducationContent) {
        console.error('[LearningCenterUI] EducationContent не загружен');
        return;
    }

    // Цветовые схемы для уровней
    const COLOR_THEMES = {
        emerald: { bg: 'from-emerald-500/20 to-emerald-700/5', border: 'border-emerald-500/30', text: 'text-emerald-400', glow: 'rgba(16, 185, 129, 0.15)' },
        blue:    { bg: 'from-blue-500/20 to-blue-700/5',       border: 'border-blue-500/30',    text: 'text-blue-400',    glow: 'rgba(59, 130, 246, 0.15)' },
        violet:  { bg: 'from-violet-500/20 to-violet-700/5',   border: 'border-violet-500/30',  text: 'text-violet-400',  glow: 'rgba(139, 92, 246, 0.15)' },
        amber:   { bg: 'from-amber-500/20 to-amber-700/5',     border: 'border-amber-500/30',   text: 'text-amber-400',   glow: 'rgba(245, 158, 11, 0.15)' },
        rose:    { bg: 'from-rose-500/20 to-rose-700/5',       border: 'border-rose-500/30',    text: 'text-rose-400',    glow: 'rgba(244, 63, 94, 0.15)' },
        cyan:    { bg: 'from-cyan-500/20 to-cyan-700/5',       border: 'border-cyan-500/30',    text: 'text-cyan-400',    glow: 'rgba(6, 182, 212, 0.15)' }
    };

    // Состояние
    let state = {
        mode: 'levels',        // 'levels' | 'lessons' | 'lesson'
        levelIndex: null,      // 1..6
        lessonNumber: null     // 1..6
    };

    function init() {
        if (!state._initialized) {
            renderLevels();
            state._initialized = true;
        }
    }

    function refresh() {
        // При повторном заходе на вкладку — обновить текущий view
        if (state.mode === 'levels') renderLevels();
        else if (state.mode === 'lessons') renderLessons(state.levelIndex);
        else if (state.mode === 'lesson') renderLesson(state.levelIndex, state.lessonNumber);
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    // ============================================================
    // РЕЖИМ 1: Список уровней
    // ============================================================
    function renderLevels() {
        state.mode = 'levels';
        state.levelIndex = null;
        state.lessonNumber = null;

        const root = document.getElementById('lab-education-host');
        if (!root) return;

        const levels = global.EducationContent.getAllLevels();
        const cardsHtml = levels.map((lvl) => {
            const theme = COLOR_THEMES[lvl.color] || COLOR_THEMES.emerald;
            const lessonsCount = lvl.lessons.length;
            return `
                <div class="relative overflow-hidden rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.bg} p-6 hover:scale-[1.02] transition-transform cursor-pointer group"
                     onclick="LearningCenterUI.openLevel(${lvl.number})">
                    <div class="flex items-start justify-between mb-4">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-xl bg-bg-800 flex items-center justify-center text-2xl">${lvl.icon}</div>
                            <div>
                                <div class="text-xs text-text-500 uppercase tracking-wider">Уровень ${lvl.number}</div>
                                <div class="text-lg font-bold text-white">${escapeHtml(lvl.title)}</div>
                            </div>
                        </div>
                        <div class="${theme.text} text-3xl font-bold opacity-30 group-hover:opacity-100 transition-opacity">${String(lvl.number).padStart(2, '0')}</div>
                    </div>
                    <p class="text-sm text-text-500 mb-4 line-clamp-2">${escapeHtml(lvl.description)}</p>
                    <div class="flex items-center justify-between">
                        <div class="text-xs ${theme.text}">${lessonsCount} уроков</div>
                        <div class="text-xs text-text-500 group-hover:text-white transition-colors">Открыть →</div>
                    </div>
                </div>
            `;
        }).join('');

        root.innerHTML = `
            <div class="mb-8">
                <h2 class="text-3xl font-bold text-white mb-2">Learning Center</h2>
                <p class="text-text-500">Структурированная образовательная программа: 6 уровней, 36 уроков теории с практическими заданиями</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                ${cardsHtml}
            </div>
        `;
    }

    // ============================================================
    // РЕЖИМ 2: Список уроков уровня
    // ============================================================
    function renderLessons(levelIndex) {
        state.mode = 'lessons';
        state.levelIndex = levelIndex;
        state.lessonNumber = null;

        const root = document.getElementById('lab-education-host');
        if (!root) return;

        const lvl = global.EducationContent.getLevel(levelIndex);
        if (!lvl) return renderLevels();

        const theme = COLOR_THEMES[lvl.color] || COLOR_THEMES.emerald;

        const lessonsHtml = lvl.lessons.map((lesson) => {
            const isLast = lesson.number === 6;
            return `
                <div class="flex items-center gap-4 p-5 rounded-xl bg-bg-800 border border-border-700 hover:border-accent-500 transition-colors cursor-pointer group"
                     onclick="LearningCenterUI.openLesson(${lvl.number}, ${lesson.number})">
                    <div class="w-12 h-12 rounded-lg bg-gradient-to-br ${theme.bg} border ${theme.border} flex items-center justify-center text-lg font-bold ${theme.text} flex-shrink-0">
                        ${String(lesson.number).padStart(2, '0')}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2">
                            <div class="text-white font-semibold truncate">${escapeHtml(lesson.title)}</div>
                            ${isLast ? '<span class="px-2 py-0.5 bg-accent-500/20 text-accent-500 text-[10px] rounded uppercase font-semibold">Практика</span>' : ''}
                        </div>
                        <div class="text-xs text-text-500 mt-1">${(lesson.sections || []).length} разделов</div>
                    </div>
                    <div class="text-text-500 group-hover:text-white transition-colors">→</div>
                </div>
            `;
        }).join('');

        root.innerHTML = `
            <div class="flex items-center gap-4 mb-4">
                <button onclick="LearningCenterUI.backToLevels()" class="text-text-500 hover:text-white text-sm transition-colors">
                    ← Назад к сценариям
                </button>
            </div>
            <div class="flex items-center gap-4 mb-2">
                <div class="w-16 h-16 rounded-2xl bg-bg-800 border ${theme.border} flex items-center justify-center text-3xl">${lvl.icon}</div>
                <div>
                    <div class="text-xs ${theme.text} uppercase tracking-wider font-semibold">Уровень ${lvl.number}</div>
                    <h2 class="text-3xl font-bold text-white">${escapeHtml(lvl.title)}</h2>
                    <p class="text-text-500 text-sm">${escapeHtml(lvl.subtitle)}</p>
                </div>
            </div>
            <div class="h-px bg-border-700 my-6"></div>
            <div class="space-y-3">
                ${lessonsHtml}
            </div>
        `;
    }

    // ============================================================
    // РЕЖИМ 3: Содержимое урока
    // ============================================================
    function renderLesson(levelIndex, lessonNumber) {
        state.mode = 'lesson';
        state.levelIndex = levelIndex;
        state.lessonNumber = lessonNumber;

        const root = document.getElementById('lab-education-host');
        if (!root) return;

        const lesson = global.EducationContent.getLesson(levelIndex, lessonNumber);
        const lvl = global.EducationContent.getLevel(levelIndex);
        if (!lesson || !lvl) return renderLevels();

        const theme = COLOR_THEMES[lvl.color] || COLOR_THEMES.emerald;
        const isLast = lessonNumber === 6;

        const sectionsHtml = (lesson.sections || []).map((section) => {
            let body = '';
            if (section.body) {
                body = `<p class="text-text-500 leading-relaxed mb-3">${escapeHtml(section.body)}</p>`;
            }
            if (section.list && Array.isArray(section.list)) {
                body += '<ul class="space-y-2 mb-3">' +
                    section.list.map(item => `<li class="flex items-start gap-2 text-text-500"><span class="${theme.text} mt-1">▸</span><span>${escapeHtml(item)}</span></li>`).join('') +
                    '</ul>';
            }
            return `
                <div class="mb-6">
                    <h3 class="text-xl font-bold text-white mb-3">${escapeHtml(section.heading || '')}</h3>
                    ${body}
                </div>
            `;
        }).join('');

        // Чек-лист
        let checklistHtml = '';
        if (lesson.checklist && Array.isArray(lesson.checklist) && lesson.checklist.length > 0) {
            checklistHtml = `
                <div class="rounded-2xl border ${theme.border} bg-gradient-to-br ${theme.bg} p-6 mb-6">
                    <div class="flex items-center gap-2 mb-4">
                        <div class="text-2xl">✅</div>
                        <h3 class="text-lg font-bold text-white">Чек-лист</h3>
                    </div>
                    <div class="space-y-2">
                        ${lesson.checklist.map(item => `
                            <label class="flex items-start gap-3 p-3 rounded-lg bg-bg-800/50 hover:bg-bg-800 cursor-pointer">
                                <input type="checkbox" class="mt-1 w-4 h-4 rounded border-border-700 bg-bg-800 ${theme.text}">
                                <span class="text-sm text-text-500">${escapeHtml(item)}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Типичные ошибки
        let mistakesHtml = '';
        if (lesson.mistakes && Array.isArray(lesson.mistakes) && lesson.mistakes.length > 0) {
            mistakesHtml = `
                <div class="rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/10 to-rose-700/5 p-6 mb-6">
                    <div class="flex items-center gap-2 mb-4">
                        <div class="text-2xl">⚠️</div>
                        <h3 class="text-lg font-bold text-white">Типичные ошибки</h3>
                    </div>
                    <div class="space-y-2">
                        ${lesson.mistakes.map(item => `
                            <div class="flex items-start gap-2 text-sm text-text-500 p-2 rounded bg-bg-800/30">
                                <span class="text-rose-400 mt-0.5">✗</span>
                                <span>${escapeHtml(item)}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Кнопка перехода в Trading Terminal (на уроке 6 / последнем уроке уровня)
        let terminalHtml = '';
        if (isLast) {
            terminalHtml = `
                <div class="rounded-2xl border border-accent-500/30 bg-gradient-to-br from-accent-500/10 to-accent-700/5 p-6 mt-8 text-center">
                    <div class="text-3xl mb-3">🎯</div>
                    <h3 class="text-xl font-bold text-white mb-2">Готовы к практике?</h3>
                    <p class="text-text-500 text-sm mb-4">Закрепите теорию на реальных сценариях в Trading Terminal</p>
                    <button onclick="LearningCenterUI.goToTradingTerminal(${levelIndex})" class="px-6 py-3 bg-accent-500 hover:bg-accent-600 text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 mx-auto">
                        <span>▶</span><span>Перейти в Trading Terminal</span>
                    </button>
                </div>
            `;
        }

        // Навигация между уроками
        const prevLesson = lessonNumber > 1 ? lessonNumber - 1 : null;
        const nextLesson = lessonNumber < 6 ? lessonNumber + 1 : null;
        const navHtml = `
            <div class="flex items-center justify-between mt-8 pt-6 border-t border-border-700">
                ${prevLesson
                    ? `<button onclick="LearningCenterUI.openLesson(${levelIndex}, ${prevLesson})" class="text-text-500 hover:text-white text-sm transition-colors">← Урок ${prevLesson}</button>`
                    : '<div></div>'}
                ${nextLesson
                    ? `<button onclick="LearningCenterUI.openLesson(${levelIndex}, ${nextLesson})" class="text-text-500 hover:text-white text-sm transition-colors">Урок ${nextLesson} →</button>`
                    : '<div></div>'}
            </div>
        `;

        root.innerHTML = `
            <div class="flex items-center gap-4 mb-4">
                <button onclick="LearningCenterUI.backToLevels()" class="text-text-500 hover:text-white text-sm transition-colors">
                    ← Назад к сценариям
                </button>
            </div>
            <div class="flex items-center gap-3 mb-2">
                <div class="w-10 h-10 rounded-lg bg-gradient-to-br ${theme.bg} border ${theme.border} flex items-center justify-center text-base font-bold ${theme.text}">
                    ${String(lessonNumber).padStart(2, '0')}
                </div>
                <div class="text-xs ${theme.text} uppercase tracking-wider font-semibold">Урок ${lessonNumber} из 6</div>
            </div>
            <h1 class="text-3xl font-bold text-white mb-6">${escapeHtml(lesson.title)}</h1>
            <div class="prose prose-invert max-w-none">
                ${sectionsHtml}
            </div>
            ${checklistHtml}
            ${mistakesHtml}
            ${terminalHtml}
            ${navHtml}
        `;

        // Прокрутка наверх
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // ============================================================
    // Публичные методы
    // ============================================================
    function openLevel(levelIndex) {
        renderLessons(levelIndex);
    }

    function openLesson(levelIndex, lessonNumber) {
        renderLesson(levelIndex, lessonNumber);
    }

    function backToLevels() {
        renderLevels();
    }

    function backToLessons(levelIndex) {
        renderLessons(levelIndex);
    }

    function goToTradingTerminal(levelIndex) {
        // Переключаемся на вкладку Trading Terminal (отдельный экран)
        if (typeof switchLabTab === 'function') {
            switchLabTab('terminal');
        }
    }

    function showNotification(text) {
        const n = document.createElement('div');
        n.className = 'fixed top-24 right-6 z-50 px-5 py-3 bg-accent-500 text-white rounded-lg shadow-lg font-medium text-sm';
        n.textContent = text;
        document.body.appendChild(n);
        setTimeout(() => {
            n.style.transition = 'opacity 0.3s';
            n.style.opacity = '0';
            setTimeout(() => n.remove(), 300);
        }, 3000);
    }

    // Экспорт
    global.LearningCenterUI = {
        init: init,
        refresh: refresh,
        openLevel: openLevel,
        openLesson: openLesson,
        backToLevels: backToLevels,
        backToLessons: backToLessons,
        goToTradingTerminal: goToTradingTerminal,
        getState: () => ({ ...state })
    };

    // Помечаем состояние инициализации
    Object.defineProperty(global.LearningCenterUI, '_initialized', {
        get: () => state._initialized === true
    });

    // Автоинициализация: при загрузке страницы
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            setTimeout(() => global.LearningCenterUI && global.LearningCenterUI.init(), 100);
        });
    } else {
        setTimeout(() => global.LearningCenterUI && global.LearningCenterUI.init(), 100);
    }

})(typeof window !== 'undefined' ? window : globalThis);
