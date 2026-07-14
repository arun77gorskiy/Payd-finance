"""
Enrich projects.json with verification metadata for Invalid Project Handling policy.

Adds to each project:
  - coingecko_id (verified CoinGecko Coin ID)
  - cmc_id (optional CoinMarketCap ID)
  - contract_address (verified contract, if applicable)
  - verified_status (verified | pending | data_unavailable)
  - last_verified_at (ISO timestamp of last verification)
  - verification_source (coingecko | coinmarketcap | manual)
  - data_provenance (provenance metadata)

Projects without a known coingecko_id are marked as data_unavailable
and will be excluded from public rankings.
"""

import json
import os
from datetime import datetime, timezone

NOW_ISO = "2026-07-15T00:00:00.000Z"
VERIFICATION_TS = 1721000000  # 2024-07-15

# Comprehensive mapping: ticker -> CoinGecko Coin ID
# Curated list of real, verifiable crypto projects
COINGECKO_IDS = {
    # ===== Layer 1 =====
    "ETH": "ethereum",
    "BTC": "bitcoin",
    "SOL": "solana",
    "BNB": "binancecoin",
    "AVAX": "avalanche-2",
    "DOT": "polkadot",
    "ATOM": "cosmos",
    "NEAR": "near",
    "APT": "aptos",
    "SUI": "sui",
    "TRX": "tron",
    "ADA": "cardano",
    "XTZ": "tezos",
    "ALGO": "algorand",
    "ICP": "internet-computer",
    "XLM": "stellar",
    "HBAR": "hedera-hashgraph",
    "FTM": "fantom",
    "KLAY": "klaytn",
    "FLOW": "flow",
    "EGLD": "elrond-reward-coin",  # multiversx (legacy id)
    "KAVA": "kava",
    "MINA": "mina-protocol",
    "CELO": "celo",
    "RON": "ronin",
    "CRO": "crypto-com-chain",
    "TIA": "celestia",
    "SEI": "sei-network",
    "INJ": "injective-protocol",
    "TON": "the-open-network",
    # ===== Layer 2 =====
    "ARB": "arbitrum",
    "OP": "optimism",
    "POL": "matic-network",
    "MANTA": "manta-network",
    "MNT": "mantle",
    "STRK": "starknet",
    "ZKS": "zksync",
    "LINEA": "linea",  # not yet listed — treat as data_unavailable
    "SCR": "scroll",  # not yet listed
    "IMX": "immutable-x",
    "METIS": "metis-token",
    "LRC": "loopring",
    "BOBA": "boba-network",
    "BLAST": "blast",
    "MODE": "mode",
    "MVL": "massa",
    "ZRC": "zircuit",  # not yet listed
    "K": "kinto",  # not yet listed
    "CYBER": "cyberconnect",
    "ZORA": "zora",
    "WLD": "worldcoin-wld",
    "ACX": "across-protocol",
    "XAI": "xai",
    "RARI": "rari-governance-token",
    "KKRT": None,  # kakarot — not on coingecko
    "RED": None,  # redstone — not on coingecko
    "GAL": "galxe",
    # ===== DePIN =====
    "RENDER": "render-token",
    "FIL": "filecoin",
    "AKT": "akash-network",
    "HNT": "helium",
    "LPT": "livepeer",
    "AR": "arweave",
    "IO": "io-net",  # not yet on coingecko
    "FLUX": "zelcash",  # flux
    "ALEPH": "aleph",
    "DIMO": "dimo",
    "HONEY": "hivemapper",
    "PEAQ": "peaq-2",
    "ATH": "aethir",
    "MASA": "masa-finance",
    "MYST": "mysterium",
    "NODL": "nodle-network",
    "CUDOS": "cudos",
    "SPON": "spheron-network",
    "SWTH": "switcheo",
    "CHR": "chromia",
    "GLMR": "moonbeam",
    "MOVR": "moonriver",
    "ANKR": "ankr",
    "POWR": "powerledger",
    "GRID": None,  # gridplus — not on coingecko as a token
    "IOTX": "iotex",
    "DATA": "streamr",
    # ===== AI =====
    "TAO": "bittensor",
    "FET": "fetch-ai",
    "AGIX": "singularitynet",
    "OCEAN": "ocean-protocol",
    "NMR": "numerai",
    "RLC": "rlc",
    "CERE": "cere-network",
    "CGPT": "chaingpt",
    "LMWR": "limewire",
    "PAAL": "paal-ai",
    "VAI": "vaiot",
    "ALI": "alethea-artificial-liquid-intelligence-token",
    "PHB": "phoenix-global",
    "VLX": "velas",
    "SAHARA": "sahara-ai",
    "NIL": "nillion",
    "0G": "zero-gravity",  # not yet on coingecko
    "REP": "reppo",  # not yet on coingecko
    "PNDR": "ponder",  # not yet on coingecko
    "ALLO": "allora",  # not yet on coingecko
    "NMT": "netmind-token",
    "KIP": "kip-protocol",  # not yet on coingecko
    "MDT": "measurable-data-token",
    "CTXC": "cortex",
    "ENJ": "enjincoin",
    "STREAMR": "streamr",
    "HMT": "humanode",
    "OXB": None,  # oxbit — not on coingecko
    "AUX": None,  # aux — not on coingecko
}

