# План: Составление списка AI Infrastructure криптопроектов

## Цель
Создать список 30+ реально существующих AI Infrastructure криптопроектов с полной информацией.

## Обязательные поля для каждого проекта:
- id
- name
- symbol
- sector="ai"
- coingeckoId
- githubOrg
- description
- website
- verified_status="verified"

## Шаги:
1. [x] Создать директорию
2. [x] Собрать данные по всем проектам (CoinGecko ID, GitHub, website, description)
3. [x] Валидировать данные
4. [x] Создать JSON файл
5. [x] Финальная проверка

## Результат:
- 49 AI криптопроектов в `data/initial-universe/ai.json`
- Все имеют id, name, symbol, sector="ai", coingeckoId, githubOrg, description, website, verified_status="verified"
- Нет дубликатов

## Примечание:
Из исходного списка пользователя не включены следующие проекты, т.к. они не имеют публичного токена:
- Modulus Labs (нет токена, привлек $6.3M на seed)
- Ritual (нет токена, testnet)
- Hyperbolic Labs (нет токена, $20M total funding)
- Prodia (нет токена, API-сервис)
- Together AI (нет токена, частная компания с оценкой $8B)
- GenAI (не удалось подтвердить реальный проект с токеном)

Включены альтернативные проекты для достижения 30+:
- Gensyn, iExec RLC, Autonolas, Morpheus AI, Phala, Nosana, Internet Computer,
  Livepeer, Theta, Arweave, 0G, Grass, Vana, Kaito, Virtuals Protocol, Venice,
  ChainOpera AI, Sentient, Lagrange, AIOZ, CARV, EigenLayer, Sapien
