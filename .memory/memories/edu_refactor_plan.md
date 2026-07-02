# План рефакторинга PAYD Trading Lab

## Проблема
Текущая реализация использует искусственно сгенерированные свечи через `generateCandles()` в `TrainerScenarios.js`. 
Пользователь требует, чтобы Module X работал как индикатор поверх РЕАЛЬНОГО графика (Binance/TradingView), а не создавал свой собственный график с искусственными данными.

## Решение
1. **Создать `RealMarketData.js`** — загрузчик реальных OHLCV с Binance Public API
2. **Рефакторинг `TrainerScenarios.js`** — сценарии описывают symbol+interval+anchorTime, а не готовые свечи
3. **Модифицировать `lab-trainer-component.js`** — загружать реальные данные при старте сценария
4. **Module X Renderer остаётся без изменений** — он уже работает как overlay на LWC

## Структура нового сценария
```javascript
{
  id: 'sc-bos-01',
  name: 'Bullish Break of Structure',
  description: '...',
  difficulty: 'intermediate',
  symbol: 'BTCUSDT',
  interval: '1h',
  anchorTime: 1735689600,        // "точка остановки" времени
  visibleCandles: 80,            // сколько свечей показать ДО anchorTime
  correctDecision: 'long',       // ожидаемое решение (для оценки)
  // Метки для UI
  hint: '...'
}
```

## Логика скрытия будущего
- Загружаем 80 свечей ДО anchorTime (видимые)
- НЕ показываем будущие свечи в области графика
- При клике "Показать ответ" — раскрываем видимую область за anchorTime (опционально)
