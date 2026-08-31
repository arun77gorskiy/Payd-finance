# PAYD Intelligence V2 — Phase 2: Provider Diagnostic Report

_Дата: 2026-08-31T14:45:47.201Z_

## Цель

Диагностика provider resolution на 10 ключевых chain-проектах до запуска полного обогащения 364 проектов.

**Тестовые проекты**: `arbitrum`, `optimism`, `polygon`, `starknet`, `mantle`, `linea`, `zksync`, `celo`, `metis`, `gnosis`

---

## Сводка по метрикам

| Проект | Entity Types | MCap | Chain TVL | Protocol TVL | Fees | Revenue | DEX Vol | Completeness |
|---|---|---|---|---|---|---|---|---|
| **arbitrum** (ARB) | CHAIN, TOKEN | $574.56M | $1.399B | $3.236B | unavailable | unavailable | unavailable | 7/11 (64%) |
| **optimism** (OP) | CHAIN, TOKEN | $198.22M | $0.00 | $574.10M | unavailable | unavailable | unavailable | 5/11 (45%) |
| **polygon** (POL) | CHAIN, TOKEN | unavailable | $808.98M | $2.757B | unavailable | unavailable | unavailable | 3/11 (27%) |
| **starknet** (STRK) | CHAIN, TOKEN | $177.46M | $162.75M | unavailable | unavailable | unavailable | unavailable | 5/11 (45%) |
| **mantle** (MNT) | CHAIN, TOKEN | $1.886B | $90.75M | unavailable | unavailable | unavailable | unavailable | 5/11 (45%) |
| **linea** (LINEA) | CHAIN, TOKEN | $61.23M | $29.10M | unavailable | unavailable | unavailable | unavailable | 5/11 (45%) |
| **zksync** (ZK) | CHAIN, TOKEN | $92.68M | $15.24M | unavailable | unavailable | unavailable | unavailable | 7/11 (64%) |
| **celo** (CELO) | CHAIN, TOKEN | $44.67M | $16.46M | unavailable | unavailable | unavailable | unavailable | 7/11 (64%) |
| **metis** (METIS) | CHAIN, TOKEN | $20.78M | $2.62M | unavailable | unavailable | unavailable | unavailable | 7/11 (64%) |
| **gnosis** (GNO) | CHAIN, TOKEN | $311.54M | $102.85M | unavailable | unavailable | unavailable | unavailable | 5/11 (45%) |

## Детальный отчёт по каждому проекту

### arbitrum (`arbitrum`)

- **Sector:** layer2
- **Entity Types:** `CHAIN`, `TOKEN`
- **CoinGecko ID:** `arbitrum`
- **DefiLlama Chain:** `Arbitrum`
- **DefiLlama Protocol:** `arbitrum-bridge`

| Метрика | Value | Source | Reason | HTTP |
|---|---|---|---|---|
| Market Cap | 574,558,673 | coingecko:markets | OK | 200 |
| Chain TVL | 1,398,785,894 | defillama:chain | OK | 200 |
| Protocol TVL | 3,235,960,233 | defillama:protocol | OK | 200 |
| Fees 24h | unavailable | — | NOT_APPLICABLE | — |
| Revenue 24h | unavailable | — | NOT_APPLICABLE | — |
| DEX Volume 24h | unavailable | — | NOT_APPLICABLE | — |
| Active Addresses | unavailable | — | NOT_APPLICABLE | — |
| GitHub Stars | 77 | github:api | OK | — |
| GitHub Commits 30d | unavailable | — | PROVIDER_NO_DATA | — |

**Missing reasons:**
- `fees.fees_24h`: `NOT_APPLICABLE`
- `revenue.revenue_24h`: `NOT_APPLICABLE`
- `dex.dex_volume_24h`: `NOT_APPLICABLE`
- `github.github.commits_30d`: `PROVIDER_NO_DATA`

### optimism (`optimism`)

- **Sector:** layer2
- **Entity Types:** `CHAIN`, `TOKEN`
- **CoinGecko ID:** `optimism`
- **DefiLlama Chain:** `Optimism`
- **DefiLlama Protocol:** `optimism-bridge`

| Метрика | Value | Source | Reason | HTTP |
|---|---|---|---|---|
| Market Cap | 198,220,431 | coingecko:markets | OK | 200 |
| Chain TVL | 0 | defillama:chain | OK | 200 |
| Protocol TVL | 574,097,317 | defillama:protocol | OK | 200 |
| Fees 24h | unavailable | — | NOT_APPLICABLE | — |
| Revenue 24h | unavailable | — | NOT_APPLICABLE | — |
| DEX Volume 24h | unavailable | — | NOT_APPLICABLE | — |
| Active Addresses | unavailable | — | NOT_APPLICABLE | — |
| GitHub Stars | unavailable | — | NOT_FOUND | — |
| GitHub Commits 30d | unavailable | — | NOT_FOUND | — |

**Missing reasons:**
- `fees.fees_24h`: `NOT_APPLICABLE`
- `revenue.revenue_24h`: `NOT_APPLICABLE`
- `dex.dex_volume_24h`: `NOT_APPLICABLE`
- `github.github.stars`: `NOT_FOUND`
- `github.github.forks`: `NOT_FOUND`
- `github.github.commits_30d`: `NOT_FOUND`

### polygon (`polygon`)

- **Sector:** layer2
- **Entity Types:** `CHAIN`, `TOKEN`
- **CoinGecko ID:** `matic-network`
- **DefiLlama Chain:** `Polygon`
- **DefiLlama Protocol:** `polygon-bridge`

| Метрика | Value | Source | Reason | HTTP |
|---|---|---|---|---|
| Market Cap | unavailable | — | PROVIDER_NO_DATA | — |
| Chain TVL | 808,976,295 | defillama:chain | OK | 200 |
| Protocol TVL | 2,756,703,196 | defillama:protocol | OK | 200 |
| Fees 24h | unavailable | — | NOT_APPLICABLE | — |
| Revenue 24h | unavailable | — | NOT_APPLICABLE | — |
| DEX Volume 24h | unavailable | — | NOT_APPLICABLE | — |
| Active Addresses | unavailable | — | NOT_APPLICABLE | — |
| GitHub Stars | 554 | github:api | OK | — |
| GitHub Commits 30d | unavailable | — | PROVIDER_NO_DATA | — |

**Missing reasons:**
- `fees.fees_24h`: `NOT_APPLICABLE`
- `revenue.revenue_24h`: `NOT_APPLICABLE`
- `dex.dex_volume_24h`: `NOT_APPLICABLE`
- `market.price_usd`: `PROVIDER_NO_DATA`
- `market.market_cap_usd`: `PROVIDER_NO_DATA`
- `market.volume_24h_usd`: `PROVIDER_NO_DATA`
- `market.fdv_usd`: `PROVIDER_NO_DATA`
- `github.github.commits_30d`: `PROVIDER_NO_DATA`

### starknet (`starknet`)

- **Sector:** layer2
- **Entity Types:** `CHAIN`, `TOKEN`
- **CoinGecko ID:** `starknet`
- **DefiLlama Chain:** `Starknet`
- **DefiLlama Protocol:** `starknet`

| Метрика | Value | Source | Reason | HTTP |
|---|---|---|---|---|
| Market Cap | 177,463,885 | coingecko:markets | OK | 200 |
| Chain TVL | 162,750,866 | defillama:chain | OK | 200 |
| Protocol TVL | unavailable | — | PROVIDER_NO_DATA | — |
| Fees 24h | unavailable | — | NOT_APPLICABLE | — |
| Revenue 24h | unavailable | — | NOT_APPLICABLE | — |
| DEX Volume 24h | unavailable | — | NOT_APPLICABLE | — |
| Active Addresses | unavailable | — | NOT_APPLICABLE | — |
| GitHub Stars | unavailable | — | NOT_FOUND | — |
| GitHub Commits 30d | unavailable | — | NOT_FOUND | — |

**Missing reasons:**
- `fees.fees_24h`: `NOT_APPLICABLE`
- `revenue.revenue_24h`: `NOT_APPLICABLE`
- `dex.dex_volume_24h`: `NOT_APPLICABLE`
- `github.github.stars`: `NOT_FOUND`
- `github.github.forks`: `NOT_FOUND`
- `github.github.commits_30d`: `NOT_FOUND`

### mantle (`mantle`)

- **Sector:** layer2
- **Entity Types:** `CHAIN`, `TOKEN`
- **CoinGecko ID:** `mantle`
- **DefiLlama Chain:** `Mantle`
- **DefiLlama Protocol:** `mantle`

| Метрика | Value | Source | Reason | HTTP |
|---|---|---|---|---|
| Market Cap | 1,885,761,756 | coingecko:markets | OK | 200 |
| Chain TVL | 90,748,899 | defillama:chain | OK | 200 |
| Protocol TVL | unavailable | — | PROVIDER_NO_DATA | — |
| Fees 24h | unavailable | — | NOT_APPLICABLE | — |
| Revenue 24h | unavailable | — | NOT_APPLICABLE | — |
| DEX Volume 24h | unavailable | — | NOT_APPLICABLE | — |
| Active Addresses | unavailable | — | NOT_APPLICABLE | — |
| GitHub Stars | unavailable | — | NOT_FOUND | — |
| GitHub Commits 30d | unavailable | — | NOT_FOUND | — |

**Missing reasons:**
- `fees.fees_24h`: `NOT_APPLICABLE`
- `revenue.revenue_24h`: `NOT_APPLICABLE`
- `dex.dex_volume_24h`: `NOT_APPLICABLE`
- `github.github.stars`: `NOT_FOUND`
- `github.github.forks`: `NOT_FOUND`
- `github.github.commits_30d`: `NOT_FOUND`

### linea (`linea`)

- **Sector:** layer2
- **Entity Types:** `CHAIN`, `TOKEN`
- **CoinGecko ID:** `linea`
- **DefiLlama Chain:** `Linea`
- **DefiLlama Protocol:** `linea`

| Метрика | Value | Source | Reason | HTTP |
|---|---|---|---|---|
| Market Cap | 61,234,821 | coingecko:markets | OK | 200 |
| Chain TVL | 29,101,130 | defillama:chain | OK | 200 |
| Protocol TVL | unavailable | — | PROVIDER_NO_DATA | — |
| Fees 24h | unavailable | — | NOT_APPLICABLE | — |
| Revenue 24h | unavailable | — | NOT_APPLICABLE | — |
| DEX Volume 24h | unavailable | — | NOT_APPLICABLE | — |
| Active Addresses | unavailable | — | NOT_APPLICABLE | — |
| GitHub Stars | unavailable | — | NOT_FOUND | — |
| GitHub Commits 30d | unavailable | — | NOT_FOUND | — |

**Missing reasons:**
- `fees.fees_24h`: `NOT_APPLICABLE`
- `revenue.revenue_24h`: `NOT_APPLICABLE`
- `dex.dex_volume_24h`: `NOT_APPLICABLE`
- `github.github.stars`: `NOT_FOUND`
- `github.github.forks`: `NOT_FOUND`
- `github.github.commits_30d`: `NOT_FOUND`

### zksync (`zksync`)

- **Sector:** layer2
- **Entity Types:** `CHAIN`, `TOKEN`
- **CoinGecko ID:** `zksync`
- **DefiLlama Chain:** `zkSync Era`
- **DefiLlama Protocol:** `zksync-era`

| Метрика | Value | Source | Reason | HTTP |
|---|---|---|---|---|
| Market Cap | 92,682,893 | coingecko:markets | OK | 200 |
| Chain TVL | 15,241,852 | defillama:chain | OK | 200 |
| Protocol TVL | unavailable | — | PROVIDER_NO_DATA | — |
| Fees 24h | unavailable | — | NOT_APPLICABLE | — |
| Revenue 24h | unavailable | — | NOT_APPLICABLE | — |
| DEX Volume 24h | unavailable | — | NOT_APPLICABLE | — |
| Active Addresses | unavailable | — | NOT_APPLICABLE | — |
| GitHub Stars | 3,233 | github:api | OK | — |
| GitHub Commits 30d | unavailable | — | PROVIDER_NO_DATA | — |

**Missing reasons:**
- `fees.fees_24h`: `NOT_APPLICABLE`
- `revenue.revenue_24h`: `NOT_APPLICABLE`
- `dex.dex_volume_24h`: `NOT_APPLICABLE`
- `github.github.commits_30d`: `PROVIDER_NO_DATA`

### celo (`celo`)

- **Sector:** layer2
- **Entity Types:** `CHAIN`, `TOKEN`
- **CoinGecko ID:** `celo`
- **DefiLlama Chain:** `Celo`
- **DefiLlama Protocol:** `celo`

| Метрика | Value | Source | Reason | HTTP |
|---|---|---|---|---|
| Market Cap | 44,669,664 | coingecko:markets | OK | 200 |
| Chain TVL | 16,456,305 | defillama:chain | OK | 200 |
| Protocol TVL | unavailable | — | PROVIDER_NO_DATA | — |
| Fees 24h | unavailable | — | NOT_APPLICABLE | — |
| Revenue 24h | unavailable | — | NOT_APPLICABLE | — |
| DEX Volume 24h | unavailable | — | NOT_APPLICABLE | — |
| Active Addresses | unavailable | — | NOT_APPLICABLE | — |
| GitHub Stars | 627 | github:api | OK | — |
| GitHub Commits 30d | unavailable | — | PROVIDER_NO_DATA | — |

**Missing reasons:**
- `fees.fees_24h`: `NOT_APPLICABLE`
- `revenue.revenue_24h`: `NOT_APPLICABLE`
- `dex.dex_volume_24h`: `NOT_APPLICABLE`
- `github.github.commits_30d`: `PROVIDER_NO_DATA`

### metis (`metis`)

- **Sector:** layer2
- **Entity Types:** `CHAIN`, `TOKEN`
- **CoinGecko ID:** `metis-token`
- **DefiLlama Chain:** `Metis`
- **DefiLlama Protocol:** `metis`

| Метрика | Value | Source | Reason | HTTP |
|---|---|---|---|---|
| Market Cap | 20,781,520 | coingecko:markets | OK | 200 |
| Chain TVL | 2,618,937 | defillama:chain | OK | 200 |
| Protocol TVL | unavailable | — | PROVIDER_NO_DATA | — |
| Fees 24h | unavailable | — | NOT_APPLICABLE | — |
| Revenue 24h | unavailable | — | NOT_APPLICABLE | — |
| DEX Volume 24h | unavailable | — | NOT_APPLICABLE | — |
| Active Addresses | unavailable | — | NOT_APPLICABLE | — |
| GitHub Stars | 10 | github:api | OK | — |
| GitHub Commits 30d | unavailable | — | PROVIDER_NO_DATA | — |

**Missing reasons:**
- `fees.fees_24h`: `NOT_APPLICABLE`
- `revenue.revenue_24h`: `NOT_APPLICABLE`
- `dex.dex_volume_24h`: `NOT_APPLICABLE`
- `github.github.commits_30d`: `PROVIDER_NO_DATA`

### gnosis (`gnosis`)

- **Sector:** layer2
- **Entity Types:** `CHAIN`, `TOKEN`
- **CoinGecko ID:** `gnosis`
- **DefiLlama Chain:** `Gnosis`
- **DefiLlama Protocol:** `gnosis-dao`

| Метрика | Value | Source | Reason | HTTP |
|---|---|---|---|---|
| Market Cap | 311,540,527 | coingecko:markets | OK | 200 |
| Chain TVL | 102,847,816 | defillama:chain | OK | 200 |
| Protocol TVL | unavailable | — | PROVIDER_NO_DATA | — |
| Fees 24h | unavailable | — | NOT_APPLICABLE | — |
| Revenue 24h | unavailable | — | NOT_APPLICABLE | — |
| DEX Volume 24h | unavailable | — | NOT_APPLICABLE | — |
| Active Addresses | unavailable | — | NOT_APPLICABLE | — |
| GitHub Stars | unavailable | — | NOT_FOUND | — |
| GitHub Commits 30d | unavailable | — | NOT_FOUND | — |

**Missing reasons:**
- `fees.fees_24h`: `NOT_APPLICABLE`
- `revenue.revenue_24h`: `NOT_APPLICABLE`
- `dex.dex_volume_24h`: `NOT_APPLICABLE`
- `github.github.stars`: `NOT_FOUND`
- `github.github.forks`: `NOT_FOUND`
- `github.github.commits_30d`: `NOT_FOUND`

---

## Raw Provider Responses (Диагностика)

Сырые ответы от провайдеров для Arbitrum и Optimism используются для верификации корректности резолва. Позволяет видеть, что именно вернул каждый endpoint, до какой степени данные дошли до системы и где именно произошла потеря.

### Raw Responses — arbitrum

#### CoinGecko /coins/markets

`Endpoint`: `/coins/{id}` from `/coins/markets?ids=arbitrum`

```json
{
  "id": "arbitrum",
  "symbol": "arb",
  "name": "Arbitrum",
  "current_price": 0.086094,
  "market_cap": 574558673,
  "fully_diluted_valuation": 860365589,
  "total_volume": 65729705,
  "circulating_supply": 6678075931,
  "total_supply": 10000000000,
  "max_supply": 10000000000,
  "market_cap_rank": 94,
  "ath": 2.39,
  "ath_change_percentage": -96.39818,
  "atl": 0.07048,
  "price_change_24h": -0.002805488101159562,
  "last_updated": "2026-08-31T14:39:20.000Z"
}
```

#### DefiLlama /v2/chains → chain entry

`Endpoint`: `/v2/chains` lookup by `name="Arbitrum"`

```json
{
  "name": "Arbitrum",
  "gecko_id": "arbitrum",
  "chainId": 42161,
  "cmcId": "11841",
  "tokenSymbol": "ARB",
  "tvl": 1398785894.010147
}
```

#### DefiLlama /protocol/{slug}

`Endpoint`: `/protocol/arbitrum-bridge`

