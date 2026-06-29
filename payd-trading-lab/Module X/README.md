# Module X — Core Analysis Engine

**Версия:** 3.0.0
**Статус:** Изолированная подсистема PAYD Trading Lab
**Зависимости:** Module 1, Module 2, Module 3 (потребители)

---

## Что такое Module X

Module X — это **ядро аналитики** всей платформы PAYD Trading Lab.
Он выполняет ВСЮ рыночную аналитику и предоставляет единый объект `AnalysisResult`
через единственную публичную функцию `analyzeMarket()`.

Никакой другой модуль системы не имеет права самостоятельно вычислять
аналитические показатели. Module 1, Module 2, Module 3 и любые будущие модули
являются **потребителями** результатов Module X.

---

## Структура каталога

```
Module X/
├── index.ts                          ← ПУБЛИЧНЫЙ API (единственная точка входа)
├── coreAnalysisEngine.ts             ← Координатор (оркестрация анализаторов)
├── coreAnalysisEngine.legacy.ts      ← Устаревшая версия (для справки)
├── coreAnalysisEngine.js             ← Скомпилированная JS-версия для браузера
├── analyzers/                        ← ИЗОЛИРОВАННЫЕ анализаторы
│   ├── marketStructureAnalyzer.ts
│   ├── trendAnalyzer.ts
│   ├── momentumAnalyzer.ts
│   ├── smartMoneyAnalyzer.ts
│   ├── priceActionAnalyzer.ts
│   ├── volumeAnalyzer.ts
│   ├── liquidityAnalyzer.ts
│   ├── volatilityAnalyzer.ts
│   ├── supportResistanceAnalyzer.ts
│   ├── probabilityEngine.ts
│   ├── confidenceEngine.ts
│   ├── scenarioGenerator.ts
│   ├── confluenceEngine.ts
│   ├── riskAssessor.ts
│   ├── invalidationBuilder.ts
│   ├── marketPhaseAnalyzer.ts
│   └── executionPlanBuilder.ts
├── tests/                            ← Интеграционные тесты Module X
│   ├── moduleX.integration.test.ts
│   ├── module1.integration.test.ts
│   └── module2.integration.test.ts
├── types/                            ← Общие типы данных
├── utils/                            ← Утилиты (зарезервировано)
├── package.json
├── tsconfig.test.json
└── README.md                         ← этот файл
```

---

## Публичный API

### `analyzeMarket(candles, timeframe?)`

Единственная публичная функция для вызова анализа.

**Параметры:**
- `candles: Candle[]` — массив свечей с полями `{ time, open, high, low, close, volume }`
- `timeframe?: string` — таймфрейм (например, `'1h'`, `'4h'`, `'1d'`)

**Возвращает:** `AnalysisResult` — единый объект со всеми секциями:

```ts
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
        version:    string;
        analyzedAt: string;
        candleCount: number;
        timeframe?: string;
    };
}
```

---

## Использование

### TypeScript / ES Modules

```ts
import { analyzeMarket, ModuleX } from './Module X';

const result = analyzeMarket(candles, '1h');
console.log(result.trend.direction);
console.log(result.confluence.score);
```

### CommonJS / Node.js

```js
const { analyzeMarket } = require('./Module X');
const result = analyzeMarket(candles, '1h');
```

### Браузер (через глобальную переменную)

```html
<!-- Подключение Module X (координатор и все анализаторы) -->
<script src="Module X/analyzers/marketStructureAnalyzer.js"></script>
<script src="Module X/analyzers/trendAnalyzer.js"></script>
<!-- ... остальные анализаторы ... -->
<script src="Module X/coreAnalysisEngine.js"></script>

<script>
    const result = window.coreAnalysisEngine.analyzeMarket(candles, '1h');
</script>
```

---

## Архитектурные правила

### Правило 1: Изоляция

Module X — **полностью самодостаточная подсистема**. Он не импортирует и не использует
Module 1, Module 2 или Module 3.

### Правило 2: Единая точка входа

Любой модуль, желающий получить рыночный анализ, ОБЯЗАН вызывать
`analyzeMarket()` через публичный API (`index.ts` или `coreAnalysisEngine`).

### Правило 3: Никакого прямого доступа к анализаторам

Прямой импорт файлов из `Module X/analyzers/` из любого другого модуля
**ЗАПРЕЩЁН**. Анализаторы вызываются ТОЛЬКО координатором
(`coreAnalysisEngine.analyzeMarket`).

### Правило 4: Никакой собственной аналитики

Module 1, Module 2, Module 3 и будущие модули **не должны**
вычислять собственные рыночные показатели. Если показателя нет в
`AnalysisResult` — он должен быть добавлен в Module X.

---

## Тестирование

```bash
cd "Module X"
npx tsx tests/moduleX.integration.test.ts
npx tsx tests/module1.integration.test.ts
npx tsx tests/module2.integration.test.ts
```

Все три тестовых набора должны проходить **100%**.

---

## Потребители Module X

| Модуль | Файл | Как использует Module X |
|--------|------|-------------------------|
| Module 1 | `../Module 1/MarketAnalysisEngine.js` | Вызывает `global.coreAnalysisEngine.analyzeMarket()` |
| Module 2 | `../Module 2/DecisionEvaluationEngine.js` | Получает `marketAnalysis: AnalysisResult` через параметр |
| Module 3 | `../Module 3/EntryConfirmationTrainer.js` | Получает `analysis: AnalysisResult` через параметр |

---

## Лицензия

PAYD Trading Lab — внутренняя подсистема.
