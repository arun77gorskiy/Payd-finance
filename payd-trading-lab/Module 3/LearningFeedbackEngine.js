/**
 * LearningFeedbackEngine — Module 3 (Learning & Feedback).
 *
 * ════════════════════════════════════════════════════════════════════════
 *  PAYD Trading Lab — Module 3 (финальный слой архитектуры)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Архитектурный контракт:
 *    ✗ НЕ анализирует график
 *    ✗ НЕ интерпретирует структуру / моментум / объём / SMC / волатильность
 *    ✗ НЕ вызывает coreAnalysisEngine.analyzeMarket()
 *    ✗ НЕ импортирует анализаторы
 *    ✗ НЕ вычисляет вероятности, тренды, силу сигналов
 *    ✗ НЕ оценивает решение пользователя (это Module 2)
 *
 *    ✓ Только читает готовые поля AnalysisResult от Module X
 *    ✓ Использует результат Module 2 (verdict, explanation, evidenceAnalysis)
 *    ✓ Генерирует обучающую обратную связь
 *
 *  Вход:  {
 *           analysis:      AnalysisResult (от Module X),
 *           userDecision:  string (id решения),
 *           module2Result: Module2Result (от Module 2),
 *           userEvidence:  string[] (опционально)
 *         }
 *  Выход: {
 *           timestamp,
 *           whyExplanation,        // 1. Explain Why
 *           missedSignals,         // 2. Missed Signals
 *           cognitiveBiases,       // 3. Cognitive Bias Detection
 *           learningTips,          // 4. Learning Tips
 *           difficulty,            // 5. Difficulty Assessment
 *           lesson,                // 6. Lesson Generator
 *           moduleVersion
 *         }
 *
 *  Зависимости:
 *    - AnalysisResult (от Module X) — ЕДИНСТВЕННЫЙ источник данных о рынке
 *    - Module2Result (от Module 2) — оценка решения
 *
 *  Это слой ОБУЧЕНИЯ. Не парсер. Не интерпретатор. Не оценщик.
 */
