# Module X — Core Analysis Engine

**Версия:** `v1.0.0` ✅ Production Ready
**Тесты:** `112 / 112` (100.0%)
**Лицензия:** PAYD Trading Lab (внутренний)

---

## Что такое Module X

Module X — **ядро рыночной аналитики** всей платформы **PAYD Trading Lab**.

Он выполняет **ВСЮ** рыночную аналитику и предоставляет единый объект `AnalysisResult`
через единственную публичную функцию `analyzeMarket()`.

Никакой другой модуль системы (Module 1, 2, 3 или будущие) не имеет права
самостоятельно вычислять аналитические показатели. Все они являются
**потребителями** результатов Module X.

---

## 📋 Содержание

1. [Быстрый старт](#быстрый-старт)
2. [Публичный API](#публичный-api)
3. [Анализаторы](#анализаторы)
4. [Структура AnalysisResult](#структура-analysisresult)
5. [Ограничения v1.0.0](#ограничения-v100)
6. [Roadmap](#roadmap)
7. [Тестирование](#тестирование)
8. [Production Readiness](#production-readiness)

---

## 🚀 Быстрый старт

### TypeScript / ES Modules

```typescript
import { analyzeMarket } from './Module X';

const candles = [
    { time: 1700000000000, open: 100, high: 101, low: 99, close: 100.5, volume: 1000 },
    // ... остальные свечи
];

const result = analyzeMarket(candles, '1h');

console.log(result.marketStructure.type);  // 'uptrend' | 'downtrend' | 'range' | ...
console.log(result.trend.primaryTrend);    // 'bull' | 'bear' | ...
console.log(result.probabilities.continuation); // 0..100
console.log(result.confidence.grade);      // 'A' | 'B' | 'C' | 'D' | 'F'
```

### Node.js / CommonJS

```javascript
const { analyzeMarket } = require('./Module X/bootstrap');

const result = analyzeMarket(candles, '1h');
// или через глобальную переменную:
const result2 = global.coreAnalysisEngine.analyzeMarket(candles, '1h');
```

### Браузер

```html
<script src="Module X/coreAnalysisEngine.js"></script>
<script>
    const result = coreAnalysisEngine.analyzeMarket(candles, '1h');
</script>
```

---

## 📖 Публичный API

### `analyzeMarket(candles, timeframe?)`

Единственная публичная функция для выполнения анализа.

**Параметры:**

| Имя | Тип | Обязательный | Описание |
|-----|-----|:---:|----------|
| `candles` | `Candle[]` | ✅ | Массив свечей (минимум 10) |
| `timeframe` | `string` | ❌ | Таймфрейм: `'1m'`, `'5m'`, `'1h'`, `'4h'`, `'1d'`, ... |

**`Candle`:**
```typescript
interface Candle {
    time:   number;   // Unix timestamp в миллисекундах
    open:   number;   // Цена открытия
    high:   number;   // Максимум
    low:    number;   // Минимум
    close:  number;   // Цена закрытия
    volume: number;   // Объём
}
```

**Возвращает:** `AnalysisResult` (см. ниже).

**Гарантии:**
- ✅ Чистая функция (при одинаковом входе → одинаковый выход)
- ✅ Не мутирует входные данные
- ✅ Бросает ошибку при `candles.length < 10`

---

## 🧩 Анализаторы

Module X содержит **17 анализаторов**, каждый из которых отвечает за
конкретную область рыночного анализа:

| № | Анализатор | Файл | Описание |
|:-:|------------|------|----------|
| 1 | `marketStructureAnalyzer` | `analyzers/marketStructureAnalyzer.ts` | Структура рынка: HH/HL/LH/LL, BOS, CHoCH. Тип: uptrend, downtrend, range, consolidation, expansion, compression |
| 2 | `trendAnalyzer` | `analyzers/trendAnalyzer.ts` | Направление и сила тренда через ADX. Первичный и вторичный тренд |
| 3 | `momentumAnalyzer` | `analyzers/momentumAnalyzer.ts` | Моментум: RSI, MACD, скорость изменения цены |
| 4 | `smartMoneyAnalyzer` | `analyzers/smartMoneyAnalyzer.ts` | Smart Money Concepts: BOS, CHoCH, Order Blocks, FVG |
| 5 | `priceActionAnalyzer` | `analyzers/priceActionAnalyzer.ts` | Свечные паттерны: Pin Bar, Engulfing, Hammer, Inside/Outside Bar |
| 6 | `volumeAnalyzer` | `analyzers/volumeAnalyzer.ts` | Объёмный профиль, накопление/распределение |
| 7 | `liquidityAnalyzer` | `analyzers/liquidityAnalyzer.ts` | Зоны ликвидности, liquidity sweeps |
| 8 | `volatilityAnalyzer` | `analyzers/volatilityAnalyzer.ts` | ATR, Bollinger Bands, стандартное отклонение |
| 9 | `supportResistanceAnalyzer` | `analyzers/supportResistanceAnalyzer.ts` | Уровни поддержки/сопротивления, исторические уровни |
| 10 | `probabilityEngine` | `analyzers/probabilityEngine.ts` | Расчёт вероятностей continuation/reversal |
| 11 | `confidenceEngine` | `analyzers/confidenceEngine.ts` | Оценка уверенности (A/B/C/D/F) на основе совпадения сигналов |
| 12 | `scenarioGenerator` | `analyzers/scenarioGenerator.ts` | Генерация применимых торговых сценариев с приоритетами |
| 13 | `confluenceEngine` | `analyzers/confluenceEngine.ts` | Двигатель совпадений: score совпадения разных сигналов |
| 14 | `riskAssessor` | `analyzers/riskAssessor.ts` | Оценка рисков по сценари |
| 15 | `invalidationBuilder` | `analyzers/invalidationBuilder.ts` | Построитель условий инвалидации сценария |
| 16 | `marketPhaseAnalyzer` | `analyzers/marketPhaseAnalyzer.ts` | Фаза рынка: accumulation, markup, distribution, markdown |
| 17 | `executionPlanBuilder` | `analyzers/executionPlanBuilder.ts` | Построитель плана исполнения: entry, stop, target |

### Координатор

`coreAnalysisEngine.ts` — **оркестратор**, который:
1. Принимает свечи
2. Последовательно вызывает все 17 анализаторов
3. Собирает единый объект `AnalysisResult`
4. Возвращает его вызывающему коду

**Координатор не выполняет аналитических вычислений** — только оркестрация.

---

## 📊 Структура AnalysisResult

```typescript
interface AnalysisResult {
    marketStructure:    MarketStructure;
    trend:              Trend;
    smartMoney:         SmartMoney;
    priceAction:        PriceAction;
    volume:             Volume;
    liquidity:          Liquidity;
    volatility:         Volatility;
    momentum:           Momentum;
    supportResistance:  SupportResistance;
    probabilities:      Probabilities;
    scenarios:          Scenarios;
    confidence:         Confidence;
    evidence:           Evidence;
    confluence:         Confluence;
    riskAssessment:     RiskAssessment;
    invalidation:       Invalidation;
    marketPhase:        MarketPhase;
    executionPlan:      ExecutionPlan;
    meta: {
        version:     string;          // '1.0.0'
        analyzedAt:  string;          // ISO дата
        candleCount: number;
        timeframe?:  string;
    };
}
```

**Типичные поля:**

```typescript
result.marketStructure.type     // 'uptrend' | 'downtrend' | 'range' | ...
result.trend.primaryTrend       // 'bull' | 'bear' | 'neutral'
result.probabilities.continuation // 0..100 (процент продолжения тренда)
result.probabilities.reversal   // 0..100 (процент разворота)
result.confidence.grade         // 'A' | 'B' | 'C' | 'D' | 'F'
result.confidence.percent       // 0..100
result.scenarios.list           // Массив сценариев с приоритетами
result.executionPlan.entry      // Цена входа
result.executionPlan.stop      // Стоп-лосс
result.executionPlan.targets    // Целевые уровни
```

---

## ⚠️ Ограничения v1.0.0

### Технические ограничения

1. **Минимум 10 свечей** для выполнения анализа. Меньше — ошибка.
2. **Только одномерные массивы** свечей. Multi-timeframe — будет в v1.1.0.
3. **Нет встроенного backtesting**. Доступен через Module 2.
4. **Нет работы с портфелем**. Поддержка в v1.2.0.
5. **Нет стриминга**. WebSocket-данные обрабатываются в consumer-коде.

### Алгоритмические ограничения

1. **ATR на малом числе свечей** может быть неточным. Рекомендуется ≥ 30 свечей.
2. **Случайное блуждание** корректно классифицируется как `range` (благодаря ATR-нормализации в `marketStructureAnalyzer` v3.0.1+).
3. **Экстремальная волатильность** (>5% на свечу) может давать нестабильные сигналы.
4. **Свечи с пропусками** (gaps) пока не валидируются специально.

### Что НЕ входит в v1.0.0

- ❌ Multi-timeframe анализ (планируется v1.1.0)
- ❌ Кеширование результатов (планируется v1.1.0)
- ❌ Backtesting модуль (планируется v1.2.0)
- ❌ Портфельный анализ (планируется v1.2.0)

---

## 🗺️ Roadmap

### v1.1.0 (планируется)
- Multi-timeframe анализ с агрегацией результатов
- Кеширование (через LRU)
- WebSocket-стриминг
- Расширенные метрики (Sharpe, Sortino, Calmar)

### v1.2.0 (планируется)
- Встроенный backtesting
- Портфельный риск-менеджмент
- Web Workers для тяжёлых вычислений

### v2.0.0 (major)
- Изменение сигнатуры (с предварительным deprecation notice)
- Поддержка альтернативных data sources

**Соглашение о backward compatibility:**
- Patch (1.0.x) — баг-фиксы без изменения API
- Minor (1.x.0) — новые поля в `AnalysisResult`, backward-compatible
- Major (x.0.0) — breaking changes с deprecation notice

---

## 🧪 Тестирование

```bash
cd "Module X"
npm test                    # все тесты
npm run test:module-x       # только Module X
npm run test:module-1       # интеграция с Module 1
npm run test:module-2       # интеграция с Module 2
```

**Текущий статус:** ✅ 112/112 (100%)

---

## ✅ Production Readiness

Module X прошёл все 9 критериев Production Readiness:

| # | Критерий | Статус |
|:-:|----------|:------:|
| 1 | Все тесты зелёные (100%) | ✅ |
| 2 | Module X — единственный источник аналитики | ✅ |
| 3 | Все анализаторы в Module X (17/17) | ✅ |
| 4 | Module 1 без аналитических вычислений | ✅ |
| 5 | Module 2 без аналитических вычислений | ✅ |
| 6 | Module 3 без аналитических вычислений | ✅ |
| 7 | Нет прямого импорта анализаторов | ✅ |
| 8 | Единая публичная точка входа `analyzeMarket()` | ✅ |
| 9 | Самостоятельная библиотека | ✅ |

Подробнее: см. [`../PRODUCTION_READINESS_AUDIT.md`](../PRODUCTION_READINESS_AUDIT.md)

---

## 📁 Структура модуля

```
Module X/
├── README.md                          ← этот файл
├── CHANGELOG.md                       ← история изменений
├── index.ts                           ← ПУБЛИЧНЫЙ API
├── bootstrap.js                       ← Загрузчик
├── package.json                       ← Манифест v1.0.0
├── tsconfig.json                      ← TS конфигурация
├── tsconfig.test.json                 ← TS конфигурация для тестов
│
├── coreAnalysisEngine.ts              ← Координатор (оркестратор)
├── coreAnalysisEngine.js              ← Скомпилированная JS-версия
│
├── analyzers/                         ← 17 ИЗОЛИРОВАННЫХ анализаторов
│   ├── marketStructureAnalyzer.ts
│   ├── trendAnalyzer.ts
│   └── ... (15 других)
│
├── tests/                             ← 112 интеграционных тестов
│   ├── moduleX.integration.test.ts    (68/68)
│   ├── module1.integration.test.ts    (16/16)
│   └── module2.integration.test.ts    (28/28)
│
├── types/                             ← Зарезервировано для общих типов
└── utils/                             ← Зарезервировано для утилит
```

---

## 📜 Лицензия

PAYD Trading Lab — внутренняя подсистема. Все права защищены.
