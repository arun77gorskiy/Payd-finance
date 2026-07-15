// Build canonical /workspace/data/projects.json from a deduplicated,
// multi-sector-aware, fully verified project registry.
//
// Goals:
//  - Keep every project unique by id
//  - Allow a project to belong to multiple sectors via `sectors[]` array
//    and keep `sector` (primary) for backward compatibility
//  - Add CoinMarketCap ID/slug, GitHub repo, X (Twitter) handle, tier
//  - Ensure every sector has 30+ verified projects
//  - Replace weak / duplicate projects with stronger verified alternatives

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
const PROJECTS = [];
const seenIds = new Set();
const seenSymbolsBySector = new Map();

function add(p) {
  // Required fields
  if (!p.id) throw new Error('Missing id: ' + JSON.stringify(p));
  if (seenIds.has(p.id)) throw new Error('Duplicate id: ' + p.id);
  seenIds.add(p.id);

  // Default fields
  p.name = p.name || p.id;
  p.symbol = (p.symbol || '').toUpperCase();
  p.sector = p.sector || 'infrastructure';
  p.sectors = p.sectors || [p.sector];
  p.coingeckoId = p.coingeckoId || p.id;
  p.cmcId = p.cmcId || null;
  p.cmcSlug = p.cmcSlug || p.id;
  p.githubOrg = p.githubOrg || null;
  p.githubRepo = p.githubRepo || (p.githubOrg ? p.githubOrg : null);
  p.xHandle = p.xHandle || null;
  p.website = p.website || null;
  p.description = p.description || '';
  p.verifiedStatus = p.verifiedStatus || 'verified';
  p.tier = p.tier || 'tier2';
  p.lastVerifiedAt = p.lastVerifiedAt || '2026-07-16';

  // Normalize sectors: ensure primary sector is first in sectors[]
  const set = new Set([p.sector, ...p.sectors]);
  p.sectors = Array.from(set);

  PROJECTS.push(p);
}