```json
{
  "id": "3777",
  "name": "Arbitrum Bridge",
  "category": "Canonical Bridge",
  "chains": [
    "Ethereum"
  ],
  "tvl": [
    {
      "date": 1699920000,
      "totalLiquidityUSD": 5376339623
    },
    {
      "date": 1700006400,
      "totalLiquidityUSD": 5333260081
    },
    {
      "date": 1700092800,
      "totalLiquidityUSD": 5464952556
    },
    {
      "date": 1700179200,
      "totalLiquidityUSD": 5288680582
    },
    {
      "date": 1700265600,
      "totalLiquidityUSD": 5332101022
    },
    {
      "date": 1700352000,
      "totalLiquidityUSD": 5352645005
    },
    {
      "date": 1700438400,
      "totalLiquidityUSD": 5469549120
    },
    {
      "date": 1700524800,
      "totalLiquidityUSD": 5533742218
    },
    {
      "date": 1700611200,
      "totalLiquidityUSD": 5379662061
    },
    {
      "date": 1700697600,
      "totalLiquidityUSD": 5602803063
    },
    {
      "date": 1700784000,
      "totalLiquidityUSD": 5630962053
    },
    {
      "date": 1700870400,
      "totalLiquidityUSD": 5640889671
    },
    {
      "date": 1700956800,
      "totalLiquidityUSD": 5703569346
    },
    {
      "date": 1701043200,
      "totalLiquidityUSD": 5695106951
    },
    {
      "date": 1701129600,
      "totalLiquidityUSD": 5604241311
    },
    {
      "date": 1701216000,
      "totalLiquidityUSD": 5617477378
    },
    {
      "date": 1701302400,
      "totalLiquidityUSD": 5549703348
    },
    {
      "date": 1701388800,
      "totalLiquidityUSD": 5574802112
    },
    {
      "date": 1701475200,
      "totalLiquidityUSD": 5659382455
    },
    {
      "date": 1701561600,
      "totalLiquidityUSD": 5764592872
    },
    {
      "date": 1701648000,
      "totalLiquidityUSD": 5817189743
    },
    {
      "date": 1701734400,
      "totalLiquidityUSD": 5927357198
    },
    {
      "date": 1701820800,
      "totalLiquidityUSD": 6061782572
    },
    {
      "date": 1701907200,
      "totalLiquidityUSD": 5956393370
    },
    {
      "date": 1701993600,
      "totalLiquidityUSD": 6157001811
    },
    {
      "date": 1702080000,
      "totalLiquidityUSD": 6135080737
    },
    {
      "date": 1702166400,
      "totalLiquidityUSD": 6097879518
    },
    {
      "date": 1702252800,
      "totalLiquidityUSD": 6137189283
    },
    {
      "date": 1702339200,
      "totalLiquidityUSD": 5937212235
    },
    {
      "date": 1702425600,
      "totalLiquidityUSD": 5966521172
    },
    {
      "date": 1702512000,
      "totalLiquidityUSD": 6076193190
    },
    {
      "date": 1702598400,
      "totalLiquidityUSD": 6199502391
    },
    {
      "date": 1702684800,
      "totalLiquidityUSD": 5990090537
    },
    {
      "date": 1702771200,
      "totalLiquidityUSD": 6014345426
    },
    {
      "date": 1702857600,
      "totalLiquidityUSD": 5947244461
    },
    {
      "date": 1702944000,
      "totalLiquidityUSD": 5993611510
    },
    {
      "date": 1703030400,
      "totalLiquidityUSD": 5952674982
    },
    {
      "date": 1703116800,
      "totalLiquidityUSD": 5989961657
    },
    {
      "date": 1703203200,
      "totalLiquidityUSD": 6065421745
    },
    {
      "date": 1703289600,
      "totalLiquidityUSD": 6280286943
    },
    {
      "date": 1703376000,
      "totalLiquidityUSD": 6266716241
    },
    {
      "date": 1703462400,
      "totalLiquidityUSD": 6216431012
    },
    {
      "date": 1703548800,
      "totalLiquidityUSD": 6262236796
    },
    {
      "date": 1703635200,
      "totalLiquidityUSD": 6230545691
    },
    {
      "date": 1703721600,
      "totalLiquidityUSD": 6535904422
    },
    {
      "date": 1703808000,
      "totalLiquidityUSD": 6434745439
    },
    {
      "date": 1703894400,
      "totalLiquidityUSD": 6377360170
    },
    {
      "date": 1703980800,
      "totalLiquidityUSD": 6361160899
    },
    {
      "date": 1704067200,
      "totalLiquidityUSD": 6370944552
    },
    {
      "date": 1704153600,
      "totalLiquidityUSD": 6506114563
    },
    {
      "date": 1704240000,
      "totalLiquidityUSD": 6531183856
    },
    {
      "date": 1704326400,
      "totalLiquidityUSD": 6341227157
    },
    {
      "date": 1704412800,
      "totalLiquidityUSD": 6486999679
    },
    {
      "date": 1704499200,
      "totalLiquidityUSD": 6448460762
    },
    {
      "date": 1704585600,
      "totalLiquidityUSD": 6406675224
    },
    {
      "date": 1704672000,
      "totalLiquidityUSD": 6346029340
    },
    {
      "date": 1704758400,
      "totalLiquidityUSD": 6602798759
    },
    {
      "date": 1704844800,
      "totalLiquidityUSD": 6640741016
    },
    {
      "date": 1704931200,
      "totalLiquidityUSD": 7076855789
    },
    {
      "date": 1705017600,
      "totalLiquidityUSD": 7140848507
    },
    {
      "date": 1705104000,
      "totalLiquidityUSD": 6987566151
    },
    {
      "date": 1705190400,
      "totalLiquidityUSD": 7054047674
    },
    {
      "date": 1705276800,
      "totalLiquidityUSD": 6904772797
    },
    {
      "date": 1705363200,
      "totalLiquidityUSD": 7077702772
    },
    {
      "date": 1705449600,
      "totalLiquidityUSD": 7201390355
    },
    {
      "date": 1705536000,
      "totalLiquidityUSD": 7057307297
    },
    {
      "date": 1705622400,
      "totalLiquidityUSD": 6902465823
    },
    {
      "date": 1705708800,
      "totalLiquidityUSD": 6959629045
    },
    {
      "date": 1705795200,
      "totalLiquidityUSD": 6930997241
    },
    {
      "date": 1705881600,
      "totalLiquidityUSD": 6948007213
    },
    {
      "date": 1705968000,
      "totalLiquidityUSD": 6697650487
    },
    {
      "date": 1706054400,
      "totalLiquidityUSD": 6582515799
    },
    {
      "date": 1706140800,
      "totalLiquidityUSD": 6555931842
    },
    {
      "date": 1706227200,
      "totalLiquidityUSD": 6563899347
    },
    {
      "date": 1706313600,
      "totalLiquidityUSD": 6686657126
    },
    {
      "date": 1706400000,
      "totalLiquidityUSD": 6721753412
    },
    {
      "date": 1706486400,
      "totalLiquidityUSD": 6724041248
    },
    {
      "date": 1706572800,
      "totalLiquidityUSD": 6864625546
    },
    {
      "date": 1706659200,
      "totalLiquidityUSD": 6948038477
    },
    {
      "date": 1706745600,
      "totalLiquidityUSD": 6790562032
    },
    {
      "date": 1706832000,
      "totalLiquidityUSD": 6866140082
    },
    {
      "date": 1706918400,
      "totalLiquidityUSD": 6948876251
    },
    {
      "date": 1707004800,
      "totalLiquidityUSD": 6883995640
    },
    {
      "date": 1707091200,
      "totalLiquidityUSD": 6873408453
    },
    {
      "date": 1707177600,
      "totalLiquidityUSD": 6949156272
    },
    {
      "date": 1707264000,
      "totalLiquidityUSD": 7086871629
    },
    {
      "date": 1707350400,
      "totalLiquidityUSD": 7186153666
    },
    {
      "date": 1707436800,
      "totalLiquidityUSD": 7160565702
    },
    {
      "date": 1707523200,
      "totalLiquidityUSD": 7346626497
    },
    {
      "date": 1707609600,
      "totalLiquidityUSD": 7391669757
    },
    {
      "date": 1707696000,
      "totalLiquidityUSD": 7412727669
    },
    {
      "date": 1707782400,
      "totalLiquidityUSD": 7764644682
    },
    {
      "date": 1707868800,
      "totalLiquidityUSD": 7707673354
    },
    {
      "date": 1707955200,
      "totalLiquidityUSD": 8027345460
    },
    {
      "date": 1708041600,
      "totalLiquidityUSD": 7930490544
    },
    {
      "date": 1708128000,
      "totalLiquidityUSD": 7913438939
    },
    {
      "date": 1708214400,
      "totalLiquidityUSD": 7995248428
    },
    {
      "date": 1708300800,
      "totalLiquidityUSD": 8213324273
    },
    {
      "date": 1708387200,
      "totalLiquidityUSD": 8393343458
    },
    {
      "date": 1708473600,
      "totalLiquidityUSD": 8479185421
    },
    {
      "date": 1708560000,
      "totalLiquidityUSD": 8501781657
    },
    {
      "date": 1708646400,
      "totalLiquidityUSD": 8538290937
    },
    {
      "date": 1708732800,
      "totalLiquidityUSD": 8467569467
    },
    {
      "date": 1708819200,
      "totalLiquidityUSD": 8615384539
    },
    {
      "date": 1708905600,
      "totalLiquidityUSD": 8832907002
    },
    {
      "date": 1708992000,
      "totalLiquidityUSD": 8998321879
    },
    {
      "date": 1709078400,
      "totalLiquidityUSD": 9188153648
    },
    {
      "date": 1709164800,
      "totalLiquidityUSD": 9490020864
    },
    {
      "date": 1709251200,
      "totalLiquidityUSD": 9414504432
    },
    {
      "date": 1709337600,
      "totalLiquidityUSD": 9654433701
    },
    {
      "date": 1709424000,
      "totalLiquidityUSD": 9715267709
    },
    {
      "date": 1709510400,
      "totalLiquidityUSD": 9882645659
    },
    {
      "date": 1709596800,
      "totalLiquidityUSD": 10071747469
    },
    {
      "date": 1709683200,
      "totalLiquidityUSD": 9971264798
    },
    {
      "date": 1709769600,
      "totalLiquidityUSD": 10627979246
    },
    {
      "date": 1709856000,
      "totalLiquidityUSD": 10667342336
    },
    {
      "date": 1709942400,
      "totalLiquidityUSD": 10772127863
    },
    {
      "date": 1710028800,
      "totalLiquidityUSD": 10869506013
    },
    {
      "date": 1710115200,
      "totalLiquidityUSD": 10843585458
    },
    {
      "date": 1710201600,
      "totalLiquidityUSD": 11246673325
    },
    {
      "date": 1710288000,
      "totalLiquidityUSD": 11050388925
    },
    {
      "date": 1710374400,
      "totalLiquidityUSD": 11202352271
    },
    {
      "date": 1710460800,
      "totalLiquidityUSD": 11058062703
    },
    {
      "date": 1710547200,
      "totalLiquidityUSD": 10734874410
    },
    {
      "date": 1710633600,
      "totalLiquidityUSD": 10245477586
    },
    {
      "date": 1710720000,
      "totalLiquidityUSD": 10422234308
    },
    {
      "date": 1710806400,
      "totalLiquidityUSD": 10262401472
    },
    {
      "date": 1710892800,
      "totalLiquidityUSD": 9617009133
    },
    {
      "date": 1710979200,
      "totalLiquidityUSD": 10343002083
    },
    {
      "date": 1711065600,
      "totalLiquidityUSD": 10317121681
    },
    {
      "date": 1711152000,
      "totalLiquidityUSD": 9978610442
    },
    {
      "date": 1711238400,
      "totalLiquidityUSD": 10100921890
    },
    {
      "date": 1711324800,
      "totalLiquidityUSD": 10304638274
    },
    {
      "date": 1711411200,
      "totalLiquidityUSD": 10728216932
    },
    {
      "date": 1711497600,
      "totalLiquidityUSD": 10701082548
    },
    {
      "date": 1711584000,
      "totalLiquidityUSD": 10509713160
    },
    {
      "date": 1711670400,
      "totalLiquidityUSD": 10609020478
    },
    {
      "date": 1711756800,
      "totalLiquidityUSD": 10614169129
    },
    {
      "date": 1711843200,
      "totalLiquidityUSD": 10619940566
    },
    {
      "date": 1711929600,
      "totalLiquidityUSD": 10879497893
    },
    {
      "date": 1712016000,
      "totalLiquidityUSD": 10622279798
    },
    {
      "date": 1712102400,
      "totalLiquidityUSD": 10124253943
    },
    {
      "date": 1712188800,
      "totalLiquidityUSD": 10189627092
    },
    {
      "date": 1712275200,
      "totalLiquidityUSD": 10264937484
    },
    {
      "date": 1712361600,
      "totalLiquidityUSD": 10254582983
    },
    {
      "date": 1712448000,
      "totalLiquidityUSD": 10386613345
    },
    {
      "date": 1712534400,
      "totalLiquidityUSD": 10496974479
    },
    {
      "date": 1712620800,
      "totalLiquidityUSD": 11081720935
    },
    {
      "date": 1712707200,
      "totalLiquidityUSD": 10721840119
    },
    {
      "date": 1712793600,
      "totalLiquidityUSD": 10706556841
    },
    {
      "date": 1712880000,
      "totalLiquidityUSD": 10805673874
    },
    {
      "date": 1712966400,
      "totalLiquidityUSD": 10131266917
    },
    {
      "date": 1713052800,
      "totalLiquidityUSD": 9428158144
    },
    {
      "date": 1713139200,
      "totalLiquidityUSD": 9983532561
    },
    {
      "date": 1713225600,
      "totalLiquidityUSD": 9854667538
    },
    {
      "date": 1713312000,
      "totalLiquidityUSD": 9838528740
    },
    {
      "date": 1713398400,
      "totalLiquidityUSD": 9652699036
    },
    {
      "date": 1713484800,
      "totalLiquidityUSD": 9807287345
    },
    {
      "date": 1713571200,
      "totalLiquidityUSD": 9946543671
    },
    {
      "date": 1713657600,
      "totalLiquidityUSD": 10099692275
    },
    {
      "date": 1713744000,
      "totalLiquidityUSD": 10110625251
    },
    {
      "date": 1713830400,
      "totalLiquidityUSD": 10251797639
    },
    {
      "date": 1713916800,
      "totalLiquidityUSD": 10267832007
    },
    {
      "date": 1714003200,
      "totalLiquidityUSD": 10094766681
    },
    {
      "date": 1714089600,
      "totalLiquidityUSD": 10160232914
    },
    {
      "date": 1714176000,
      "totalLiquidityUSD": 10082066375
    },
    {
      "date": 1714262400,
      "totalLiquidityUSD": 10305294740
    },
    {
      "date": 1714348800,
      "totalLiquidityUSD": 10395474965
    },
    {
      "date": 1714435200,
      "totalLiquidityUSD": 10102224371
    },
    {
      "date": 1714521600,
      "totalLiquidityUSD": 9645772754
    },
    {
      "date": 1714608000,
      "totalLiquidityUSD": 9573631164
    },
    {
      "date": 1714694400,
      "totalLiquidityUSD": 9649913493
    },
    {
      "date": 1714780800,
      "totalLiquidityUSD": 9923725021
    },
    {
      "date": 1714867200,
      "totalLiquidityUSD": 9944488889
    },
    {
      "date": 1714953600,
      "totalLiquidityUSD": 9980178281
    },
    {
      "date": 1715040000,
      "totalLiquidityUSD": 9758864088
    },
    {
      "date": 1715126400,
      "totalLiquidityUSD": 9659319335
    },
    {
      "date": 1715212800,
      "totalLiquidityUSD": 9455163678
    },
    {
      "date": 1715299200,
      "totalLiquidityUSD": 9552491725
    },
    {
      "date": 1715385600,
      "totalLiquidityUSD": 9322212826
    },
    {
      "date": 1715472000,
      "totalLiquidityUSD": 9356430082
    },
    {
      "date": 1715558400,
      "totalLiquidityUSD": 9369528468
    },
    {
      "date": 1715644800,
      "totalLiquidityUSD": 9446148619
    },
    {
      "date": 1715731200,
      "totalLiquidityUSD": 9284147349
    },
    {
      "date": 1715817600,
      "totalLiquidityUSD": 9644052374
    },
    {
      "date": 1715904000,
      "totalLiquidityUSD": 9495578565
    },
    {
      "date": 1715990400,
      "totalLiquidityUSD": 9874588935
    },
    {
      "date": 1716076800,
      "totalLiquidityUSD": 9934654047
    },
    {
      "date": 1716163200,
      "totalLiquidityUSD": 9856280754
    },
    {
      "date": 1716249600,
      "totalLiquidityUSD": 11077298959
    },
    {
      "date": 1716336000,
      "totalLiquidityUSD": 11320450376
    },
    {
      "date": 1716422400,
      "totalLiquidityUSD": 11355553209
    },
    {
      "date": 1716508800,
      "totalLiquidityUSD": 11476121556
    },
    {
      "date": 1716595200,
      "totalLiquidityUSD": 11347621469
    },
    {
      "date": 1716681600,
      "totalLiquidityUSD": 11381830030
    },
    {
      "date": 1716768000,
      "totalLiquidityUSD": 11556252690
    },
    {
      "date": 1716854400,
      "totalLiquidityUSD": 11688366654
    },
    {
      "date": 1716940800,
      "totalLiquidityUSD": 11612634530
    },
    {
      "date": 1717027200,
      "totalLiquidityUSD": 11462980423
    },
    {
      "date": 1717113600,
      "totalLiquidityUSD": 11535408206
    },
    {
      "date": 1717200000,
      "totalLiquidityUSD": 11578904094
    },
    {
      "date": 1717286400,
      "totalLiquidityUSD": 11657955919
    },
    {
      "date": 1717372800,
      "totalLiquidityUSD": 11637165571
    },
    {
      "date": 1717459200,
      "totalLiquidityUSD": 11635251784
    },
    {
      "date": 1717545600,
      "totalLiquidityUSD": 11742660207
    },
    {
      "date": 1717632000,
      "totalLiquidityUSD": 11821436353
    },
    {
      "date": 1717718400,
      "totalLiquidityUSD": 11725933235
    },
    {
      "date": 1717804800,
      "totalLiquidityUSD": 11469253946
    },
    {
      "date": 1717891200,
      "totalLiquidityUSD": 11409068455
    },
    {
      "date": 1717977600,
      "totalLiquidityUSD": 11493191548
    },
    {
      "date": 1718064000,
      "totalLiquidityUSD": 11396903207
    },
    {
      "date": 1718150400,
      "totalLiquidityUSD": 11005302029
    },
    {
      "date": 1718236800,
      "totalLiquidityUSD": 11209662808
    },
    {
      "date": 1718323200,
      "totalLiquidityUSD": 10991056431
    },
    {
      "date": 1718409600,
      "totalLiquidityUSD": 10979755621
    },
    {
      "date": 1718496000,
      "totalLiquidityUSD": 11136639089
    },
    {
      "date": 1718582400,
      "totalLiquidityUSD": 11218042951
    },
    {
      "date": 1718668800,
      "totalLiquidityUSD": 11024515775
    },
    {
      "date": 1718755200,
      "totalLiquidityUSD": 10861097877
    },
    {
      "date": 1718841600,
      "totalLiquidityUSD": 11093584380
    },
    {
      "date": 1718928000,
      "totalLiquidityUSD": 11065618872
    },
    {
      "date": 1719014400,
      "totalLiquidityUSD": 11072637873
    },
    {
      "date": 1719100800,
      "totalLiquidityUSD": 11038475326
    },
    {
      "date": 1719187200,
      "totalLiquidityUSD": 10853979812
    },
    {
      "date": 1719273600,
      "totalLiquidityUSD": 10700493203
    },
    {
      "date": 1719360000,
      "totalLiquidityUSD": 10912556219
    },
    {
      "date": 1719446400,
      "totalLiquidityUSD": 10880345825
    },
    {
      "date": 1719532800,
      "totalLiquidityUSD": 11029969585
    },
    {
      "date": 1719619200,
      "totalLiquidityUSD": 10879539052
    },
    {
      "date": 1719705600,
      "totalLiquidityUSD": 10882412651
    },
    {
      "date": 1719792000,
      "totalLiquidityUSD": 9225094875
    },
    {
      "date": 1719878400,
      "totalLiquidityUSD": 9244965545
    },
    {
      "date": 1719964800,
      "totalLiquidityUSD": 9171100196
    },
    {
      "date": 1720051200,
      "totalLiquidityUSD": 10394157459
    },
    {
      "date": 1720137600,
      "totalLiquidityUSD": 10394037597
    },
    {
      "date": 1720224000,
      "totalLiquidityUSD": 9972954147
    },
    {
      "date": 1720310400,
      "totalLiquidityUSD": 10180669562
    },
    {
      "date": 1720396800,
      "totalLiquidityUSD": 9944015062
    },
    {
      "date": 1720483200,
      "totalLiquidityUSD": 10096254381
    },
    {
      "date": 1720569600,
      "totalLiquidityUSD": 10185657853
    },
    {
      "date": 1720656000,
      "totalLiquidityUSD": 10279225504
    },
    {
      "date": 1720742400,
      "totalLiquidityUSD": 10313255321
    },
    {
      "date": 1720828800,
      "totalLiquidityUSD": 10337993616
    },
    {
      "date": 1720915200,
      "totalLiquidityUSD": 10474765544
    },
    {
      "date": 1721001600,
      "totalLiquidityUSD": 10714976579
    },
    {
      "date": 1721088000,
      "totalLiquidityUSD": 11196120553
    },
    {
      "date": 1721174400,
      "totalLiquidityUSD": 11159250532
    },
    {
      "date": 1721260800,
      "totalLiquidityUSD": 11125842833
    },
    {
      "date": 1721347200,
      "totalLiquidityUSD": 11125956349
    },
    {
      "date": 1721433600,
      "totalLiquidityUSD": 11378567980
    },
    {
      "date": 1721520000,
      "totalLiquidityUSD": 11435317599
    },
    {
      "date": 1721606400,
      "totalLiquidityUSD": 11484034000
    },
    {
      "date": 1721692800,
      "totalLiquidityUSD": 11296731489
    },
    {
      "date": 1721779200,
      "totalLiquidityUSD": 11323940114
    },
    {
      "date": 1721865600,
      "totalLiquidityUSD": 11053792642
    },
    {
      "date": 1721952000,
      "totalLiquidityUSD": 10726639811
    },
    {
      "date": 1722038400,
      "totalLiquidityUSD": 10974152241
    },
    {
      "date": 1722124800,
      "totalLiquidityUSD": 11033201634
    },
    {
      "date": 1722211200,
      "totalLiquidityUSD": 10979918177
    },
    {
      "date": 1722297600,
      "totalLiquidityUSD": 11174859140
    },
    {
      "date": 1722384000,
      "totalLiquidityUSD": 11018222831
    },
    {
      "date": 1722470400,
      "totalLiquidityUSD": 10904937504
    },
    {
      "date": 1722556800,
      "totalLiquidityUSD": 10812860477
    },
    {
      "date": 1722643200,
      "totalLiquidityUSD": 10409295091
    },
    {
      "date": 1722729600,
      "totalLiquidityUSD": 10197970208
    },
    {
      "date": 1722816000,
      "totalLiquidityUSD": 9801981782
    },
    {
      "date": 1722902400,
      "totalLiquidityUSD": 9205076476
    },
    {
      "date": 1722988800,
      "totalLiquidityUSD": 9339478582
    },
    {
      "date": 1723075200,
      "totalLiquidityUSD": 9040792602
    },
    {
      "date": 1723161600,
      "totalLiquidityUSD": 9645640716
    },
    {
      "date": 1723248000,
      "totalLiquidityUSD": 9710124763
    },
    {
      "date": 1723334400,
      "totalLiquidityUSD": 9744199339
    },
    {
      "date": 1723420800,
      "totalLiquidityUSD": 9607932540
    },
    {
      "date": 1723507200,
      "totalLiquidityUSD": 9897603674
    },
    {
      "date": 1723593600,
      "totalLiquidityUSD": 10012540281
    },
    {
      "date": 1723680000,
      "totalLiquidityUSD": 9874982062
    },
    {
      "date": 1723766400,
      "totalLiquidityUSD": 9628150641
    },
    {
      "date": 1723852800,
      "totalLiquidityUSD": 9729377567
    },
    {
      "date": 1723939200,
      "totalLiquidityUSD": 9750619668
    },
    {
      "date": 1724025600,
      "totalLiquidityUSD": 9868778245
    },
    {
      "date": 1724112000,
      "totalLiquidityUSD": 9804300225
    },
    {
      "date": 1724198400,
      "totalLiquidityUSD": 9769231515
    },
    {
      "date": 1724284800,
      "totalLiquidityUSD": 9928579906
    },
    {
      "date": 1724371200,
      "totalLiquidityUSD": 9854467943
    },
    {
      "date": 1724457600,
      "totalLiquidityUSD": 10260917710
    },
    {
      "date": 1724544000,
      "totalLiquidityUSD": 10219439077
    },
    {
      "date": 1724630400,
      "totalLiquidityUSD": 10280530227
    },
    {
      "date": 1724716800,
      "totalLiquidityUSD": 9984552530
    },
    {
      "date": 1724803200,
      "totalLiquidityUSD": 9396903679
    },
    {
      "date": 1724889600,
      "totalLiquidityUSD": 9575988166
    },
    {
      "date": 1724976000,
      "totalLiquidityUSD": 9578646388
    },
    {
      "date": 1725062400,
      "totalLiquidityUSD": 9471542530
    },
    {
      "date": 1725148800,
      "totalLiquidityUSD": 9224899403
    },
    {
      "date": 1725235200,
      "totalLiquidityUSD": 8752523086
    },
    {
      "date": 1725321600,
      "totalLiquidityUSD": 8997075417
    },
    {
      "date": 1725408000,
      "totalLiquidityUSD": 8792611025
    },
    {
      "date": 1725494400,
      "totalLiquidityUSD": 8832118410
    },
    {
      "date": 1725580800,
      "totalLiquidityUSD": 8634510503
    },
    {
      "date": 1725667200,
      "totalLiquidityUSD": 8318685416
    },
    {
      "date": 1725753600,
      "totalLiquidityUSD": 8456557344
    },
    {
      "date": 1725840000,
      "totalLiquidityUSD": 8560444254
    },
    {
      "date": 1725926400,
      "totalLiquidityUSD": 8619695376
    },
    {
      "date": 1726012800,
      "totalLiquidityUSD": 8673221782
    },
    {
      "date": 1726099200,
      "totalLiquidityUSD": 8223261574
    },
    {
      "date": 1726185600,
      "totalLiquidityUSD": 8381643360
    },
    {
      "date": 1726272000,
      "totalLiquidityUSD": 8593926564
    },
    {
      "date": 1726358400,
      "totalLiquidityUSD": 8554916885
    },
    {
      "date": 1726444800,
      "totalLiquidityUSD": 8414019603
    },
    {
      "date": 1726531200,
      "totalLiquidityUSD": 8289102966
    },
    {
      "date": 1726617600,
      "totalLiquidityUSD": 8438384181
    },
    {
      "date": 1726704000,
      "totalLiquidityUSD": 8416466360
    },
    {
      "date": 1726790400,
      "totalLiquidityUSD": 8373571020
    },
    {
      "date": 1726876800,
      "totalLiquidityUSD": 8536682974
    },
    {
      "date": 1726963200,
      "totalLiquidityUSD": 8568688109
    },
    {
      "date": 1727049600,
      "totalLiquidityUSD": 8530561926
    },
    {
      "date": 1727136000,
      "totalLiquidityUSD": 8738444435
    },
    {
      "date": 1727222400,
      "totalLiquidityUSD": 8623143981
    },
    {
      "date": 1727308800,
      "totalLiquidityUSD": 8520899942
    },
    {
      "date": 1727395200,
      "totalLiquidityUSD": 8702765460
    },
    {
      "date": 1727481600,
      "totalLiquidityUSD": 8824144617
    },
    {
      "date": 1727568000,
      "totalLiquidityUSD": 8763828370
    },
    {
      "date": 1727654400,
      "totalLiquidityUSD": 8758698464
    },
    {
      "date": 1727740800,
      "totalLiquidityUSD": 8626816890
    },
    {
      "date": 1727827200,
      "totalLiquidityUSD": 8348811479
    },
    {
      "date": 1727913600,
      "totalLiquidityUSD": 8042141444
    },
    {
      "date": 1728000000,
      "totalLiquidityUSD": 7976664735
    },
    {
      "date": 1728086400,
      "totalLiquidityUSD": 8126558485
    },
    {
      "date": 1728172800,
      "totalLiquidityUSD": 8101471547
    },
    {
      "date": 1728259200,
      "totalLiquidityUSD": 8148655733
    },
    {
      "date": 1728345600,
      "totalLiquidityUSD": 8182329450
    },
    {
      "date": 1728432000,
      "totalLiquidityUSD": 8087650617
    },
    {
      "date": 1728518400,
      "totalLiquidityUSD": 7974117148
    },
    {
      "date": 1728604800,
      "totalLiquidityUSD": 7978168620
    },
    {
      "date": 1728691200,
      "totalLiquidityUSD": 8075473327
    },
    {
      "date": 1728777600,
      "totalLiquidityUSD": 8133394004
    },
    {
      "date": 1728864000,
      "totalLiquidityUSD": 8080462000
    },
    {
      "date": 1728950400,
      "totalLiquidityUSD": 8401370276
    },
    {
      "date": 1729036800,
      "totalLiquidityUSD": 8323771858
    },
    {
      "date": 1729123200,
      "totalLiquidityUSD": 8379793179
    },
    {
      "date": 1729209600,
      "totalLiquidityUSD": 8363114060
    },
    {
      "date": 1729296000,
      "totalLiquidityUSD": 8422511421
    },
    {
      "date": 1729382400,
      "totalLiquidityUSD": 8441339046
    },
    {
      "date": 1729468800,
      "totalLiquidityUSD": 8628257282
    },
    {
      "date": 1729555200,
      "totalLiquidityUSD": 8503111389
    },
    {
      "date": 1729641600,
      "totalLiquidityUSD": 8460030657
    },
    {
      "date": 1729728000,
      "totalLiquidityUSD": 8281253132
    },
    {
      "date": 1729814400,
      "totalLiquidityUSD": 8395305828
    },
    {
      "date": 1729900800,
      "totalLiquidityUSD": 8290896254
    },
    {
      "date": 1729987200,
      "totalLiquidityUSD": 8301016010
    },
    {
      "date": 1730073600,
      "totalLiquidityUSD": 8375218275
    },
    {
      "date": 1730160000,
      "totalLiquidityUSD": 8428440993
    },
    {
      "date": 1730246400,
      "totalLiquidityUSD": 8476380744
    },
    {
      "date": 1730332800,
      "totalLiquidityUSD": 8560364230
    },
    {
      "date": 1730419200,
      "totalLiquidityUSD": 8311315312
    },
    {
      "date": 1730505600,
      "totalLiquidityUSD": 8313448598
    },
    {
      "date": 1730592000,
      "totalLiquidityUSD": 8278104489
    },
    {
      "date": 1730678400,
      "totalLiquidityUSD": 8211944085
    },
    {
      "date": 1730764800,
      "totalLiquidityUSD": 7871190859
    },
    {
      "date": 1730851200,
      "totalLiquidityUSD": 7755055901
    },
    {
      "date": 1730937600,
      "totalLiquidityUSD": 8443518152
    },
    {
      "date": 1731024000,
      "totalLiquidityUSD": 8645298902
    },
    {
      "date": 1731110400,
      "totalLiquidityUSD": 8779468908
    },
    {
      "date": 1731196800,
      "totalLiquidityUSD": 9079495732
    },
    {
      "date": 1731283200,
      "totalLiquidityUSD": 9198388431
    },
    {
      "date": 1731369600,
      "totalLiquidityUSD": 9387659962
    },
    {
      "date": 1731456000,
      "totalLiquidityUSD": 9415682360
    },
    {
      "date": 1731542400,
      "totalLiquidityUSD": 9354945280
    },
    {
      "date": 1731628800,
      "totalLiquidityUSD": 9217616778
    },
    {
      "date": 1731715200,
      "totalLiquidityUSD": 9348753480
    },
    {
      "date": 1731801600,
      "totalLiquidityUSD": 9443192022
    },
    {
      "date": 1731888000,
      "totalLiquidityUSD": 9326977987
    },
    {
      "date": 1731974400,
      "totalLiquidityUSD": 9587917996
    },
    {
      "date": 1732060800,
      "totalLiquidityUSD": 9532571632
    },
    {
      "date": 1732147200,
      "totalLiquidityUSD": 9515221480
    },
    {
      "date": 1732233600,
      "totalLiquidityUSD": 10127657631
    },
    {
      "date": 1732320000,
      "totalLiquidityUSD": 10074407723
    },
    {
      "date": 1732406400,
      "totalLiquidityUSD": 10190237324
    },
    {
      "date": 1732492800,
      "totalLiquidityUSD": 10139914792
    },
    {
      "date": 1732579200,
      "totalLiquidityUSD": 9941963862
    },
    {
      "date": 1732665600,
      "totalLiquidityUSD": 9806017076
    },
    {
      "date": 1732752000,
      "totalLiquidityUSD": 10346481598
    },
    {
      "date": 1732838400,
      "totalLiquidityUSD": 10225203514
    },
    {
      "date": 1732924800,
      "totalLiquidityUSD": 10313983215
    },
    {
      "date": 1733011200,
      "totalLiquidityUSD": 10551003074
    },
    {
      "date": 1733097600,
      "totalLiquidityUSD": 10647932341
    },
    {
      "date": 1733184000,
      "totalLiquidityUSD": 10570724320
    },
    {
      "date": 1733270400,
      "totalLiquidityUSD": 10594961576
    },
    {
      "date": 1733356800,
      "totalLiquidityUSD": 10999758088
    },
    {
      "date": 1733443200,
      "totalLiquidityUSD": 10796149581
    },
    {
      "date": 1733529600,
      "totalLiquidityUSD": 11214686912
    },
    {
      "date": 1733616000,
      "totalLiquidityUSD": 11241068211
    },
    {
      "date": 1733702400,
      "totalLiquidityUSD": 11236739851
    },
    {
      "date": 1733788800,
      "totalLiquidityUSD": 10749252627
    },
    {
      "date": 1733875200,
      "totalLiquidityUSD": 10676947682
    },
    {
      "date": 1733961600,
      "totalLiquidityUSD": 11092173942
    },
    {
      "date": 1734048000,
      "totalLiquidityUSD": 11106940109
    },
    {
      "date": 1734134400,
      "totalLiquidityUSD": 10945379871
    },
    {
      "date": 1734220800,
      "totalLiquidityUSD": 10886917338
    },
    {
      "date": 1734307200,
      "totalLiquidityUSD": 10979027188
    },
    {
      "date": 1734393600,
      "totalLiquidityUSD": 11228199303
    },
    {
      "date": 1734480000,
      "totalLiquidityUSD": 11023333353
    },
    {
      "date": 1734566400,
      "totalLiquidityUSD": 10650593027
    },
    {
      "date": 1734652800,
      "totalLiquidityUSD": 10195707853
    },
    {
      "date": 1734739200,
      "totalLiquidityUSD": 10356483337
    },
    {
      "date": 1734825600,
      "totalLiquidityUSD": 10092979969
    },
    {
      "date": 1734912000,
      "totalLiquidityUSD": 10052936439
    },
    {
      "date": 1734998400,
      "totalLiquidityUSD": 9982803671
    },
    {
      "date": 1735084800,
      "totalLiquidityUSD": 10026148281
    },
    {
      "date": 1735171200,
      "totalLiquidityUSD": 9930703168
    },
    {
      "date": 1735257600,
      "totalLiquidityUSD": 9563344638
    },
    {
      "date": 1735344000,
      "totalLiquidityUSD": 9456597885
    },
    {
      "date": 1735430400,
      "totalLiquidityUSD": 9590130232
    },
    {
      "date": 1735516800,
      "totalLiquidityUSD": 9499630084
    },
    {
      "date": 1735603200,
      "totalLiquidityUSD": 9402341226
    },
    {
      "date": 1735689600,
      "totalLiquidityUSD": 9292678318
    },
    {
      "date": 1735776000,
      "totalLiquidityUSD": 9358610436
    },
    {
      "date": 1735862400,
      "totalLiquidityUSD": 9547103380
    },
    {
      "date": 1735948800,
      "totalLiquidityUSD": 9864637531
    },
    {
      "date": 1736035200,
      "totalLiquidityUSD": 10005929618
    },
    {
      "date": 1736121600,
      "totalLiquidityUSD": 9967792682
    },
    {
      "date": 1736208000,
      "totalLiquidityUSD": 9978462467
    },
    {
      "date": 1736294400,
      "totalLiquidityUSD": 9250111561
    },
    {
      "date": 1736380800,
      "totalLiquidityUSD": 9129559727
    },
    {
      "date": 1736467200,
      "totalLiquidityUSD": 8886523062
    },
    {
      "date": 1736553600,
      "totalLiquidityUSD": 8996696029
    },
    {
      "date": 1736640000,
      "totalLiquidityUSD": 9003200418
    },
    {
      "date": 1736726400,
      "totalLiquidityUSD": 8865930180
    },
    {
      "date": 1736812800,
      "totalLiquidityUSD": 8626454564
    },
    {
      "date": 1736899200,
      "totalLiquidityUSD": 8696889176
    },
    {
      "date": 1736985600,
      "totalLiquidityUSD": 9026071810
    },
    {
      "date": 1737072000,
      "totalLiquidityUSD": 8734333669
    },
    {
      "date": 1737158400,
      "totalLiquidityUSD": 8889529912
    },
    {
      "date": 1737244800,
      "totalLiquidityUSD": 8570365822
    },
    {
      "date": 1737331200,
      "totalLiquidityUSD": 8325144759
    },
    {
      "date": 1737417600,
      "totalLiquidityUSD": 8366952610
    },
    {
      "date": 1737504000,
      "totalLiquidityUSD": 8371921390
    },
    {
      "date": 1737590400,
      "totalLiquidityUSD": 8208158385
    },
    {
      "date": 1737676800,
      "totalLiquidityUSD": 8294973487
    },
    {
      "date": 1737763200,
      "totalLiquidityUSD": 7845922862
    },
    {
      "date": 1737849600,
      "totalLiquidityUSD": 7845852474
    },
    {
      "date": 1737936000,
      "totalLiquidityUSD": 7777040139
    },
    {
      "date": 1738022400,
      "totalLiquidityUSD": 7560954790
    },
    {
      "date": 1738108800,
      "totalLiquidityUSD": 7252474538
    },
    {
      "date": 1738195200,
      "totalLiquidityUSD": 7401154007
    },
    {
      "date": 1738281600,
      "totalLiquidityUSD": 7592145504
    },
    {
      "date": 1738368000,
      "totalLiquidityUSD": 7517698390
    },
    {
      "date": 1738454400,
      "totalLiquidityUSD": 7265088984
    },
    {
      "date": 1738540800,
      "totalLiquidityUSD": 6609946379
    },
    {
      "date": 1738627200,
      "totalLiquidityUSD": 6712933960
    },
    {
      "date": 1738713600,
      "totalLiquidityUSD": 6437440219
    },
    {
      "date": 1738800000,
      "totalLiquidityUSD": 5186973140
    },
    {
      "date": 1738886400,
      "totalLiquidityUSD": 5030782625
    },
    {
      "date": 1738972800,
      "totalLiquidityUSD": 5008366117
    },
    {
      "date": 1739059200,
      "totalLiquidityUSD": 4998027260
    },
    {
      "date": 1739145600,
      "totalLiquidityUSD": 4991437355
    },
    {
      "date": 1739232000,
      "totalLiquidityUSD": 5047296929
    },
    {
      "date": 1739318400,
      "totalLiquidityUSD": 4928255854
    },
    {
      "date": 1739404800,
      "totalLiquidityUSD": 5142409952
    },
    {
      "date": 1739491200,
      "totalLiquidityUSD": 5049581527
    },
    {
      "date": 1739577600,
      "totalLiquidityUSD": 5147800774
    },
    {
      "date": 1739664000,
      "totalLiquidityUSD": 5120397226
    },
    {
      "date": 1739750400,
      "totalLiquidityUSD": 5050837737
    },
    {
      "date": 1739836800,
      "totalLiquidityUSD": 5086037868
    },
    {
      "date": 1739923200,
      "totalLiquidityUSD": 5014262418
    },
    {
      "date": 1740009600,
      "totalLiquidityUSD": 5035744701
    },
    {
      "date": 1740096000,
      "totalLiquidityUSD": 5085534789
    },
    {
      "date": 1740182400,
      "totalLiquidityUSD": 4980536820
    },
    {
      "date": 1740268800,
      "totalLiquidityUSD": 5177390652
    },
    {
      "date": 1740355200,
      "totalLiquidityUSD": 5262165504
    },
    {
      "date": 1740441600,
      "totalLiquidityUSD": 4816553098
    },
    {
      "date": 1740528000,
      "totalLiquidityUSD": 4753197572
    },
    {
      "date": 1740614400,
      "totalLiquidityUSD": 4541719166
    },
    {
      "date": 1740700800,
      "totalLiquidityUSD": 4758552887
    },
    {
      "date": 1740787200,
      "totalLiquidityUSD": 4669362673
    },
    {
      "date": 1740873600,
      "totalLiquidityUSD": 4665440258
    },
    {
      "date": 1740960000,
      "totalLiquidityUSD": 5124151781
    },
    {
      "date": 1741046400,
      "totalLiquidityUSD": 4563331266
    },
    {
      "date": 1741132800,
      "totalLiquidityUSD": 4560976739
    },
    {
      "date": 1741219200,
      "totalLiquidityUSD": 4716610508
    },
    {
      "date": 1741305600,
      "totalLiquidityUSD": 4669449945
    },
    {
      "date": 1741392000,
      "totalLiquidityUSD": 4553103310
    },
    {
      "date": 1741478400,
      "totalLiquidityUSD": 4578343186
    },
    {
      "date": 1741564800,
      "totalLiquidityUSD": 4274966571
    },
    {
      "date": 1741651200,
      "totalLiquidityUSD": 3926058201
    },
    {
      "date": 1741737600,
      "totalLiquidityUSD": 4141878801
    },
    {
      "date": 1741824000,
      "totalLiquidityUSD": 4163176895
    },
    {
      "date": 1741910400,
      "totalLiquidityUSD": 4085933728
    },
    {
      "date": 1741996800,
      "totalLiquidityUSD": 4195880752
    },
    {
      "date": 1742083200,
      "totalLiquidityUSD": 4240389061
    },
    {
      "date": 1742169600,
      "totalLiquidityUSD": 4126359792
    },
    {
      "date": 1742256000,
      "totalLiquidityUSD": 4249289465
    },
    {
      "date": 1742342400,
      "totalLiquidityUSD": 4244992896
    },
    {
      "date": 1742428800,
      "totalLiquidityUSD": 4461176905
    },
    {
      "date": 1742515200,
      "totalLiquidityUSD": 4334028777
    },
    {
      "date": 1742601600,
      "totalLiquidityUSD": 4329131522
    },
    {
      "date": 1742688000,
      "totalLiquidityUSD": 4350776137
    },
    {
      "date": 1742774400,
      "totalLiquidityUSD": 4440671848
    },
    {
      "date": 1742860800,
      "totalLiquidityUSD": 4544186745
    },
    {
      "date": 1742947200,
      "totalLiquidityUSD": 4543871984
    },
    {
      "date": 1743033600,
      "totalLiquidityUSD": 4457238081
    },
    {
      "date": 1743120000,
      "totalLiquidityUSD": 4443592374
    },
    {
      "date": 1743206400,
      "totalLiquidityUSD": 4268705379
    },
    {
      "date": 1743292800,
      "totalLiquidityUSD": 4115237434
    },
    {
      "date": 1743379200,
      "totalLiquidityUSD": 4082180809
    },
    {
      "date": 1743465600,
      "totalLiquidityUSD": 4126184393
    },
    {
      "date": 1743552000,
      "totalLiquidityUSD": 4287562421
    },
    {
      "date": 1743638400,
      "totalLiquidityUSD": 4108998735
    },
    {
      "date": 1743724800,
      "totalLiquidityUSD": 4044434892
    },
    {
      "date": 1743811200,
      "totalLiquidityUSD": 3881137138
    },
    {
      "date": 1743897600,
      "totalLiquidityUSD": 3852888213
    },
    {
      "date": 1743984000,
      "totalLiquidityUSD": 3506526623
    },
    {
      "date": 1744070400,
      "totalLiquidityUSD": 3523868743
    },
    {
      "date": 1744156800,
      "totalLiquidityUSD": 3394940822
    },
    {
      "date": 1744243200,
      "totalLiquidityUSD": 3727437484
    },
    {
      "date": 1744329600,
      "totalLiquidityUSD": 3539123259
    },
    {
      "date": 1744416000,
      "totalLiquidityUSD": 3644416789
    },
    {
      "date": 1744502400,
      "totalLiquidityUSD": 3776170553
    },
    {
      "date": 1744588800,
      "totalLiquidityUSD": 3724437352
    },
    {
      "date": 1744675200,
      "totalLiquidityUSD": 3756956527
    },
    {
      "date": 1744761600,
      "totalLiquidityUSD": 3720435113
    },
    {
      "date": 1744848000,
      "totalLiquidityUSD": 3683413881
    },
    {
      "date": 1744934400,
      "totalLiquidityUSD": 3709336848
    },
    {
      "date": 1745020800,
      "totalLiquidityUSD": 3710750629
    },
    {
      "date": 1745107200,
      "totalLiquidityUSD": 3746390895
    },
    {
      "date": 1745193600,
      "totalLiquidityUSD": 3735338846
    },
    {
      "date": 1745280000,
      "totalLiquidityUSD": 3773697821
    },
    {
      "date": 1745366400,
      "totalLiquidityUSD": 3980902347
    },
    {
      "date": 1745452800,
      "totalLiquidityUSD": 4041547668
    },
    {
      "date": 1745539200,
      "totalLiquidityUSD": 4038937717
    },
    {
      "date": 1745625600,
      "totalLiquidityUSD": 4083424179
    },
    {
      "date": 1745712000,
      "totalLiquidityUSD": 4134317717
    },
    {
      "date": 1745798400,
      "totalLiquidityUSD": 4024473490
    },
    {
      "date": 1745884800,
      "totalLiquidityUSD": 4067115691
    },
    {
      "date": 1745971200,
      "totalLiquidityUSD": 4114223111
    },
    {
      "date": 1746057600,
      "totalLiquidityUSD": 4177699447
    },
    {
      "date": 1746144000,
      "totalLiquidityUSD": 4250871914
    },
    {
      "date": 1746230400,
      "totalLiquidityUSD": 4265372140
    },
    {
      "date": 1746316800,
      "totalLiquidityUSD": 4211768336
    },
    {
      "date": 1746403200,
      "totalLiquidityUSD": 4153326002
    },
    {
      "date": 1746489600,
      "totalLiquidityUSD": 4148331941
    },
    {
      "date": 1746576000,
      "totalLiquidityUSD": 4207093984
    },
    {
      "date": 1746662400,
      "totalLiquidityUSD": 4196248795
    },
    {
      "date": 1746748800,
      "totalLiquidityUSD": 4762051325
    },
    {
      "date": 1746835200,
      "totalLiquidityUSD": 4967659359
    },
    {
      "date": 1746921600,
      "totalLiquidityUSD": 5290756701
    },
    {
      "date": 1747008000,
      "totalLiquidityUSD": 5204086188
    },
    {
      "date": 1747094400,
      "totalLiquidityUSD": 5111353095
    },
    {
      "date": 1747180800,
      "totalLiquidityUSD": 5430521803
    },
    {
      "date": 1747267200,
      "totalLiquidityUSD": 5303706476
    },
    {
      "date": 1747353600,
      "totalLiquidityUSD": 5216841114
    },
    {
      "date": 1747440000,
      "totalLiquidityUSD": 5221072840
    },
    {
      "date": 1747526400,
      "totalLiquidityUSD": 5134271450
    },
    {
      "date": 1747612800,
      "totalLiquidityUSD": 5194795652
    },
    {
      "date": 1747699200,
      "totalLiquidityUSD": 5261888862
    },
    {
      "date": 1747785600,
      "totalLiquidityUSD": 5275909870
    },
    {
      "date": 1747872000,
      "totalLiquidityUSD": 5355174450
    },
    {
      "date": 1747958400,
      "totalLiquidityUSD": 5539245905
    },
    {
      "date": 1748044800,
      "totalLiquidityUSD": 5311611717
    },
    {
      "date": 1748131200,
      "totalLiquidityUSD": 5194209081
    },
    {
      "date": 1748217600,
      "totalLiquidityUSD": 5252756350
    },
    {
      "date": 1748304000,
      "totalLiquidityUSD": 5299113668
    },
    {
      "date": 1748390400,
      "totalLiquidityUSD": 5173650408
    },
    {
      "date": 1748476800,
      "totalLiquidityUSD": 5203802943
    },
    {
      "date": 1748563200,
      "totalLiquidityUSD": 5017117103
    },
    {
      "date": 1748649600,
      "totalLiquidityUSD": 4829345858
    },
    {
      "date": 1748736000,
      "totalLiquidityUSD": 4832196616
    },
    {
      "date": 1748822400,
      "totalLiquidityUSD": 4873276473
    },
    {
      "date": 1748908800,
      "totalLiquidityUSD": 4988920776
    },
    {
      "date": 1748995200,
      "totalLiquidityUSD": 4775674345
    },
    {
      "date": 1749081600,
      "totalLiquidityUSD": 4769695637
    },
    {
      "date": 1749168000,
      "totalLiquidityUSD": 4539062664
    },
    {
      "date": 1749254400,
      "totalLiquidityUSD": 4453111218
    },
    {
      "date": 1749340800,
      "totalLiquidityUSD": 4563541701
    },
    {
      "date": 1749427200,
      "totalLiquidityUSD": 4536391395
    },
    {
      "date": 1749513600,
      "totalLiquidityUSD": 4841645124
    },
    {
      "date": 1749600000,
      "totalLiquidityUSD": 5001386649
    },
    {
      "date": 1749686400,
      "totalLiquidityUSD": 4914281329
    },
    {
      "date": 1749772800,
      "totalLiquidityUSD": 4616608953
    },
    {
      "date": 1749859200,
      "totalLiquidityUSD": 4630388678
    },
    {
      "date": 1749945600,
      "totalLiquidityUSD": 4583733434
    },
    {
      "date": 1750032000,
      "totalLiquidityUSD": 4593448540
    },
    {
      "date": 1750118400,
      "totalLiquidityUSD": 4660918014
    },
    {
      "date": 1750204800,
      "totalLiquidityUSD": 4581890086
    },
    {
      "date": 1750291200,
      "totalLiquidityUSD": 4617825266
    },
    {
      "date": 1750377600,
      "totalLiquidityUSD": 4633801447
    },
    {
      "date": 1750464000,
      "totalLiquidityUSD": 4469396750
    },
    {
      "date": 1750550400,
      "totalLiquidityUSD": 4253850563
    },
    {
      "date": 1750636800,
      "totalLiquidityUSD": 4249426548
    },
    {
      "date": 1750723200,
      "totalLiquidityUSD": 4492050065
    },
    {
      "date": 1750809600,
      "totalLiquidityUSD": 4553036481
    },
    {
      "date": 1750896000,
      "totalLiquidityUSD": 4529888241
    },
    {
      "date": 1750982400,
      "totalLiquidityUSD": 4534164911
    },
    {
      "date": 1751068800,
      "totalLiquidityUSD": 4559630978
    },
    {
      "date": 1751155200,
      "totalLiquidityUSD": 4610984911
    },
    {
      "date": 1751241600,
      "totalLiquidityUSD": 4738737980
    },
    {
      "date": 1751328000,
      "totalLiquidityUSD": 4680014178
    },
    {
      "date": 1751414400,
      "totalLiquidityUSD": 4412863530
    },
    {
      "date": 1751500800,
      "totalLiquidityUSD": 4646748195
    },
    {
      "date": 1751587200,
      "totalLiquidityUSD": 4698822573
    },
    {
      "date": 1751673600,
      "totalLiquidityUSD": 4573324666
    },
    {
      "date": 1751760000,
      "totalLiquidityUSD": 4568461612
    },
    {
      "date": 1751846400,
      "totalLiquidityUSD": 4649541770
    },
    {
      "date": 1751932800,
      "totalLiquidityUSD": 4609788515
    },
    {
      "date": 1752019200,
      "totalLiquidityUSD": 4708297445
    },
    {
      "date": 1752105600,
      "totalLiquidityUSD": 4670825264
    },
    {
      "date": 1752192000,
      "totalLiquidityUSD": 4913446524
    },
    {
      "date": 1752278400,
      "totalLiquidityUSD": 4956789425
    },
    {
      "date": 1752364800,
      "totalLiquidityUSD": 4963447411
    },
    {
      "date": 1752451200,
      "totalLiquidityUSD": 5006383997
    },
    {
      "date": 1752537600,
      "totalLiquidityUSD": 5025246920
    },
    {
      "date": 1752624000,
      "totalLiquidityUSD": 4959681979
    },
    {
      "date": 1752710400,
      "totalLiquidityUSD": 5186504944
    },
    {
      "date": 1752796800,
      "totalLiquidityUSD": 5201496995
    },
    {
      "date": 1752883200,
      "totalLiquidityUSD": 5322822816
    },
    {
      "date": 1752969600,
      "totalLiquidityUSD": 5376771278
    },
    {
      "date": 1753056000,
      "totalLiquidityUSD": 5550498458
    },
    {
      "date": 1753142400,
      "totalLiquidityUSD": 5474981882
    },
    {
      "date": 1753228800,
      "totalLiquidityUSD": 5499920548
    },
    {
      "date": 1753315200,
      "totalLiquidityUSD": 5328794940
    },
    {
      "date": 1753401600,
      "totalLiquidityUSD": 5512010220
    },
    {
      "date": 1753488000,
      "totalLiquidityUSD": 5505934657
    },
    {
      "date": 1753574400,
      "totalLiquidityUSD": 5545027930
    },
    {
      "date": 1753660800,
      "totalLiquidityUSD": 5687151308
    },
    {
      "date": 1753747200,
      "totalLiquidityUSD": 5485471378
    },
    {
      "date": 1753833600,
      "totalLiquidityUSD": 5459254348
    },
    {
      "date": 1753920000,
      "totalLiquidityUSD": 5480024161
    },
    {
      "date": 1754006400,
      "totalLiquidityUSD": 5350674430
    },
    {
      "date": 1754092800,
      "totalLiquidityUSD": 5147576400
    },
    {
      "date": 1754179200,
      "totalLiquidityUSD": 5035380354
    },
    {
      "date": 1754265600,
      "totalLiquidityUSD": 5204928214
    },
    {
      "date": 1754352000,
      "totalLiquidityUSD": 5362388327
    },
    {
      "date": 1754438400,
      "totalLiquidityUSD": 5236228973
    },
    {
      "date": 1754524800,
      "totalLiquidityUSD": 5337867429
    },
    {
      "date": 1754611200,
      "totalLiquidityUSD": 5661976748
    },
    {
      "date": 1754697600,
      "totalLiquidityUSD": 5809934058
    },
    {
      "date": 1754784000,
      "totalLiquidityUSD": 6131176023
    },
    {
      "date": 1754870400,
      "totalLiquidityUSD": 6126325473
    },
    {
      "date": 1754956800,
      "totalLiquidityUSD": 6078024812
    },
    {
      "date": 1755043200,
      "totalLiquidityUSD": 6509192601
    },
    {
      "date": 1755129600,
      "totalLiquidityUSD": 6607489285
    },
    {
      "date": 1755216000,
      "totalLiquidityUSD": 6371787729
    },
    {
      "date": 1755302400,
      "totalLiquidityUSD": 6289592241
    },
    {
      "date": 1755388800,
      "totalLiquidityUSD": 6249949788
    },
    {
      "date": 1755475200,
      "totalLiquidityUSD": 6295507463
    },
    {
      "date": 1755561600,
      "totalLiquidityUSD": 6084998368
    },
    {
      "date": 1755648000,
      "totalLiquidityUSD": 5853485244
    },
    {
      "date": 1755734400,
      "totalLiquidityUSD": 6043389435
    },
    {
      "date": 1755820800,
      "totalLiquidityUSD": 5856957949
    },
    {
      "date": 1755907200,
      "totalLiquidityUSD": 6449455392
    },
    {
      "date": 1755993600,
      "totalLiquidityUSD": 6418565989
    },
    {
      "date": 1756080000,
      "totalLiquidityUSD": 6277791746
    },
    {
      "date": 1756166400,
      "totalLiquidityUSD": 5912415195
    },
    {
      "date": 1756252800,
      "totalLiquidityUSD": 6179872654
    },
    {
      "date": 1756339200,
      "totalLiquidityUSD": 6082249712
    },
    {
      "date": 1756425600,
      "totalLiquidityUSD": 6096342642
    },
    {
      "date": 1756512000,
      "totalLiquidityUSD": 5927992413
    },
    {
      "date": 1756598400,
      "totalLiquidityUSD": 5944126309
    },
    {
      "date": 1756684800,
      "totalLiquidityUSD": 5938901304
    },
    {
      "date": 1756771200,
      "totalLiquidityUSD": 5857150905
    },
    {
      "date": 1756857600,
      "totalLiquidityUSD": 5825370008
    },
    {
      "date": 1756944000,
      "totalLiquidityUSD": 5922418842
    },
    {
      "date": 1757030400,
      "totalLiquidityUSD": 5617141666
    },
    {
      "date": 1757116800,
      "totalLiquidityUSD": 5623997108
    },
    {
      "date": 1757203200,
      "totalLiquidityUSD": 5598773725
    },
    {
      "date": 1757289600,
      "totalLiquidityUSD": 5645610437
    },
    {
      "date": 1757376000,
      "totalLiquidityUSD": 5754752776
    },
    {
      "date": 1757462400,
      "totalLiquidityUSD": 5693355575
    },
    {
      "date": 1757548800,
      "totalLiquidityUSD": 5766783478
    },
    {
      "date": 1757635200,
      "totalLiquidityUSD": 5941145876
    },
    {
      "date": 1757721600,
      "totalLiquidityUSD": 6198783698
    },
    {
      "date": 1757808000,
      "totalLiquidityUSD": 6173280023
    },
    {
      "date": 1757894400,
      "totalLiquidityUSD": 6099500030
    },
    {
      "date": 1757980800,
      "totalLiquidityUSD": 6025540552
    },
    {
      "date": 1758067200,
      "totalLiquidityUSD": 6062631838
    },
    {
      "date": 1758153600,
      "totalLiquidityUSD": 6087438051
    },
    {
      "date": 1758240000,
      "totalLiquidityUSD": 6092227255
    },
    {
      "date": 1758326400,
      "totalLiquidityUSD": 5969405306
    },
    {
      "date": 1758412800,
      "totalLiquidityUSD": 5991162799
    },
    {
      "date": 1758499200,
      "totalLiquidityUSD": 5970260649
    },
    {
      "date": 1758585600,
      "totalLiquidityUSD": 5688607022
    },
    {
      "date": 1758672000,
      "totalLiquidityUSD": 5733582161
    },
    {
      "date": 1758758400,
      "totalLiquidityUSD": 5774492787
    },
    {
      "date": 1758844800,
      "totalLiquidityUSD": 5482012904
    },
    {
      "date": 1758931200,
      "totalLiquidityUSD": 5946352215
    },
    {
      "date": 1759017600,
      "totalLiquidityUSD": 6009505914
    },
    {
      "date": 1759104000,
      "totalLiquidityUSD": 6213084887
    },
    {
      "date": 1759190400,
      "totalLiquidityUSD": 6194309470
    },
    {
      "date": 1759276800,
      "totalLiquidityUSD": 6057914537
    },
    {
      "date": 1759363200,
      "totalLiquidityUSD": 6312606553
    },
    {
      "date": 1759449600,
      "totalLiquidityUSD": 6477530654
    },
    {
      "date": 1759536000,
      "totalLiquidityUSD": 6636134014
    },
    {
      "date": 1759622400,
      "totalLiquidityUSD": 6577307338
    },
    {
      "date": 1759708800,
      "totalLiquidityUSD": 6599060051
    },
    {
      "date": 1759795200,
      "totalLiquidityUSD": 6948213166
    },
    {
      "date": 1759881600,
      "totalLiquidityUSD": 6543171295
    },
    {
      "date": 1759968000,
      "totalLiquidityUSD": 6534122111
    },
    {
      "date": 1760054400,
      "totalLiquidityUSD": 6300911176
    },
    {
      "date": 1760140800,
      "totalLiquidityUSD": 5537697156
    },
    {
      "date": 1760227200,
      "totalLiquidityUSD": 5367578307
    },
    {
      "date": 1760313600,
      "totalLiquidityUSD": 5905409447
    },
    {
      "date": 1760400000,
      "totalLiquidityUSD": 5958832769
    },
    {
      "date": 1760486400,
      "totalLiquidityUSD": 5728465020
    },
    {
      "date": 1760572800,
      "totalLiquidityUSD": 5533107107
    },
    {
      "date": 1760659200,
      "totalLiquidityUSD": 5498289130
    },
    {
      "date": 1760745600,
      "totalLiquidityUSD": 5408755341
    },
    {
      "date": 1760832000,
      "totalLiquidityUSD": 5474531796
    },
    {
      "date": 1760918400,
      "totalLiquidityUSD": 5633671763
    },
    {
      "date": 1761004800,
      "totalLiquidityUSD": 5664999080
    },
    {
      "date": 1761091200,
      "totalLiquidityUSD": 5529454302
    },
    {
      "date": 1761177600,
      "totalLiquidityUSD": 5470021631
    },
    {
      "date": 1761264000,
      "totalLiquidityUSD": 5557137154
    },
    {
      "date": 1761350400,
      "totalLiquidityUSD": 5703838466
    },
    {
      "date": 1761436800,
      "totalLiquidityUSD": 5747947418
    },
    {
      "date": 1761523200,
      "totalLiquidityUSD": 6000420272
    },
    {
      "date": 1761609600,
      "totalLiquidityUSD": 5876245067
    },
    {
      "date": 1761696000,
      "totalLiquidityUSD": 5734796812
    },
    {
      "date": 1761782400,
      "totalLiquidityUSD": 5642335601
    },
    {
      "date": 1761868800,
      "totalLiquidityUSD": 5460369658
    },
    {
      "date": 1761955200,
      "totalLiquidityUSD": 5494406779
    },
    {
      "date": 1762041600,
      "totalLiquidityUSD": 5509613644
    },
    {
      "date": 1762128000,
      "totalLiquidityUSD": 5529361304
    },
    {
      "date": 1762214400,
      "totalLiquidityUSD": 5171938677
    },
    {
      "date": 1762300800,
      "totalLiquidityUSD": 4714870668
    },
    {
      "date": 1762387200,
      "totalLiquidityUSD": 4936694656
    },
    {
      "date": 1762473600,
      "totalLiquidityUSD": 4816046759
    },
    {
      "date": 1762560000,
      "totalLiquidityUSD": 5000350801
    },
    {
      "date": 1762646400,
      "totalLiquidityUSD": 4952903860
    },
    {
      "date": 1762732800,
      "totalLiquidityUSD": 5213000260
    },
    {
      "date": 1762819200,
      "totalLiquidityUSD": 5178305628
    },
    {
      "date": 1762905600,
      "totalLiquidityUSD": 4998722465
    },
    {
      "date": 1762992000,
      "totalLiquidityUSD": 5003674883
    },
    {
      "date": 1763078400,
      "totalLiquidityUSD": 4691388910
    },
    {
      "date": 1763164800,
      "totalLiquidityUSD": 4588732272
    },
    {
      "date": 1763251200,
      "totalLiquidityUSD": 4657357533
    },
    {
      "date": 1763337600,
      "totalLiquidityUSD": 4599521750
    },
    {
      "date": 1763424000,
      "totalLiquidityUSD": 4484731933
    },
    {
      "date": 1763510400,
      "totalLiquidityUSD": 4579134285
    },
    {
      "date": 1763596800,
      "totalLiquidityUSD": 4508557526
    },
    {
      "date": 1763683200,
      "totalLiquidityUSD": 4264759247
    },
    {
      "date": 1763769600,
      "totalLiquidityUSD": 4196474192
    },
    {
      "date": 1763856000,
      "totalLiquidityUSD": 4200242690
    },
    {
      "date": 1763942400,
      "totalLiquidityUSD": 4255275985
    },
    {
      "date": 1764028800,
      "totalLiquidityUSD": 4425472028
    },
    {
      "date": 1764115200,
      "totalLiquidityUSD": 4406250381
    },
    {
      "date": 1764201600,
      "totalLiquidityUSD": 4551162793
    },
    {
      "date": 1764288000,
      "totalLiquidityUSD": 4518867487
    },
    {
      "date": 1764374400,
      "totalLiquidityUSD": 4482416836
    },
    {
      "date": 1764460800,
      "totalLiquidityUSD": 4415560020
    },
    {
      "date": 1764547200,
      "totalLiquidityUSD": 4398884892
    },
    {
      "date": 1764633600,
      "totalLiquidityUSD": 4103894310
    },
    {
      "date": 1764720000,
      "totalLiquidityUSD": 4476523430
    },
    {
      "date": 1764806400,
      "totalLiquidityUSD": 4644103641
    },
    {
      "date": 1764892800,
      "totalLiquidityUSD": 4534917959
    },
    {
      "date": 1764979200,
      "totalLiquidityUSD": 4351119831
    },
    {
      "date": 1765065600,
      "totalLiquidityUSD": 4390907149
    },
    {
      "date": 1765152000,
      "totalLiquidityUSD": 4408771694
    },
    {
      "date": 1765238400,
      "totalLiquidityUSD": 4517834498
    },
    {
      "date": 1765324800,
      "totalLiquidityUSD": 4671506613
    },
    {
      "date": 1765411200,
      "totalLiquidityUSD": 4584682464
    },
    {
      "date": 1765497600,
      "totalLiquidityUSD": 4564935032
    },
    {
      "date": 1765584000,
      "totalLiquidityUSD": 4418583569
    },
    {
      "date": 1765670400,
      "totalLiquidityUSD": 4449450302
    },
    {
      "date": 1765756800,
      "totalLiquidityUSD": 4375503758
    },
    {
      "date": 1765843200,
      "totalLiquidityUSD": 4214370062
    },
    {
      "date": 1765929600,
      "totalLiquidityUSD": 4242461572
    },
    {
      "date": 1766016000,
      "totalLiquidityUSD": 4100932499
    },
    {
      "date": 1766102400,
      "totalLiquidityUSD": 4046207148
    },
    {
      "date": 1766188800,
      "totalLiquidityUSD": 4166933126
    },
    {
      "date": 1766275200,
      "totalLiquidityUSD": 4180934791
    },
    {
      "date": 1766361600,
      "totalLiquidityUSD": 4226065632
    },
    {
      "date": 1766448000,
      "totalLiquidityUSD": 4147574996
    },
    {
      "date": 1766534400,
      "totalLiquidityUSD": 4113079894
    },
    {
      "date": 1766620800,
      "totalLiquidityUSD": 4058891308
    },
    {
      "date": 1766707200,
      "totalLiquidityUSD": 4014674688
    },
    {
      "date": 1766793600,
      "totalLiquidityUSD": 4052869047
    },
    {
      "date": 1766880000,
      "totalLiquidityUSD": 4092452992
    },
    {
      "date": 1766966400,
      "totalLiquidityUSD": 4101730746
    },
    {
      "date": 1767052800,
      "totalLiquidityUSD": 4032706938
    },
    {
      "date": 1767139200,
      "totalLiquidityUSD": 4034440705
    },
    {
      "date": 1767225600,
      "totalLiquidityUSD": 4050230610
    },
    {
      "date": 1767312000,
      "totalLiquidityUSD": 4107289744
    },
    {
      "date": 1767398400,
      "totalLiquidityUSD": 4205148329
    },
    {
      "date": 1767484800,
      "totalLiquidityUSD": 4251644764
    },
    {
      "date": 1767571200,
      "totalLiquidityUSD": 4253488118
    },
    {
      "date": 1767657600,
      "totalLiquidityUSD": 4287108662
    },
    {
      "date": 1767744000,
      "totalLiquidityUSD": 4374709009
    },
    {
      "date": 1767830400,
      "totalLiquidityUSD": 4229372151
    },
    {
      "date": 1767916800,
      "totalLiquidityUSD": 4220728541
    },
    {
      "date": 1768003200,
      "totalLiquidityUSD": 4178245941
    },
    {
      "date": 1768089600,
      "totalLiquidityUSD": 4181908038
    },
    {
      "date": 1768176000,
      "totalLiquidityUSD": 4220926531
    },
    {
      "date": 1768262400,
      "totalLiquidityUSD": 4225544076
    },
    {
      "date": 1768348800,
      "totalLiquidityUSD": 4452354184
    },
    {
      "date": 1768435200,
      "totalLiquidityUSD": 4485548125
    },
    {
      "date": 1768521600,
      "totalLiquidityUSD": 4433920710
    },
    {
      "date": 1768608000,
      "totalLiquidityUSD": 4392589717
    },
    {
      "date": 1768694400,
      "totalLiquidityUSD": 4405933403
    },
    {
      "date": 1768780800,
      "totalLiquidityUSD": 4279829356
    },
    {
      "date": 1768867200,
      "totalLiquidityUSD": 4484378486
    },
    {
      "date": 1768953600,
      "totalLiquidityUSD": 4235271342
    },
    {
      "date": 1769040000,
      "totalLiquidityUSD": 4309458829
    },
    {
      "date": 1769126400,
      "totalLiquidityUSD": 4275430918
    },
    {
      "date": 1769212800,
      "totalLiquidityUSD": 4304048617
    },
    {
      "date": 1769299200,
      "totalLiquidityUSD": 4305030053
    },
    {
      "date": 1769385600,
      "totalLiquidityUSD": 4160694482
    },
    {
      "date": 1769472000,
      "totalLiquidityUSD": 4280738559
    },
    {
      "date": 1769558400,
      "totalLiquidityUSD": 4432098786
    },
    {
      "date": 1769644800,
      "totalLiquidityUSD": 4435774409
    },
    {
      "date": 1769731200,
      "totalLiquidityUSD": 4241512454
    },
    {
      "date": 1769817600,
      "totalLiquidityUSD": 4089637419
    },
    {
      "date": 1769904000,
      "totalLiquidityUSD": 3831300402
    },
    {
      "date": 1769990400,
      "totalLiquidityUSD": 3695696242
    },
    {
      "date": 1770076800,
      "totalLiquidityUSD": 3756926261
    },
    {
      "date": 1770163200,
      "totalLiquidityUSD": 3622630060
    },
    {
      "date": 1770249600,
      "totalLiquidityUSD": 3488569414
    },
    {
      "date": 1770336000,
      "totalLiquidityUSD": 3023578061
    },
    {
      "date": 1770422400,
      "totalLiquidityUSD": 3429611873
    },
    {
      "date": 1770508800,
      "totalLiquidityUSD": 3449149846
    },
    {
      "date": 1770595200,
      "totalLiquidityUSD": 3460321813
    },
    {
      "date": 1770681600,
      "totalLiquidityUSD": 3482356443
    },
    {
      "date": 1770768000,
      "totalLiquidityUSD": 3362947361
    },
    {
      "date": 1770854400,
      "totalLiquidityUSD": 3271347834
    },
    {
      "date": 1770940800,
      "totalLiquidityUSD": 3236940699
    },
    {
      "date": 1771027200,
      "totalLiquidityUSD": 3363356158
    },
    {
      "date": 1771113600,
      "totalLiquidityUSD": 3412737268
    },
    {
      "date": 1771200000,
      "totalLiquidityUSD": 3298362268
    },
    {
      "date": 1771286400,
      "totalLiquidityUSD": 3287883768
    },
    {
      "date": 1771372800,
      "totalLiquidityUSD": 3239660191
    },
    {
      "date": 1771459200,
      "totalLiquidityUSD": 3166448061
    },
    {
      "date": 1771545600,
      "totalLiquidityUSD": 3193844327
    },
    {
      "date": 1771632000,
      "totalLiquidityUSD": 3205425427
    },
    {
      "date": 1771718400,
      "totalLiquidityUSD": 3204281083
    },
    {
      "date": 1771804800,
      "totalLiquidityUSD": 3162023460
    },
    {
      "date": 1771891200,
      "totalLiquidityUSD": 3036473140
    },
    {
      "date": 1771977600,
      "totalLiquidityUSD": 3020166506
    },
    {
      "date": 1772064000,
      "totalLiquidityUSD": 3255579886
    },
    {
      "date": 1772150400,
      "totalLiquidityUSD": 3216240947
    },
    {
      "date": 1772236800,
      "totalLiquidityUSD": 3110125252
    },
    {
      "date": 1772323200,
      "totalLiquidityUSD": 3149383912
    },
    {
      "date": 1772409600,
      "totalLiquidityUSD": 3136954377
    },
    {
      "date": 1772496000,
      "totalLiquidityUSD": 3234753354
    },
    {
      "date": 1772582400,
      "totalLiquidityUSD": 3196911575
    },
    {
      "date": 1772668800,
      "totalLiquidityUSD": 3383469607
    },
    {
      "date": 1772755200,
      "totalLiquidityUSD": 3301635632
    },
    {
      "date": 1772841600,
      "totalLiquidityUSD": 3186027047
    },
    {
      "date": 1772928000,
      "totalLiquidityUSD": 3162361292
    },
    {
      "date": 1773014400,
      "totalLiquidityUSD": 3139900671
    },
    {
      "date": 1773100800,
      "totalLiquidityUSD": 3213387365
    },
    {
      "date": 1773187200,
      "totalLiquidityUSD": 3284887432
    },
    {
      "date": 1773273600,
      "totalLiquidityUSD": 3317110166
    },
    {
      "date": 1773360000,
      "totalLiquidityUSD": 3381155049
    },
    {
      "date": 1773446400,
      "totalLiquidityUSD": 3373860969
    },
    {
      "date": 1773532800,
      "totalLiquidityUSD": 3365033000
    },
    {
      "date": 1773619200,
      "totalLiquidityUSD": 3467190770
    },
    {
      "date": 1773705600,
      "totalLiquidityUSD": 3666616341
    },
    {
      "date": 1773792000,
      "totalLiquidityUSD": 3613665542
    },
    {
      "date": 1773878400,
      "totalLiquidityUSD": 3461325029
    },
    {
      "date": 1773964800,
      "totalLiquidityUSD": 3364052652
    },
    {
      "date": 1774051200,
      "totalLiquidityUSD": 3363445572
    },
    {
      "date": 1774137600,
      "totalLiquidityUSD": 3295884805
    },
    {
      "date": 1774224000,
      "totalLiquidityUSD": 3238752718
    },
    {
      "date": 1774310400,
      "totalLiquidityUSD": 3294922302
    },
    {
      "date": 1774396800,
      "totalLiquidityUSD": 3333061348
    },
    {
      "date": 1774483200,
      "totalLiquidityUSD": 3325062027
    },
    {
      "date": 1774569600,
      "totalLiquidityUSD": 3204686112
    },
    {
      "date": 1774656000,
      "totalLiquidityUSD": 3134193868
    },
    {
      "date": 1774742400,
      "totalLiquidityUSD": 3142085055
    },
    {
      "date": 1774828800,
      "totalLiquidityUSD": 3155215573
    },
    {
      "date": 1774915200,
      "totalLiquidityUSD": 3192963281
    },
    {
      "date": 1775001600,
      "totalLiquidityUSD": 3282622498
    },
    {
      "date": 1775088000,
      "totalLiquidityUSD": 3297602706
    },
    {
      "date": 1775174400,
      "totalLiquidityUSD": 3180715416
    },
    {
      "date": 1775260800,
      "totalLiquidityUSD": 3181517912
    },
    {
      "date": 1775347200,
      "totalLiquidityUSD": 3187509956
    },
    {
      "date": 1775433600,
      "totalLiquidityUSD": 3258168493
    },
    {
      "date": 1775520000,
      "totalLiquidityUSD": 3211768533
    },
    {
      "date": 1775606400,
      "totalLiquidityUSD": 3356722937
    },
    {
      "date": 1775692800,
      "totalLiquidityUSD": 3280087622
    },
    {
      "date": 1775779200,
      "totalLiquidityUSD": 3300238841
    },
    {
      "date": 1775865600,
      "totalLiquidityUSD": 3370905226
    },
    {
      "date": 1775952000,
      "totalLiquidityUSD": 3406604982
    },
    {
      "date": 1776038400,
      "totalLiquidityUSD": 3303418079
    },
    {
      "date": 1776124800,
      "totalLiquidityUSD": 3510411310
    },
    {
      "date": 1776211200,
      "totalLiquidityUSD": 3469893506
    },
    {
      "date": 1776297600,
      "totalLiquidityUSD": 3798802469
    },
    {
      "date": 1776384000,
      "totalLiquidityUSD": 3769219677
    },
    {
      "date": 1776470400,
      "totalLiquidityUSD": 3863836013
    },
    {
      "date": 1776556800,
      "totalLiquidityUSD": 3777133357
    },
    {
      "date": 1776643200,
      "totalLiquidityUSD": 3402346733
    },
    {
      "date": 1776729600,
      "totalLiquidityUSD": 3481751005
    },
    {
      "date": 1776816000,
      "totalLiquidityUSD": 3448128695
    },
    {
      "date": 1776902400,
      "totalLiquidityUSD": 3522783213
    },
    {
      "date": 1776988800,
      "totalLiquidityUSD": 3492662273
    },
    {
      "date": 1777075200,
      "totalLiquidityUSD": 3480250961
    },
    {
      "date": 1777161600,
      "totalLiquidityUSD": 3472716920
    },
    {
      "date": 1777248000,
      "totalLiquidityUSD": 3532478009
    },
    {
      "date": 1777334400,
      "totalLiquidityUSD": 3444624122
    },
    {
      "date": 1777420800,
      "totalLiquidityUSD": 3409884552
    },
    {
      "date": 1777507200,
      "totalLiquidityUSD": 3400856556
    },
    {
      "date": 1777593600,
      "totalLiquidityUSD": 3392681565
    },
    {
      "date": 1777680000,
      "totalLiquidityUSD": 3446404676
    },
    {
      "date": 1777766400,
      "totalLiquidityUSD": 3471604519
    },
    {
      "date": 1777852800,
      "totalLiquidityUSD": 3478688778
    },
    {
      "date": 1777939200,
      "totalLiquidityUSD": 3524868163
    },
    {
      "date": 1778025600,
      "totalLiquidityUSD": 3560856922
    },
    {
      "date": 1778112000,
      "totalLiquidityUSD": 3557291884
    },
    {
      "date": 1778198400,
      "totalLiquidityUSD": 3504882864
    },
    {
      "date": 1778284800,
      "totalLiquidityUSD": 3526387960
    },
    {
      "date": 1778371200,
      "totalLiquidityUSD": 3547856313
    },
    {
      "date": 1778457600,
      "totalLiquidityUSD": 3481748177
    },
    {
      "date": 1778544000,
      "totalLiquidityUSD": 3481939292
    },
    {
      "date": 1778630400,
      "totalLiquidityUSD": 3438411506
    },
    {
      "date": 1778716800,
      "totalLiquidityUSD": 3379632317
    },
    {
      "date": 1778803200,
      "totalLiquidityUSD": 3423019618
    },
    {
      "date": 1778889600,
      "totalLiquidityUSD": 3342659053
    },
    {
      "date": 1778976000,
      "totalLiquidityUSD": 3293076150
    },
    {
      "date": 1779062400,
      "totalLiquidityUSD": 3217913079
    },
    {
      "date": 1779148800,
      "totalLiquidityUSD": 3248280598
    },
    {
      "date": 1779235200,
      "totalLiquidityUSD": 3206373427
    },
    {
      "date": 1779321600,
      "totalLiquidityUSD": 3225206700
    },
    {
      "date": 1779408000,
      "totalLiquidityUSD": 3222130534
    },
    {
      "date": 1779494400,
      "totalLiquidityUSD": 3161791537
    },
    {
      "date": 1779580800,
      "totalLiquidityUSD": 3222183811
    },
    {
      "date": 1779667200,
      "totalLiquidityUSD": 3209492473
    },
    {
      "date": 1779753600,
      "totalLiquidityUSD": 3219788485
    },
    {
      "date": 1779840000,
      "totalLiquidityUSD": 3182116580
    },
    {
      "date": 1779926400,
      "totalLiquidityUSD": 3118900054
    },
    {
      "date": 1780012800,
      "totalLiquidityUSD": 3129549869
    },
    {
      "date": 1780099200,
      "totalLiquidityUSD": 3130002776
    },
    {
      "date": 1780185600,
      "totalLiquidityUSD": 3146618704
    },
    {
      "date": 1780272000,
      "totalLiquidityUSD": 3144803961
    },
    {
      "date": 1780358400,
      "totalLiquidityUSD": 3130248590
    },
    {
      "date": 1780444800,
      "totalLiquidityUSD": 2946907711
    },
    {
      "date": 1780531200,
      "totalLiquidityUSD": 2894891024
    },
    {
      "date": 1780617600,
      "totalLiquidityUSD": 2842357241
    },
    {
      "date": 1780704000,
      "totalLiquidityUSD": 2673984207
    },
    {
      "date": 1780790400,
      "totalLiquidityUSD": 2637356829
    },
    {
      "date": 1780876800,
      "totalLiquidityUSD": 2790943110
    },
    {
      "date": 1780963200,
      "totalLiquidityUSD": 2762112474
    },
    {
      "date": 1781049600,
      "totalLiquidityUSD": 2702638425
    },
    {
      "date": 1781136000,
      "totalLiquidityUSD": 2666804113
    },
    {
      "date": 1781222400,
      "totalLiquidityUSD": 2733654923
    },
    {
      "date": 1781308800,
      "totalLiquidityUSD": 2709232928
    },
    {
      "date": 1781395200,
      "totalLiquidityUSD": 2735324628
    },
    {
      "date": 1781481600,
      "totalLiquidityUSD": 2798697279
    },
    {
      "date": 1781568000,
      "totalLiquidityUSD": 2871399119
    },
    {
      "date": 1781654400,
      "totalLiquidityUSD": 2875533630
    },
    {
      "date": 1781740800,
      "totalLiquidityUSD": 2824371000
    },
    {
      "date": 1781827200,
      "totalLiquidityUSD": 2758020499
    },
    {
      "date": 1781913600,
      "totalLiquidityUSD": 2746291248
    },
    {
      "date": 1782000000,
      "totalLiquidityUSD": 2778613843
    },
    {
      "date": 1782086400,
      "totalLiquidityUSD": 2738964903
    },
    {
      "date": 1782172800,
      "totalLiquidityUSD": 2769514099
    },
    {
      "date": 1782259200,
      "totalLiquidityUSD": 2696426746
    },
    {
      "date": 1782345600,
      "totalLiquidityUSD": 2636809505
    },
    {
      "date": 1782432000,
      "totalLiquidityUSD": 2566099563
    },
    {
      "date": 1782518400,
      "totalLiquidityUSD": 2593746944
    },
    {
      "date": 1782604800,
      "totalLiquidityUSD": 2591106590
    },
    {
      "date": 1782691200,
      "totalLiquidityUSD": 2584418889
    },
    {
      "date": 1782777600,
      "totalLiquidityUSD": 2615849858
    },
    {
      "date": 1782864000,
      "totalLiquidityUSD": 2573332533
    },
    {
      "date": 1782950400,
      "totalLiquidityUSD": 2621883968
    },
    {
      "date": 1783036800,
      "totalLiquidityUSD": 2701801971
    },
    {
      "date": 1783123200,
      "totalLiquidityUSD": 2764921954
    },
    {
      "date": 1783209600,
      "totalLiquidityUSD": 2793349036
    },
    {
      "date": 1783296000,
      "totalLiquidityUSD": 2800174740
    },
    {
      "date": 1783382400,
      "totalLiquidityUSD": 2802674263
    },
    {
      "date": 1783468800,
      "totalLiquidityUSD": 2772083783
    },
    {
      "date": 1783555200,
      "totalLiquidityUSD": 2740562722
    },
    {
      "date": 1783641600,
      "totalLiquidityUSD": 2749053431
    },
    {
      "date": 1783728000,
      "totalLiquidityUSD": 2807150709
    },
    {
      "date": 1783814400,
      "totalLiquidityUSD": 2796759810
    },
    {
      "date": 1783900800,
      "totalLiquidityUSD": 2810333552
    },
    {
      "date": 1783987200,
      "totalLiquidityUSD": 2749267256
    },
    {
      "date": 1784073600,
      "totalLiquidityUSD": 2890931891
    },
    {
      "date": 1784160000,
      "totalLiquidityUSD": 2922608045
    },
    {
      "date": 1784246400,
      "totalLiquidityUSD": 2855086454
    },
    {
      "date": 1784332800,
      "totalLiquidityUSD": 2835556934
    },
    {
      "date": 1784419200,
      "totalLiquidityUSD": 2853941080
    },
    {
      "date": 1784505600,
      "totalLiquidityUSD": 2875617274
    },
    {
      "date": 1784592000,
      "totalLiquidityUSD": 2895174751
    },
    {
      "date": 1784678400,
      "totalLiquidityUSD": 2930755807
    },
    {
      "date": 1784764800,
      "totalLiquidityUSD": 2900858026
    },
    {
      "date": 1784851200,
      "totalLiquidityUSD": 2842349075
    },
    {
      "date": 1784937600,
      "totalLiquidityUSD": 2815537062
    },
    {
      "date": 1785024000,
      "totalLiquidityUSD": 2823947137
    },
    {
      "date": 1785110400,
      "totalLiquidityUSD": 2906130167
    },
    {
      "date": 1785196800,
      "totalLiquidityUSD": 2831652020
    },
    {
      "date": 1785283200,
      "totalLiquidityUSD": 2834822846
    },
    {
      "date": 1785369600,
      "totalLiquidityUSD": 2822390913
    },
    {
      "date": 1785456000,
      "totalLiquidityUSD": 2833291782
    },
    {
      "date": 1785542400,
      "totalLiquidityUSD": 2773172401
    },
    {
      "date": 1785628800,
      "totalLiquidityUSD": 2755071034
    },
    {
      "date": 1785715200,
      "totalLiquidityUSD": 2791100762
    },
    {
      "date": 1785801600,
      "totalLiquidityUSD": 2742064142
    },
    {
      "date": 1785888000,
      "totalLiquidityUSD": 2756051377
    },
    {
      "date": 1785974400,
      "totalLiquidityUSD": 2763742595
    },
    {
      "date": 1786060800,
      "totalLiquidityUSD": 2760418588
    },
    {
      "date": 1786147200,
      "totalLiquidityUSD": 2781936984
    },
    {
      "date": 1786233600,
      "totalLiquidityUSD": 2786955383
    },
    {
      "date": 1786320000,
      "totalLiquidityUSD": 2780377966
    },
    {
      "date": 1786406400,
      "totalLiquidityUSD": 2727157701
    },
    {
      "date": 1786492800,
      "totalLiquidityUSD": 2727629595
    },
    {
      "date": 1786579200,
      "totalLiquidityUSD": 2699320759
    },
    {
      "date": 1786665600,
      "totalLiquidityUSD": 2707877627
    },
    {
      "date": 1786752000,
      "totalLiquidityUSD": 2698677462
    },
    {
      "date": 1786838400,
      "totalLiquidityUSD": 2698930026
    },
    {
      "date": 1786924800,
      "totalLiquidityUSD": 2696187976
    },
    {
      "date": 1787011200,
      "totalLiquidityUSD": 2741938280
    },
    {
      "date": 1787097600,
      "totalLiquidityUSD": 2750509965
    },
    {
      "date": 1787184000,
      "totalLiquidityUSD": 3075117447
    },
    {
      "date": 1787270400,
      "totalLiquidityUSD": 3185182765
    },
    {
      "date": 1787356800,
      "totalLiquidityUSD": 3364169391
    },
    {
      "date": 1787443200,
      "totalLiquidityUSD": 3299204436
    },
    {
      "date": 1787529600,
      "totalLiquidityUSD": 3338789135
    },
    {
      "date": 1787616000,
      "totalLiquidityUSD": 3336532754
    },
    {
      "date": 1787702400,
      "totalLiquidityUSD": 3298357505
    },
    {
      "date": 1787788800,
      "totalLiquidityUSD": 3363727983
    },
    {
      "date": 1787875200,
      "totalLiquidityUSD": 3366509332
    },
    {
      "date": 1787961600,
      "totalLiquidityUSD": 3251528682
    },
    {
      "date": 1788048000,
      "totalLiquidityUSD": 3270434622
    },
    {
      "date": 1788134400,
      "totalLiquidityUSD": 3243931951
    },
    {
      "date": 1788182183,
      "totalLiquidityUSD": 3235960232
    }
  ]
}
```

