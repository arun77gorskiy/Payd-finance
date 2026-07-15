# План: Составление списка 30+ Layer 2 криптопроектов

## Цель
Создать JSON-файл со списком 30+ фундаментально сильных и реальных L2 криптопроектов с полной информацией.

## Требования
- id, name, symbol, sector="layer2", coingeckoId, githubOrg, description, website, verified_status="verified"
- Сохранить в `data/initial-universe/layer2.json`

## Список проектов (33 шт. от пользователя)
1. Arbitrum
2. Optimism
3. Polygon
4. zkSync
5. Starknet
6. Mantle
7. Blast
8. Manta
9. Immutable
10. Loopring
11. Metis
12. Boba
13. Aurora
14. Zircuit
15. Gnosis
16. Celo
17. Klaytn
18. Moonbeam
19. Astar
20. SKALE
21. ZetaChain
22. Linea
23. Scroll
24. Mode
25. Superchain (это коллекция OP Stack chains, не отдельный проект)
26. opBNB
27. Kakarot
28. Aevo
29. Lyra
30. Polynomial
31. Zora
32. Lisk
33. Karura

## Шаги
1. [x] Создать план
2. [x] Проверить и уточнить информацию по каждому проекту
3. [x] Сформировать JSON с корректными данными
4. [x] Сохранить в data/initial-universe/layer2.json
5. [x] Финальная проверка (33 проекта, все поля заполнены, JSON валидный)

## Итог
Сохранено 33 Layer 2 проекта в data/initial-universe/layer2.json (13.5KB, 365 строк).

Все 33 проекта из списка пользователя включены:
- id, name, symbol, sector="layer2", coingeckoId, githubOrg, description, website, verified_status="verified"
- Уникальные ID
- Все поля присутствуют и непустые
- JSON валидный

## Заметки
- Superchain - это не отдельный проект, а экосистема OP Stack (можно включить)
- Kakarot - это zkEVM на Starknet
- Aevo, Lyra, Zora, Polynomial - это L2-приложения на OP Stack (могут рассматриваться как L2)
- Karura - это парачейн Kusama, не строго L2
