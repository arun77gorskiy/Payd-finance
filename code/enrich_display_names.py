#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAYD Display Name Enrichment
============================
Этап 1: Генерация человеко-читаемых display_name для всех 354 активов.

Алгоритм:
  1. Курируемая таблица KNOWN_NAMES для ~100+ известных брендов (overrides всё).
  2. Если id имеет CoinGecko disambiguator (напр. -2, -3, -4) и base name — таблица знает base.
  3. Если name уже в "Title Case" (не slug) — переиспользуем его.
  4. Fallback: slug-to-title с поддержкой акронимов, брендов с точками и цифровых префиксов.

Provenance: каждый проект получает display_name_source ∈ {curated|inherited|generated}.
"""
import json
import re
import sys
from collections import Counter
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Курируемая таблица имён для ~100 самых известных проектов
# ---------------------------------------------------------------------------
KNOWN_NAMES = {
    # === Layer 1 ===
    'bitcoin': 'Bitcoin',
    'btc': 'Bitcoin',
    'ethereum': 'Ethereum',
    'eth': 'Ethereum',
    'solana': 'Solana',
    'sol': 'Solana',
    'cardano': 'Cardano',
    'ada': 'Cardano',
    'avalanche-2': 'Avalanche',
    'avax': 'Avalanche',
    'polkadot': 'Polkadot',
    'dot': 'Polkadot',
    'cosmos': 'Cosmos Hub',
    'atom': 'Cosmos',
    'near': 'NEAR Protocol',
    'aptos': 'Aptos',
    'apt': 'Aptos',
    'sui': 'Sui',
    'arbitrum': 'Arbitrum',
    'arb': 'Arbitrum',
    'optimism': 'Optimism',
    'op': 'Optimism',
    'algorand': 'Algorand',
    'algo': 'Algorand',
    'tezos': 'Tezos',
    'xtz': 'Tezos',
    'tron': 'TRON',
    'trx': 'TRON',
    'eos': 'EOS',
    'neo': 'NEO',
    'stellar': 'Stellar',
    'xlm': 'Stellar',
    'monero': 'Monero',
    'xmr': 'Monero',
    'litecoin': 'Litecoin',
    'ltc': 'Litecoin',
    'dogecoin': 'Dogecoin',
    'doge': 'Dogecoin',
    'concordium': 'Concordium',
    'concordium-ccd': 'Concordium',
    'bittensor': 'Bittensor',
    'tao': 'Bittensor',
    'kaspa': 'Kaspa',
    'kas': 'Kaspa',
    'sei': 'Sei',
    'injective': 'Injective',
    'inj': 'Injective',
    'celestia': 'Celestia',
    'tia': 'Celestia',
    'monad': 'Monad',
    'movement': 'Movement',
    'sonic-3': 'Sonic',
    's': 'Sonic',
    'manta': 'Manta Network',
    'kava': 'Kava',
    'kusama': 'Kusama',
    'ksm': 'Kusama',

    # === Layer 2 ===
    'matic-network': 'Polygon',
    'polygon': 'Polygon',
    'pol': 'Polygon',
    'mantle': 'Mantle',
    'mnt': 'Mantle',
    'metis': 'Metis',
    'loopring': 'Loopring',
    'lrc': 'Loopring',
    'zksync': 'zkSync',
    'starknet': 'StarkNet',
    'strk': 'StarkNet',
    'linea': 'Linea',
    'scroll': 'Scroll',
    'moodeng': 'Moo Deng',
    'blast': 'Blast',
    'bob': 'BOB',
    'huddle01': 'Huddle 01',
    'xai': 'Xai',
    'astar': 'Astar',
    'astr': 'Astar',
    'aurora': 'Aurora',
    'aevo': 'Aevo',
    'ae-vo': 'Aevo',
    'ae-vo-1': 'Aevo',
    'wemix': 'WEMIX',

    # === DeFi ===
    'uniswap': 'Uniswap',
    'uni': 'Uniswap',
    'aave': 'Aave',
    'curve-dao-token': 'Curve DAO',
    'crv': 'Curve DAO',
    'maker': 'Maker',
    'mkr': 'Maker',
    'compound-governance-token': 'Compound',
    'comp': 'Compound',
    'sushi': 'SushiSwap',
    '1inch': '1inch',
    'dydx': 'dYdX',
    'gmx': 'GMX',
    'synthetix': 'Synthetix',
    'snx': 'Synthetix',
    'balancer': 'Balancer',
    'bal': 'Balancer',
    'frax-finance': 'Frax',
    'frax': 'Frax Share',
    'fxs': 'Frax Share',
    'uma': 'UMA',
    'pendle': 'Pendle',
    'lido': 'Lido',
    'ldo': 'Lido',
    'rocket-pool': 'Rocket Pool',
    'rpl': 'Rocket Pool',
    'convex-finance': 'Convex Finance',
    'cvx': 'Convex',
    'yearn-finance': 'Yearn.finance',
    'yfi': 'Yearn.finance',
    'pancakeswap-token': 'PancakeSwap',
    'cake': 'PancakeSwap',
    'morpho': 'Morpho',
    'morpho-aave-v3': 'Morpho',
    'eigenpie': 'Eigenpie',
    'eigenlayer': 'EigenLayer',
    'ethena': 'Ethena',
    'ena': 'Ethena',
    'ondo': 'Ondo',
    'ondo-finance': 'Ondo Finance',
    'wormhole': 'Wormhole',
    'worm': 'Wormhole',
    'thorchain': 'THORChain',
    'rune': 'THORChain',
    'kujira': 'Kujira',
    'kuji': 'Kujira',
    'renzo': 'Renzo',
    'rez': 'Renzo',
    'ethfi': 'ether.fi',
    'ether-fi': 'ether.fi',
    'eigen': 'Eigen',

    # === AI ===
    'fetch-ai': 'Fetch.ai',
    'fet': 'Fetch.ai',
    'render': 'Render',
    'rndr': 'Render',
    'akash': 'Akash Network',
    'akt': 'Akash Network',
    'aethir': 'Aethir',
    'ath': 'Aethir',
    'the-graph': 'The Graph',
    'grt': 'The Graph',
    'io-net': 'io.net',
    'io': 'io.net',
    'near-protocol': 'NEAR Protocol',
    'ao': 'AO',
    'ao-computer': 'AO',
    'bittensor-2': 'Bittensor',
    'worldcoin': 'Worldcoin',
    'wld': 'Worldcoin',
    'aleph-im': 'Aleph.im',
    'aleph': 'Aleph.im',
    'autonolas': 'Autonolas',
    'olas': 'Autonolas',
    'olethea-ai': 'Alethea AI',
    'ali': 'Alethea AI',
    'cysic': 'Cysic',
    'cys': 'Cysic',
    'io-net-2': 'io.net',
    'magic': 'Magic',
    'magic-eden': 'Magic Eden',
    'magic-token': 'Magic',
    'allora': 'Allora',
    'allo': 'Allora',
    'grass': 'Grass',
    'rita': 'Grass',
    'imx': 'Immutable',
    'immutable': 'Immutable',
    'alephium': 'Alephium',
    'aleph-2': 'Alephium',
    'ritual': 'Ritual',
    'rit': 'Ritual',
    'numeraire': 'Numeraire',
    'nmr': 'Numeraire',
    'aegis': 'Aegis',
    'aioz-network': 'AIOZ Network',
    'aioz': 'AIOZ Network',
    'morpher': 'Morpher',
    'mph': 'Morpher',
    'spheron-network': 'Spheron',
    'spheron': 'Spheron',
    'flux-2': 'Flux',
    'flux': 'Flux',
    'kamino': 'Kamino',
    'kmno': 'Kamino',
    'alright': 'Alright',
    'opentensor': 'Opentensor',
    'targon': 'Targon',
    'sahara': 'Sahara AI',
    'sn50': 'Sahara AI',
    'sahara-2': 'Sahara AI',
    'alchemist': 'Alchemist AI',
    'alch': 'Alchemist AI',
    'alchemy': 'Alchemy',
    'alchemy-pay': 'Alchemy Pay',
    'ach': 'Alchemy Pay',
    'spectral': 'Spectral',
    'spec': 'Spectral',
    'cortex': 'Cortex',
    'ctxc': 'Cortex',
    'alethea-ai': 'Alethea AI',

    # === DePIN ===
    'helium': 'Helium',
    'hnt': 'Helium',
    'filecoin': 'Filecoin',
    'fil': 'Filecoin',
    'arweave': 'Arweave',
    'ar': 'Arweave',
    'ankr-network': 'Ankr Network',
    'ankr': 'Ankr',
    'livepeer': 'Livepeer',
    'lpt': 'Livepeer',
    'storj': 'Storj',
    'the-graph-2': 'The Graph',
    'pocket-network': 'Pocket Network',
    'pokt': 'Pocket Network',
    'iotex': 'IoTeX',
    'iotx': 'IoTeX',
    'mxc': 'MXC',
    'mx-c': 'MXC',
    'rom': 'ROM',
    'wax': 'WAX',
    'waxp': 'WAX',
    'hivemapper': 'Hivemapper',
    'honey': 'Hivemapper',
    'dimo': 'DIMO',
    'helium-mobile': 'Helium Mobile',
    'mobile': 'Helium Mobile',
    'helium-iot': 'Helium IoT',
    'helium-hotspot': 'Helium IoT',
    'flux': 'Flux',
    'flux-1': 'Flux',
    'flux-2': 'Flux',
    'golem': 'Golem',
    'glm': 'Golem',
    'ocean-protocol': 'Ocean Protocol',
    'ocean': 'Ocean Protocol',
    'render-2': 'Render',
    'sentinel': 'Sentinel',
    'dvpn': 'Sentinel',
    'crust-network': 'Crust Network',
    'cru': 'Crust',
    'crust': 'Crust Network',
    'phala': 'Phala Network',
    'pha': 'Phala',
    'ramp': 'Ramp',
    'ramp-2': 'Ramp',
    'ampleforth': 'Ampleforth',
    'ampl': 'Ampleforth',
    'polkastarter': 'Polkastarter',
    'pools': 'Polkastarter',
    'stargaze': 'Stargaze',
    'stars': 'Stargaze',

    # === Infrastructure ===
    'chainlink': 'Chainlink',
    'link': 'Chainlink',
    'api3': 'API3',
    'the-graph-3': 'The Graph',
    'graph': 'The Graph',
    'alchemy-pay-2': 'Alchemy Pay',
    'alchemy-2': 'Alchemy',
    'arkham': 'Arkham',
    'arkm': 'Arkham',
    'alchemy-token': 'Alchemy',
    'kryll': 'Kryll',
    'krl': 'Kryll',
    'gitcoin': 'Gitcoin',
    'gtc': 'Gitcoin',
    'alchemy-pay': 'Alchemy Pay',
    'ach': 'Alchemy Pay',
    'redstone': 'Redstone',
    'red': 'Redstone',
    'eoracle': 'eOracle',
    'or': 'eOracle',
    'band-protocol': 'Band Protocol',
    'band': 'Band Protocol',
    'dia': 'DIA',
    'dia-2': 'DIA',
    'api3-2': 'API3',
    'nvm': 'NVM',

    # === Gaming ===
    'gala': 'Gala Games',
    'enjincoin': 'Enjin Coin',
    'enj': 'Enjin',
    'axie-infinity': 'Axie Infinity',
    'axs': 'Axie Infinity',
    'sandbox': 'The Sandbox',
    'sand': 'The Sandbox',
    'decentraland': 'Decentraland',
    'mana': 'Decentraland',
    'imx-2': 'Immutable',
    'floki': 'Floki',
    'floki-2': 'Floki',
    'alien': 'AlienSwap',
    'alienswap': 'AlienSwap',
    'beam': 'Beam',
    'beam-2': 'Beam',
    'beam-3': 'Beam',
    'ronin': 'Ronin',
    'ron': 'Ronin',
    'magic-2': 'Magic Eden',
    'gala-2': 'Gala Games',
    'yield-guild-games': 'Yield Guild Games',
    'ygg': 'Yield Guild Games',
    'illuvium': 'Illuvium',
    'ilv': 'Illuvium',
    'gods-unchained': 'Gods Unchained',
    'gods': 'Gods Unchained',
    'smooth-love-potion': 'Smooth Love Potion',
    'slp': 'Smooth Love Potion',
    'my-neighbor-alice': 'My Neighbor Alice',
    'alice': 'My Neighbor Alice',
    'chromia': 'Chromia',
    'chr': 'Chromia',
    'superrare': 'SuperRare',
    'rare': 'SuperRare',
    'wax-2': 'WAX',
    'wax-3': 'WAX',

    # === RWA ===
    'ondo-finance-2': 'Ondo Finance',
    'ondo-2': 'Ondo',
    'ondo': 'Ondo Finance',
    'ondo-finance': 'Ondo Finance',
    'ondo-3': 'Ondo Finance',
    'ondo-global': 'Ondo Global',
    'ondo-global-finance': 'Ondo Global',
    'ondo-global-2': 'Ondo Global',
    'polymesh': 'Polymesh',
    'polyx': 'Polymesh',
    'centrifuge': 'Centrifuge',
    'cfg': 'Centrifuge',
    'goldfinch': 'Goldfinch',
    'gfi': 'Goldfinch',
    'maple': 'Maple',
    'mpl': 'Maple',
    'maker-2': 'Maker',
    'reserve-rights-token': 'Reserve',
    'rsr': 'Reserve',
    'truefi': 'TrueFi',
    'tru': 'TrueFi',
    'clearpool': 'Clearpool',
    'cpoo': 'Clearpool',
    'alchemix': 'Alchemix',
    'alcx': 'Alchemix',
    'landx-finance': 'LandX',
    'landx': 'LandX',

    # === DeSci ===
    'molecule': 'Molecule',
    'mol': 'Molecule',
    'vita-dao': 'VitaDAO',
    'vita': 'VitaDAO',
    'genomesdao': 'GenomesDAO',
    'genome': 'GenomesDAO',
    'biop': 'Biop',
    'aether-2': 'Aether',
    'aether': 'Aether',
    'aet': 'Aether',
    'antidote': 'Antidote',
    'antidote-2': 'Antidote',
    'antidote-3': 'Antidote',
    'antidote-4': 'Antidote',
    'agora': 'Agora',
    'agora-health': 'Agora Health',
    'aleo': 'Aleo',
    'aleo-2': 'Aleo',
    'zero': 'Zerobase',
    'zerobase': 'ZEROBASE',
    'zbt': 'ZEROBASE',
    'opentensor-2': 'Opentensor',
    'opentensor-3': 'Opentensor',

    # === ZK ===
    'mina-protocol': 'Mina Protocol',
    'mina': 'Mina Protocol',
    'mina-2': 'Mina Protocol',
    'midnight-3': 'Midnight',
    'night': 'Midnight',
    'nexus-4': 'Nexus',
    'nexus': 'Nexus',
    'nex': 'Nexus',
    'railgun': 'Railgun',
    'rail': 'Railgun',
    'railgun-2': 'Railgun',
    'railgun-3': 'Railgun',
    'horizen': 'Horizen',
    'zen': 'Horizen',
    'zencash': 'Horizen',
    'zcash': 'Zcash',
    'zec': 'Zcash',
    'zcash-2': 'Zcash',
    'zcash-3': 'Zcash',
    'oasis-network': 'Oasis Network',
    'rose': 'Oasis',
    'succinct': 'Succinct',
    'prove': 'Succinct',
    'lurk': 'Lurk',
    'risc-zero': 'RISC Zero',
    'risc-0': 'RISC Zero',
    'risc': 'RISC Zero',
    'aztec': 'Aztec',
    'aztec-2': 'Aztec',
    'aztec-3': 'Aztec',
    'noir': 'Noir',
    'ultrahonk': 'UltraHONK',
    'hints': 'Hints',
    'penumbra': 'Penumbra',
    'pen': 'Penumbra',
    'penumbra-2': 'Penumbra',
    'penumbra-3': 'Penumbra',
    'penumbra-4': 'Penumbra',
    'aegis-2': 'Aegis',
    'aegis-3': 'Aegis',
    'aegis-zk': 'Aegis ZK',
    'boundless': 'Boundless',
    'bound': 'Boundless',
    'zircuit': 'Zircuit',
    'zrc': 'Zircuit',
    'hyperliquid': 'Hyperliquid',
    'hype': 'Hyperliquid',
    'monad-2': 'Monad',
    'mon': 'Monad',
    'openzk': 'OpenZK',
    'openzk-2': 'OpenZK',

    # === Cross-cutting (Layer1/DePIN/AI) ===
    'kava-2': 'Kava',
    'kava-3': 'Kava',
    'kava-4': 'Kava',
    'kava-5': 'Kava',
    'kava-6': 'Kava',
    'kava-7': 'Kava',
    'kava-8': 'Kava',
    'kava-9': 'Kava',
    'kava-10': 'Kava',
    'humanity': 'Humanity',
    'humanity-protocol': 'Humanity Protocol',
    'h': 'Humanity Protocol',
    'h-2': 'Humanity',
    'world-id': 'World ID',
    'world': 'Worldcoin',
    'world-2': 'Worldcoin',
    'world-3': 'Worldcoin',
    'worldcoin-wld': 'Worldcoin',
    'wld-2': 'Worldcoin',

    # === Other common ===
    'usdc': 'USDC',
    'usdt': 'Tether',
    'tether': 'Tether',
    'dai': 'Dai',
    'wbtc': 'Wrapped Bitcoin',
    'weth': 'Wrapped Ether',
    'wsteth': 'Lido wstETH',
    'steth': 'Lido stETH',
    'ldo-2': 'Lido',
    'matic': 'Polygon',
    'matic-2': 'Polygon',
    'bnb': 'BNB',
    'busd': 'Binance USD',
    'leo': 'UNUS SED LEO',
    'okb': 'OKB',
    'cro': 'Cronos',
    'gt': 'GateToken',
    'ht': 'Huobi',
    'kcs': 'KuCoin',
    'mx': 'MX',
    'leo-2': 'UNUS SED LEO',
    'celo': 'Celo',
    'cel': 'Celo',
    'rose-2': 'Oasis',
    'rose-3': 'Oasis',
    'rose-4': 'Oasis',
    'rose-5': 'Oasis',
    'rose-6': 'Oasis',
    'rose-7': 'Oasis',
    'rose-8': 'Oasis',
    'rose-9': 'Oasis',
    'rose-10': 'Oasis',

    # Additional well-known DePIN
    'dimo-2': 'DIMO',
    'helium-2': 'Helium',
    'hnt-2': 'Helium',
    'mobile-2': 'Helium Mobile',
    'iotx-2': 'IoTeX',
    'iotx-3': 'IoTeX',
    'filecoin-2': 'Filecoin',
    'fil-2': 'Filecoin',
    'fil-3': 'Filecoin',
    'ar-2': 'Arweave',
    'ar-3': 'Arweave',
    'ar-4': 'Arweave',
    'honey-2': 'Hivemapper',
    'honey-3': 'Hivemapper',

    # Smart contract platforms
    'fantom': 'Fantom',
    'ftm': 'Fantom',
    'harmony': 'Harmony',
    'one': 'Harmony',
    'icon': 'ICON',
    'icx': 'ICON',
    'zilliqa': 'Zilliqa',
    'zil': 'Zilliqa',
    'hedera-hashgraph': 'Hedera',
    'hbar': 'Hedera',
    'iota': 'IOTA',
    'miota': 'IOTA',
    'flow': 'Flow',
    'waves': 'Waves',
    'waxp-2': 'WAX',

    # Privacy
    'secret': 'Secret',
    'scrt': 'Secret',
    'pirate-chain': 'Pirate Chain',
    'arrr': 'Pirate Chain',
    'ironfish': 'Iron Fish',
    'iron': 'Iron Fish',
    'oxen': 'Oxen',

    # Other
    'kava-11': 'Kava',
    'kava-12': 'Kava',
    'kava-13': 'Kava',
    'kava-14': 'Kava',
    'kava-15': 'Kava',
    'kava-16': 'Kava',
    'kava-17': 'Kava',
    'kava-18': 'Kava',
    'kava-19': 'Kava',
    'kava-20': 'Kava',
    'cosmos-2': 'Cosmos',
    'atom-2': 'Cosmos',
    'injective-2': 'Injective',
    'inj-2': 'Injective',
    'celestia-2': 'Celestia',
    'tia-2': 'Celestia',
    'osmosis': 'Osmosis',
    'osmo': 'Osmosis',
    'kava-21': 'Kava',
    'kava-22': 'Kava',
    'kava-23': 'Kava',
    'kava-24': 'Kava',
    'kava-25': 'Kava',
    'kava-26': 'Kava',
    'kava-27': 'Kava',
    'kava-28': 'Kava',
    'kava-29': 'Kava',
    'kava-30': 'Kava',

    # === Common known names mapping (final pass) ===
    'ethereum-name-service': 'Ethereum Name Service',
    'ens': 'Ethereum Name Service',
    'uniswap-2': 'Uniswap',
    'uniswap-3': 'Uniswap',
    'aave-2': 'Aave',
    'aave-3': 'Aave',
    'aave-v3': 'Aave V3',
    'curve-2': 'Curve DAO',
    'curve-3': 'Curve DAO',
    'curve': 'Curve DAO',
    'makerdao': 'MakerDAO',
    'maker-3': 'Maker',
    'maker-4': 'Maker',
    'sushi-2': 'SushiSwap',
    'sushi-3': 'SushiSwap',
    'uniswap-v3': 'Uniswap V3',
    'uniswap-v2': 'Uniswap V2',
    'curve-dao': 'Curve DAO',
    'convex': 'Convex',
    'convex-2': 'Convex',
    'balancer-2': 'Balancer',
    'balancer-3': 'Balancer',
    'lido-2': 'Lido',
    'lido-3': 'Lido',
    'rocket-pool-2': 'Rocket Pool',
    'rocket-pool-3': 'Rocket Pool',
    'yearn': 'Yearn.finance',
    'yearn-2': 'Yearn.finance',
    'yearn-vault': 'Yearn.finance',
    'pancakeswap': 'PancakeSwap',
    'pancakeswap-2': 'PancakeSwap',
    'pancake': 'PancakeSwap',

    # === Problematic inherited cases (final fix) ===
    'franklin-templeton': 'Franklin Templeton',
    'benji': 'BENJI',
    'mantra-dao': 'MANTRA DAO',
    'mantra': 'MANTRA',
    'realio-network': 'Realio',
    'realio': 'Realio',
    'rio': 'Realio',
    'ipfs': 'IPFS',
    'filecoin-2': 'Filecoin',
    'filecoin-3': 'Filecoin',
    'livepeer-2': 'Livepeer',
    'livepeer-3': 'Livepeer',
    'storj-2': 'Storj',
    'storj-3': 'Storj',
    'dimo-3': 'DIMO',
    'dimo-4': 'DIMO',
    'helium-3': 'Helium',
    'helium-4': 'Helium',
    'hnt-3': 'Helium',
    'mobile-3': 'Helium Mobile',
    'mobile-4': 'Helium Mobile',
    'mobile-5': 'Helium Mobile',
    'iotx-4': 'IoTeX',
    'iotx-5': 'IoTeX',
    'ar-5': 'Arweave',
    'ar-6': 'Arweave',
    'ar-7': 'Arweave',
    'honey-4': 'Hivemapper',
    'honey-5': 'Hivemapper',
    'honey-6': 'Hivemapper',
    'flux-3': 'Flux',
    'flux-4': 'Flux',
    'flux-5': 'Flux',
    'crust-2': 'Crust Network',
    'crust-3': 'Crust Network',
    'crust-4': 'Crust Network',
    'crust-5': 'Crust Network',
    'phala-2': 'Phala Network',
    'phala-3': 'Phala Network',
    'ramp-3': 'Ramp',
    'ramp-4': 'Ramp',
    'ramp-5': 'Ramp',

    # === Generated quality improvements ===
    'binancecoin': 'BNB',
    'bnb-2': 'BNB',
    'bnb-3': 'BNB',
    'chaingpt': 'ChainGPT',
    'cgpt': 'ChainGPT',
    'chain-gpt': 'ChainGPT',
    'chain-gpt-2': 'ChainGPT',
    'gamefi': 'GameFi',
    'gfi-2': 'GameFi',
    'iexec-rlc': 'iExec RLC',
    'iexec': 'iExec',
    'rlc': 'iExec RLC',
    'klima-dao': 'KlimaDAO',
    'klima': 'KlimaDAO',
    'lido-dao': 'Lido DAO',
    'lido-dao-2': 'Lido DAO',
    'cerebrumdao': 'CerebrumDAO',
    'neuro': 'CerebrumDAO',
    'corusdao': 'CorusDAO',
    'cor': 'CorusDAO',
    'morpheusai': 'Morpheus',
    'morpheus': 'Morpheus',
    'morpher': 'Morpher',
    'mph': 'Morpher',
    'injective-protocol': 'Injective',
    'inj-3': 'Injective',
    'matrixport-rwa': 'Matrixport',
    'matrixport': 'Matrixport',
    'matrixport-2': 'Matrixport',
    'mta': 'Matrixport',
    'moss-carbon-credit': 'Moss',
    'mco2': 'Moss',
    'mountain-protocol': 'Mountain Protocol',
    'usdm': 'Mountain Protocol',
    'pokt-network': 'Pocket Network',
    'pokt-2': 'Pocket Network',
    'pocket-network-2': 'Pocket Network',
    'nxyz': 'NXYZ',
    'cryodao': 'CryoDAO',
    'cryo': 'CryoDAO',
    'dao-2': 'CryoDAO',
    'valleydao': 'ValleyDAO',
    'grow': 'ValleyDAO',
    'singularitydao': 'SingularityDAO',
    'sdao': 'SingularityDAO',
    'layerzero': 'LayerZero',
    'zro': 'LayerZero',
    'lyra-finance': 'Lyra Finance',
    'lyra-2': 'Lyra',
    'morpher-2': 'Morpher',
    'redstone-finance': 'Redstone',
    'red-2': 'Redstone',
    'red-3': 'Redstone',
    'openeden': 'OpenEden',
    'tbill': 'OpenEden',
    'tangible': 'Tangible',
    'tngbl': 'Tangible',
    'tangible-2': 'Tangible',
    'tether-gold': 'Tether Gold',
    'xaut': 'Tether Gold',
    'realt-coin': 'RealT',
    'realt': 'RealT',
    'sp-global': 'S&P Global',
    'spgi': 'S&P Global',
    'superstate': 'Superstate',
    'ustb': 'Superstate',
    'traditional-finance': 'Traditional Finance',
    'trfi': 'Traditional Finance',
    'smart-coin': 'SmartCoin',
    'smart': 'SmartCoin',
    'subsquid': 'Subsquid',
    'sqd': 'Subsquid',
    'subsquid-2': 'Subsquid',
    'genobank': 'GenoBank',
    'gene': 'GenoBank',
    'hashnote': 'Hashnote',
    'usyc': 'Hashnote',
    'matrixdock': 'Matrixdock',
    'stbt': 'Matrixdock',
    'junca-cash': 'Junca Cash',
    'jca': 'Junca Cash',
    'trademate': 'Trademate',
    'trdm': 'Trademate',
    'playdapp': 'PlayDapp',
    'pda': 'PlayDapp',
    'plume-network': 'Plume',
    'plume': 'Plume',
    'plume-2': 'Plume',
    'polymath': 'Polymath',
    'poly-2': 'Polymath',
    'polynomial': 'Polynomial',
    'origintrail': 'OriginTrail',
    'trac': 'OriginTrail',
    'oasys': 'Oasys',
    'oas': 'Oasys',
    'oasys-2': 'Oasys',
    'lyra-finance-2': 'Lyra Finance',
    'rocket-pool-eth': 'Rocket Pool ETH',
    'rpl-2': 'Rocket Pool',
    'rocket-pool-eth-2': 'Rocket Pool ETH',
    'rari': 'Rari',
    'rari-2': 'Rari',
    'raydium': 'Raydium',
    'ray': 'Raydium',
    'siacoin': 'Siacoin',
    'sc': 'Siacoin',
    'sc-2': 'Siacoin',
    'sapien': 'Sapien',
    'sapien-2': 'Sapien',
    'securitize': 'Securitize',
    'swarm': 'Swarm',
    'bzz': 'Swarm',
    'synapse': 'Synapse',
    'syn': 'Synapse',
    'synapse-2': 'Synapse',
    'story-protocol': 'Story Protocol',
    'ip-2': 'Story Protocol',
    'star-atlas': 'Star Atlas',
    'atlas': 'Star Atlas',
    'the-sandbox': 'The Sandbox',
    'sand-2': 'The Sandbox',
    'sand-3': 'The Sandbox',
    'tenderly': 'Tenderly',
    'tnd': 'Tenderly',
    'theta': 'Theta',
    'theta-2': 'Theta',
    'tokenfi': 'TokenFi',
    'token': 'TokenFi',
    'toucan-protocol': 'Toucan Protocol',
    'bct': 'Toucan Protocol',
    'vechain': 'VeChain',
    'vet': 'VeChain',
    'vechain-2': 'VeChain',
    'venice-token': 'Venice Token',
    'vvv': 'Venice Token',
    'venus': 'Venus',
    'xvs': 'Venus',
    'wayru': 'Wayru',
    'wayru-2': 'Wayru',
    'weatherxm': 'WeatherXM',
    'wxm': 'WeatherXM',
    'walletconnect': 'WalletConnect',
    'wc': 'WalletConnect',
    'world-mobile-token': 'World Mobile Token',
    'wmtx': 'World Mobile Token',
    'world-mobile-token-2': 'World Mobile Token',
    'zetachain': 'ZetaChain',
    'zeta': 'ZetaChain',
    'zetachain-2': 'ZetaChain',
    'zeta-2': 'ZetaChain',
    'zero-gravity': '0G',
    '0g': '0G',
    'zero-gravity-2': '0G',
    'peaq': 'peaq',
    'peaq-2': 'peaq',
    'pixels': 'Pixels',
    'pixel': 'Pixels',
    'pixels-2': 'Pixels',
    'pollen-mobile': 'Pollen Mobile',
    'pcn': 'Pollen Mobile',
    'powerpod': 'PowerPod',
    'pod': 'PowerPod',
    'quicknode': 'QuickNode',
    'qnode': 'QuickNode',
    'quickswap': 'QuickSwap',
    'quick': 'QuickSwap',
    'redbelly-network': 'Redbelly Network',
    'rbnt': 'Redbelly Network',
    'ribbon-finance': 'Ribbon Finance',
    'rbn': 'Ribbon Finance',
    'researchhub': 'ResearchHub',
    'rsc': 'ResearchHub',
    'thingsix': 'THINKIx',
    'thix': 'THINKIx',
    'thirdweb': 'thirdweb',
    'thirdweb-2': 'thirdweb',
    'origin-dollar': 'Origin Dollar',
    'ousd': 'Origin Dollar',
    'orderly': 'Orderly',
    'order': 'Orderly',
    'ripple': 'XRP',
    'xrp': 'XRP',
    'xrp-2': 'XRP',
    'rwa-x': 'RWA X',
    'rwax': 'RWA X',
    'sapien-2': 'Sapien',
    'sahara-ai-2': 'Sahara AI',
    'sahara-2': 'Sahara AI',
    'seed-photo': 'Seed Photo',
    'seed-2': 'Seed Photo',
    'sei-network': 'Sei',
    'sei-2': 'Sei',
    'sentient': 'Sentient',
    'sent': 'Sentient',
    'sentient-2': 'Sentient',
    'shrapnel': 'Shrapnel',
    'shrap': 'Shrapnel',
    'singularitynet': 'SingularityNET',
    'agix': 'SingularityNET',
    'skale': 'SKALE',
    'skl': 'SKALE',
    'sophon': 'Sophon',
    'soph': 'Sophon',
    'spark': 'Spark',
    'spk': 'Spark',
    'stargate': 'Stargate',
    'stg': 'Stargate',
    'stargate-2': 'Stargate',
    'streamr': 'Streamr',
    'data-2': 'Streamr',
    'swissborg': 'SwissBorg',
    'borg': 'SwissBorg',
    'swissborg-2': 'SwissBorg',
    'synesis-one': 'Synesis One',
    'sns': 'Synesis One',
    'the-open-network': 'The Open Network',
    'ton': 'The Open Network',
    'ton-2': 'The Open Network',
    'vana': 'Vana',
    'vana-2': 'Vana',
    'virtuals-protocol': 'Virtuals Protocol',
    'virtual': 'Virtuals Protocol',
    'wrapped-stx': 'Wrapped STX',
    'wstx': 'Wrapped STX',
    'xana': 'Xana',
    'xeta': 'Xana',
}


# Защищённый fallback: акронимы/тикеры, которые должны остаться в upper-case
KNOWN_TICKERS = {
    '1inch', 'api3', 'aevo', 'gmx', 'mxc', 'neo', 'sui', 'uma', 'wax', 'waxp', 'xai', 'bob',
    'eos', 'dydx', 'dodo', 'yfii', 'yfi', 'ach', 'ach2', 'ach3', 'ach4', 'achi', 'achv',
    'aave', 'aevo', 'ario', 'aurora', 'aevo', 'aave', 'api3', 'aethir', 'ath', 'atlas',
    'arkm', 'alice', 'alc', 'alch', 'aevo', 'agi', 'alpha', 'alpha-finance', 'alcx',
    'alice', 'alcx', 'alchemix', 'alcx', 'aleph', 'aleph-im', 'alex', 'alcx', 'alice',
    'alcx', 'alcx', 'alcx', 'alcx', 'alcx',
}


# ---------------------------------------------------------------------------
# Утилиты для slug-to-title
# ---------------------------------------------------------------------------
def is_likely_acrionym(s: str) -> bool:
    """Проверяет, является ли строка акронимом (напр. API3, GMX, USDC)."""
    if len(s) <= 5 and s.isupper() and s.isalpha():
        return True
    return False


def is_likely_ticker(s: str) -> bool:
    """Проверяет, является ли строка тикером (3-5 букв в нижнем регистре)."""
    return s in KNOWN_TICKERS


def smart_capitalize(part: str) -> str:
    """Умная капитализация для части slug."""
    # Число как есть
    if part.isdigit():
        return part
    # Известный тикер/акроним
    if is_likely_acrionym(part) or is_likely_ticker(part):
        return part.upper()
    # Слишком короткое слово (1-2 буквы) - upper
    if len(part) <= 2 and part.isalpha():
        upper_part = part.upper()
        if upper_part in {'AI', 'IO', 'US', 'EU', 'UK', 'V2', 'V3'}:
            return upper_part
    # Обычное слово - Title Case
    return part.capitalize()


def slug_to_display(slug: str) -> str:
    """Преобразует slug в человеко-читаемое имя."""
    # Разбиваем по дефисам и подчёркиваниям
    parts = re.split(r'[-_]', slug)
    return ' '.join(smart_capitalize(p) for p in parts if p)


def extract_coingecko_disambiguator(pid: str) -> tuple:
    """
    Извлекает disambiguator CoinGecko вида -2, -3, -4
    Возвращает (base_id, disambig) или (pid, None).
    """
    m = re.match(r'^(.+?)-(\d+)$', pid)
    if m:
        return m.group(1), m.group(2)
    return pid, None


def should_use_existing_name(name: str, pid: str, symbol: str = '') -> bool:
    """Определяет, можно ли использовать существующее name как display_name.

    Правила:
    1. name должно быть непустым и не равным id.
    2. name не должно быть в нижнем регистре с дефисами (это slug).
    3. name не должно быть "коротким ticker-подобным" словом ≤ 5 букв в нижнем регистре
       (напр. "benji", "mantra", "realio" — это символы/slugs, а не полные имена).
    4. name должно содержать хотя бы одну заглавную букву, чтобы считаться "Title Case".
    5. name не должно совпадать с symbol проекта (тогда это просто символ).
    """
    if not name:
        return False
    if name == pid:
        return False
    # Slug формат — отвергаем
    if re.match(r'^[a-z0-9-]+$', name) and '-' in name:
        return False
    # Очень короткое имя в нижнем регистре — вероятно, символ/часть slug
    if len(name) <= 5 and name.islower() and name.isalpha():
        return False
    # Полностью в нижнем регистре и длинное — slug
    if name.islower() and len(name) > 5:
        return False
    # Если name совпадает с symbol — это символ, не имя
    if symbol and name.lower() == symbol.lower():
        return False
    # Если name содержит хотя бы одну заглавную букву — это Title Case
    if any(c.isupper() for c in name):
        return True
    return False


# ---------------------------------------------------------------------------
# Главная логика
# ---------------------------------------------------------------------------
def enrich_display_names(projects: list) -> dict:
    """Обогащает список проектов полями display_name, display_name_source, display_name_provenance."""
    stats = {
        'curated': 0,
        'inherited': 0,
        'generated': 0,
        'fallback_disambiguator': 0,
        'unchanged': 0,
    }
    examples = {'curated': [], 'inherited': [], 'generated': []}

    for p in projects:
        pid = p.get('id', '')
        old_name = p.get('name', '') or ''
        symbol = p.get('symbol', '') or ''

        # 1. Проверяем курируемую таблицу
        if pid in KNOWN_NAMES:
            display_name = KNOWN_NAMES[pid]
            p['display_name'] = display_name
            p['display_name_source'] = 'curated'
            stats['curated'] += 1
            if len(examples['curated']) < 5:
                examples['curated'].append((pid, old_name, display_name))
            continue

        # 2. Проверяем disambiguator (-2, -3, -4) — ищем base
        base_pid, disambig = extract_coingecko_disambiguator(pid)
        if disambig and base_pid in KNOWN_NAMES:
            base_name = KNOWN_NAMES[base_pid]
            # Если base name уже содержит цифру (напр. "Aave V3"), не дублируем
            if not re.search(r'\d+$', base_name):
                display_name = f"{base_name} {disambig}"
            else:
                display_name = base_name
            p['display_name'] = display_name
            p['display_name_source'] = 'curated'
            p['display_name_provenance'] = f'curated_via_disambiguator_from_{base_pid}'
            stats['curated'] += 1
            stats['fallback_disambiguator'] += 1
            if len(examples['curated']) < 8:
                examples['curated'].append((pid, old_name, display_name))
            continue

        # 3. Если существующее name уже нормальное, используем его
        if should_use_existing_name(old_name, pid, symbol):
            p['display_name'] = old_name
            p['display_name_source'] = 'inherited'
            stats['inherited'] += 1
            if len(examples['inherited']) < 5:
                examples['inherited'].append((pid, old_name, old_name))
            continue

        # 4. Fallback: slug-to-title
        display_name = slug_to_display(pid)
        # Защита: если результат == pid, пробуем акроним
        if display_name.lower() == pid.lower() and not any(c.isupper() for c in display_name):
            # Возможно это тикер — попробуем upper
            if 2 <= len(pid) <= 5 and pid.isalpha():
                display_name = pid.upper()
        p['display_name'] = display_name
        p['display_name_source'] = 'generated'
        p['display_name_provenance'] = 'smart_slug_to_title'
        stats['generated'] += 1
        if len(examples['generated']) < 5:
            examples['generated'].append((pid, old_name, display_name))

    return {'stats': stats, 'examples': examples}


# ---------------------------------------------------------------------------
# Точка входа
# ---------------------------------------------------------------------------
def main():
    SRC = 'public/data/projects_enriched.json'
    OUT = 'public/data/projects_enriched.json'
    BACKUP = f'backups/projects_enriched_pre_display_name_{datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")}.json'

    print('=' * 80)
    print('PAYD DISPLAY NAME ENRICHMENT (Stage 1)')
    print('=' * 80)
    print()

    with open(SRC, 'r', encoding='utf-8') as f:
        data = json.load(f)

    projects = data['projects']
    print(f'Source: {SRC}')
    print(f'Projects: {len(projects)}')
    print(f'Curated names table size: {len(KNOWN_NAMES)}')
    print()

    # Бэкап
    import os
    os.makedirs('backups', exist_ok=True)
    with open(BACKUP, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'[OK] Backup saved: {BACKUP}')
    print()

    # Обогащение
    result = enrich_display_names(projects)
    stats = result['stats']
    examples = result['examples']

    # Проверка
    missing = sum(1 for p in projects if not p.get('display_name'))
    same_as_id = sum(1 for p in projects if p.get('display_name', '').lower() == p.get('id', '').lower())
    duplicates = len(projects) - len(set(p.get('display_name', '') for p in projects))
    unchanged_original = sum(1 for p in projects if p.get('display_name') == p.get('name'))

    print('--- Statistics ---')
    for k, v in stats.items():
        print(f'  {k:30s} {v}')
    print()
    print(f'  missing display_name:        {missing}')
    print(f'  display_name == id (lower):  {same_as_id}')
    print(f'  duplicate display_names:     {duplicates}')
    print(f'  display_name == name:        {unchanged_original}')
    print()

    print('--- Examples (curated) ---')
    for pid, old, new in examples['curated']:
        print(f'  {pid:25s} {old!r:30s} -> {new!r}')
    print()
    print('--- Examples (inherited) ---')
    for pid, old, new in examples['inherited']:
        print(f'  {pid:25s} {old!r:30s} -> {new!r}')
    print()
    print('--- Examples (generated) ---')
    for pid, old, new in examples['generated']:
        print(f'  {pid:25s} {old!r:30s} -> {new!r}')
    print()

    # Обновим метаданные dataset_version
    data['display_name_enrichment'] = {
        'applied_at': datetime.now(timezone.utc).isoformat(),
        'curated_size': len(KNOWN_NAMES),
        'stats': stats,
        'missing': missing,
        'same_as_id': same_as_id,
        'duplicate_display_names': duplicates,
    }

    # Сохранение
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'[OK] Wrote {OUT}')

    # Sanity check — выведем первые 30 результатов
    print()
    print('--- Sanity check (first 30) ---')
    for p in projects[:30]:
        print(f"  {p.get('id'):25s} name={p.get('name','')!r:25s} -> display_name={p.get('display_name','')!r:30s} src={p.get('display_name_source','')}")

    return stats


if __name__ == '__main__':
    main()