#### GitHub API attempts

**Source repo:** `OffchainLabs/arbitrum`

```json
{
  "full_name": "OffchainLabs/arbitrum",
  "stargazers_count": 77,
  "forks_count": 37,
  "subscribers_count": 22,
  "open_issues_count": 0,
  "archived": false,
  "disabled": false,
  "language": null,
  "license": null,
  "pushed_at": "2025-07-02T11:28:14Z",
  "updated_at": "2026-06-18T09:59:39Z"
}
```

### Raw Responses — optimism

#### CoinGecko /coins/markets

`Endpoint`: `/coins/{id}` from `/coins/markets?ids=optimism`

```json
{
  "id": "optimism",
  "symbol": "op",
  "name": "Optimism",
  "current_price": 0.086675,
  "market_cap": 198220431,
  "fully_diluted_valuation": 372094489,
  "total_volume": 39121523,
  "circulating_supply": 2287994831,
  "total_supply": 4294967296,
  "max_supply": 4294967296,
  "market_cap_rank": 170,
  "ath": 4.84,
  "ath_change_percentage": -98.21079,
  "atl": 0.080689,
  "price_change_24h": -0.003032432455125023,
  "last_updated": "2026-08-31T14:39:20.000Z"
}
```

#### DefiLlama /v2/chains → chain entry