(function (global) {
    'use strict';

    // ================================================================
    // Версия модуля
    // ================================================================
    const MODULE_VERSION = '1.0.0';

    // ================================================================
    // READ-функции — извлекают готовые данные из AnalysisResult.
    // ТОЛЬКО чтение полей. Никаких вычислений.
    // ================================================================

    /** bias: bullish / bearish / neutral */
    function _readBias(x) {
        if (!x) return 'neutral';
        if (x.trend && x.trend.primaryTrend) {
            const t = x.trend.primaryTrend;
            if (/bull/i.test(t) && !/bear/i.test(t)) return 'bullish';
            if (/bear/i.test(t)) return 'bearish';
        }
        if (x.marketStructure && x.marketStructure.type) {
            if (x.marketStructure.type === 'uptrend') return 'bullish';
            if (x.marketStructure.type === 'downtrend') return 'bearish';
        }
        return 'neutral';
    }

    /** trend strength: 0..100 */
    function _readTrendStrength(x) {
        if (!x) return 0;
        if (x.trend && typeof x.trend.strength === 'number') return x.trend.strength;
        if (x.marketStructure && typeof x.marketStructure.strength === 'number') return x.marketStructure.strength;
        return 0;
    }

    /** confidence: 0..100 или null */
    function _readConfidence(x) {
        if (!x) return null;
        if (x.confidence && typeof x.confidence.percent === 'number') return Math.round(x.confidence.percent);
        if (typeof x.confidence === 'number') return Math.round(x.confidence);
        return null;
    }

    /** marketPhase.phase */
    function _readMarketPhase(x) {
        if (!x) return 'unknown';
        if (x.marketPhase && x.marketPhase.phase) return x.marketPhase.phase;
        if (x.marketStructure && x.marketStructure.type) return x.marketStructure.type;
        return 'unknown';
    }

    /** scenarios */
    function _readScenarios(x) {
        if (!x) return [];
        return Array.isArray(x.scenarios) ? x.scenarios : [];
    }

    /** evidence.keySignals */
    function _readKeySignals(x) {
        if (!x || !x.evidence) return [];
        if (Array.isArray(x.evidence.keySignals)) return x.evidence.keySignals;
        return [];
    }

    /** evidence.supporting */
    function _readSupportingSignals(x) {
        if (!x || !x.evidence) return [];
        if (Array.isArray(x.evidence.supporting)) return x.evidence.supporting;
        return [];
    }

    /** evidence.against */
    function _readAgainstSignals(x) {
        if (!x || !x.evidence) return [];
        if (Array.isArray(x.evidence.against)) return x.evidence.against;
        return [];
    }

    /** confluence score */
    function _readConfluenceScore(x) {
        if (!x || !x.confluence) return null;
        if (typeof x.confluence.score === 'number') return x.confluence.score;
        if (typeof x.confluence.value === 'number') return x.confluence.value;
        return null;
    }

    /** confluence level/count */
    function _readConfluenceLevel(x) {
        if (!x || !x.confluence) return 0;
        if (Array.isArray(x.confluence.sources)) return x.confluence.sources.length;
        if (typeof x.confluence.level === 'number') return x.confluence.level;
        return 0;
    }

    /** conflicting signals count */
    function _readConflictingCount(x) {
        if (!x || !x.confluence) return 0;
        if (typeof x.confluence.conflictingSignals === 'number') return x.confluence.conflictingSignals;
        if (Array.isArray(x.confluence.conflicting)) return x.confluence.conflicting.length;
        return 0;
    }

    /** continuation probability (0..1) */
    function _readContinuationPct(x) {
        if (!x || !x.probabilities || typeof x.probabilities.continuation !== 'number') return null;
        const p = x.probabilities.continuation;
        return p <= 1 ? Math.round(p * 100) : Math.round(p);
    }

    // ================================================================
    // Коллекторы сигналов по категориям.
    // Категории: Price Action, Smart Money, Structure, Volume,
    //            Liquidity, Momentum.
    // Только ЧТЕНИЕ полей AnalysisResult — никаких вычислений.
    // ================================================================

    /** Возвращает список значимых элементов массива (убирая пустые) */
    function _safeArray(x) {
        return Array.isArray(x) ? x.filter(Boolean) : [];
    }

    function _collectPriceActionSignals(x) {
        if (!x || !x.priceAction) return [];
        const out = [];
        const pa = x.priceAction;
        if (pa.pattern) out.push(pa.pattern);
        if (pa.summary) out.push(pa.summary);
        if (Array.isArray(pa.signals)) out.push(...pa.signals);
        if (Array.isArray(pa.candles)) out.push(...pa.candles.map(c => c && (c.name || c.type)));
        return _safeArray(out).filter(s => typeof s === 'string');
    }

    function _collectSmartMoneySignals(x) {
        if (!x || !x.smartMoney) return [];
        const out = [];
        const sm = x.smartMoney;
        if (sm.summary) out.push(sm.summary);
        if (sm.concept) out.push(sm.concept);
        if (Array.isArray(sm.concepts)) out.push(...sm.concepts);
        if (Array.isArray(sm.signals)) out.push(...sm.signals);
        if (sm.orderBlocks) {
            const obs = _safeArray(sm.orderBlocks);
            obs.slice(0, 2).forEach(o => o && (o.type || o.zone) && out.push(`order-block: ${o.type || o.zone}`));
        }
        return _safeArray(out).filter(s => typeof s === 'string');
    }

    function _collectStructureSignals(x) {
        if (!x || !x.marketStructure) return [];
        const out = [];
        const ms = x.marketStructure;
        if (ms.type) out.push(`type: ${ms.type}`);
        if (ms.summary) out.push(ms.summary);
        if (Array.isArray(ms.swings) && ms.swings.length > 0) {
            out.push(`${ms.swings.length} swing points`);
        }
        if (ms.structureShift) out.push(`shift: ${ms.structureShift}`);
        return _safeArray(out);
    }

    function _collectVolumeSignals(x) {
        if (!x || !x.volume) return [];
        const out = [];
        const v = x.volume;
        if (v.trend) out.push(`volume ${v.trend}`);
        if (v.summary) out.push(v.summary);
        if (typeof v.relative === 'number') {
            out.push(`relative: ${v.relative}`);
        }
        if (Array.isArray(v.spikes)) out.push(...v.spikes);
        if (Array.isArray(v.signals)) out.push(...v.signals);
        return _safeArray(out).filter(s => typeof s === 'string');
    }

    function _collectLiquiditySignals(x) {
        if (!x || !x.liquidity) return [];
        const out = [];
        const l = x.liquidity;
        if (l.summary) out.push(l.summary);
        if (Array.isArray(l.levels)) out.push(...l.levels);
        if (Array.isArray(l.zones)) out.push(...l.zones);
        return _safeArray(out).filter(s => typeof s === 'string');
    }

    function _collectMomentumSignals(x) {
        if (!x || !x.momentum) return [];
        const out = [];
        const m = x.momentum;
        if (m.trend) out.push(`momentum ${m.trend}`);
        if (m.summary) out.push(m.summary);
        if (typeof m.value === 'number') out.push(`momentum value: ${m.value}`);
        if (Array.isArray(m.divergences)) out.push(...m.divergences);
        return _safeArray(out).filter(s => typeof s === 'string');
    }

    /**
     * Собирает ВСЕ ключевые сигналы из AnalysisResult по категориям.
     * Это «сырое сырьё» для Missed Signals.
     */
    function _collectAllCategorizedSignals(x) {
        return {
            priceAction: _collectPriceActionSignals(x),
            smartMoney: _collectSmartMoneySignals(x),
            structure: _collectStructureSignals(x),
            volume: _collectVolumeSignals(x),
            liquidity: _collectLiquiditySignals(x),
            momentum: _collectMomentumSignals(x)
        };
    }

    // ================================================================
    // 1. EXPLAIN WHY
    // Почему решение оказалось правильным/ошибочным.
    // Опирается на verdict + score + explanation от Module 2.
    // ================================================================

    function _explainWhy(analysis, decision, module2Result, bias) {
        if (!module2Result || !decision) {
            return {
                headline: 'Нет данных для объяснения.',
                bullets: [],
                confidenceNote: 'unknown'
            };
        }

        const verdict = module2Result.verdict;
        const score = module2Result.score;
        const confidence = _readConfidence(analysis);
        const baseRow = (module2Result.evidenceAnalysis && module2Result.evidenceAnalysis.modifier !== undefined)
            ? null : null;

        const headline = (() => {
            if (verdict === 'correct') {
                return `Решение «${decision.shortLabel || decision.label}» соответствует выводам Module X (${bias}-bias).`;
            }
            if (verdict === 'incorrect') {
                return `Решение «${decision.shortLabel || decision.label}» противоречит выводам Module X (${bias}-bias).`;
            }
            return `Решение «${decision.shortLabel || decision.label}» допустимо, но требует осторожности (${bias}-bias).`;
        })();

        const bullets = [];

        // Базовая логика скоринга (на основе category/direction)
        if (decision.category === 'directional') {
            if (verdict === 'correct') {
                bullets.push(`Направление решения (${decision.direction}) совпадает с ${bias}-bias от Module X.`);
            } else if (verdict === 'incorrect') {
                bullets.push(`Решение направлено против ${bias}-bias от Module X — это против тренда.`);
            } else {
                bullets.push(`Решение направлено, но bias неопределён — повышенная неопределённость.`);
            }
        } else if (decision.category === 'counter-trend') {
            bullets.push(`Это контртрендовая сделка. Bias от Module X: ${bias}.`);
        } else if (decision.category === 'conditional') {
            bullets.push(`Условный вход (entry style: ${decision.entryStyle || 'n/a'}) — требует срабатывания триггера.`);
        } else if (decision.category === 'risk-managed') {
            bullets.push(`Управление позицией (риск-менеджмент) — фокус не на направлении.`);
        } else if (decision.category === 'neutral') {
            bullets.push(`Нейтральное решение (дисциплина / ожидание) — вне зависимости от bias.`);
        }

        // Confidence
        if (confidence !== null) {
            if (confidence >= 80) {
                bullets.push(`Module X оценивает уверенность как высокую (${confidence}%).`);
            } else if (confidence < 50) {
                bullets.push(`Module X оценивает уверенность как низкую (${confidence}%) — много шума.`);
            } else {
                bullets.push(`Module X оценивает уверенность как среднюю (${confidence}%).`);
            }
        } else {
            bullets.push('Уверенность от Module X недоступна.');
        }

        // Evidence
        if (module2Result.evidenceAnalysis) {
            const ev = module2Result.evidenceAnalysis;
            if (ev.matches && ev.matches.length > 0) {
                bullets.push(`Подтверждения учтены: ${ev.matches.length} из ${(ev.matches.length + (ev.misses || []).length)}.`);
            }
            if (ev.misses && ev.misses.length > 0) {
                bullets.push(`Пропущены подтверждения: ${ev.misses.length}.`);
            }
        }

        // Better alternative
        if (module2Result.explanation && module2Result.explanation.betterAlternative) {
            const alt = module2Result.explanation.betterAlternative;
            bullets.push(`Альтернатива из scenarios Module X: «${alt.label || alt.id}».`);
        }

        // Score context
        if (typeof score === 'number') {
            bullets.push(`Итоговый score Module 2: ${score} (чем выше — тем лучше).`);
        }

        return {
            headline,
            bullets,
            confidenceNote: confidence !== null
                ? (confidence >= 80 ? 'high' : (confidence < 50 ? 'low' : 'medium'))
                : 'unknown'
        };
    }

    // ================================================================
    // 2. MISSED SIGNALS
    // Какие сигналы были доступны в AnalysisResult, но пользователь
    // их НЕ учёл (на основе userEvidence).
    // ================================================================

    /**
     * Сравнивает ключевые сигналы по категориям с подтверждениями,
     * которые отметил пользователь. Возвращает список «потенциально
     * пропущенных» сигналов.
     */
    function _detectMissedSignals(analysis, userEvidence, decision) {
        const categorized = _collectAllCategorizedSignals(analysis);
        const userSet = new Set(Array.isArray(userEvidence) ? userEvidence : []);

        const missed = [];
        const accounted = new Set(); // уже учтённые категории

        function _pushIfMissed(categoryName, signals) {
            if (!signals || signals.length === 0) return;
            // Сигнал считается пропущенным, если строка из AnalysisResult
            // не пересекается с userEvidence и не была уже пропущена.
            const samples = signals.slice(0, 3).filter(Boolean);
            if (samples.length === 0) return;
            const notInUser = samples.filter(s => !userSet.has(s));
            if (notInUser.length > 0 && !accounted.has(categoryName)) {
                missed.push({
                    category: categoryName,
                    signals: notInUser,
                    severity: samples.length > 1 ? 'high' : 'medium',
                    note: `В категории «${categoryName}» найдено ${signals.length} сигнал(ов), подтверждения не отмечены.`
                });
                accounted.add(categoryName);
            } else if (samples.length > 0) {
                accounted.add(categoryName);
            }
        }

        _pushIfMissed('Price Action', categorized.priceAction);
        _pushIfMissed('Smart Money', categorized.smartMoney);
        _pushIfMissed('Structure', categorized.structure);
        _pushIfMissed('Volume', categorized.volume);
        _pushIfMissed('Liquidity', categorized.liquidity);
        _pushIfMissed('Momentum', categorized.momentum);

        // Дополнительно — supporting signals из evidence
        const supporting = _readSupportingSignals(analysis);
        if (supporting.length > 0) {
            const missedSupporting = supporting.filter(s => !userSet.has(s)).slice(0, 2);
            if (missedSupporting.length > 0) {
                missed.push({
                    category: 'Supporting Evidence',
                    signals: missedSupporting,
                    severity: 'medium',
                    note: 'Из блока supporting evidence часть подтверждений не отмечена.'
                });
            }
        }

        // Против-рыночные сигналы, проигнорированные пользователем
        const against = _readAgainstSignals(analysis);
        if (against.length > 0) {
            const missedAgainst = against.filter(s => !userSet.has(s)).slice(0, 2);
            if (missedAgainst.length > 0 && decision) {
                missed.push({
                    category: 'Against-Trend Signals',
                    signals: missedAgainst,
                    severity: 'high',
                    note: 'Есть сигналы против рынка, которые вы могли не учесть.'
                });
            }
        }

        return {
            total: missed.length,
            items: missed,
            categorical: {
                priceAction: categorized.priceAction,
                smartMoney: categorized.smartMoney,
                structure: categorized.structure,
                volume: categorized.volume,
                liquidity: categorized.liquidity,
                momentum: categorized.momentum
            }
        };
    }

    // ================================================================
    // 3. COGNITIVE BIAS DETECTION
    // Возможные психологические ошибки.
    // Module 3 НЕ утверждает факт — формулирует как вероятности.
    // ================================================================

    /**
     * Возвращает массив объектов с bias, вероятностью (0..1),
     * причиной вывода и индикаторами (из AnalysisResult).
     */
    function _detectCognitiveBiases(analysis, decision, module2Result) {
        const biases = [];
        if (!module2Result || !decision) return biases;

        const verdict = module2Result.verdict;
        const bias = _readBias(analysis);
        const decisionDir = decision.direction;
        const confidence = _readConfidence(analysis);
        const phase = _readMarketPhase(analysis);
        const continuationPct = _readContinuationPct(analysis);
        const trendStrength = _readTrendStrength(analysis);

        const SCORE = {
            FOMO: 'fomo',
            FEAR: 'fear',
            AGAINST_TREND: 'trading_against_trend',
            PREMATURE: 'premature_entry',
            LATE: 'late_entry',
            CONFIRMATION: 'confirmation_bias',
            OVERCONFIDENCE: 'overconfidence',
            REVENGE: 'revenge_trading',
            IMPATIENCE: 'impatience'
        };

        function _add(type, likelihood, indicators, explanation) {
            biases.push({
                type,
                likelihood: Math.min(1, Math.max(0, likelihood)),
                indicators,
                explanation
            });
        }

        // === FOMO ===
        // Решение принято в направлении тренда, но confidence низкий или
        // структура не подтверждена.
        const trendFollow = (bias === 'bullish' && decisionDir === 'long') ||
                            (bias === 'bearish' && decisionDir === 'short');
        if (trendFollow && (confidence === null || confidence < 60)) {
            _add(SCORE.FOMO, 0.6,
                [`confidence=${confidence}`, `bias=${bias}`],
                'Решение в направлении тренда при низкой уверенности — может указывать на FOMO (страх упустить движение).');
        }
        if (trendFollow && phase === 'consolidation') {
            _add(SCORE.FOMO, 0.55,
                [`phase=${phase}`, `bias=${bias}`],
                'Вход по тренду в фазе консолидации — типичный сценарий FOMO (импульсивный вход до пробоя).');
        }

        // === FEAR ===
        // Решение не идти в направлении тренда при высокой уверенности.
        if ((bias === 'bullish' && decisionDir === 'short') ||
            (bias === 'bearish' && decisionDir === 'long')) {
            if (confidence !== null && confidence >= 70) {
                _add(SCORE.FEAR, 0.35,
                    [`confidence=${confidence}`, `bias=${bias} vs decision=${decisionDir}`],
                    'Решение идёт против сильного тренда — возможна попытка «убежать» от страха, либо излишняя осторожность.');
            }
        }
        if (decision.category === 'neutral' && bias !== 'neutral' && confidence !== null && confidence >= 70) {
            _add(SCORE.IMPATIENCE, 0.5,
                [`category=neutral`, `bias=${bias}`, `confidence=${confidence}`],
                'Нейтральное решение при высокой уверенности тренда — возможно, страх или нетерпение мешают использовать ситуацию.');
        }

        // === TRADING AGAINST TREND ===
        // Прямое противоречие с bias.
        if ((bias === 'bullish' && decisionDir === 'short') ||
            (bias === 'bearish' && decisionDir === 'long')) {
            _add(SCORE.AGAINST_TREND, 0.85,
                [`bias=${bias}`, `decisionDir=${decisionDir}`],
                'Решение прямо против тренда — высокий риск «ловли дна/вершины».');
        }

        // === PREMATURE ENTRY ===
        // Вход на ранней стадии — phase/structure ещё не подтверждены.
        if (decision.category === 'directional') {
            if ((phase === 'transition' || phase === 'consolidation') && verdict !== 'correct') {
                _add(SCORE.PREMATURE, 0.7,
                    [`phase=${phase}`, `category=directional`],
                    'Направленный вход в фазе перехода/консолидации — преждевременный вход до подтверждения.');
            }
            if (trendStrength < 50 && bias !== 'neutral') {
                _add(SCORE.PREMATURE, 0.4,
                    [`trendStrength=${trendStrength}`, `bias=${bias}`],
                    'Тренд слабый, но вход направленный — может быть преждевременным.');
            }
        }

        // === LATE ENTRY ===
        // Вход после пропущенной части тренда — strong bias, продолжение вероятно.
        if (trendFollow && continuationPct !== null && continuationPct < 40 && confidence !== null && confidence >= 70) {
            _add(SCORE.LATE, 0.55,
                [`continuationPct=${continuationPct}`, `confidence=${confidence}`],
                'Вход при высокой уверенности, но низкой вероятности продолжения — возможно, тренд уже исчерпан.');
        }

        // === CONFIRMATION BIAS ===
        // Verdict incorrect + много пропущенных evidence — пользователь игнорирует контрсигналы.
        if (verdict === 'incorrect' && module2Result.evidenceAnalysis &&
            Array.isArray(module2Result.evidenceAnalysis.misses) &&
            module2Result.evidenceAnalysis.misses.length >= 1) {
            _add(SCORE.CONFIRMATION, 0.65,
                [`misses=${module2Result.evidenceAnalysis.misses.length}`, `verdict=${verdict}`],
                'Verdict incorrect при наличии пропущенных подтверждений — возможно, фокус только на «бычьих» сигналах.');
        }

        // === OVERCONFIDENCE ===
        // Высокий score при низкой confidence → пользователь переоценивает себя.
        if (module2Result.score >= 4 && confidence !== null && confidence < 50) {
            _add(SCORE.OVERCONFIDENCE, 0.6,
                [`module2Score=${module2Result.score}`, `confidence=${confidence}`],
                'Высокий score Module 2 при низкой уверенности Module X — возможна переоценка собственной интерпретации.');
        }

        // === REVENGE TRADING ===
        // Не имеет прямых данных, но можно эвристически:
        // если модуль 2 НЕ доступен, а verdict был incorrect — потенциально.
        // Можно также учесть repeated direction (но у нас один снапшот, не детектируем).

        // Дедупликация по type — оставляем максимальный likelihood.
        const dedup = {};
        for (const b of biases) {
            if (!dedup[b.type] || dedup[b.type].likelihood < b.likelihood) {
                dedup[b.type] = b;
            }
        }
        const sorted = Object.values(dedup).sort((a, b) => b.likelihood - a.likelihood);

        // Если ничего не нашлось — добавляем neutral
        if (sorted.length === 0) {
            sorted.push({
                type: 'none_detected',
                likelihood: 0,
                indicators: [],
                explanation: 'Явных признаков когнитивных искажений не обнаружено на основании доступных данных.'
            });
        }

        return sorted;
    }

    // ================================================================
    // 4. LEARNING TIPS
    // Что обратить внимание в следующий раз.
    // ================================================================

    /**
     * Генерирует конкретные советы на основе:
     *   - пропущенных сигналов
     *   - когнитивных искажений
     *   - структурных элементов AnalysisResult
     */
    function _generateLearningTips(analysis, decision, module2Result, missedSignals) {
        const tips = [];
        if (!analysis) return tips;

        const bias = _readBias(analysis);
        const confidence = _readConfidence(analysis);
        const phase = _readMarketPhase(analysis);
        const verdict = module2Result ? module2Result.verdict : null;

        // Совет 1: общая рекомендация по verdict
        if (verdict === 'incorrect') {
            tips.push({
                priority: 'high',
                title: 'Сверьтесь с bias Module X',
                detail: 'Ваше решение противоречит выводам Module X. В следующий раз начните с проверки общего направления тренда.'
            });
        } else if (verdict === 'risky') {
            tips.push({
                priority: 'medium',
                title: 'Изучите контекст глубже',
                detail: 'Решение допустимо, но данных недостаточно. Проверьте confluence и несколько сценариев перед входом.'
            });
        }

        // Совет 2: по пропущенным сигналам
        if (missedSignals && missedSignals.items && missedSignals.items.length > 0) {
            const topMissed = missedSignals.items[0];
            tips.push({
                priority: topMissed.severity === 'high' ? 'high' : 'medium',
                title: `Обратите внимание на ${topMissed.category}`,
                detail: `Сигналы в этой категории присутствовали в AnalysisResult, но не были отмечены. Изучите их в первую очередь.`
            });
        }

        // Совет 3: что проверить перед входом
        if (verdict === 'incorrect' || verdict === 'risky') {
            tips.push({
                priority: 'high',
                title: 'Перед входом проверьте',
                detail: '1) bias и структуру; 2) confluence score Module X; 3) обязательные подтверждения (requiredEvidence); 4) противоположные сигналы.'
            });
        }

        // Совет 4: контекст по фазе
        if (phase === 'consolidation') {
            tips.push({
                priority: 'medium',
                title: 'Фаза консолидации',
                detail: 'В фазе консолидации воздержитесь от направленных входов до пробоя и подтверждения.'
            });
        } else if (phase === 'transition') {
            tips.push({
                priority: 'medium',
                title: 'Фаза перехода',
                detail: 'В переходной фазе структура может меняться. Подождите подтверждения нового направления.'
            });
        }

        // Совет 5: по confluence
        const confScore = _readConfluenceScore(analysis);
        const conflicting = _readConflictingCount(analysis);
        if (confScore !== null && confScore < 60) {
            tips.push({
                priority: 'high',
                title: 'Низкий confluence',
                detail: `Confluence Module X = ${confScore}. Принимайте решения только при высокой согласованности сигналов.`
            });
        }
        if (conflicting > 2) {
            tips.push({
                priority: 'medium',
                title: 'Много противоречивых сигналов',
                detail: `${conflicting} сигналов противоречат друг другу. Сократите позицию или пропустите сделку.`
            });
        }

        // Совет 6: по силе тренда
        const ts = _readTrendStrength(analysis);
        if (ts > 0 && ts < 40) {
            tips.push({
                priority: 'low',
                title: 'Слабый тренд',
                detail: 'Сила тренда ниже 40. В слабом тренде контртрендовые сделки рискованны.'
            });
        }

        // Совет 7: confidence note
        if (confidence !== null && confidence < 50) {
            tips.push({
                priority: 'high',
                title: 'Низкая уверенность Module X',
                detail: `При уверенности ${confidence}% дополнительно перепроверьте данные, прежде чем входить.`
            });
        }

        // Пусть будет дедупликация по title
        const dedup = [];
        const seen = new Set();
        for (const t of tips) {
            if (!seen.has(t.title)) {
                dedup.push(t);
                seen.add(t.title);
            }
        }

        return dedup;
    }

    // ================================================================
    // 5. DIFFICULTY ASSESSMENT
    // Объективная сложность ситуации.
    // ================================================================

    function _assessDifficulty(analysis, module2Result) {
        if (!analysis) {
            return {
                level: 'unknown',
                factors: ['Нет данных для оценки сложности.'],
                score: null
            };
        }

        let score = 0;
        const factors = [];

        // 1. Конфликтующие сигналы
        const conflicting = _readConflictingCount(analysis);
        if (conflicting > 0) {
            score += Math.min(conflicting * 15, 45);
            factors.push(`Конфликтующих сигналов: ${conflicting}.`);
        }

        // 2. Слабый тренд
        const ts = _readTrendStrength(analysis);
        if (ts > 0 && ts < 60) {
            score += (60 - ts) / 4;
            factors.push(`Сила тренда: ${ts} (слабый/средний).`);
        } else if (ts >= 60) {
            factors.push(`Сила тренда: ${ts} (сильный).`);
        }

        // 3. Качество структуры (из marketStructure)
        if (analysis.marketStructure && Array.isArray(analysis.marketStructure.swings) &&
            analysis.marketStructure.swings.length < 3) {
            score += 10;
            factors.push('Структура имеет мало swing-точек.');
        }

        // 4. Уровень confluence
        const confScore = _readConfluenceScore(analysis);
        if (confScore !== null) {
            if (confScore < 50) {
                score += 25;
                factors.push(`Confluence: ${confScore} (низкий).`);
            } else if (confScore < 70) {
                score += 10;
                factors.push(`Confluence: ${confScore} (средний).`);
            } else {
                factors.push(`Confluence: ${confScore} (высокий).`);
            }
        }

        // 5. Module 2 verdict — несогласие между решением и анализом
        if (module2Result && module2Result.verdict === 'incorrect') {
            score += 10;
            factors.push('Решение противоречит выводам Module X.');
        } else if (module2Result && module2Result.verdict === 'risky') {
            score += 5;
            factors.push('Решение рискованное.');
        }

        // 6. Confidence
        const confidence = _readConfidence(analysis);
        if (confidence !== null && confidence < 60) {
            score += (60 - confidence) / 3;
            factors.push(`Уверенность Module X: ${confidence}% (низкая/средняя).`);
        }

        // Приведение к шкале 0..100
        score = Math.round(Math.min(100, Math.max(0, score)));

        let level;
        if (score < 25) level = 'easy';
        else if (score < 50) level = 'medium';
        else if (score < 75) level = 'hard';
        else level = 'expert';

        return {
            level,
            score,
            factors
        };
    }

    // ================================================================
    // 6. LESSON GENERATOR
    // Короткий урок: правило + объяснение + вывод.
    // ================================================================

    /**
     * Библиотека правил по категориям. Выбирается то, которое лучше
     * всего соответствует текущей ситуации.
     */
    const LESSON_LIBRARY = [
        {
            id: 'trend_is_priority',
            rule: 'Сначала тренд — потом всё остальное.',
            explanation: 'Самый сильный сигнал — направление тренда. Направленные входы против тренда имеют низкую вероятность успеха.',
            practical: 'Перед входом проверьте trend.bias и убедитесь, что ваше решение направлено в сторону тренда.'
        },
        {
            id: 'no_signals_no_trade',
            rule: 'Нет подтверждений — нет сделки.',
            explanation: 'Если вы не можете перечислить 2-3 причины для входа, сделка импульсивная.',
            practical: 'Перед входом сформулируйте хотя бы одну причину по каждой из категорий: структура, momentum, volume.'
        },
        {
            id: 'confidence_reflects_complexity',
            rule: 'Низкая confidence = пропустить сделку.',
            explanation: 'Низкая уверенность Module X означает смешанные или слабые сигналы. Такие сетапы чаще убыточны.',
            practical: 'Если Module X даёт < 60% уверенности, уменьшите размер позиции или пропустите сделку.'
        },
        {
            id: 'evidence_matters',
            rule: 'Отмечайте только реальные подтверждения.',
            explanation: 'Подтверждения (evidence) должны соответствовать фактическому состоянию графика, а не вашему желанию.',
            practical: 'Каждый раз перечитывайте AnalysisResult, прежде чем отметить подтверждение.'
        },
        {
            id: 'confluence_low_risk_high',
            rule: 'Confluence < 70 → риск минимальный или сделка пропускается.',
            explanation: 'Слабый confluence указывает на то, что сигналы не согласованы между собой.',
            practical: 'Сделки при confluence < 70 должны иметь размер < 50% от обычного.'
        },
        {
            id: 'against_trend_caution',
            rule: 'Контр-тренд только с подтверждением.',
            explanation: 'Контр-трендовые сделки имеют низкий win-rate и требуют специфических подтверждений.',
            practical: 'Контр-тренд оправдан только при сильных сигналах разворота и невысокой уверенности тренда.'
        },
        {
            id: 'wait_is_a_decision',
            rule: 'Ожидание — это тоже решение.',
            explanation: 'Не входить в рынок часто лучше, чем входить в плохой сетап.',
            practical: 'Если AnalysisResult не даёт чёткого направления, используйте решение «wait».'
        },
        {
            id: 'phase_aware',
            rule: 'Фаза рынка определяет стратегию.',
            explanation: 'В разных фазах (тренд/переход/консолидация) работают разные стратегии.',
            practical: 'В консолидации — не торгуйте направленно. В тренде — следуйте за трендом.'
        }
    ];

    function _generateLesson(analysis, decision, module2Result, biases) {
        const lessons = [];
        if (!analysis || !module2Result) {
            return { primary: null, secondary: [] };
        }

        const verdict = module2Result.verdict;
        const bias = _readBias(analysis);
        const confidence = _readConfidence(analysis);
        const confScore = _readConfluenceScore(analysis);
        const phase = _readMarketPhase(analysis);

        // Выбор уроков на основе контекста (по приоритету)
        if (verdict === 'incorrect') {
            lessons.push(LESSON_LIBRARY.find(l => l.id === 'trend_is_priority'));
            lessons.push(LESSON_LIBRARY.find(l => l.id === 'evidence_matters'));
        } else if (verdict === 'risky') {
            lessons.push(LESSON_LIBRARY.find(l => l.id === 'no_signals_no_trade'));
            lessons.push(LESSON_LIBRARY.find(l => l.id === 'phase_aware'));
        } else {
            lessons.push(LESSON_LIBRARY.find(l => l.id === 'evidence_matters'));
            lessons.push(LESSON_LIBRARY.find(l => l.id === 'phase_aware'));
        }

        if (confidence !== null && confidence < 60) {
            lessons.push(LESSON_LIBRARY.find(l => l.id === 'confidence_reflects_complexity'));
        }

        if (confScore !== null && confScore < 70) {
            lessons.push(LESSON_LIBRARY.find(l => l.id === 'confluence_low_risk_high'));
        }

        if (phase === 'consolidation') {
            lessons.push(LESSON_LIBRARY.find(l => l.id === 'phase_aware'));
            lessons.push(LESSON_LIBRARY.find(l => l.id === 'wait_is_a_decision'));
        }

        // По когнитивным искажениям
        if (biases && biases.length > 0) {
            const top = biases[0];
            if (top.type === 'fomo') lessons.push(LESSON_LIBRARY.find(l => l.id === 'wait_is_a_decision'));
            if (top.type === 'trading_against_trend') lessons.push(LESSON_LIBRARY.find(l => l.id === 'against_trend_caution'));
            if (top.type === 'confirmation_bias') lessons.push(LESSON_LIBRARY.find(l => l.id === 'evidence_matters'));
        }

        // Дедупликация по id
        const dedup = [];
        const seen = new Set();
        for (const l of lessons) {
            if (l && !seen.has(l.id)) {
                dedup.push(l);
                seen.add(l.id);
            }
        }

        return {
            primary: dedup[0] || LESSON_LIBRARY[0],
            secondary: dedup.slice(1, 3)
        };
    }

    // ================================================================
    // ГЛАВНАЯ ТОЧКА ВХОДА
    // ================================================================

    /**
     * Генерирует полную обучающую обратную связь.
     *
     * @param {object} input
     * @param {object} input.analysis       — AnalysisResult от Module X
     * @param {string} input.userDecision  — id решения пользователя
     * @param {object} input.module2Result — результат Module 2
     * @param {string[]} [input.userEvidence] — подтверждения, отмеченные пользователем
     *
     * @returns {object} полный набор обучающих данных
     */
    function generateLearningFeedback(input) {
        if (!input || typeof input !== 'object') {
            throw new Error('[LearningFeedbackEngine] input is required');
        }
        const analysis = input.analysis || input.marketAnalysis;
        if (!analysis) {
            throw new Error('[LearningFeedbackEngine] analysis (AnalysisResult) is required');
        }
        const module2Result = input.module2Result;
        if (!module2Result) {
            throw new Error('[LearningFeedbackEngine] module2Result is required');
        }
        const decision = module2Result.decision || { id: input.userDecision, shortLabel: input.userDecision };

        // === Извлекаем унифицированный контекст ===
        const bias = _readBias(analysis);

        // === 1. Why Explanation ===
        const whyExplanation = _explainWhy(analysis, decision, module2Result, bias);

        // === 2. Missed Signals ===
        const missedSignals = _detectMissedSignals(analysis, input.userEvidence, decision);

        // === 3. Cognitive Bias Detection ===
        const cognitiveBiases = _detectCognitiveBiases(analysis, decision, module2Result);

        // === 4. Learning Tips ===
        const learningTips = _generateLearningTips(analysis, decision, module2Result, missedSignals);

        // === 5. Difficulty Assessment ===
        const difficulty = _assessDifficulty(analysis, module2Result);

        // === 6. Lesson Generator ===
        const lesson = _generateLesson(analysis, decision, module2Result, cognitiveBiases);

        return {
            timestamp: new Date().toISOString(),
            userDecision: input.userDecision,
            bias,
            confidence: _readConfidence(analysis),
            marketPhase: _readMarketPhase(analysis),
            whyExplanation,
            missedSignals,
            cognitiveBiases,
            learningTips,
            difficulty,
            lesson,
            moduleVersion: MODULE_VERSION
        };
    }

    // ================================================================
    // Экспорт
    // ================================================================

    const api = {
        generateLearningFeedback: generateLearningFeedback,
        // Приватные функции выставлены для тестирования
        _internal: {
            _readBias: _readBias,
            _readConfidence: _readConfidence,
            _readTrendStrength: _readTrendStrength,
            _readMarketPhase: _readMarketPhase,
            _readScenarios: _readScenarios,
            _readKeySignals: _readKeySignals,
            _readSupportingSignals: _readSupportingSignals,
            _readAgainstSignals: _readAgainstSignals,
            _readConfluenceScore: _readConfluenceScore,
            _readConfluenceLevel: _readConfluenceLevel,
            _readConflictingCount: _readConflictingCount,
            _readContinuationPct: _readContinuationPct,
            _collectAllCategorizedSignals: _collectAllCategorizedSignals,
            _collectPriceActionSignals: _collectPriceActionSignals,
            _collectSmartMoneySignals: _collectSmartMoneySignals,
            _collectStructureSignals: _collectStructureSignals,
            _collectVolumeSignals: _collectVolumeSignals,
            _collectLiquiditySignals: _collectLiquiditySignals,
            _collectMomentumSignals: _collectMomentumSignals,
            _explainWhy: _explainWhy,
            _detectMissedSignals: _detectMissedSignals,
            _detectCognitiveBiases: _detectCognitiveBiases,
            _generateLearningTips: _generateLearningTips,
            _assessDifficulty: _assessDifficulty,
            _generateLesson: _generateLesson
        },
        MODULE_VERSION: MODULE_VERSION,
        LESSON_LIBRARY: LESSON_LIBRARY
    };

    global.LearningFeedbackEngine = api;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = api;
    }
})(typeof window !== 'undefined' ? window : globalThis);
