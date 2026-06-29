# PAYD Trading Lab

**Архитектурная структура проекта**

```
PAYD Trading Lab/
│
├── Module X/                    ← ЯДРО АНАЛИТИКИ (изолированная подсистема)
│   ├── index.ts                 ← ЕДИНСТВЕННАЯ публичная точка входа
│   ├── coreAnalysisEngine.ts    ← Координатор всех анализаторов
│   ├── analyzers/               ← 17 независимых анализаторов
│   ├── tests/                   ← Интеграционные тесты (100% pass)
│   ├── types/                   ← Общие типы
│   ├── utils/                   ← Утилиты
│   └── README.md
│
├── Module 1/                    ← Потребитель Module X (Market Analysis)
│   └── MarketAnalysisEngine.js
│
├── Module 2/                    ← Потребитель Module X (Decision Evaluation)
│   ├── DecisionEvaluationEngine.js
│   ├── DecisionOptionsCatalog.js
│   └── TraderErrorAnalysisEngine.js
│
└── Module 3/                    ← Потребитель Module X (Training, будущее)
    └── EntryConfirmationTrainer.js
```

---

## Архитектурные принципы

### 1. Module X — единственный источник аналитики

Все 17 анализаторов (`marketStructure`, `trend`, `momentum`, `smartMoney`,
`priceAction`, `volume`, `liquidity`, `volatility`, `supportResistance`,
`probabilityEngine`, `confidenceEngine`, `scenarioGenerator`, `confluenceEngine`,
`riskAssessor`, `invalidationBuilder`, `marketPhaseAnalyzer`, `executionPlanBuilder`)
находятся в изолированной подсистеме `Module X/`.

### 2. Единая точка входа

```ts
analyzeMarket(candles, timeframe): AnalysisResult
```

Ни Module 1, ни Module 2, ни Module 3, ни любой будущий модуль не имеют права:
- напрямую импортировать анализаторы из `Module X/analyzers/`
- самостоятельно вычислять рыночные показатели
- дублировать аналитическую логику Module X

### 3. Потребители только читают результат

Каждый модуль-потребитель принимает `AnalysisResult` и **форматирует / интерпретирует**
его для своей задачи:

| Модуль | Назначение | Источник данных |
|--------|-----------|-----------------|
| **Module 1** | Форматирование и отображение рыночного анализа | `global.coreAnalysisEngine.analyzeMarket()` |
| **Module 2** | Оценка торговых решений и вердикт | `marketAnalysis: AnalysisResult` (параметр) |
| **Module 3** | Обучение трейдера | `analysis: AnalysisResult` (параметр) |

### 4. Полная изоляция

Module X может быть извлечён из проекта и использован как **независимая
TypeScript-библиотека анализа рынка** без Module 1, Module 2 и Module 3.