`Endpoint`: `/v2/chains` lookup by `name="Optimism"`

```json
{
  "name": "Optimism",
  "gecko_id": "optimism",
  "chainId": 10,
  "cmcId": "11840",
  "tokenSymbol": "OP",
  "tvl": 0
}
```

#### DefiLlama /protocol/{slug}

`Endpoint`: `/protocol/optimism-bridge`

```json
{
  "id": "3784",
  "name": "Optimism Bridge",
  "category": "Canonical Bridge",
  "chains": [
    "Base",
    "PGN",
    "Ethereum"
  ],
  "tvl": [
    {
      "date": 1699920000,
      "totalLiquidityUSD": 1163340346
    },
    {
      "date": 1700006400,
      "totalLiquidityUSD": 1179357079
    },
    {
      "date": 1700092800,
      "totalLiquidityUSD": 1204561259
    },
    {
      "date": 1700179200,
      "totalLiquidityUSD": 1161501347
    },
    {
      "date": 1700265600,
      "totalLiquidityUSD": 1121246698
    },
    {
      "date": 1700352000,
      "totalLiquidityUSD": 1135674561
    },
    {
      "date": 1700438400,
      "totalLiquidityUSD": 1207969237
    },
    {
      "date": 1700524800,
      "totalLiquidityUSD": 1151188816
    },
    {
      "date": 1700611200,
      "totalLiquidityUSD": 1142794937
    },
    {
      "date": 1700697600,
      "totalLiquidityUSD": 1203830690
    },
    {
      "date": 1700784000,
      "totalLiquidityUSD": 1185954520
    },
    {
      "date": 1700870400,
      "totalLiquidityUSD": 1207193124
    },
    {
      "date": 1700956800,
      "totalLiquidityUSD": 1245674764
    },
    {
      "date": 1701043200,
      "totalLiquidityUSD": 1228729039
    },
    {
      "date": 1701129600,
      "totalLiquidityUSD": 1194679886
    },
    {
      "date": 1701216000,
      "totalLiquidityUSD": 1190112951
    },
    {
      "date": 1701302400,
      "totalLiquidityUSD": 1164443535
    },
    {
      "date": 1701388800,
      "totalLiquidityUSD": 1177133424
    },
    {
      "date": 1701475200,
      "totalLiquidityUSD": 1235146065
    },
    {
      "date": 1701561600,
      "totalLiquidityUSD": 1271394841
    },
    {
      "date": 1701648000,
      "totalLiquidityUSD": 1262022144
    },
    {
      "date": 1701734400,
      "totalLiquidityUSD": 1271967104
    },
    {
      "date": 1701820800,
      "totalLiquidityUSD": 1272828814
    },
    {
      "date": 1701907200,
      "totalLiquidityUSD": 1971603240
    },
    {
      "date": 1701993600,
      "totalLiquidityUSD": 2052034262
    },
    {
      "date": 1702080000,
      "totalLiquidityUSD": 2064141184
    },
    {
      "date": 1702166400,
      "totalLiquidityUSD": 2056794697
    },
    {
      "date": 1702252800,
      "totalLiquidityUSD": 2094850267
    },
    {
      "date": 1702339200,
      "totalLiquidityUSD": 1993941874
    },
    {
      "date": 1702425600,
      "totalLiquidityUSD": 1980459848
    },
    {
      "date": 1702512000,
      "totalLiquidityUSD": 2050223992
    },
    {
      "date": 1702598400,
      "totalLiquidityUSD": 2091633129
    },
    {
      "date": 1702684800,
      "totalLiquidityUSD": 2017905787
    },
    {
      "date": 1702771200,
      "totalLiquidityUSD": 2255700020
    },
    {
      "date": 1702857600,
      "totalLiquidityUSD": 2319873422
    },
    {
      "date": 1702944000,
      "totalLiquidityUSD": 2290740738
    },
    {
      "date": 1703030400,
      "totalLiquidityUSD": 2247673116
    },
    {
      "date": 1703116800,
      "totalLiquidityUSD": 2204569358
    },
    {
      "date": 1703203200,
      "totalLiquidityUSD": 2257141751
    },
    {
      "date": 1703289600,
      "totalLiquidityUSD": 2310687389
    },
    {
      "date": 1703376000,
      "totalLiquidityUSD": 2267237387
    },
    {
      "date": 1703462400,
      "totalLiquidityUSD": 2237673004
    },
    {
      "date": 1703548800,
      "totalLiquidityUSD": 2314454234
    },
    {
      "date": 1703635200,
      "totalLiquidityUSD": 2283712969
    },
    {
      "date": 1703721600,
      "totalLiquidityUSD": 2365861336
    },
    {
      "date": 1703808000,
      "totalLiquidityUSD": 2280226560
    },
    {
      "date": 1703894400,
      "totalLiquidityUSD": 2288622716
    },
    {
      "date": 1703980800,
      "totalLiquidityUSD": 2313273748
    },
    {
      "date": 1704067200,
      "totalLiquidityUSD": 2302020115
    },
    {
      "date": 1704153600,
      "totalLiquidityUSD": 2337807425
    },
    {
      "date": 1704240000,
      "totalLiquidityUSD": 2354658575
    },
    {
      "date": 1704326400,
      "totalLiquidityUSD": 2181228069
    },
    {
      "date": 1704412800,
      "totalLiquidityUSD": 2226638318
    },
    {
      "date": 1704499200,
      "totalLiquidityUSD": 2155030164
    },
    {
      "date": 1704585600,
      "totalLiquidityUSD": 2113985832
    },
    {
      "date": 1704672000,
      "totalLiquidityUSD": 2075159281
    },
    {
      "date": 1704758400,
      "totalLiquidityUSD": 2151568465
    },
    {
      "date": 1704844800,
      "totalLiquidityUSD": 2098793800
    },
    {
      "date": 1704931200,
      "totalLiquidityUSD": 2249906746
    },
    {
      "date": 1705017600,
      "totalLiquidityUSD": 2257007735
    },
    {
      "date": 1705104000,
      "totalLiquidityUSD": 2232700546
    },
    {
      "date": 1705190400,
      "totalLiquidityUSD": 2233942793
    },
    {
      "date": 1705276800,
      "totalLiquidityUSD": 2182041839
    },
    {
      "date": 1705363200,
      "totalLiquidityUSD": 2205927437
    },
    {
      "date": 1705449600,
      "totalLiquidityUSD": 2222413617
    },
    {
      "date": 1705536000,
      "totalLiquidityUSD": 2190488398
    },
    {
      "date": 1705622400,
      "totalLiquidityUSD": 2120517768
    },
    {
      "date": 1705708800,
      "totalLiquidityUSD": 2128070142
    },
    {
      "date": 1705795200,
      "totalLiquidityUSD": 2114492319
    },
    {
      "date": 1705881600,
      "totalLiquidityUSD": 2110704494
    },
    {
      "date": 1705968000,
      "totalLiquidityUSD": 2011038693
    },
    {
      "date": 1706054400,
      "totalLiquidityUSD": 1972818401
    },
    {
      "date": 1706140800,
      "totalLiquidityUSD": 1975458972
    },
    {
      "date": 1706227200,
      "totalLiquidityUSD": 1957280701
    },
    {
      "date": 1706313600,
      "totalLiquidityUSD": 2014197938
    },
    {
      "date": 1706400000,
      "totalLiquidityUSD": 2022057172
    },
    {
      "date": 1706486400,
      "totalLiquidityUSD": 1993764158
    },
    {
      "date": 1706572800,
      "totalLiquidityUSD": 2035760951
    },
    {
      "date": 1706659200,
      "totalLiquidityUSD": 2059791573
    },
    {
      "date": 1706745600,
      "totalLiquidityUSD": 2001700682
    },
    {
      "date": 1706832000,
      "totalLiquidityUSD": 2026913991
    },
    {
      "date": 1706918400,
      "totalLiquidityUSD": 2032671650
    },
    {
      "date": 1707004800,
      "totalLiquidityUSD": 2010947784
    },
    {
      "date": 1707091200,
      "totalLiquidityUSD": 1990920231
    },
    {
      "date": 1707177600,
      "totalLiquidityUSD": 2072355288
    },
    {
      "date": 1707264000,
      "totalLiquidityUSD": 2112759483
    },
    {
      "date": 1707350400,
      "totalLiquidityUSD": 2158441465
    },
    {
      "date": 1707436800,
      "totalLiquidityUSD": 2155246563
    },
    {
      "date": 1707523200,
      "totalLiquidityUSD": 2209949481
    },
    {
      "date": 1707609600,
      "totalLiquidityUSD": 2203094562
    },
    {
      "date": 1707696000,
      "totalLiquidityUSD": 2211723020
    },
    {
      "date": 1707782400,
      "totalLiquidityUSD": 2312928168
    },
    {
      "date": 1707868800,
      "totalLiquidityUSD": 3095146707
    },
    {
      "date": 1707955200,
      "totalLiquidityUSD": 3249573679
    },
    {
      "date": 1708041600,
      "totalLiquidityUSD": 3312311021
    },
    {
      "date": 1708128000,
      "totalLiquidityUSD": 3506980440
    },
    {
      "date": 1708214400,
      "totalLiquidityUSD": 3556720618
    },
    {
      "date": 1708300800,
      "totalLiquidityUSD": 3817047571
    },
    {
      "date": 1708387200,
      "totalLiquidityUSD": 4137623759
    },
    {
      "date": 1708473600,
      "totalLiquidityUSD": 4060505405
    },
    {
      "date": 1708560000,
      "totalLiquidityUSD": 4093194338
    },
    {
      "date": 1708646400,
      "totalLiquidityUSD": 4228713872
    },
    {
      "date": 1708732800,
      "totalLiquidityUSD": 4168690434
    },
    {
      "date": 1708819200,
      "totalLiquidityUSD": 4218060136
    },
    {
      "date": 1708905600,
      "totalLiquidityUSD": 4388509227
    },
    {
      "date": 1708992000,
      "totalLiquidityUSD": 4308103713
    },
    {
      "date": 1709078400,
      "totalLiquidityUSD": 4225007305
    },
    {
      "date": 1709164800,
      "totalLiquidityUSD": 4528001963
    },
    {
      "date": 1709251200,
      "totalLiquidityUSD": 4416247156
    },
    {
      "date": 1709337600,
      "totalLiquidityUSD": 4554066271
    },
    {
      "date": 1709424000,
      "totalLiquidityUSD": 4503699752
    },
    {
      "date": 1709510400,
      "totalLiquidityUSD": 4606512362
    },
    {
      "date": 1709596800,
      "totalLiquidityUSD": 4620294193
    },
    {
      "date": 1709683200,
      "totalLiquidityUSD": 4430469511
    },
    {
      "date": 1709769600,
      "totalLiquidityUSD": 4743887399
    },
    {
      "date": 1709856000,
      "totalLiquidityUSD": 4713647977
    },
    {
      "date": 1709942400,
      "totalLiquidityUSD": 4812479041
    },
    {
      "date": 1710028800,
      "totalLiquidityUSD": 5523052396
    },
    {
      "date": 1710115200,
      "totalLiquidityUSD": 5180272930
    },
    {
      "date": 1710201600,
      "totalLiquidityUSD": 5363307189
    },
    {
      "date": 1710288000,
      "totalLiquidityUSD": 5349235023
    },
    {
      "date": 1710374400,
      "totalLiquidityUSD": 5308863022
    },
    {
      "date": 1710460800,
      "totalLiquidityUSD": 5425722852
    },
    {
      "date": 1710547200,
      "totalLiquidityUSD": 5147862208
    },
    {
      "date": 1710633600,
      "totalLiquidityUSD": 4799386086
    },
    {
      "date": 1710720000,
      "totalLiquidityUSD": 5077834608
    },
    {
      "date": 1710806400,
      "totalLiquidityUSD": 4841312753
    },
    {
      "date": 1710892800,
      "totalLiquidityUSD": 4376864297
    },
    {
      "date": 1710979200,
      "totalLiquidityUSD": 4791099940
    },
    {
      "date": 1711065600,
      "totalLiquidityUSD": 4709301648
    },
    {
      "date": 1711152000,
      "totalLiquidityUSD": 4599714968
    },
    {
      "date": 1711238400,
      "totalLiquidityUSD": 4703095742
    },
    {
      "date": 1711324800,
      "totalLiquidityUSD": 4781330034
    },
    {
      "date": 1711411200,
      "totalLiquidityUSD": 4942722185
    },
    {
      "date": 1711497600,
      "totalLiquidityUSD": 4967610180
    },
    {
      "date": 1711584000,
      "totalLiquidityUSD": 4835712570
    },
    {
      "date": 1711670400,
      "totalLiquidityUSD": 4935950674
    },
    {
      "date": 1711756800,
      "totalLiquidityUSD": 4912575729
    },
    {
      "date": 1711843200,
      "totalLiquidityUSD": 4882599607
    },
    {
      "date": 1711929600,
      "totalLiquidityUSD": 4980714975
    },
    {
      "date": 1712016000,
      "totalLiquidityUSD": 4776863212
    },
    {
      "date": 1712102400,
      "totalLiquidityUSD": 4537051748
    },
    {
      "date": 1712188800,
      "totalLiquidityUSD": 4562272521
    },
    {
      "date": 1712275200,
      "totalLiquidityUSD": 4612925003
    },
    {
      "date": 1712361600,
      "totalLiquidityUSD": 4646553334
    },
    {
      "date": 1712448000,
      "totalLiquidityUSD": 4811723553
    },
    {
      "date": 1712534400,
      "totalLiquidityUSD": 4890058536
    },
    {
      "date": 1712620800,
      "totalLiquidityUSD": 5044762990
    },
    {
      "date": 1712707200,
      "totalLiquidityUSD": 4787509408
    },
    {
      "date": 1712793600,
      "totalLiquidityUSD": 4767934974
    },
    {
      "date": 1712880000,
      "totalLiquidityUSD": 4698479029
    },
    {
      "date": 1712966400,
      "totalLiquidityUSD": 4343706206
    },
    {
      "date": 1713052800,
      "totalLiquidityUSD": 4012078491
    },
    {
      "date": 1713139200,
      "totalLiquidityUSD": 4319761999
    },
    {
      "date": 1713225600,
      "totalLiquidityUSD": 4203281644
    },
    {
      "date": 1713312000,
      "totalLiquidityUSD": 4267447179
    },
    {
      "date": 1713398400,
      "totalLiquidityUSD": 4114961332
    },
    {
      "date": 1713484800,
      "totalLiquidityUSD": 4249468458
    },
    {
      "date": 1713571200,
      "totalLiquidityUSD": 4238440939
    },
    {
      "date": 1713657600,
      "totalLiquidityUSD": 4371235382
    },
    {
      "date": 1713744000,
      "totalLiquidityUSD": 4378170989
    },
    {
      "date": 1713830400,
      "totalLiquidityUSD": 4414600240
    },
    {
      "date": 1713916800,
      "totalLiquidityUSD": 4400640612
    },
    {
      "date": 1714003200,
      "totalLiquidityUSD": 4286879993
    },
    {
      "date": 1714089600,
      "totalLiquidityUSD": 4296463235
    },
    {
      "date": 1714176000,
      "totalLiquidityUSD": 4206593719
    },
    {
      "date": 1714262400,
      "totalLiquidityUSD": 4295368216
    },
    {
      "date": 1714348800,
      "totalLiquidityUSD": 4325429973
    },
    {
      "date": 1714435200,
      "totalLiquidityUSD": 4200258816
    },
    {
      "date": 1714521600,
      "totalLiquidityUSD": 4067984327
    },
    {
      "date": 1714608000,
      "totalLiquidityUSD": 4067316273
    },
    {
      "date": 1714694400,
      "totalLiquidityUSD": 4126730949
    },
    {
      "date": 1714780800,
      "totalLiquidityUSD": 4320928900
    },
    {
      "date": 1714867200,
      "totalLiquidityUSD": 4313179590
    },
    {
      "date": 1714953600,
      "totalLiquidityUSD": 4410074870
    },
    {
      "date": 1715040000,
      "totalLiquidityUSD": 4463785326
    },
    {
      "date": 1715126400,
      "totalLiquidityUSD": 4431252921
    },
    {
      "date": 1715212800,
      "totalLiquidityUSD": 4259607170
    },
    {
      "date": 1715299200,
      "totalLiquidityUSD": 4329649386
    },
    {
      "date": 1715385600,
      "totalLiquidityUSD": 4328205014
    },
    {
      "date": 1715472000,
      "totalLiquidityUSD": 4410856312
    },
    {
      "date": 1715558400,
      "totalLiquidityUSD": 4421480236
    },
    {
      "date": 1715644800,
      "totalLiquidityUSD": 4406580855
    },
    {
      "date": 1715731200,
      "totalLiquidityUSD": 4208399593
    },
    {
      "date": 1715817600,
      "totalLiquidityUSD": 4386233257
    },
    {
      "date": 1715904000,
      "totalLiquidityUSD": 4297790630
    },
    {
      "date": 1715990400,
      "totalLiquidityUSD": 4416154430
    },
    {
      "date": 1716076800,
      "totalLiquidityUSD": 4444587847
    },
    {
      "date": 1716163200,
      "totalLiquidityUSD": 4355227896
    },
    {
      "date": 1716249600,
      "totalLiquidityUSD": 4774411092
    },
    {
      "date": 1716336000,
      "totalLiquidityUSD": 4844754230
    },
    {
      "date": 1716422400,
      "totalLiquidityUSD": 4842947219
    },
    {
      "date": 1716508800,
      "totalLiquidityUSD": 4900721055
    },
    {
      "date": 1716595200,
      "totalLiquidityUSD": 4802155299
    },
    {
      "date": 1716681600,
      "totalLiquidityUSD": 4834225979
    },
    {
      "date": 1716768000,
      "totalLiquidityUSD": 4855317539
    },
    {
      "date": 1716854400,
      "totalLiquidityUSD": 4933118759
    },
    {
      "date": 1716940800,
      "totalLiquidityUSD": 4837812545
    },
    {
      "date": 1717027200,
      "totalLiquidityUSD": 4866506465
    },
    {
      "date": 1717113600,
      "totalLiquidityUSD": 4852719853
    },
    {
      "date": 1717200000,
      "totalLiquidityUSD": 4877177705
    },
    {
      "date": 1717286400,
      "totalLiquidityUSD": 4897474943
    },
    {
      "date": 1717372800,
      "totalLiquidityUSD": 4845694077
    },
    {
      "date": 1717459200,
      "totalLiquidityUSD": 4872341344
    },
    {
      "date": 1717545600,
      "totalLiquidityUSD": 4905246932
    },
    {
      "date": 1717632000,
      "totalLiquidityUSD": 4928897636
    },
    {
      "date": 1717718400,
      "totalLiquidityUSD": 4911174995
    },
    {
      "date": 1717804800,
      "totalLiquidityUSD": 4776148673
    },
    {
      "date": 1717891200,
      "totalLiquidityUSD": 4724657552
    },
    {
      "date": 1717977600,
      "totalLiquidityUSD": 4771723836
    },
    {
      "date": 1718064000,
      "totalLiquidityUSD": 4724101942
    },
    {
      "date": 1718150400,
      "totalLiquidityUSD": 4405641836
    },
    {
      "date": 1718236800,
      "totalLiquidityUSD": 4486365726
    },
    {
      "date": 1718323200,
      "totalLiquidityUSD": 4393096084
    },
    {
      "date": 1718409600,
      "totalLiquidityUSD": 4591432192
    },
    {
      "date": 1718496000,
      "totalLiquidityUSD": 4613083068
    },
    {
      "date": 1718582400,
      "totalLiquidityUSD": 4689342851
    },
    {
      "date": 1718668800,
      "totalLiquidityUSD": 4526181015
    },
    {
      "date": 1718755200,
      "totalLiquidityUSD": 4426634060
    },
    {
      "date": 1718841600,
      "totalLiquidityUSD": 4478415352
    },
    {
      "date": 1718928000,
      "totalLiquidityUSD": 4465880519
    },
    {
      "date": 1719014400,
      "totalLiquidityUSD": 4493589105
    },
    {
      "date": 1719100800,
      "totalLiquidityUSD": 4501519390
    },
    {
      "date": 1719187200,
      "totalLiquidityUSD": 4428095705
    },
    {
      "date": 1719273600,
      "totalLiquidityUSD": 4376088075
    },
    {
      "date": 1719360000,
      "totalLiquidityUSD": 4414019484
    },
    {
      "date": 1719446400,
      "totalLiquidityUSD": 4380664111
    },
    {
      "date": 1719532800,
      "totalLiquidityUSD": 4483475212
    },
    {
      "date": 1719619200,
      "totalLiquidityUSD": 4397149344
    },
    {
      "date": 1719705600,
      "totalLiquidityUSD": 4384495230
    },
    {
      "date": 1719792000,
      "totalLiquidityUSD": 4377844549
    },
    {
      "date": 1719878400,
      "totalLiquidityUSD": 4396102912
    },
    {
      "date": 1719964800,
      "totalLiquidityUSD": 4346864286
    },
    {
      "date": 1720051200,
      "totalLiquidityUSD": 4271405723
    },
    {
      "date": 1720137600,
      "totalLiquidityUSD": 4138655426
    },
    {
      "date": 1720224000,
      "totalLiquidityUSD": 3950023995
    },
    {
      "date": 1720310400,
      "totalLiquidityUSD": 4059495364
    },
    {
      "date": 1720396800,
      "totalLiquidityUSD": 3975108540
    },
    {
      "date": 1720483200,
      "totalLiquidityUSD": 3990693943
    },
    {
      "date": 1720569600,
      "totalLiquidityUSD": 4035174155
    },
    {
      "date": 1720656000,
      "totalLiquidityUSD": 4056424377
    },
    {
      "date": 1720742400,
      "totalLiquidityUSD": 4024737588
    },
    {
      "date": 1720828800,
      "totalLiquidityUSD": 4037154228
    },
    {
      "date": 1720915200,
      "totalLiquidityUSD": 4076008036
    },
    {
      "date": 1721001600,
      "totalLiquidityUSD": 4177438006
    },
    {
      "date": 1721088000,
      "totalLiquidityUSD": 4419423618
    },
    {
      "date": 1721174400,
      "totalLiquidityUSD": 4499495579
    },
    {
      "date": 1721260800,
      "totalLiquidityUSD": 4536805225
    },
    {
      "date": 1721347200,
      "totalLiquidityUSD": 4454192819
    },
    {
      "date": 1721433600,
      "totalLiquidityUSD": 4566052117
    },
    {
      "date": 1721520000,
      "totalLiquidityUSD": 4592277086
    },
    {
      "date": 1721606400,
      "totalLiquidityUSD": 4526893725
    },
    {
      "date": 1721692800,
      "totalLiquidityUSD": 4492156446
    },
    {
      "date": 1721779200,
      "totalLiquidityUSD": 4454461940
    },
    {
      "date": 1721865600,
      "totalLiquidityUSD": 4381180936
    },
    {
      "date": 1721952000,
      "totalLiquidityUSD": 4241222037
    },
    {
      "date": 1722038400,
      "totalLiquidityUSD": 4390405792
    },
    {
      "date": 1722124800,
      "totalLiquidityUSD": 4389707193
    },
    {
      "date": 1722211200,
      "totalLiquidityUSD": 4384543990
    },
    {
      "date": 1722297600,
      "totalLiquidityUSD": 4413625657
    },
    {
      "date": 1722384000,
      "totalLiquidityUSD": 4325773428
    },
    {
      "date": 1722470400,
      "totalLiquidityUSD": 4266939524
    },
    {
      "date": 1722556800,
      "totalLiquidityUSD": 4220328877
    },
    {
      "date": 1722643200,
      "totalLiquidityUSD": 4035285869
    },
    {
      "date": 1722729600,
      "totalLiquidityUSD": 3922757035
    },
    {
      "date": 1722816000,
      "totalLiquidityUSD": 3789506164
    },
    {
      "date": 1722902400,
      "totalLiquidityUSD": 3602829234
    },
    {
      "date": 1722988800,
      "totalLiquidityUSD": 3673502097
    },
    {
      "date": 1723075200,
      "totalLiquidityUSD": 3515590238
    },
    {
      "date": 1723161600,
      "totalLiquidityUSD": 3751413101
    },
    {
      "date": 1723248000,
      "totalLiquidityUSD": 3773824915
    },
    {
      "date": 1723334400,
      "totalLiquidityUSD": 3783918487
    },
    {
      "date": 1723420800,
      "totalLiquidityUSD": 3695529703
    },
    {
      "date": 1723507200,
      "totalLiquidityUSD": 3791095038
    },
    {
      "date": 1723593600,
      "totalLiquidityUSD": 3837420021
    },
    {
      "date": 1723680000,
      "totalLiquidityUSD": 3760075285
    },
    {
      "date": 1723766400,
      "totalLiquidityUSD": 3648967174
    },
    {
      "date": 1723852800,
      "totalLiquidityUSD": 3688313322
    },
    {
      "date": 1723939200,
      "totalLiquidityUSD": 3700083800
    },
    {
      "date": 1724025600,
      "totalLiquidityUSD": 3746445070
    },
    {
      "date": 1724112000,
      "totalLiquidityUSD": 3721208400
    },
    {
      "date": 1724198400,
      "totalLiquidityUSD": 3713622652
    },
    {
      "date": 1724284800,
      "totalLiquidityUSD": 3781672513
    },
    {
      "date": 1724371200,
      "totalLiquidityUSD": 3775121794
    },
    {
      "date": 1724457600,
      "totalLiquidityUSD": 3974318643
    },
    {
      "date": 1724544000,
      "totalLiquidityUSD": 3962992927
    },
    {
      "date": 1724630400,
      "totalLiquidityUSD": 3981644296
    },
    {
      "date": 1724716800,
      "totalLiquidityUSD": 3862227880
    },
    {
      "date": 1724803200,
      "totalLiquidityUSD": 3654566907
    },
    {
      "date": 1724889600,
      "totalLiquidityUSD": 3703677950
    },
    {
      "date": 1724976000,
      "totalLiquidityUSD": 3709265464
    },
    {
      "date": 1725062400,
      "totalLiquidityUSD": 3720034376
    },
    {
      "date": 1725148800,
      "totalLiquidityUSD": 3704342194
    },
    {
      "date": 1725235200,
      "totalLiquidityUSD": 3619923471
    },
    {
      "date": 1725321600,
      "totalLiquidityUSD": 3724290163
    },
    {
      "date": 1725408000,
      "totalLiquidityUSD": 3643838408
    },
    {
      "date": 1725494400,
      "totalLiquidityUSD": 3652358421
    },
    {
      "date": 1725580800,
      "totalLiquidityUSD": 3606213088
    },
    {
      "date": 1725667200,
      "totalLiquidityUSD": 3468586568
    },
    {
      "date": 1725753600,
      "totalLiquidityUSD": 3509877241
    },
    {
      "date": 1725840000,
      "totalLiquidityUSD": 3564509554
    },
    {
      "date": 1725926400,
      "totalLiquidityUSD": 3635358538
    },
    {
      "date": 1726012800,
      "totalLiquidityUSD": 3638515200
    },
    {
      "date": 1726099200,
      "totalLiquidityUSD": 3571518476
    },
    {
      "date": 1726185600,
      "totalLiquidityUSD": 3640359455
    },
    {
      "date": 1726272000,
      "totalLiquidityUSD": 3711412461
    },
    {
      "date": 1726358400,
      "totalLiquidityUSD": 3687104526
    },
    {
      "date": 1726444800,
      "totalLiquidityUSD": 3644438849
    },
    {
      "date": 1726531200,
      "totalLiquidityUSD": 3575374235
    },
    {
      "date": 1726617600,
      "totalLiquidityUSD": 3654737751
    },
    {
      "date": 1726704000,
      "totalLiquidityUSD": 3667044281
    },
    {
      "date": 1726790400,
      "totalLiquidityUSD": 3779440757
    },
    {
      "date": 1726876800,
      "totalLiquidityUSD": 3834166478
    },
    {
      "date": 1726963200,
      "totalLiquidityUSD": 3843985586
    },
    {
      "date": 1727049600,
      "totalLiquidityUSD": 3811053655
    },
    {
      "date": 1727136000,
      "totalLiquidityUSD": 3927582244
    },
    {
      "date": 1727222400,
      "totalLiquidityUSD": 3958578970
    },
    {
      "date": 1727308800,
      "totalLiquidityUSD": 3982746893
    },
    {
      "date": 1727395200,
      "totalLiquidityUSD": 4019911323
    },
    {
      "date": 1727481600,
      "totalLiquidityUSD": 4017891060
    },
    {
      "date": 1727568000,
      "totalLiquidityUSD": 3957141153
    },
    {
      "date": 1727654400,
      "totalLiquidityUSD": 3947953696
    },
    {
      "date": 1727740800,
      "totalLiquidityUSD": 3856255988
    },
    {
      "date": 1727827200,
      "totalLiquidityUSD": 3677032504
    },
    {
      "date": 1727913600,
      "totalLiquidityUSD": 3583486490
    },
    {
      "date": 1728000000,
      "totalLiquidityUSD": 3572604601
    },
    {
      "date": 1728086400,
      "totalLiquidityUSD": 3701302452
    },
    {
      "date": 1728172800,
      "totalLiquidityUSD": 3725316149
    },
    {
      "date": 1728259200,
      "totalLiquidityUSD": 3790694201
    },
    {
      "date": 1728345600,
      "totalLiquidityUSD": 3816222108
    },
    {
      "date": 1728432000,
      "totalLiquidityUSD": 3697416907
    },
    {
      "date": 1728518400,
      "totalLiquidityUSD": 3593794816
    },
    {
      "date": 1728604800,
      "totalLiquidityUSD": 3579444217
    },
    {
      "date": 1728691200,
      "totalLiquidityUSD": 3648322704
    },
    {
      "date": 1728777600,
      "totalLiquidityUSD": 3707353903
    },
    {
      "date": 1728864000,
      "totalLiquidityUSD": 3687043249
    },
    {
      "date": 1728950400,
      "totalLiquidityUSD": 3885041246
    },
    {
      "date": 1729036800,
      "totalLiquidityUSD": 3847841701
    },
    {
      "date": 1729123200,
      "totalLiquidityUSD": 3822918727
    },
    {
      "date": 1729209600,
      "totalLiquidityUSD": 3767471809
    },
    {
      "date": 1729296000,
      "totalLiquidityUSD": 3835425737
    },
    {
      "date": 1729382400,
      "totalLiquidityUSD": 3845211460
    },
    {
      "date": 1729468800,
      "totalLiquidityUSD": 3914494380
    },
    {
      "date": 1729555200,
      "totalLiquidityUSD": 3819189447
    },
    {
      "date": 1729641600,
      "totalLiquidityUSD": 3782784481
    },
    {
      "date": 1729728000,
      "totalLiquidityUSD": 3669715797
    },
    {
      "date": 1729814400,
      "totalLiquidityUSD": 3699068863
    },
    {
      "date": 1729900800,
      "totalLiquidityUSD": 3620999711
    },
    {
      "date": 1729987200,
      "totalLiquidityUSD": 3594642326
    },
    {
      "date": 1730073600,
      "totalLiquidityUSD": 3625932144
    },
    {
      "date": 1730160000,
      "totalLiquidityUSD": 3649485597
    },
    {
      "date": 1730246400,
      "totalLiquidityUSD": 3669996175
    },
    {
      "date": 1730332800,
      "totalLiquidityUSD": 3662982625
    },
    {
      "date": 1730419200,
      "totalLiquidityUSD": 3533899016
    },
    {
      "date": 1730505600,
      "totalLiquidityUSD": 3494395834
    },
    {
      "date": 1730592000,
      "totalLiquidityUSD": 3447228942
    },
    {
      "date": 1730678400,
      "totalLiquidityUSD": 3403883099
    },
    {
      "date": 1730764800,
      "totalLiquidityUSD": 3292713646
    },
    {
      "date": 1730851200,
      "totalLiquidityUSD": 3355188352
    },
    {
      "date": 1730937600,
      "totalLiquidityUSD": 3628263619
    },
    {
      "date": 1731024000,
      "totalLiquidityUSD": 3735609306
    },
    {
      "date": 1731110400,
      "totalLiquidityUSD": 3748584532
    },
    {
      "date": 1731196800,
      "totalLiquidityUSD": 3868761200
    },
    {
      "date": 1731283200,
      "totalLiquidityUSD": 3933875461
    },
    {
      "date": 1731369600,
      "totalLiquidityUSD": 4169808309
    },
    {
      "date": 1731456000,
      "totalLiquidityUSD": 4202800033
    },
    {
      "date": 1731542400,
      "totalLiquidityUSD": 4093445643
    },
    {
      "date": 1731628800,
      "totalLiquidityUSD": 3962026421
    },
    {
      "date": 1731715200,
      "totalLiquidityUSD": 4039413394
    },
    {
      "date": 1731801600,
      "totalLiquidityUSD": 3989243678
    },
    {
      "date": 1731888000,
      "totalLiquidityUSD": 3981927382
    },
    {
      "date": 1731974400,
      "totalLiquidityUSD": 4110305626
    },
    {
      "date": 1732060800,
      "totalLiquidityUSD": 4051033362
    },
    {
      "date": 1732147200,
      "totalLiquidityUSD": 3987061094
    },
    {
      "date": 1732233600,
      "totalLiquidityUSD": 4222101946
    },
    {
      "date": 1732320000,
      "totalLiquidityUSD": 4152427342
    },
    {
      "date": 1732406400,
      "totalLiquidityUSD": 4251745767
    },
    {
      "date": 1732492800,
      "totalLiquidityUSD": 4274158762
    },
    {
      "date": 1732579200,
      "totalLiquidityUSD": 4264381302
    },
    {
      "date": 1732665600,
      "totalLiquidityUSD": 4159116878
    },
    {
      "date": 1732752000,
      "totalLiquidityUSD": 4447283447
    },
    {
      "date": 1732838400,
      "totalLiquidityUSD": 4501136657
    },
    {
      "date": 1732924800,
      "totalLiquidityUSD": 4528713399
    },
    {
      "date": 1733011200,
      "totalLiquidityUSD": 4851371258
    },
    {
      "date": 1733097600,
      "totalLiquidityUSD": 4798457029
    },
    {
      "date": 1733184000,
      "totalLiquidityUSD": 4663529959
    },
    {
      "date": 1733270400,
      "totalLiquidityUSD": 4692372340
    },
    {
      "date": 1733356800,
      "totalLiquidityUSD": 4821724445
    },
    {
      "date": 1733443200,
      "totalLiquidityUSD": 4767464366
    },
    {
      "date": 1733529600,
      "totalLiquidityUSD": 4980240143
    },
    {
      "date": 1733616000,
      "totalLiquidityUSD": 4954688710
    },
    {
      "date": 1733702400,
      "totalLiquidityUSD": 4949712920
    },
    {
      "date": 1733788800,
      "totalLiquidityUSD": 4512107748
    },
    {
      "date": 1733875200,
      "totalLiquidityUSD": 4455936985
    },
    {
      "date": 1733961600,
      "totalLiquidityUSD": 4721360018
    },
    {
      "date": 1734048000,
      "totalLiquidityUSD": 4714468146
    },
    {
      "date": 1734134400,
      "totalLiquidityUSD": 4671415433
    },
    {
      "date": 1734220800,
      "totalLiquidityUSD": 4606856177
    },
    {
      "date": 1734307200,
      "totalLiquidityUSD": 4708739558
    },
    {
      "date": 1734393600,
      "totalLiquidityUSD": 4725656065
    },
    {
      "date": 1734480000,
      "totalLiquidityUSD": 4599238264
    },
    {
      "date": 1734566400,
      "totalLiquidityUSD": 4376676607
    },
    {
      "date": 1734652800,
      "totalLiquidityUSD": 4150426448
    },
    {
      "date": 1734739200,
      "totalLiquidityUSD": 4216705831
    },
    {
      "date": 1734825600,
      "totalLiquidityUSD": 4063585175
    },
    {
      "date": 1734912000,
      "totalLiquidityUSD": 4047171496
    },
    {
      "date": 1734998400,
      "totalLiquidityUSD": 4187588831
    },
    {
      "date": 1735084800,
      "totalLiquidityUSD": 4248873368
    },
    {
      "date": 1735171200,
      "totalLiquidityUSD": 4225910869
    },
    {
      "date": 1735257600,
      "totalLiquidityUSD": 4072761970
    },
    {
      "date": 1735344000,
      "totalLiquidityUSD": 4051895242
    },
    {
      "date": 1735430400,
      "totalLiquidityUSD": 4124375172
    },
    {
      "date": 1735516800,
      "totalLiquidityUSD": 4053755037
    },
    {
      "date": 1735603200,
      "totalLiquidityUSD": 4053552104
    },
    {
      "date": 1735689600,
      "totalLiquidityUSD": 4000819894
    },
    {
      "date": 1735776000,
      "totalLiquidityUSD": 4053520354
    },
    {
      "date": 1735862400,
      "totalLiquidityUSD": 4141657596
    },
    {
      "date": 1735948800,
      "totalLiquidityUSD": 4291649762
    },
    {
      "date": 1736035200,
      "totalLiquidityUSD": 4318071803
    },
    {
      "date": 1736121600,
      "totalLiquidityUSD": 4313124407
    },
    {
      "date": 1736208000,
      "totalLiquidityUSD": 4428122200
    },
    {
      "date": 1736294400,
      "totalLiquidityUSD": 4134862185
    },
    {
      "date": 1736380800,
      "totalLiquidityUSD": 4036282102
    },
    {
      "date": 1736467200,
      "totalLiquidityUSD": 3920697610
    },
    {
      "date": 1736553600,
      "totalLiquidityUSD": 3972605515
    },
    {
      "date": 1736640000,
      "totalLiquidityUSD": 3987783203
    },
    {
      "date": 1736726400,
      "totalLiquidityUSD": 3936973631
    },
    {
      "date": 1736812800,
      "totalLiquidityUSD": 3834622730
    },
    {
      "date": 1736899200,
      "totalLiquidityUSD": 3938146937
    },
    {
      "date": 1736985600,
      "totalLiquidityUSD": 4123717456
    },
    {
      "date": 1737072000,
      "totalLiquidityUSD": 4017870564
    },
    {
      "date": 1737158400,
      "totalLiquidityUSD": 4177815645
    },
    {
      "date": 1737244800,
      "totalLiquidityUSD": 4002126027
    },
    {
      "date": 1737331200,
      "totalLiquidityUSD": 3902913032
    },
    {
      "date": 1737417600,
      "totalLiquidityUSD": 3959670079
    },
    {
      "date": 1737504000,
      "totalLiquidityUSD": 4085646450
    },
    {
      "date": 1737590400,
      "totalLiquidityUSD": 4109282419
    },
    {
      "date": 1737676800,
      "totalLiquidityUSD": 4132544875
    },
    {
      "date": 1737763200,
      "totalLiquidityUSD": 4112468031
    },
    {
      "date": 1737849600,
      "totalLiquidityUSD": 4004738186
    },
    {
      "date": 1737936000,
      "totalLiquidityUSD": 3926573477
    },
    {
      "date": 1738022400,
      "totalLiquidityUSD": 3822730817
    },
    {
      "date": 1738108800,
      "totalLiquidityUSD": 3674729686
    },
    {
      "date": 1738195200,
      "totalLiquidityUSD": 3758044416
    },
    {
      "date": 1738281600,
      "totalLiquidityUSD": 3844749374
    },
    {
      "date": 1738368000,
      "totalLiquidityUSD": 3887406095
    },
    {
      "date": 1738454400,
      "totalLiquidityUSD": 3730421071
    },
    {
      "date": 1738540800,
      "totalLiquidityUSD": 3415013436
    },
    {
      "date": 1738627200,
      "totalLiquidityUSD": 3421067073
    },
    {
      "date": 1738713600,
      "totalLiquidityUSD": 3295835615
    },
    {
      "date": 1738800000,
      "totalLiquidityUSD": 3224863677
    },
    {
      "date": 1738886400,
      "totalLiquidityUSD": 3148796709
    },
    {
      "date": 1738972800,
      "totalLiquidityUSD": 3129897565
    },
    {
      "date": 1739059200,
      "totalLiquidityUSD": 3132151159
    },
    {
      "date": 1739145600,
      "totalLiquidityUSD": 3151037199
    },
    {
      "date": 1739232000,
      "totalLiquidityUSD": 3180761163
    },
    {
      "date": 1739318400,
      "totalLiquidityUSD": 3116791523
    },
    {
      "date": 1739404800,
      "totalLiquidityUSD": 3225274205
    },
    {
      "date": 1739491200,
      "totalLiquidityUSD": 3064890467
    },
    {
      "date": 1739577600,
      "totalLiquidityUSD": 3015559197
    },
    {
      "date": 1739664000,
      "totalLiquidityUSD": 2991764824
    },
    {
      "date": 1739750400,
      "totalLiquidityUSD": 2967694534
    },
    {
      "date": 1739836800,
      "totalLiquidityUSD": 3002689367
    },
    {
      "date": 1739923200,
      "totalLiquidityUSD": 2825833171
    },
    {
      "date": 1740009600,
      "totalLiquidityUSD": 2864513523
    },
    {
      "date": 1740096000,
      "totalLiquidityUSD": 2900831496
    },
    {
      "date": 1740182400,
      "totalLiquidityUSD": 2750963587
    },
    {
      "date": 1740268800,
      "totalLiquidityUSD": 2915812282
    },
    {
      "date": 1740355200,
      "totalLiquidityUSD": 2939162374
    },
    {
      "date": 1740441600,
      "totalLiquidityUSD": 2617720021
    },
    {
      "date": 1740528000,
      "totalLiquidityUSD": 2628109375
    },
    {
      "date": 1740614400,
      "totalLiquidityUSD": 2509262929
    },
    {
      "date": 1740700800,
      "totalLiquidityUSD": 2487690654
    },
    {
      "date": 1740787200,
      "totalLiquidityUSD": 2451335905
    },
    {
      "date": 1740873600,
      "totalLiquidityUSD": 2439831922
    },
    {
      "date": 1740960000,
      "totalLiquidityUSD": 2689863123
    },
    {
      "date": 1741046400,
      "totalLiquidityUSD": 2354971159
    },
    {
      "date": 1741132800,
      "totalLiquidityUSD": 2354317180
    },
    {
      "date": 1741219200,
      "totalLiquidityUSD": 2418640950
    },
    {
      "date": 1741305600,
      "totalLiquidityUSD": 2339954199
    },
    {
      "date": 1741392000,
      "totalLiquidityUSD": 2343615558
    },
    {
      "date": 1741478400,
      "totalLiquidityUSD": 2374511601
    },
    {
      "date": 1741564800,
      "totalLiquidityUSD": 2207993118
    },
    {
      "date": 1741651200,
      "totalLiquidityUSD": 2067467752
    },
    {
      "date": 1741737600,
      "totalLiquidityUSD": 2166932807
    },
    {
      "date": 1741824000,
      "totalLiquidityUSD": 2178883309
    },
    {
      "date": 1741910400,
      "totalLiquidityUSD": 2147765957
    },
    {
      "date": 1741996800,
      "totalLiquidityUSD": 2201473551
    },
    {
      "date": 1742083200,
      "totalLiquidityUSD": 2226243197
    },
    {
      "date": 1742169600,
      "totalLiquidityUSD": 2181707242
    },
    {
      "date": 1742256000,
      "totalLiquidityUSD": 2119984052
    },
    {
      "date": 1742342400,
      "totalLiquidityUSD": 2129104504
    },
    {
      "date": 1742428800,
      "totalLiquidityUSD": 2207103793
    },
    {
      "date": 1742515200,
      "totalLiquidityUSD": 2157754844
    },
    {
      "date": 1742601600,
      "totalLiquidityUSD": 2147923193
    },
    {
      "date": 1742688000,
      "totalLiquidityUSD": 2146118820
    },
    {
      "date": 1742774400,
      "totalLiquidityUSD": 2170591589
    },
    {
      "date": 1742860800,
      "totalLiquidityUSD": 2247473525
    },
    {
      "date": 1742947200,
      "totalLiquidityUSD": 2247169067
    },
    {
      "date": 1743120000,
      "totalLiquidityUSD": 2038268151
    },
    {
      "date": 1743206400,
      "totalLiquidityUSD": 2013736877
    },
    {
      "date": 1743292800,
      "totalLiquidityUSD": 1936727947
    },
    {
      "date": 1743379200,
      "totalLiquidityUSD": 1927615366
    },
    {
      "date": 1743465600,
      "totalLiquidityUSD": 1936706188
    },
    {
      "date": 1743552000,
      "totalLiquidityUSD": 2006963239
    },
    {
      "date": 1743638400,
      "totalLiquidityUSD": 1916514650
    },
    {
      "date": 1743724800,
      "totalLiquidityUSD": 1932369734
    },
    {
      "date": 1743811200,
      "totalLiquidityUSD": 1949766979
    },
    {
      "date": 1743897600,
      "totalLiquidityUSD": 1934190246
    },
    {
      "date": 1743984000,
      "totalLiquidityUSD": 1756139861
    },
    {
      "date": 1744070400,
      "totalLiquidityUSD": 1753357813
    },
    {
      "date": 1744156800,
      "totalLiquidityUSD": 1693655545
    },
    {
      "date": 1744243200,
      "totalLiquidityUSD": 1838866146
    },
    {
      "date": 1744329600,
      "totalLiquidityUSD": 1770824256
    },
    {
      "date": 1744416000,
      "totalLiquidityUSD": 1834496042
    },
    {
      "date": 1744502400,
      "totalLiquidityUSD": 1899080753
    },
    {
      "date": 1744588800,
      "totalLiquidityUSD": 1863573251
    },
    {
      "date": 1744675200,
      "totalLiquidityUSD": 1853770426
    },
    {
      "date": 1744761600,
      "totalLiquidityUSD": 1741634383
    },
    {
      "date": 1744848000,
      "totalLiquidityUSD": 1585474063
    },
    {
      "date": 1744934400,
      "totalLiquidityUSD": 1593376958
    },
    {
      "date": 1745020800,
      "totalLiquidityUSD": 1588398646
    },
    {
      "date": 1745107200,
      "totalLiquidityUSD": 1621981603
    },
    {
      "date": 1745193600,
      "totalLiquidityUSD": 1621176267
    },
    {
      "date": 1745280000,
      "totalLiquidityUSD": 1597652240
    },
    {
      "date": 1745366400,
      "totalLiquidityUSD": 1717054113
    },
    {
      "date": 1745452800,
      "totalLiquidityUSD": 1654264895
    },
    {
      "date": 1745539200,
      "totalLiquidityUSD": 1512891226
    },
    {
      "date": 1745625600,
      "totalLiquidityUSD": 1601041317
    },
    {
      "date": 1745712000,
      "totalLiquidityUSD": 1643382666
    },
    {
      "date": 1745798400,
      "totalLiquidityUSD": 1605047058
    },
    {
      "date": 1745884800,
      "totalLiquidityUSD": 1612719436
    },
    {
      "date": 1745971200,
      "totalLiquidityUSD": 1612777603
    },
    {
      "date": 1746057600,
      "totalLiquidityUSD": 1569447089
    },
    {
      "date": 1746144000,
      "totalLiquidityUSD": 1564189971
    },
    {
      "date": 1746230400,
      "totalLiquidityUSD": 1562001354
    },
    {
      "date": 1746316800,
      "totalLiquidityUSD": 1530723486
    },
    {
      "date": 1746403200,
      "totalLiquidityUSD": 1511042434
    },
    {
      "date": 1746489600,
      "totalLiquidityUSD": 1439090088
    },
    {
      "date": 1746576000,
      "totalLiquidityUSD": 1422545742
    },
    {
      "date": 1746662400,
      "totalLiquidityUSD": 1424203949
    },
    {
      "date": 1746748800,
      "totalLiquidityUSD": 1594555833
    },
    {
      "date": 1746835200,
      "totalLiquidityUSD": 1671162590
    },
    {
      "date": 1746921600,
      "totalLiquidityUSD": 1768409033
    },
    {
      "date": 1747008000,
      "totalLiquidityUSD": 1783150783
    },
    {
      "date": 1747094400,
      "totalLiquidityUSD": 1751039594
    },
    {
      "date": 1747180800,
      "totalLiquidityUSD": 1771215346
    },
    {
      "date": 1747267200,
      "totalLiquidityUSD": 1713159162
    },
    {
      "date": 1747353600,
      "totalLiquidityUSD": 1650617321
    },
    {
      "date": 1747440000,
      "totalLiquidityUSD": 1649587116
    },
    {
      "date": 1747526400,
      "totalLiquidityUSD": 1612261975
    },
    {
      "date": 1747612800,
      "totalLiquidityUSD": 1634430298
    },
    {
      "date": 1747699200,
      "totalLiquidityUSD": 1659535685
    },
    {
      "date": 1747785600,
      "totalLiquidityUSD": 1653205581
    },
    {
      "date": 1747872000,
      "totalLiquidityUSD": 1715588502
    },
    {
      "date": 1747958400,
      "totalLiquidityUSD": 1826531781
    },
    {
      "date": 1748044800,
      "totalLiquidityUSD": 1727906479
    },
    {
      "date": 1748131200,
      "totalLiquidityUSD": 1739495966
    },
    {
      "date": 1748217600,
      "totalLiquidityUSD": 1758672611
    },
    {
      "date": 1748304000,
      "totalLiquidityUSD": 1746220704
    },
    {
      "date": 1748390400,
      "totalLiquidityUSD": 1787429242
    },
    {
      "date": 1748476800,
      "totalLiquidityUSD": 1770397105
    },
    {
      "date": 1748563200,
      "totalLiquidityUSD": 1609085581
    },
    {
      "date": 1748649600,
      "totalLiquidityUSD": 1558514083
    },
    {
      "date": 1748736000,
      "totalLiquidityUSD": 1558351939
    },
    {
      "date": 1748822400,
      "totalLiquidityUSD": 1579342373
    },
    {
      "date": 1748908800,
      "totalLiquidityUSD": 1633731792
    },
    {
      "date": 1748995200,
      "totalLiquidityUSD": 1637499162
    },
    {
      "date": 1749081600,
      "totalLiquidityUSD": 1633257661
    },
    {
      "date": 1749168000,
      "totalLiquidityUSD": 1550312944
    },
    {
      "date": 1749254400,
      "totalLiquidityUSD": 1589216250
    },
    {
      "date": 1749340800,
      "totalLiquidityUSD": 1619468942
    },
    {
      "date": 1749427200,
      "totalLiquidityUSD": 1612424277
    },
    {
      "date": 1749513600,
      "totalLiquidityUSD": 1665614276
    },
    {
      "date": 1749600000,
      "totalLiquidityUSD": 1714886292
    },
    {
      "date": 1749686400,
      "totalLiquidityUSD": 1678758257
    },
    {
      "date": 1749772800,
      "totalLiquidityUSD": 1610420400
    },
    {
      "date": 1749859200,
      "totalLiquidityUSD": 1573530729
    },
    {
      "date": 1749945600,
      "totalLiquidityUSD": 1555758509
    },
    {
      "date": 1750032000,
      "totalLiquidityUSD": 1560082205
    },
    {
      "date": 1750118400,
      "totalLiquidityUSD": 1559835854
    },
    {
      "date": 1750204800,
      "totalLiquidityUSD": 1516709895
    },
    {
      "date": 1750291200,
      "totalLiquidityUSD": 1532403080
    },
    {
      "date": 1750377600,
      "totalLiquidityUSD": 1534321429
    },
    {
      "date": 1750464000,
      "totalLiquidityUSD": 1477910049
    },
    {
      "date": 1750550400,
      "totalLiquidityUSD": 1420255514
    },
    {
      "date": 1750636800,
      "totalLiquidityUSD": 1407218885
    },
    {
      "date": 1750723200,
      "totalLiquidityUSD": 1506857974
    },
    {
      "date": 1750809600,
      "totalLiquidityUSD": 1523623927
    },
    {
      "date": 1750896000,
      "totalLiquidityUSD": 1493281605
    },
    {
      "date": 1750982400,
      "totalLiquidityUSD": 1485976892
    },
    {
      "date": 1751068800,
      "totalLiquidityUSD": 1500987415
    },
    {
      "date": 1751155200,
      "totalLiquidityUSD": 1514490224
    },
    {
      "date": 1751241600,
      "totalLiquidityUSD": 1545462659
    },
    {
      "date": 1751328000,
      "totalLiquidityUSD": 1530833526
    },
    {
      "date": 1751414400,
      "totalLiquidityUSD": 1491934805
    },
    {
      "date": 1751500800,
      "totalLiquidityUSD": 1558093628
    },
    {
      "date": 1751587200,
      "totalLiquidityUSD": 1580072976
    },
    {
      "date": 1751673600,
      "totalLiquidityUSD": 1528335548
    },
    {
      "date": 1751760000,
      "totalLiquidityUSD": 1530041938
    },
    {
      "date": 1751846400,
      "totalLiquidityUSD": 1557872970
    },
    {
      "date": 1751932800,
      "totalLiquidityUSD": 1541730992
    },
    {
      "date": 1752019200,
      "totalLiquidityUSD": 1540637036
    },
    {
      "date": 1752105600,
      "totalLiquidityUSD": 1578613044
    },
    {
      "date": 1752192000,
      "totalLiquidityUSD": 1685472129
    },
    {
      "date": 1752278400,
      "totalLiquidityUSD": 1681308063
    },
    {
      "date": 1752364800,
      "totalLiquidityUSD": 1678773320
    },
    {
      "date": 1752451200,
      "totalLiquidityUSD": 1700290833
    },
    {
      "date": 1752537600,
      "totalLiquidityUSD": 1701156671
    },
    {
      "date": 1752624000,
      "totalLiquidityUSD": 1745247228
    },
    {
      "date": 1752710400,
      "totalLiquidityUSD": 1834426657
    },
    {
      "date": 1752796800,
      "totalLiquidityUSD": 1865169322
    },
    {
      "date": 1752883200,
      "totalLiquidityUSD": 1910102507
    },
    {
      "date": 1752969600,
      "totalLiquidityUSD": 1938907230
    },
    {
      "date": 1753056000,
      "totalLiquidityUSD": 1955369615
    },
    {
      "date": 1753142400,
      "totalLiquidityUSD": 2019154499
    },
    {
      "date": 1753228800,
      "totalLiquidityUSD": 2093645754
    },
    {
      "date": 1753315200,
      "totalLiquidityUSD": 2006552376
    },
    {
      "date": 1753401600,
      "totalLiquidityUSD": 1093164440
    },
    {
      "date": 1753488000,
      "totalLiquidityUSD": 1107484218
    },
    {
      "date": 1753574400,
      "totalLiquidityUSD": 1111346774
    },
    {
      "date": 1753660800,
      "totalLiquidityUSD": 1133906595
    },
    {
      "date": 1753747200,
      "totalLiquidityUSD": 1097766135
    },
    {
      "date": 1753833600,
      "totalLiquidityUSD": 1097524613
    },
    {
      "date": 1753920000,
      "totalLiquidityUSD": 1094908144
    },
    {
      "date": 1754006400,
      "totalLiquidityUSD": 1065366820
    },
    {
      "date": 1754092800,
      "totalLiquidityUSD": 1034018135
    },
    {
      "date": 1754179200,
      "totalLiquidityUSD": 1017333810
    },
    {
      "date": 1754265600,
      "totalLiquidityUSD": 1039760574
    },
    {
      "date": 1754352000,
      "totalLiquidityUSD": 1064181965
    },
    {
      "date": 1754438400,
      "totalLiquidityUSD": 1033752040
    },
    {
      "date": 1754524800,
      "totalLiquidityUSD": 1055603305
    },
    {
      "date": 1754611200,
      "totalLiquidityUSD": 1086487703
    },
    {
      "date": 1754697600,
      "totalLiquidityUSD": 1082028177
    },
    {
      "date": 1754784000,
      "totalLiquidityUSD": 1111724237
    },
    {
      "date": 1754870400,
      "totalLiquidityUSD": 1111008810
    },
    {
      "date": 1754956800,
      "totalLiquidityUSD": 1085490745
    },
    {
      "date": 1755043200,
      "totalLiquidityUSD": 1129794065
    },
    {
      "date": 1755129600,
      "totalLiquidityUSD": 1121725522
    },
    {
      "date": 1755216000,
      "totalLiquidityUSD": 1070841348
    },
    {
      "date": 1755302400,
      "totalLiquidityUSD": 1035422384
    },
    {
      "date": 1755388800,
      "totalLiquidityUSD": 1037714001
    },
    {
      "date": 1755475200,
      "totalLiquidityUSD": 1044773808
    },
    {
      "date": 1755561600,
      "totalLiquidityUSD": 1015148483
    },
    {
      "date": 1755648000,
      "totalLiquidityUSD": 985866440
    },
    {
      "date": 1755734400,
      "totalLiquidityUSD": 1017509782
    },
    {
      "date": 1755820800,
      "totalLiquidityUSD": 1001730587
    },
    {
      "date": 1755907200,
      "totalLiquidityUSD": 1073704966
    },
    {
      "date": 1755993600,
      "totalLiquidityUSD": 1062960698
    },
    {
      "date": 1756080000,
      "totalLiquidityUSD": 1044070038
    },
    {
      "date": 1756166400,
      "totalLiquidityUSD": 986599857
    },
    {
      "date": 1756252800,
      "totalLiquidityUSD": 1020651745
    },
    {
      "date": 1756339200,
      "totalLiquidityUSD": 1007519917
    },
    {
      "date": 1756425600,
      "totalLiquidityUSD": 1019881099
    },
    {
      "date": 1756512000,
      "totalLiquidityUSD": 981959707
    },
    {
      "date": 1756598400,
      "totalLiquidityUSD": 985740646
    },
    {
      "date": 1756684800,
      "totalLiquidityUSD": 983371605
    },
    {
      "date": 1756771200,
      "totalLiquidityUSD": 963414145
    },
    {
      "date": 1756857600,
      "totalLiquidityUSD": 978872578
    },
    {
      "date": 1756944000,
      "totalLiquidityUSD": 988601896
    },
    {
      "date": 1757030400,
      "totalLiquidityUSD": 970461328
    },
    {
      "date": 1757116800,
      "totalLiquidityUSD": 987662089
    },
    {
      "date": 1757203200,
      "totalLiquidityUSD": 993796646
    },
    {
      "date": 1757289600,
      "totalLiquidityUSD": 1017881839
    },
    {
      "date": 1757376000,
      "totalLiquidityUSD": 1242725791
    },
    {
      "date": 1757462400,
      "totalLiquidityUSD": 1267283435
    },
    {
      "date": 1757548800,
      "totalLiquidityUSD": 1289557337
    },
    {
      "date": 1757635200,
      "totalLiquidityUSD": 1226338216
    },
    {
      "date": 1757721600,
      "totalLiquidityUSD": 1263652290
    },
    {
      "date": 1757808000,
      "totalLiquidityUSD": 1239171196
    },
    {
      "date": 1757894400,
      "totalLiquidityUSD": 1215970819
    },
    {
      "date": 1757980800,
      "totalLiquidityUSD": 1198921456
    },
    {
      "date": 1758067200,
      "totalLiquidityUSD": 1203339996
    },
    {
      "date": 1758153600,
      "totalLiquidityUSD": 1239826938
    },
    {
      "date": 1758240000,
      "totalLiquidityUSD": 1244555979
    },
    {
      "date": 1758326400,
      "totalLiquidityUSD": 1202958217
    },
    {
      "date": 1758412800,
      "totalLiquidityUSD": 1198810515
    },
    {
      "date": 1758499200,
      "totalLiquidityUSD": 1171810167
    },
    {
      "date": 1758585600,
      "totalLiquidityUSD": 1138371373
    },
    {
      "date": 1758672000,
      "totalLiquidityUSD": 1099345793
    },
    {
      "date": 1758758400,
      "totalLiquidityUSD": 1118553966
    },
    {
      "date": 1758844800,
      "totalLiquidityUSD": 1073701373
    },
    {
      "date": 1758931200,
      "totalLiquidityUSD": 1085243637
    },
    {
      "date": 1759017600,
      "totalLiquidityUSD": 1081735065
    },
    {
      "date": 1759104000,
      "totalLiquidityUSD": 1110980050
    },
    {
      "date": 1759190400,
      "totalLiquidityUSD": 1102445865
    },
    {
      "date": 1759276800,
      "totalLiquidityUSD": 1086214435
    },
    {
      "date": 1759363200,
      "totalLiquidityUSD": 1131975586
    },
    {
      "date": 1759449600,
      "totalLiquidityUSD": 1156294202
    },
    {
      "date": 1759536000,
      "totalLiquidityUSD": 1157133441
    },
    {
      "date": 1759622400,
      "totalLiquidityUSD": 1129465956
    },
    {
      "date": 1759708800,
      "totalLiquidityUSD": 1129749241
    },
    {
      "date": 1759795200,
      "totalLiquidityUSD": 1157874310
    },
    {
      "date": 1759881600,
      "totalLiquidityUSD": 1110706718
    },
    {
      "date": 1759968000,
      "totalLiquidityUSD": 1143013557
    },
    {
      "date": 1760054400,
      "totalLiquidityUSD": 1105061236
    },
    {
      "date": 1760140800,
      "totalLiquidityUSD": 944102209
    },
    {
      "date": 1760227200,
      "totalLiquidityUSD": 957405639
    },
    {
      "date": 1760313600,
      "totalLiquidityUSD": 1018414599
    },
    {
      "date": 1760400000,
      "totalLiquidityUSD": 1018499732
    },
    {
      "date": 1760486400,
      "totalLiquidityUSD": 976931667
    },
    {
      "date": 1760572800,
      "totalLiquidityUSD": 956700690
    },
    {
      "date": 1760659200,
      "totalLiquidityUSD": 942045599
    },
    {
      "date": 1760745600,
      "totalLiquidityUSD": 922776774
    },
    {
      "date": 1760832000,
      "totalLiquidityUSD": 924905562
    },
    {
      "date": 1760918400,
      "totalLiquidityUSD": 941313977
    },
    {
      "date": 1761004800,
      "totalLiquidityUSD": 952053655
    },
    {
      "date": 1761091200,
      "totalLiquidityUSD": 930395517
    },
    {
      "date": 1761177600,
      "totalLiquidityUSD": 910365955
    },
    {
      "date": 1761264000,
      "totalLiquidityUSD": 897151452
    },
    {
      "date": 1761350400,
      "totalLiquidityUSD": 912315883
    },
    {
      "date": 1761436800,
      "totalLiquidityUSD": 909824974
    },
    {
      "date": 1761523200,
      "totalLiquidityUSD": 940711496
    },
    {
      "date": 1761609600,
      "totalLiquidityUSD": 924104185
    },
    {
      "date": 1761696000,
      "totalLiquidityUSD": 903764484
    },
    {
      "date": 1761782400,
      "totalLiquidityUSD": 890692843
    },
    {
      "date": 1761868800,
      "totalLiquidityUSD": 859391288
    },
    {
      "date": 1761955200,
      "totalLiquidityUSD": 859807159
    },
    {
      "date": 1762041600,
      "totalLiquidityUSD": 881694457
    },
    {
      "date": 1762128000,
      "totalLiquidityUSD": 874462081
    },
    {
      "date": 1762214400,
      "totalLiquidityUSD": 813876062
    },
    {
      "date": 1762300800,
      "totalLiquidityUSD": 778227463
    },
    {
      "date": 1762387200,
      "totalLiquidityUSD": 802628358
    },
    {
      "date": 1762473600,
      "totalLiquidityUSD": 781150319
    },
    {
      "date": 1762560000,
      "totalLiquidityUSD": 838758690
    },
    {
      "date": 1762646400,
      "totalLiquidityUSD": 820161776
    },
    {
      "date": 1762732800,
      "totalLiquidityUSD": 841085930
    },
    {
      "date": 1762819200,
      "totalLiquidityUSD": 842541466
    },
    {
      "date": 1762905600,
      "totalLiquidityUSD": 813514365
    },
    {
      "date": 1762992000,
      "totalLiquidityUSD": 793741987
    },
    {
      "date": 1763078400,
      "totalLiquidityUSD": 768189852
    },
    {
      "date": 1763164800,
      "totalLiquidityUSD": 752823248
    },
    {
      "date": 1763251200,
      "totalLiquidityUSD": 753426142
    },
    {
      "date": 1763337600,
      "totalLiquidityUSD": 738698311
    },
    {
      "date": 1763424000,
      "totalLiquidityUSD": 727408821
    },
    {
      "date": 1763510400,
      "totalLiquidityUSD": 745713200
    },
    {
      "date": 1763596800,
      "totalLiquidityUSD": 729704901
    },
    {
      "date": 1763683200,
      "totalLiquidityUSD": 709408099
    },
    {
      "date": 1763769600,
      "totalLiquidityUSD": 666128313
    },
    {
      "date": 1763856000,
      "totalLiquidityUSD": 675811656
    },
    {
      "date": 1763942400,
      "totalLiquidityUSD": 693157243
    },
    {
      "date": 1764028800,
      "totalLiquidityUSD": 705284196
    },
    {
      "date": 1764115200,
      "totalLiquidityUSD": 703535231
    },
    {
      "date": 1764201600,
      "totalLiquidityUSD": 716155311
    },
    {
      "date": 1764288000,
      "totalLiquidityUSD": 715159670
    },
    {
      "date": 1764374400,
      "totalLiquidityUSD": 711231659
    },
    {
      "date": 1764460800,
      "totalLiquidityUSD": 706646369
    },
    {
      "date": 1764547200,
      "totalLiquidityUSD": 697705715
    },
    {
      "date": 1764633600,
      "totalLiquidityUSD": 666557709
    },
    {
      "date": 1764720000,
      "totalLiquidityUSD": 700870434
    },
    {
      "date": 1764806400,
      "totalLiquidityUSD": 714758244
    },
    {
      "date": 1764892800,
      "totalLiquidityUSD": 708754098
    },
    {
      "date": 1764979200,
      "totalLiquidityUSD": 675169628
    },
    {
      "date": 1765065600,
      "totalLiquidityUSD": 679255598
    },
    {
      "date": 1765152000,
      "totalLiquidityUSD": 677532390
    },
    {
      "date": 1765238400,
      "totalLiquidityUSD": 693613286
    },
    {
      "date": 1765324800,
      "totalLiquidityUSD": 682236012
    },
    {
      "date": 1765411200,
      "totalLiquidityUSD": 675351017
    },
    {
      "date": 1765497600,
      "totalLiquidityUSD": 673402563
    },
    {
      "date": 1765584000,
      "totalLiquidityUSD": 662279102
    },
    {
      "date": 1765670400,
      "totalLiquidityUSD": 664693978
    },
    {
      "date": 1765756800,
      "totalLiquidityUSD": 654011031
    },
    {
      "date": 1765843200,
      "totalLiquidityUSD": 638786910
    },
    {
      "date": 1765929600,
      "totalLiquidityUSD": 637700665
    },
    {
      "date": 1766016000,
      "totalLiquidityUSD": 623790556
    },
    {
      "date": 1766102400,
      "totalLiquidityUSD": 617188582
    },
    {
      "date": 1766188800,
      "totalLiquidityUSD": 643674000
    },
    {
      "date": 1766275200,
      "totalLiquidityUSD": 644902132
    },
    {
      "date": 1766361600,
      "totalLiquidityUSD": 649957733
    },
    {
      "date": 1766448000,
      "totalLiquidityUSD": 641658736
    },
    {
      "date": 1766534400,
      "totalLiquidityUSD": 634228164
    },
    {
      "date": 1766620800,
      "totalLiquidityUSD": 616735518
    },
    {
      "date": 1766707200,
      "totalLiquidityUSD": 612418493
    },
    {
      "date": 1766793600,
      "totalLiquidityUSD": 618351804
    },
    {
      "date": 1766880000,
      "totalLiquidityUSD": 625281891
    },
    {
      "date": 1766966400,
      "totalLiquidityUSD": 625028063
    },
    {
      "date": 1767052800,
      "totalLiquidityUSD": 623212667
    },
    {
      "date": 1767139200,
      "totalLiquidityUSD": 618498623
    },
    {
      "date": 1767225600,
      "totalLiquidityUSD": 616791436
    },
    {
      "date": 1767312000,
      "totalLiquidityUSD": 630049759
    },
    {
      "date": 1767398400,
      "totalLiquidityUSD": 652938139
    },
    {
      "date": 1767484800,
      "totalLiquidityUSD": 662822867
    },
    {
      "date": 1767571200,
      "totalLiquidityUSD": 668289772
    },
    {
      "date": 1767657600,
      "totalLiquidityUSD": 687519777
    },
    {
      "date": 1767744000,
      "totalLiquidityUSD": 689133301
    },
    {
      "date": 1767830400,
      "totalLiquidityUSD": 674474571
    },
    {
      "date": 1767916800,
      "totalLiquidityUSD": 671644402
    },
    {
      "date": 1768003200,
      "totalLiquidityUSD": 663283450
    },
    {
      "date": 1768089600,
      "totalLiquidityUSD": 657270647
    },
    {
      "date": 1768176000,
      "totalLiquidityUSD": 656460391
    },
    {
      "date": 1768262400,
      "totalLiquidityUSD": 654490490
    },
    {
      "date": 1768348800,
      "totalLiquidityUSD": 675549084
    },
    {
      "date": 1768435200,
      "totalLiquidityUSD": 673076276
    },
    {
      "date": 1768521600,
      "totalLiquidityUSD": 662416067
    },
    {
      "date": 1768608000,
      "totalLiquidityUSD": 658637400
    },
    {
      "date": 1768694400,
      "totalLiquidityUSD": 659772578
    },
    {
      "date": 1768780800,
      "totalLiquidityUSD": 633462197
    },
    {
      "date": 1768867200,
      "totalLiquidityUSD": 663689109
    },
    {
      "date": 1768953600,
      "totalLiquidityUSD": 645250227
    },
    {
      "date": 1769040000,
      "totalLiquidityUSD": 650581126
    },
    {
      "date": 1769126400,
      "totalLiquidityUSD": 640363486
    },
    {
      "date": 1769212800,
      "totalLiquidityUSD": 644696272
    },
    {
      "date": 1769299200,
      "totalLiquidityUSD": 650544779
    },
    {
      "date": 1769385600,
      "totalLiquidityUSD": 630595668
    },
    {
      "date": 1769472000,
      "totalLiquidityUSD": 653453564
    },
    {
      "date": 1769558400,
      "totalLiquidityUSD": 662698823
    },
    {
      "date": 1769644800,
      "totalLiquidityUSD": 692970697
    },
    {
      "date": 1769731200,
      "totalLiquidityUSD": 628607992
    },
    {
      "date": 1769817600,
      "totalLiquidityUSD": 621707391
    },
    {
      "date": 1769904000,
      "totalLiquidityUSD": 597237104
    },
    {
      "date": 1769990400,
      "totalLiquidityUSD": 578884666
    },
    {
      "date": 1770076800,
      "totalLiquidityUSD": 589970802
    },
    {
      "date": 1770163200,
      "totalLiquidityUSD": 575633929
    },
    {
      "date": 1770249600,
      "totalLiquidityUSD": 555886207
    },
    {
      "date": 1770336000,
      "totalLiquidityUSD": 504130851
    },
    {
      "date": 1770422400,
      "totalLiquidityUSD": 541739836
    },
    {
      "date": 1770508800,
      "totalLiquidityUSD": 534641478
    },
    {
      "date": 1770595200,
      "totalLiquidityUSD": 535542327
    },
    {
      "date": 1770681600,
      "totalLiquidityUSD": 520495168
    },
    {
      "date": 1770768000,
      "totalLiquidityUSD": 511989046
    },
    {
      "date": 1770854400,
      "totalLiquidityUSD": 499662021
    },
    {
      "date": 1770940800,
      "totalLiquidityUSD": 500791141
    },
    {
      "date": 1771027200,
      "totalLiquidityUSD": 515642531
    },
    {
      "date": 1771113600,
      "totalLiquidityUSD": 526079849
    },
    {
      "date": 1771200000,
      "totalLiquidityUSD": 511314558
    },
    {
      "date": 1771286400,
      "totalLiquidityUSD": 510298239
    },
    {
      "date": 1771372800,
      "totalLiquidityUSD": 506061318
    },
    {
      "date": 1771459200,
      "totalLiquidityUSD": 498665319
    },
    {
      "date": 1771545600,
      "totalLiquidityUSD": 499063989
    },
    {
      "date": 1771632000,
      "totalLiquidityUSD": 504286102
    },
    {
      "date": 1771718400,
      "totalLiquidityUSD": 494720616
    },
    {
      "date": 1771804800,
      "totalLiquidityUSD": 492932839
    },
    {
      "date": 1771891200,
      "totalLiquidityUSD": 481490858
    },
    {
      "date": 1771977600,
      "totalLiquidityUSD": 485315162
    },
    {
      "date": 1772064000,
      "totalLiquidityUSD": 512673688
    },
    {
      "date": 1772150400,
      "totalLiquidityUSD": 502770131
    },
    {
      "date": 1772236800,
      "totalLiquidityUSD": 495492668
    },
    {
      "date": 1772323200,
      "totalLiquidityUSD": 501394269
    },
    {
      "date": 1772409600,
      "totalLiquidityUSD": 493233516
    },
    {
      "date": 1772496000,
      "totalLiquidityUSD": 512482194
    },
    {
      "date": 1772582400,
      "totalLiquidityUSD": 506134319
    },
    {
      "date": 1772668800,
      "totalLiquidityUSD": 526090503
    },
    {
      "date": 1772755200,
      "totalLiquidityUSD": 515750570
    },
    {
      "date": 1772841600,
      "totalLiquidityUSD": 508503991
    },
    {
      "date": 1772928000,
      "totalLiquidityUSD": 503453603
    },
    {
      "date": 1773014400,
      "totalLiquidityUSD": 496392859
    },
    {
      "date": 1773100800,
      "totalLiquidityUSD": 504861995
    },
    {
      "date": 1773187200,
      "totalLiquidityUSD": 510208363
    },
    {
      "date": 1773273600,
      "totalLiquidityUSD": 510605739
    },
    {
      "date": 1773360000,
      "totalLiquidityUSD": 513952089
    },
    {
      "date": 1773446400,
      "totalLiquidityUSD": 509994338
    },
    {
      "date": 1773532800,
      "totalLiquidityUSD": 508637864
    },
    {
      "date": 1773619200,
      "totalLiquidityUSD": 518243027
    },
    {
      "date": 1773705600,
      "totalLiquidityUSD": 540456798
    },
    {
      "date": 1773792000,
      "totalLiquidityUSD": 536988832
    },
    {
      "date": 1773878400,
      "totalLiquidityUSD": 518340841
    },
    {
      "date": 1773964800,
      "totalLiquidityUSD": 502517540
    },
    {
      "date": 1774051200,
      "totalLiquidityUSD": 502149715
    },
    {
      "date": 1774137600,
      "totalLiquidityUSD": 497656646
    },
    {
      "date": 1774224000,
      "totalLiquidityUSD": 490908588
    },
    {
      "date": 1774310400,
      "totalLiquidityUSD": 502944819
    },
    {
      "date": 1774396800,
      "totalLiquidityUSD": 503957296
    },
    {
      "date": 1774483200,
      "totalLiquidityUSD": 506186759
    },
    {
      "date": 1774569600,
      "totalLiquidityUSD": 485558780
    },
    {
      "date": 1774656000,
      "totalLiquidityUSD": 468386080
    },
    {
      "date": 1774742400,
      "totalLiquidityUSD": 476361115
    },
    {
      "date": 1774828800,
      "totalLiquidityUSD": 475296287
    },
    {
      "date": 1774915200,
      "totalLiquidityUSD": 477801714
    },
    {
      "date": 1775001600,
      "totalLiquidityUSD": 487438623
    },
    {
      "date": 1775088000,
      "totalLiquidityUSD": 489657324
    },
    {
      "date": 1775174400,
      "totalLiquidityUSD": 478733926
    },
    {
      "date": 1775260800,
      "totalLiquidityUSD": 478081051
    },
    {
      "date": 1775347200,
      "totalLiquidityUSD": 475823532
    },
    {
      "date": 1775433600,
      "totalLiquidityUSD": 476266109
    },
    {
      "date": 1775520000,
      "totalLiquidityUSD": 474988202
    },
    {
      "date": 1775606400,
      "totalLiquidityUSD": 488270744
    },
    {
      "date": 1775692800,
      "totalLiquidityUSD": 487580147
    },
    {
      "date": 1775779200,
      "totalLiquidityUSD": 493049757
    },
    {
      "date": 1775865600,
      "totalLiquidityUSD": 500401821
    },
    {
      "date": 1775952000,
      "totalLiquidityUSD": 510864733
    },
    {
      "date": 1776038400,
      "totalLiquidityUSD": 503679642
    },
    {
      "date": 1776124800,
      "totalLiquidityUSD": 533133224
    },
    {
      "date": 1776211200,
      "totalLiquidityUSD": 526860884
    },
    {
      "date": 1776297600,
      "totalLiquidityUSD": 532395340
    },
    {
      "date": 1776384000,
      "totalLiquidityUSD": 536262240
    },
    {
      "date": 1776470400,
      "totalLiquidityUSD": 533059743
    },
    {
      "date": 1776556800,
      "totalLiquidityUSD": 522601838
    },
    {
      "date": 1776643200,
      "totalLiquidityUSD": 515831296
    },
    {
      "date": 1776729600,
      "totalLiquidityUSD": 521554127
    },
    {
      "date": 1776816000,
      "totalLiquidityUSD": 524875933
    },
    {
      "date": 1776902400,
      "totalLiquidityUSD": 530934012
    },
    {
      "date": 1776988800,
      "totalLiquidityUSD": 529977900
    },
    {
      "date": 1777075200,
      "totalLiquidityUSD": 528544131
    },
    {
      "date": 1777161600,
      "totalLiquidityUSD": 526952992
    },
    {
      "date": 1777248000,
      "totalLiquidityUSD": 532876628
    },
    {
      "date": 1777334400,
      "totalLiquidityUSD": 525009369
    },
    {
      "date": 1777420800,
      "totalLiquidityUSD": 517045764
    },
    {
      "date": 1777507200,
      "totalLiquidityUSD": 517565332
    },
    {
      "date": 1777593600,
      "totalLiquidityUSD": 517901264
    },
    {
      "date": 1777680000,
      "totalLiquidityUSD": 518859459
    },
    {
      "date": 1777766400,
      "totalLiquidityUSD": 525931650
    },
    {
      "date": 1777852800,
      "totalLiquidityUSD": 524683086
    },
    {
      "date": 1777939200,
      "totalLiquidityUSD": 526400258
    },
    {
      "date": 1778025600,
      "totalLiquidityUSD": 532545991
    },
    {
      "date": 1778112000,
      "totalLiquidityUSD": 539436841
    },
    {
      "date": 1778198400,
      "totalLiquidityUSD": 538853087
    },
    {
      "date": 1778284800,
      "totalLiquidityUSD": 555743462
    },
    {
      "date": 1778371200,
      "totalLiquidityUSD": 556641933
    },
    {
      "date": 1778457600,
      "totalLiquidityUSD": 560885895
    },
    {
      "date": 1778544000,
      "totalLiquidityUSD": 561819036
    },
    {
      "date": 1778630400,
      "totalLiquidityUSD": 555308639
    },
    {
      "date": 1778716800,
      "totalLiquidityUSD": 552833357
    },
    {
      "date": 1778803200,
      "totalLiquidityUSD": 556783313
    },
    {
      "date": 1778889600,
      "totalLiquidityUSD": 546819358
    },
    {
      "date": 1778976000,
      "totalLiquidityUSD": 541682851
    },
    {
      "date": 1779062400,
      "totalLiquidityUSD": 535312671
    },
    {
      "date": 1779148800,
      "totalLiquidityUSD": 529889068
    },
    {
      "date": 1779235200,
      "totalLiquidityUSD": 528548323
    },
    {
      "date": 1779321600,
      "totalLiquidityUSD": 502736561
    },
    {
      "date": 1779408000,
      "totalLiquidityUSD": 510308931
    },
    {
      "date": 1779494400,
      "totalLiquidityUSD": 507594940
    },
    {
      "date": 1779580800,
      "totalLiquidityUSD": 522187346
    },
    {
      "date": 1779667200,
      "totalLiquidityUSD": 519057028
    },
    {
      "date": 1779753600,
      "totalLiquidityUSD": 532634264
    },
    {
      "date": 1779840000,
      "totalLiquidityUSD": 546090875
    },
    {
      "date": 1779926400,
      "totalLiquidityUSD": 527871566
    },
    {
      "date": 1780012800,
      "totalLiquidityUSD": 510908443
    },
    {
      "date": 1780099200,
      "totalLiquidityUSD": 512317811
    },
    {
      "date": 1780185600,
      "totalLiquidityUSD": 531491577
    },
    {
      "date": 1780272000,
      "totalLiquidityUSD": 534924575
    },
    {
      "date": 1780358400,
      "totalLiquidityUSD": 561932857
    },
    {
      "date": 1780444800,
      "totalLiquidityUSD": 547616813
    },
    {
      "date": 1780531200,
      "totalLiquidityUSD": 600558309
    },
    {
      "date": 1780617600,
      "totalLiquidityUSD": 595283063
    },
    {
      "date": 1780704000,
      "totalLiquidityUSD": 587461163
    },
    {
      "date": 1780790400,
      "totalLiquidityUSD": 547690708
    },
    {
      "date": 1780876800,
      "totalLiquidityUSD": 578563827
    },
    {
      "date": 1780963200,
      "totalLiquidityUSD": 581715926
    },
    {
      "date": 1781049600,
      "totalLiquidityUSD": 582412468
    },
    {
      "date": 1781136000,
      "totalLiquidityUSD": 562261430
    },
    {
      "date": 1781222400,
      "totalLiquidityUSD": 586336116
    },
    {
      "date": 1781308800,
      "totalLiquidityUSD": 573606265
    },
    {
      "date": 1781395200,
      "totalLiquidityUSD": 592805099
    },
    {
      "date": 1781481600,
      "totalLiquidityUSD": 604318057
    },
    {
      "date": 1781568000,
      "totalLiquidityUSD": 632322548
    },
    {
      "date": 1781654400,
      "totalLiquidityUSD": 662904106
    },
    {
      "date": 1781740800,
      "totalLiquidityUSD": 687789526
    },
    {
      "date": 1781827200,
      "totalLiquidityUSD": 686269054
    },
    {
      "date": 1781913600,
      "totalLiquidityUSD": 649865937
    },
    {
      "date": 1782000000,
      "totalLiquidityUSD": 644187274
    },
    {
      "date": 1782086400,
      "totalLiquidityUSD": 652561694
    },
    {
      "date": 1782172800,
      "totalLiquidityUSD": 652605470
    },
    {
      "date": 1782259200,
      "totalLiquidityUSD": 617012202
    },
    {
      "date": 1782345600,
      "totalLiquidityUSD": 612758344
    },
    {
      "date": 1782432000,
      "totalLiquidityUSD": 607788352
    },
    {
      "date": 1782518400,
      "totalLiquidityUSD": 598232728
    },
    {
      "date": 1782604800,
      "totalLiquidityUSD": 596599339
    },
    {
      "date": 1782691200,
      "totalLiquidityUSD": 592739805
    },
    {
      "date": 1782777600,
      "totalLiquidityUSD": 585002694
    },
    {
      "date": 1782864000,
      "totalLiquidityUSD": 573492121
    },
    {
      "date": 1782950400,
      "totalLiquidityUSD": 566850173
    },
    {
      "date": 1783036800,
      "totalLiquidityUSD": 578007769
    },
    {
      "date": 1783123200,
      "totalLiquidityUSD": 598072857
    },
    {
      "date": 1783209600,
      "totalLiquidityUSD": 595744847
    },
    {
      "date": 1783296000,
      "totalLiquidityUSD": 592318616
    },
    {
      "date": 1783382400,
      "totalLiquidityUSD": 595619500
    },
    {
      "date": 1783468800,
      "totalLiquidityUSD": 583920267
    },
    {
      "date": 1783555200,
      "totalLiquidityUSD": 580670732
    },
    {
      "date": 1783641600,
      "totalLiquidityUSD": 580862890
    },
    {
      "date": 1783728000,
      "totalLiquidityUSD": 589041888
    },
    {
      "date": 1783814400,
      "totalLiquidityUSD": 599551163
    },
    {
      "date": 1783900800,
      "totalLiquidityUSD": 610003406
    },
    {
      "date": 1783987200,
      "totalLiquidityUSD": 595447199
    },
    {
      "date": 1784073600,
      "totalLiquidityUSD": 616736728
    },
    {
      "date": 1784160000,
      "totalLiquidityUSD": 617818034
    },
    {
      "date": 1784246400,
      "totalLiquidityUSD": 598316843
    },
    {
      "date": 1784332800,
      "totalLiquidityUSD": 596932864
    },
    {
      "date": 1784419200,
      "totalLiquidityUSD": 595328739
    },
    {
      "date": 1784505600,
      "totalLiquidityUSD": 591551490
    },
    {
      "date": 1784592000,
      "totalLiquidityUSD": 600478755
    },
    {
      "date": 1784678400,
      "totalLiquidityUSD": 603064309
    },
    {
      "date": 1784764800,
      "totalLiquidityUSD": 604472956
    },
    {
      "date": 1784851200,
      "totalLiquidityUSD": 599117923
    },
    {
      "date": 1784937600,
      "totalLiquidityUSD": 573301262
    },
    {
      "date": 1785024000,
      "totalLiquidityUSD": 575635756
    },
    {
      "date": 1785110400,
      "totalLiquidityUSD": 586677498
    },
    {
      "date": 1785196800,
      "totalLiquidityUSD": 570033243
    },
    {
      "date": 1785283200,
      "totalLiquidityUSD": 569129113
    },
    {
      "date": 1785369600,
      "totalLiquidityUSD": 566699081
    },
    {
      "date": 1785456000,
      "totalLiquidityUSD": 564298158
    },
    {
      "date": 1785542400,
      "totalLiquidityUSD": 552909642
    },
    {
      "date": 1785628800,
      "totalLiquidityUSD": 552540454
    },
    {
      "date": 1785715200,
      "totalLiquidityUSD": 562588734
    },
    {
      "date": 1785801600,
      "totalLiquidityUSD": 518398929
    },
    {
      "date": 1785888000,
      "totalLiquidityUSD": 518092059
    },
    {
      "date": 1785974400,
      "totalLiquidityUSD": 522795925
    },
    {
      "date": 1786060800,
      "totalLiquidityUSD": 514232050
    },
    {
      "date": 1786147200,
      "totalLiquidityUSD": 519619974
    },
    {
      "date": 1786233600,
      "totalLiquidityUSD": 520366745
    },
    {
      "date": 1786320000,
      "totalLiquidityUSD": 527595695
    },
    {
      "date": 1786406400,
      "totalLiquidityUSD": 531203560
    },
    {
      "date": 1786492800,
      "totalLiquidityUSD": 529488363
    },
    {
      "date": 1786579200,
      "totalLiquidityUSD": 525259777
    },
    {
      "date": 1786665600,
      "totalLiquidityUSD": 522992748
    },
    {
      "date": 1786752000,
      "totalLiquidityUSD": 521524568
    },
    {
      "date": 1786838400,
      "totalLiquidityUSD": 525860148
    },
    {
      "date": 1786924800,
      "totalLiquidityUSD": 530030044
    },
    {
      "date": 1787011200,
      "totalLiquidityUSD": 526613449
    },
    {
      "date": 1787097600,
      "totalLiquidityUSD": 504588604
    },
    {
      "date": 1787184000,
      "totalLiquidityUSD": 544930935
    },
    {
      "date": 1787270400,
      "totalLiquidityUSD": 561012666
    },
    {
      "date": 1787356800,
      "totalLiquidityUSD": 588134680
    },
    {
      "date": 1787443200,
      "totalLiquidityUSD": 574260768
    },
    {
      "date": 1787529600,
      "totalLiquidityUSD": 584131503
    },
    {
      "date": 1787616000,
      "totalLiquidityUSD": 583437270
    },
    {
      "date": 1787702400,
      "totalLiquidityUSD": 575855589
    },
    {
      "date": 1787788800,
      "totalLiquidityUSD": 593170340
    },
    {
      "date": 1787875200,
      "totalLiquidityUSD": 597650171
    },
    {
      "date": 1787961600,
      "totalLiquidityUSD": 578342605
    },
    {
      "date": 1788048000,
      "totalLiquidityUSD": 581276560
    },
    {
      "date": 1788134400,
      "totalLiquidityUSD": 575148351
    },
    {
      "date": 1788181043,
      "totalLiquidityUSD": 574097317
    }
  ]
}
```