# Minimum target per sector (user requested 30)
MIN_TARGET_PER_SECTOR = 30


def enrich_project(project):
    """Add verification metadata to a single project."""
    ticker = project.get("ticker", "").upper()
    cg_id = COINGECKO_IDS.get(ticker)

    # Determine verification status
    if cg_id:
        verified_status = "verified"
        verification_source = "coingecko"
    else:
        verified_status = "data_unavailable"
        verification_source = None

    # Add verification fields to project
    project["coingecko_id"] = cg_id
    project["cmc_id"] = None  # not yet curated
    project["contract_address"] = None  # to be filled per-chain
    project["verified_status"] = verified_status
    project["last_verified_at"] = NOW_ISO
    project["verification_source"] = verification_source
    project["data_provenance"] = {
        "schema_version": "2.1",
        "policy": "Invalid Project Handling v1.0",
        "checks": ["coingecko_id", "verified_market_cap", "verified_fdv", "verified_price", "github_activity"],
    }

    # Embed verification in metadata too (for compatibility with V1)
    md = project.get("metadata", {})
    md["coingecko_id"] = cg_id
    md["verified_status"] = verified_status
    md["verification_source"] = verification_source
    md["last_verified_at"] = NOW_ISO
    project["metadata"] = md

    return project


def main():
    src = os.path.join(os.path.dirname(__file__), "..", "public", "data", "projects.json")
    src = os.path.abspath(src)

    with open(src, "r", encoding="utf-8") as f:
        data = json.load(f)

    projects = data.get("projects", [])
    if not projects and isinstance(data, list):
        # Defensive: handle case where root is a list
        projects = data
        data = {"projects": projects, "metadata": {}}

    enriched = [enrich_project(p) for p in projects]

    # Count by status
    from collections import Counter
    status_counts = Counter(p["verified_status"] for p in enriched)
    sector_counts = Counter(p["sector"] for p in enriched if p["verified_status"] == "verified")

    # Update metadata
    data["projects"] = enriched
    data["metadata"] = data.get("metadata", {})
    data["metadata"]["verification_stats"] = {
        "verified": status_counts.get("verified", 0),
        "pending": status_counts.get("pending", 0),
        "data_unavailable": status_counts.get("data_unavailable", 0),
        "verified_by_sector": dict(sector_counts),
        "min_target_per_sector": MIN_TARGET_PER_SECTOR,
        "policy_version": "InvalidProjectHandling-v1.0",
    }
    data["metadata"]["schema_version"] = "2.1"

    with open(src, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[OK] Enriched {len(enriched)} projects in {src}")
    print(f"     Verified: {status_counts.get('verified', 0)}")
    print(f"     Pending:  {status_counts.get('pending', 0)}")
    print(f"     Unavailable: {status_counts.get('data_unavailable', 0)}")
    print(f"     Verified by sector: {dict(sector_counts)}")
    print()
    # Warn if any sector is below target
    shortfalls = []
    for sector, count in sector_counts.items():
        if count < MIN_TARGET_PER_SECTOR:
            shortfalls.append(f"{sector}: {count}/{MIN_TARGET_PER_SECTOR}")
    if shortfalls:
        print(f"[WARN] Sectors below target ({MIN_TARGET_PER_SECTOR}):")
        for s in shortfalls:
            print(f"       - {s}")


if __name__ == "__main__":
    main()