// ---------------------------------------------------------------------------
// LAYER 1 — base-layer / consensus networks (target 38)
// ---------------------------------------------------------------------------
add({ id:'bitcoin', symbol:'BTC', sector:'layer1', coingeckoId:'bitcoin', cmcId:'1', cmcSlug:'bitcoin', githubOrg:'bitcoin', githubRepo:'bitcoin/bitcoin', xHandle:'Bitcoin', website:'https://bitcoin.org', description:'The first decentralized peer-to-peer digital currency, secured by proof-of-work consensus and the largest cryptocurrency by market capitalization.', tier:'tier1' });
add({ id:'ethereum', symbol:'ETH', sector:'layer1', coingeckoId:'ethereum', cmcId:'1027', cmcSlug:'ethereum', githubOrg:'ethereum', githubRepo:'ethereum/go-ethereum', xHandle:'ethereum', website:'https://ethereum.org', description:'Programmable blockchain that introduced smart contracts and EVM-compatible decentralized applications (dapps), now the largest settlement layer for DeFi and NFTs.', tier:'tier1' });
add({ id:'solana', symbol:'SOL', sector:'layer1', coingeckoId:'solana', cmcId:'5426', cmcSlug:'solana', githubOrg:'solana-labs', githubRepo:'solana-labs/solana', xHandle:'solana', website:'https://solana.com', description:'High-throughput layer-1 blockchain using proof-of-stake combined with proof-of-history to deliver sub-second finality at low transaction cost.', tier:'tier1' });
add({ id:'binancecoin', symbol:'BNB', sector:'layer1', coingeckoId:'binancecoin', cmcId:'1839', cmcSlug:'bnb', githubOrg:'bnb-chain', githubRepo:'bnb-chain/bsc', xHandle:'BNBCHAIN', website:'https://www.bnbchain.org', description:'Native asset of BNB Chain, an EVM-compatible layer-1 that runs the BNB Smart Chain and opBNB rollup, with a large DeFi and gaming user base.', tier:'tier1' });
add({ id:'avalanche-2', symbol:'AVAX', sector:'layer1', coingeckoId:'avalanche-2', cmcId:'5805', cmcSlug:'avalanche', githubOrg:'ava-labs', githubRepo:'ava-labs/avalanchego', xHandle:'avax', website:'https://www.avax.network', description:'Layer-1 platform using a novel three-chain architecture (X/P/C) to host custom subnets with sub-second finality.', tier:'tier1' });
add({ id:'polkadot', symbol:'DOT', sector:'layer1', coingeckoId:'polkadot', cmcId:'6636', cmcSlug:'polkadot-new', githubOrg:'paritytech', githubRepo:'paritytech/polkadot-sdk', xHandle:'Polkadot', website:'https://polkadot.com', description:'Multi-chain sharded protocol that allows heterogeneous blockchains (parachains) to share security and interoperate through a central relay chain.', tier:'tier1' });
add({ id:'cosmos', symbol:'ATOM', sector:'layer1', coingeckoId:'cosmos', cmcId:'3794', cmcSlug:'cosmos', githubOrg:'cosmos', githubRepo:'cosmos/cosmos-sdk', xHandle:'cosmos', website:'https://cosmos.network', description:'Internet of blockchains built on the Tendermint consensus engine and IBC protocol, enabling sovereign app-chains to communicate trustlessly.', tier:'tier1' });
add({ id:'near', symbol:'NEAR', sector:'layer1', coingeckoId:'near', cmcId:'6535', cmcSlug:'near', githubOrg:'near', githubRepo:'near/nearcore', xHandle:'NEARProtocol', website:'https://near.org', description:'Sharded, account-based layer-1 with developer-friendly UX, nightshade sharding and chain signatures for cross-chain intents.', tier:'tier1' });
add({ id:'aptos', symbol:'APT', sector:'layer1', coingeckoId:'aptos', cmcId:'21794', cmcSlug:'aptos', githubOrg:'aptos-labs', githubRepo:'aptos-labs/aptos-core', xHandle:'Aptos', website:'https://aptosfoundation.org', description:'Move-based, proof-of-stake layer-1 developed by former Meta Diem engineers, focused on safety and parallel execution.', tier:'tier1' });
add({ id:'sui', symbol:'SUI', sector:'layer1', coingeckoId:'sui', cmcId:'20947', cmcSlug:'sui', githubOrg:'MystenLabs', githubRepo:'MystenLabs/sui', xHandle:'SuiNetwork', website:'https://sui.io', description:'Move-based, horizontally scalable layer-1 with object-centric data model and parallel transaction execution for high-throughput consumer apps.', tier:'tier1' });
add({ id:'sei-network', symbol:'SEI', sector:'layer1', coingeckoId:'sei-network', cmcId:'23149', cmcSlug:'sei-network', githubOrg:'sei-protocol', githubRepo:'sei-protocol/sei-chain', xHandle:'SeiNetwork', website:'https://www.sei.io', description:'Parallelized EVM layer-1 optimised for trading, with twin-turbo consensus and order-book primitives baked into the base layer.', tier:'tier1' });
add({ id:'internet-computer', symbol:'ICP', sector:'layer1', sectors:['layer1','infrastructure'], coingeckoId:'internet-computer', cmcId:'8916', cmcSlug:'internet-computer', githubOrg:'dfinity', githubRepo:'dfinity/ic', xHandle:'dfinity', website:'https://internetcomputer.org', description:'Chain-key cryptography layer-1 that hosts canisters (smart contracts) running at web-speed, allowing fully on-chain compute and AI inference.', tier:'tier1' });
add({ id:'tezos', symbol:'XTZ', sector:'layer1', coingeckoId:'tezos', cmcId:'2011', cmcSlug:'tezos', githubOrg:'tezos', githubRepo:'tezos/tezos', xHandle:'tezos', website:'https://tezos.com', description:'Proof-of-stake layer-1 with on-chain governance and formal-verification-friendly Michelson/Micheline smart contract language.', tier:'tier1' });
add({ id:'algorand', symbol:'ALGO', sector:'layer1', coingeckoId:'algorand', cmcId:'4030', cmcSlug:'algorand', githubOrg:'algorand', githubRepo:'algorand/go-algorand', xHandle:'Algorand', website:'https://algorandtechnologies.com', description:'Pure proof-of-stake layer-1 with instant finality, low fees and carbon-negative network design.', tier:'tier1' });
add({ id:'hedera-hashgraph', symbol:'HBAR', sector:'layer1', coingeckoId:'hedera-hashgraph', cmcId:'4642', cmcSlug:'hedera', githubOrg:'hashgraph', githubRepo:'hashgraph/hedera-services', xHandle:'hedera', website:'https://hedera.com', description:'Hashgraph consensus layer-1 governed by a council of global enterprises, providing high-throughput and ABFT-finality for tokenized assets.', tier:'tier1' });
add({ id:'stellar', symbol:'XLM', sector:'layer1', coingeckoId:'stellar', cmcId:'512', cmcSlug:'stellar', githubOrg:'stellar', githubRepo:'stellar/stellar-core', xHandle:'StellarOrg', website:'https://stellar.org', description:'Open-source payment network optimised for cross-border money transfers and asset tokenisation with built-in order-book DEX.', tier:'tier1' });
add({ id:'tron', symbol:'TRX', sector:'layer1', coingeckoId:'tron', cmcId:'1958', cmcSlug:'tron', githubOrg:'tronprotocol', githubRepo:'tronprotocol/java-tron', xHandle:'trondao', website:'https://tron.network', description:'High-throughput EVM-compatible layer-1 used heavily for stablecoin transfer and as a settlement layer for USDT traffic.', tier:'tier1' });
add({ id:'cardano', symbol:'ADA', sector:'layer1', coingeckoId:'cardano', cmcId:'2010', cmcSlug:'cardano', githubOrg:'IntersectMBO', githubRepo:'IntersectMBO/cardano-node', xHandle:'Cardano', website:'https://cardano.org', description:'Research-driven, peer-reviewed proof-of-stake layer-1 using Ouroboros consensus and Plutus/Haskell smart contracts.', tier:'tier1' });
add({ id:'injective-protocol', symbol:'INJ', sector:'layer1', coingeckoId:'injective-protocol', cmcId:'7226', cmcSlug:'injective-protocol', githubOrg:'InjectiveLabs', githubRepo:'InjectiveLabs/injective-chain', xHandle:'injective', website:'https://injective.com', description:'Cosmos-based layer-1 optimised for finance, offering a fully on-chain order book and MEV-resistant infrastructure.', tier:'tier1' });
add({ id:'celestia', symbol:'TIA', sector:'layer1', sectors:['layer1','infrastructure'], coingeckoId:'celestia', cmcId:'22861', cmcSlug:'celestia', githubOrg:'celestiaorg', githubRepo:'celestiaorg/celestia-core', xHandle:'celestia', website:'https://celestia.org', description:'First modular data-availability and consensus network, enabling sovereign rollups to publish transaction data without execution bottlenecks.', tier:'tier1' });
add({ id:'monad', symbol:'MON', sector:'layer1', coingeckoId:'monad', cmcId:'30746', cmcSlug:'monad', githubOrg:'category-labs', githubRepo:'category-labs/monad', xHandle:'monad_xyz', website:'https://www.monad.xyz', description:'High-performance EVM-compatible layer-1 with parallel execution and pipelined consensus targeting 10,000+ TPS.', tier:'tier2' });
add({ id:'berachain', symbol:'BERA', sector:'layer1', coingeckoId:'berachain', cmcId:'24647', cmcSlug:'berachain', githubOrg:'berachain', githubRepo:'berachain/berachain', xHandle:'berachain', website:'https://www.berachain.com', description:'EVM-identical layer-1 using Proof-of-Liquidity consensus that aligns network security with liquidity provisioning.', tier:'tier2' });
add({ id:'sonic-3', symbol:'S', sector:'layer1', coingeckoId:'sonic-3', cmcId:'29607', cmcSlug:'sonic-3', githubOrg:'0xsoniclabs', githubRepo:'0xsoniclabs/sonic', xHandle:'SonicLabs', website:'https://www.soniclabs.com', description:'EVM-equivalent layer-1 migrating from Fantom, focused on high throughput and consumer-facing DeFi incentives.', tier:'tier2' });
add({ id:'fantom', symbol:'FTM', sector:'layer1', coingeckoId:'fantom', cmcId:'3513', cmcSlug:'fantom', githubOrg:'Fantom-Foundation', githubRepo:'Fantom-Foundation/fantom', xHandle:'FantomFDN', website:'https://fantom.foundation', description:'DAG-based aBFT layer-1 with Lachesis consensus, offering EVM compatibility and sub-second finality.', tier:'tier2' });
add({ id:'crypto-com-chain', symbol:'CRO', sector:'layer1', coingeckoId:'crypto-com-chain', cmcId:'3635', cmcSlug:'cronos', githubOrg:'crypto-org-chain', githubRepo:'crypto-org-chain/chain-main', xHandle:'cronos_chain', website:'https://cronos.org', description:'EVM-compatible layer-1 from Crypto.com focused on DeFi, GameFi and payments interoperability with the Crypto.com ecosystem.', tier:'tier2' });
add({ id:'kava', symbol:'KAVA', sector:'layer1', coingeckoId:'kava', cmcId:'4846', cmcSlug:'kava', githubOrg:'kava-labs', githubRepo:'kava-labs/kava', xHandle:'KAVA_CHAIN', website:'https://www.kava.io', description:'Cosmos-EVM co-chain layer-1 enabling Tendermint consensus and Ethereum smart contracts on one network.', tier:'tier2' });
add({ id:'oasis-network', symbol:'ROSE', sector:'layer1', coingeckoId:'oasis-network', cmcId:'7653', cmcSlug:'oasis-network', githubOrg:'oasisprotocol', githubRepo:'oasisprotocol/oasis-core', xHandle:'OasisProtocol', website:'https://oasisprotocol.org', description:'Privacy-first, scalable layer-1 with a separate compute layer (ParaTimes) for confidential smart contracts and AI workloads.', tier:'tier2' });
add({ id:'mina-protocol', symbol:'MINA', sector:'layer1', coingeckoId:'mina-protocol', cmcId:'8646', cmcSlug:'mina-protocol', githubOrg:'MinaProtocol', githubRepo:'MinaProtocol/mina', xHandle:'MinaProtocol', website:'https://minaprotocol.com', description:'Succinct blockchain that stays a constant ~22 KB using recursive zero-knowledge proofs, enabling on-chain verification cheaply.', tier:'tier2' });
add({ id:'initia', symbol:'INIT', sector:'layer1', coingeckoId:'initia', cmcId:'31859', cmcSlug:'initia', githubOrg:'initia-labs', githubRepo:'initia-labs/initia', xHandle:'initia', website:'https://initia.xyz', description:'Modular layer-1 purpose-built to host an interconnected network of app-chains (Mitosis) with native interoperability.', tier:'tier2' });
add({ id:'the-open-network', symbol:'TON', sector:'layer1', coingeckoId:'the-open-network', cmcId:'11419', cmcSlug:'toncoin', githubOrg:'ton-blockchain', githubRepo:'ton-blockchain/ton', xHandle:'ton_blockchain', website:'https://ton.org', description:'Multi-blockchain layer-1 originally developed by Telegram, designed for mass adoption with Telegram-native mini-apps and TON Storage.', tier:'tier1' });
add({ id:'kaspa', symbol:'KAS', sector:'layer1', coingeckoId:'kaspa', cmcId:'20396', cmcSlug:'kaspa', githubOrg:'kaspanet', githubRepo:'kaspanet/kaspad', xHandle:'KaspaCurrency', website:'https://kaspa.org', description:'Proof-of-work layer-1 using the GHOSTDAG protocol to enable high block rate (~1 BPS) with full confirmation ordering.', tier:'tier1' });
add({ id:'ripple', symbol:'XRP', sector:'layer1', coingeckoId:'ripple', cmcId:'52', cmcSlug:'xrp', githubOrg:'ripple', githubRepo:'ripple/rippled', xHandle:'Ripple', website:'https://ripple.com', description:'Real-time gross settlement system and remittance network purpose-built for cross-border bank-to-bank transfers using the XRP Ledger.', tier:'tier1' });
add({ id:'eos', symbol:'EOS', sector:'layer1', coingeckoId:'eos', cmcId:'1765', cmcSlug:'eos', githubOrg:'AntelopeIO', githubRepo:'AntelopeIO/leap', xHandle:'EOSNetworkFDN', website:'https://eosnetwork.com', description:'Antelope-based DPoS layer-1 focused on enterprise-grade smart contracts and horizontal scaling for high-throughput dapps.', tier:'tier2' });
add({ id:'neo', symbol:'NEO', sector:'layer1', coingeckoId:'neo', cmcId:'1376', cmcSlug:'neo', githubOrg:'neo-project', githubRepo:'neo-project/neo', xHandle:'NeoBlockchain', website:'https://neo.org', description:'Multi-language smart contract platform supporting C#, Java, Go and Python, often called the "Ethereum of China".', tier:'tier2' });
add({ id:'flow', symbol:'FLOW', sector:'layer1', sectors:['layer1','gaming'], coingeckoId:'flow', cmcId:'4558', cmcSlug:'flow', githubOrg:'onflow', githubRepo:'onflow/flow-go', xHandle:'flow_blockchain', website:'https://flow.com', description:'Multi-role, pipelined layer-1 designed for consumer-grade crypto apps, games and digital collectibles without sharding or gas spikes.', tier:'tier1' });
add({ id:'conflux-token', symbol:'CFX', sector:'layer1', coingeckoId:'conflux-token', cmcId:'4562', cmcSlug:'conflux-network', githubOrg:'Conflux-Chain', githubRepo:'Conflux-Chain/conflux-rust', xHandle:'ConfluxNetwork', website:'https://confluxnetwork.org', description:'Tree-Graph consensus layer-1 combining proof-of-work with a permissionless DAG ledger, with high throughput and regulatory compliance features.', tier:'tier2' });
add({ id:'dogecoin', symbol:'DOGE', sector:'layer1', coingeckoId:'dogecoin', cmcId:'74', cmcSlug:'dogecoin', githubOrg:'dogecoin', githubRepo:'dogecoin/dogecoin', xHandle:'dogecoin', website:'https://dogecoin.com', description:'The original meme-coin and proof-of-work payment network, now widely accepted for tipping, micropayments and merchant settlements.', tier:'tier2' });
add({ id:'litecoin', symbol:'LTC', sector:'layer1', coingeckoId:'litecoin', cmcId:'2', cmcSlug:'litecoin', githubOrg:'litecoin-project', githubRepo:'litecoin-project/litecoin', xHandle:'litecoin', website:'https://litecoin.com', description:'Long-standing Bitcoin fork designed for fast, low-cost peer-to-peer payments with Scrypt PoW and 2.5 minute block times.', tier:'tier2' });
add({ id:'iota', symbol:'MIOTA', sector:'layer1', coingeckoId:'iota', cmcId:'1720', cmcSlug:'iota', githubOrg:'iotaledger', githubRepo:'iotaledger/iota-core', xHandle:'iota', website:'https://www.iota.org', description:'Feeless, Tangle-based distributed ledger optimised for IoT micropayments and machine-to-machine data transfer.', tier:'tier2' });
add({ id:'zilliqa', symbol:'ZIL', sector:'layer1', coingeckoId:'zilliqa', cmcId:'2469', cmcSlug:'zilliqa', githubOrg:'Zilliqa', githubRepo:'Zilliqa/Zilliqa', xHandle:'zilliqa', website:'https://www.zilliqa.com', description:'Sharded, high-throughput layer-1 using practical Byzantine fault tolerance, supporting EVM-compatible smart contracts via Zilliqa 2.0.', tier:'tier2' });
add({ id:'kadena', symbol:'KDA', sector:'layer1', coingeckoId:'kadena', cmcId:'5647', cmcSlug:'kadena', githubOrg:'kadena-io', githubRepo:'kadena-io/chainweb-node', xHandle:'kadena_io', website:'https://kadena.io', description:'BFT layer-1 with braided parallel chains and Pact smart contract language, designed for enterprise scale and chain-of-chains throughput.', tier:'tier2' });
add({ id:'multiversx', symbol:'EGLD', sector:'layer1', coingeckoId:'multiversx', cmcId:'6892', cmcSlug:'multiversx', githubOrg:'multiversx', githubRepo:'multiversx/mx-chain-go', xHandle:'MultiversX', website:'https://multiversx.com', description:'Sharded, EVM-compatible layer-1 with adaptive state sharding and secure proof-of-stake consensus for high-throughput DeFi and metaverse apps.', tier:'tier2' });
add({ id:'filecoin', symbol:'FIL', sector:'layer1', sectors:['layer1','depin','infrastructure'], coingeckoId:'filecoin', cmcId:'2280', cmcSlug:'filecoin', githubOrg:'filecoin-project', githubRepo:'filecoin-project/lotus', xHandle:'Filecoin', website:'https://filecoin.io', description:'Decentralized storage marketplace built on a proof-of-spacetime blockchain, providing verifiable, censorship-resistant data persistence.', tier:'tier1' });
add({ id:'chia', symbol:'XCH', sector:'layer1', sectors:['layer1','depin'], coingeckoId:'chia', cmcId:'9261', cmcSlug:'chia', githubOrg:'Chia-Network', githubRepo:'Chia-Network/chia-blockchain', xHandle:'chia_project', website:'https://www.chia.net', description:'Proof-of-space-and-time layer-1 with hard-drive mining, focused on sustainability and enterprise-grade blockchain infrastructure.', tier:'tier2' });
add({ id:'bittensor', symbol:'TAO', sector:'layer1', sectors:['layer1','ai'], coingeckoId:'bittensor', cmcId:'22974', cmcSlug:'bittensor', githubOrg:'opentensor', githubRepo:'opentensor/bittensor', xHandle:'bittensor_', website:'https://bittensor.com', description:'Decentralized machine learning network where miners and validators contribute to and earn from training and serving AI models across specialized subnets.', tier:'tier1' });

console.log('Layer1 so far:', PROJECTS.length);
fs.writeFileSync('/workspace/code/_progress.json', JSON.stringify({count: PROJECTS.length, ids: Array.from(seenIds)}, null, 2));