#### GitHub API attempts

**All GitHub attempts failed.** Attempts:

| Candidate | Success | HTTP | Reason |
|---|---|---|---|
| `ethereum-optimism/optimism` | ✗ | 404 | NOT_FOUND |
| `ethereum-optimism/op` | ✗ | 404 | NOT_FOUND |

---

## 📊 Data Quality Test

Финальный тест качества данных. Подтверждает, что проекты с известными chain-данными больше не показывают `$0 TVL` из-за отсутствия protocol mapping.

| Project | Entity Type | Market Cap | TVL (chain) | Fees | Revenue | Active Addr | GitHub | Completeness | Missing Reasons |
|---|---|---|---|---|---|---|---|---|---|
| **arbitrum** | CHAIN+TOKEN | $574.56M | $1.399B | unavailable | unavailable | unavailable | 77⭐ | 64% | `fees.fees_24h:NOT_APPLICABLE, revenue.revenue_24h:NOT_APPLICABLE, dex.dex_volume_24h:NOT_APPLICABLE, gh.commits_30d:PROVIDER_NO_DATA` |
| **optimism** | CHAIN+TOKEN | $198.22M | $0.00 | unavailable | unavailable | unavailable | — | 45% | `fees.fees_24h:NOT_APPLICABLE, revenue.revenue_24h:NOT_APPLICABLE, dex.dex_volume_24h:NOT_APPLICABLE, gh.stars:NOT_FOUND, gh.forks:NOT_FOUND, gh.commits_30d:NOT_FOUND` |
| **polygon** | CHAIN+TOKEN | unavailable | $808.98M | unavailable | unavailable | unavailable | 554⭐ | 27% | `fees.fees_24h:NOT_APPLICABLE, revenue.revenue_24h:NOT_APPLICABLE, dex.dex_volume_24h:NOT_APPLICABLE, market.price_usd:PROVIDER_NO_DATA, market.market_cap_usd:PROVIDER_NO_DATA, market.volume_24h_usd:PROVIDER_NO_DATA, market.fdv_usd:PROVIDER_NO_DATA, gh.commits_30d:PROVIDER_NO_DATA` |
| **starknet** | CHAIN+TOKEN | $177.46M | $162.75M | unavailable | unavailable | unavailable | — | 45% | `fees.fees_24h:NOT_APPLICABLE, revenue.revenue_24h:NOT_APPLICABLE, dex.dex_volume_24h:NOT_APPLICABLE, gh.stars:NOT_FOUND, gh.forks:NOT_FOUND, gh.commits_30d:NOT_FOUND` |
| **mantle** | CHAIN+TOKEN | $1.886B | $90.75M | unavailable | unavailable | unavailable | — | 45% | `fees.fees_24h:NOT_APPLICABLE, revenue.revenue_24h:NOT_APPLICABLE, dex.dex_volume_24h:NOT_APPLICABLE, gh.stars:NOT_FOUND, gh.forks:NOT_FOUND, gh.commits_30d:NOT_FOUND` |
| **linea** | CHAIN+TOKEN | $61.23M | $29.10M | unavailable | unavailable | unavailable | — | 45% | `fees.fees_24h:NOT_APPLICABLE, revenue.revenue_24h:NOT_APPLICABLE, dex.dex_volume_24h:NOT_APPLICABLE, gh.stars:NOT_FOUND, gh.forks:NOT_FOUND, gh.commits_30d:NOT_FOUND` |
| **zksync** | CHAIN+TOKEN | $92.68M | $15.24M | unavailable | unavailable | unavailable | 3,233⭐ | 64% | `fees.fees_24h:NOT_APPLICABLE, revenue.revenue_24h:NOT_APPLICABLE, dex.dex_volume_24h:NOT_APPLICABLE, gh.commits_30d:PROVIDER_NO_DATA` |
| **celo** | CHAIN+TOKEN | $44.67M | $16.46M | unavailable | unavailable | unavailable | 627⭐ | 64% | `fees.fees_24h:NOT_APPLICABLE, revenue.revenue_24h:NOT_APPLICABLE, dex.dex_volume_24h:NOT_APPLICABLE, gh.commits_30d:PROVIDER_NO_DATA` |
| **metis** | CHAIN+TOKEN | $20.78M | $2.62M | unavailable | unavailable | unavailable | 10⭐ | 64% | `fees.fees_24h:NOT_APPLICABLE, revenue.revenue_24h:NOT_APPLICABLE, dex.dex_volume_24h:NOT_APPLICABLE, gh.commits_30d:PROVIDER_NO_DATA` |
| **gnosis** | CHAIN+TOKEN | $311.54M | $102.85M | unavailable | unavailable | unavailable | — | 45% | `fees.fees_24h:NOT_APPLICABLE, revenue.revenue_24h:NOT_APPLICABLE, dex.dex_volume_24h:NOT_APPLICABLE, gh.stars:NOT_FOUND, gh.forks:NOT_FOUND, gh.commits_30d:NOT_FOUND` |

### Acceptance Criteria

- **Chain TVL данные получены для**: 10/10 проектов
- **Protocol TVL данные получены для**: 3/10 проектов
- **Критерий**: `$0 TVL` не должен возвращаться, если провайдер вернул реальное числовое значение > 0

✅ **TEST PASSED**: Все 10 целевых chain-проектов получили корректный chain TVL. Проблема с `$0 TVL` для L2 устранена.

### Разбивка по типам ошибок (missing reasons)

| Reason | Count |
|---|---|
| `NOT_APPLICABLE` | 30 |
| `NOT_FOUND` | 15 |
| `PROVIDER_NO_DATA` | 9 |

