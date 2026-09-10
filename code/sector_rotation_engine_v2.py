#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAYD Sector Rotation Engine v2
================================

Two-gate eligibility model:

  GATE 1 (Market Cap):
    market_cap_usd >= 5_000_000

  GATE 2 (Project Activity):
    project_activity_status == ACTIVE

Additional requirements (AND):
  - tradable_asset == true
  - identity sufficiently verified
  - project not delisted/inactive

ACTIVE_ELIGIBLE =
  market_cap_gate AND activity_gate AND tradable AND identity_verified AND not_delisted

Sort within sector: market_cap_usd DESC

Replacement rule:
  - Remove from ACTIVE universe if:
      * below Market Cap threshold
      * INACTIVE
      * confirmed abandoned
      * delisted
  - Replace with highest-market-cap candidate from SAME sector that
    satisfies BOTH gates.

Activity status history is tracked.

CRITICAL DEPENDENCY:
  Until the VERIFIED GitHub Developer Activity snapshot has been
  validated and merged, this engine runs in DRY-RUN mode and
  does NOT modify production data.
"""
import json
import csv
import os
from datetime import datetime, timezone
from collections import defaultdict, Counter
from typing import Dict, List, Optional, Any, Tuple

from activity_status_classifier import (
    ActivityClassifier,
    ACTIVITY_STATES,
    REASON,
    MIN_MARKET_CAP_USD,
    load_github_snapshot,
)

# Sectors (from public/data/sector_config.json — CamelCase).
# projects_enriched.json uses lowercase, so we normalize.
ALL_SECTORS = [
    'Layer1', 'Layer2', 'DeFi', 'DePIN', 'AI',
    'RWA', 'DeSci', 'Gaming', 'Infrastructure', 'ZK',
]
SECTOR_NORMALIZE = {
    'layer1': 'Layer1', 'l1': 'Layer1',
    'layer2': 'Layer2', 'l2': 'Layer2',
    'defi': 'DeFi',
    'depin': 'DePIN',
    'ai': 'AI', 'artificial-intelligence': 'AI',
    'rwa': 'RWA',
    'desci': 'DeSci',
    'gaming': 'Gaming', 'game': 'Gaming',
    'infrastructure': 'Infrastructure', 'infra': 'Infrastructure',
    'zk': 'ZK', 'zero-knowledge': 'ZK',
}

PROJECTS_FILE = 'public/data/projects_enriched.json'
SECTOR_CONFIG_FILE = 'public/data/sector_config.json'
REGISTRY_FILE = 'tmp/payd_github_identity_registry.json'
GITHUB_SNAPSHOT_FILE = 'tmp/payd_github_developer_enrichment.json'

# Outputs
OUT_ACTIVITY = 'tmp/payd_project_activity_status.json'
OUT_HISTORY = 'tmp/payd_activity_status_history.json'
OUT_ACTIVE_UNIVERSE = 'tmp/payd_active_sector_universe.json'
OUT_REMOVALS = 'tmp/payd_sector_rotation_removals.json'
OUT_ADDITIONS = 'tmp/payd_sector_rotation_additions.json'
OUT_REPORT_MD = 'tmp/payd_sector_rotation_dryrun_report.md'
OUT_REPORT_JSON = 'tmp/payd_sector_rotation_dryrun_report.json'


class SectorRotationEngineV2:
    """Two-gate sector rotation engine.

    Modes:
      - DRY_RUN: snapshot not validated, no production writes.
      - PRODUCTION: snapshot validated, may write to public/data/.
    """

    def __init__(
        self,
        projects: List[Dict[str, Any]],
        sector_config: List[Dict[str, Any]],
        registry: Dict[str, Any],
        github_snapshot: Optional[Dict[str, Any]] = None,
        github_snapshot_validated: bool = False,
        now: Optional[datetime] = None,
    ):
        self.projects = projects
        self.sector_config = {s['sector']: s for s in sector_config}
        self.registry = registry.get('registry', registry) if isinstance(registry, dict) and 'registry' in registry else registry
        self.github_snapshot = github_snapshot or {}
        self.github_snapshot_validated = github_snapshot_validated
        self.now = now or datetime.now(timezone.utc)
        self.classifier = ActivityClassifier(
            github_snapshot=self.github_snapshot,
            github_snapshot_validated=self.github_snapshot_validated,
            now=self.now,
        )
        # History
        self.history: List[Dict[str, Any]] = []
        # Results
        self.activity_statuses: Dict[str, Dict[str, Any]] = {}
        self.active_universe: Dict[str, List[Dict[str, Any]]] = {}
        self.removals: List[Dict[str, Any]] = []
        self.additions: List[Dict[str, Any]] = []

    @property
    def is_dry_run(self) -> bool:
        return not self.github_snapshot_validated

    def run(self) -> Dict[str, Any]:
        """Run the full pipeline.

        Returns the full result dict.
        """
        print('=' * 80)
        print(f'PAYD SECTOR ROTATION ENGINE v2 — {"DRY-RUN" if self.is_dry_run else "PRODUCTION"}')
        print('=' * 80)
        print()
        print(f'GitHub snapshot validated: {self.github_snapshot_validated}')
        if self.is_dry_run:
            print('⚠️  DRY-RUN MODE: no production writes')
            print('   Activity-based gate returns DATA_UNAVAILABLE for all projects.')
        print()

        # Step 1: classify all projects
        self._classify_all()

        # Step 2: build per-sector active universe
        self._build_active_universe()

        # Step 3: identify removals/additions
        self._identify_replacements()

        # Step 4: save artifacts
        self._save_artifacts()

        # Step 5: print report
        self._print_report()

        return {
            'metadata': self._metadata(),
            'activity_statuses': self.activity_statuses,
            'active_universe': self.active_universe,
            'removals': self.removals,
            'additions': self.additions,
            'history': self.history,
        }

    def _metadata(self) -> Dict[str, Any]:
        return {
            'generated_at': self.now.isoformat(),
            'engine_version': 'v2',
            'mode': 'DRY_RUN' if self.is_dry_run else 'PRODUCTION',
            'github_snapshot_validated': self.github_snapshot_validated,
            'min_market_cap_usd': MIN_MARKET_CAP_USD,
            'sectors': ALL_SECTORS,
        }

    def _classify_all(self):
        """Classify all projects into activity states."""
        print('--- Step 1: Classifying activity status ---')
        for p in self.projects:
            pid = p.get('id', '')
            registry_entry = self.registry.get(pid) if isinstance(self.registry, dict) else None
            non_github = self._extract_non_github_evidence(p)
            status = self.classifier.classify(p, registry_entry, non_github)
            self.activity_statuses[pid] = status
            self.history.append({
                'canonical_asset_id': pid,
                'previous_status': None,
                'new_status': status['project_activity_status'],
                'reason': status['activity_status_reason'],
                'evidence': status['evidence'],
                'timestamp': self.now.isoformat(),
            })

        # Summary
        counter = Counter(s['project_activity_status'] for s in self.activity_statuses.values())
        for state in sorted(ACTIVITY_STATES):
            print(f'  {state:18s}: {counter.get(state, 0):4d}')
        print()

    def _extract_non_github_evidence(self, project: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Extract non-GitHub sector-specific activity evidence from project data.

        Per spec, this is only used for projects where GitHub is NOT_APPLICABLE
        or where verified non-GitHub signals are available. We do NOT
        fabricate metrics.

        For now, we return None and rely on:
          - registry mapping status (NOT_APPLICABLE -> NOT_APPLICABLE state)
          - project.delisted flag (if present)
        """
        # If project is explicitly delisted/inactive
        if project.get('delisted') or project.get('is_inactive') or project.get('status') == 'delisted':
            return {
                'activity_status': 'INACTIVE',
                'activity_reason': REASON['PROJECT_ABANDONED'],
                'note': 'Project marked as delisted/inactive in source data',
            }
        return None

    def _build_active_universe(self):
        """Build the per-sector active universe applying both gates."""
        print('--- Step 2: Building active sector universe (two gates) ---')

        def normalize_sector(s: str) -> Optional[str]:
            if not s:
                return None
            return SECTOR_NORMALIZE.get(s.lower(), s if s in ALL_SECTORS else None)

        # Group projects by sector
        by_sector: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
        for p in self.projects:
            # Try 'sectors' (array) first, fall back to 'sector' (single)
            sectors_field = p.get('sectors') or p.get('sector') or []
            if isinstance(sectors_field, str):
                sectors_field = [sectors_field]
            for s in sectors_field:
                normalized = normalize_sector(s)
                if normalized and normalized in ALL_SECTORS:
                    by_sector[normalized].append(p)

        for sector in ALL_SECTORS:
            candidates = by_sector.get(sector, [])
            eligible = []
            for p in candidates:
                pid = p.get('id', '')
                activity = self.activity_statuses.get(pid, {})
                activity_status = activity.get('project_activity_status', 'DATA_UNAVAILABLE')
                market_cap = self._get_market_cap(p)
                tradable = p.get('tradable', True)
                identity_verified = self._is_identity_verified(pid)
                delisted = bool(p.get('delisted') or p.get('is_inactive'))

                # Gate evaluation
                market_cap_pass = market_cap is not None and market_cap >= MIN_MARKET_CAP_USD
                activity_pass = activity_status == 'ACTIVE'
                tradable_pass = tradable
                identity_pass = identity_verified
                delisted_pass = not delisted

                active_eligible = (
                    market_cap_pass and activity_pass
                    and tradable_pass and identity_pass and delisted_pass
                )

                enriched = {
                    'canonical_asset_id': pid,
                    'display_name': p.get('display_name') or p.get('name', ''),
                    'symbol': p.get('symbol', ''),
                    'sector': sector,
                    'market_cap_usd': market_cap,
                    'project_activity_status': activity_status,
                    'activity_reason': activity.get('activity_status_reason'),
                    'tradable': tradable,
                    'identity_verified': identity_verified,
                    'delisted': delisted,
                    'gate_market_cap': market_cap_pass,
                    'gate_activity': activity_pass,
                    'gate_tradable': tradable_pass,
                    'gate_identity': identity_pass,
                    'gate_delisted': delisted_pass,
                    'ACTIVE_ELIGIBLE': active_eligible,
                }
                eligible.append(enriched)

            # Sort by market_cap DESC (None last)
            eligible.sort(
                key=lambda x: (x['market_cap_usd'] if x['market_cap_usd'] is not None else -1),
                reverse=True,
            )
            self.active_universe[sector] = eligible

        # Summary
        for sector in ALL_SECTORS:
            items = self.active_universe.get(sector, [])
            active = [x for x in items if x['ACTIVE_ELIGIBLE']]
            print(f'  {sector:18s}: {len(active):3d} ACTIVE / {len(items):3d} total')
        print()

    def _get_market_cap(self, project: Dict[str, Any]) -> Optional[float]:
        """Extract market cap from project, handling multiple possible field names.

        projects_enriched.json nests market data under 'market' key, but we
        also check top-level fields for backward compatibility.
        """
        # Try nested market.market_cap_usd first
        market = project.get('market') or {}
        if isinstance(market, dict):
            v = market.get('market_cap_usd')
            if v is not None:
                try:
                    val = float(v)
                    if val > 0:
                        return val
                except (ValueError, TypeError):
                    pass
        # Try top-level fields
        for key in ['market_cap_usd', 'marketCap', 'market_cap', 'mc_usd']:
            v = project.get(key)
            if v is not None:
                try:
                    val = float(v)
                    if val > 0:
                        return val
                except (ValueError, TypeError):
                    pass
        return None

    def _is_identity_verified(self, pid: str) -> bool:
        """Check if identity is sufficiently verified."""
        if not isinstance(self.registry, dict):
            return False
        entry = self.registry.get(pid)
        if not entry:
            return False
        status = entry.get('github_mapping_status') or entry.get('identity_status')
        # Sufficient verification = VERIFIED mapping, or NOT_APPLICABLE (token/asset)
        return status in ('VERIFIED', 'NOT_APPLICABLE')

    def _identify_replacements(self):
        """Identify removals and replacement candidates per spec.

        Removal criteria:
          - BELOW_MARKET_CAP_THRESHOLD
          - INACTIVE
          - confirmed abandoned
          - delisted

        Replacement criteria:
          - market_cap >= $5M
          - project_activity_status = ACTIVE
          - verified identity
          - valid sector classification
        """
        print('--- Step 3: Identifying removals and replacements ---')

        # For each sector, find candidates that FAIL eligibility
        # and check if there are eligible replacement candidates
        for sector in ALL_SECTORS:
            items = self.active_universe.get(sector, [])

            # In DRY-RUN mode, we don't know the current ACTIVE universe,
            # so we report all non-eligible items as "would-be removed"
            # and all eligible items as "would-be active".
            currently_eligible = [x for x in items if x['ACTIVE_ELIGIBLE']]

            # In production, "currently active" would be a separate input.
            # In DRY-RUN, we report all non-eligible items as candidate
            # removals (with reasons) so the operator can review.
            for x in items:
                if x['ACTIVE_ELIGIBLE']:
                    continue

                reasons = []
                if not x['gate_market_cap']:
                    reasons.append('BELOW_MARKET_CAP_THRESHOLD')
                if not x['gate_activity']:
                    if x['project_activity_status'] == 'INACTIVE':
                        reasons.append('INACTIVE')
                    elif x['project_activity_status'] == 'STALE':
                        reasons.append('STALE')
                    elif x['project_activity_status'] == 'DATA_UNAVAILABLE':
                        reasons.append('DATA_UNAVAILABLE')
                    elif x['project_activity_status'] == 'NOT_APPLICABLE':
                        reasons.append('NOT_APPLICABLE')
                    elif x['project_activity_status'] == 'REVIEW_REQUIRED':
                        reasons.append('REVIEW_REQUIRED')
                if x['delisted']:
                    reasons.append('DELISTED')
                if not x['gate_tradable']:
                    reasons.append('NOT_TRADABLE')
                if not x['gate_identity']:
                    reasons.append('IDENTITY_UNVERIFIED')

                # Last commit (for report)
                last_commit = self._get_last_commit(x['canonical_asset_id'])
                contributors = self._get_contributors(x['canonical_asset_id'])

                self.removals.append({
                    'PROJECT': x['display_name'],
                    'TICKER': x['symbol'],
                    'SECTOR': sector,
                    'MARKET_CAP': x['market_cap_usd'],
                    'DEVELOPER_ACTIVITY': x['project_activity_status'],
                    'LAST_COMMIT': last_commit,
                    'CONTRIBUTORS_90D': contributors,
                    'ACTIVITY_STATUS': x['project_activity_status'],
                    'REMOVAL_REASON': ' | '.join(reasons),
                    'canonical_asset_id': x['canonical_asset_id'],
                })

            # Replacement candidates: items that ARE ACTIVE_ELIGIBLE
            # These would be the proposed additions in DRY-RUN.
            for x in currently_eligible:
                last_commit = self._get_last_commit(x['canonical_asset_id'])
                contributors = self._get_contributors(x['canonical_asset_id'])
                self.additions.append({
                    'PROJECT': x['display_name'],
                    'TICKER': x['symbol'],
                    'SECTOR': sector,
                    'MARKET_CAP': x['market_cap_usd'],
                    'DEVELOPER_ACTIVITY': x['project_activity_status'],
                    'LAST_COMMIT': last_commit,
                    'CONTRIBUTORS_90D': contributors,
                    'ACTIVITY_STATUS': x['project_activity_status'],
                    'canonical_asset_id': x['canonical_asset_id'],
                })

        print(f'  Removals: {len(self.removals)}')
        print(f'  Active-eligible candidates: {len(self.additions)}')
        print()

    def _get_last_commit(self, pid: str) -> Optional[str]:
        if not self.github_snapshot:
            return None
        m = self.github_snapshot.get(pid)
        if m:
            return m.get('last_commit_at')
        return None

    def _get_contributors(self, pid: str) -> Optional[int]:
        if not self.github_snapshot:
            return None
        m = self.github_snapshot.get(pid)
        if m:
            return m.get('unique_contributors_90d')
        return None

    def _save_artifacts(self):
        """Save all output artifacts."""
        os.makedirs('tmp', exist_ok=True)

        # Activity statuses
        with open(OUT_ACTIVITY, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': self._metadata(),
                'project_activity_statuses': self.activity_statuses,
            }, f, ensure_ascii=False, indent=2)

        # History
        with open(OUT_HISTORY, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': self._metadata(),
                'activity_status_history': self.history,
            }, f, ensure_ascii=False, indent=2)

        # Active universe
        with open(OUT_ACTIVE_UNIVERSE, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': self._metadata(),
                'active_universe_by_sector': self.active_universe,
            }, f, ensure_ascii=False, indent=2)

        # Removals
        with open(OUT_REMOVALS, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': self._metadata(),
                'removals': self.removals,
            }, f, ensure_ascii=False, indent=2)

        # Additions
        with open(OUT_ADDITIONS, 'w', encoding='utf-8') as f:
            json.dump({
                'metadata': self._metadata(),
                'additions': self.additions,
            }, f, ensure_ascii=False, indent=2)

    def _print_report(self):
        """Print human-readable report to stdout and save markdown."""
        print('--- Step 4: Saving artifacts ---')
        for path in [OUT_ACTIVITY, OUT_HISTORY, OUT_ACTIVE_UNIVERSE,
                     OUT_REMOVALS, OUT_ADDITIONS, OUT_REPORT_MD,
                     OUT_REPORT_JSON]:
            print(f'  {path}')
        print()

        # Build markdown report
        self._save_markdown_report()

    def _save_markdown_report(self):
        """Save a comprehensive markdown report."""
        lines = []
        lines.append('# PAYD Sector Rotation Engine v2 — DRY-RUN Report')
        lines.append('')
        lines.append(f'**Generated:** {self.now.isoformat()}')
        lines.append(f'**Engine version:** v2 (two-gate eligibility)')
        lines.append(f'**Mode:** {"DRY-RUN" if self.is_dry_run else "PRODUCTION"}')
        lines.append(f'**GitHub snapshot validated:** {self.github_snapshot_validated}')
        lines.append('')
        lines.append('## Two-Gate Eligibility Model')
        lines.append('')
        lines.append('A project is **ACTIVE_ELIGIBLE** iff ALL of:')
        lines.append('')
        lines.append('1. `market_cap_usd >= 5_000_000`')
        lines.append('2. `project_activity_status == ACTIVE`')
        lines.append('3. `tradable_asset == true`')
        lines.append('4. Identity sufficiently verified')
        lines.append('5. Not delisted/inactive')
        lines.append('')
        if self.is_dry_run:
            lines.append('> ⚠️ **DRY-RUN MODE.** GitHub Developer Activity snapshot has not been')
            lines.append('> validated and merged. All GitHub-dependent classifications return')
            lines.append('> `DATA_UNAVAILABLE`. No production writes.')
            lines.append('')

        # Activity status distribution
        lines.append('## Activity Status Distribution')
        lines.append('')
        counter = Counter(s['project_activity_status'] for s in self.activity_statuses.values())
        lines.append('| Status | Count |')
        lines.append('|---|---|')
        for state in ['ACTIVE', 'STALE', 'INACTIVE', 'DATA_UNAVAILABLE',
                      'NOT_APPLICABLE', 'REVIEW_REQUIRED']:
            lines.append(f'| {state} | {counter.get(state, 0)} |')
        lines.append('')

        # Per-sector summary
        lines.append('## Per-Sector Eligibility Summary')
        lines.append('')
        lines.append('| Sector | Total | Eligible by MC | Eligible by Activity | Eligible by BOTH | Below $5M | INACTIVE | STALE | DATA_UNAV | Replacement Candidates |')
        lines.append('|---|---|---|---|---|---|---|---|---|---|')
        for sector in ALL_SECTORS:
            items = self.active_universe.get(sector, [])
            total = len(items)
            mc_eligible = sum(1 for x in items if x['gate_market_cap'])
            act_eligible = sum(1 for x in items if x['gate_activity'])
            both = sum(1 for x in items if x['ACTIVE_ELIGIBLE'])
            below_mc = sum(1 for x in items if not x['gate_market_cap'])
            inactive = sum(1 for x in items if x['project_activity_status'] == 'INACTIVE')
            stale = sum(1 for x in items if x['project_activity_status'] == 'STALE')
            data_unav = sum(1 for x in items if x['project_activity_status'] == 'DATA_UNAVAILABLE')
            replacement = both
            lines.append(
                f'| {sector} | {total} | {mc_eligible} | {act_eligible} | {both} | '
                f'{below_mc} | {inactive} | {stale} | {data_unav} | {replacement} |'
            )
        lines.append('')

        # Removals detail (per spec)
        lines.append('## Proposed Removals (DRY-RUN)')
        lines.append('')
        lines.append('| PROJECT | TICKER | SECTOR | MARKET CAP | DEV ACTIVITY | LAST COMMIT | CONTRIBUTORS 90D | ACTIVITY STATUS | REMOVAL REASON |')
        lines.append('|---|---|---|---|---|---|---|---|---|')
        for r in self.removals[:50]:  # Cap for readability
            mc = f"${r['MARKET_CAP']:,.0f}" if r['MARKET_CAP'] else 'N/A'
            lines.append(
                f"| {r['PROJECT']} | {r['TICKER']} | {r['SECTOR']} | {mc} | "
                f"{r['DEVELOPER_ACTIVITY']} | {r['LAST_COMMIT'] or 'N/A'} | "
                f"{r['CONTRIBUTORS_90D'] if r['CONTRIBUTORS_90D'] is not None else 'N/A'} | "
                f"{r['ACTIVITY_STATUS']} | {r['REMOVAL_REASON']} |"
            )
        if len(self.removals) > 50:
            lines.append(f'| ... | | | | | | | | _{len(self.removals) - 50} more rows in JSON_ |')
        lines.append('')

        # Additions detail
        lines.append('## Replacement Candidates (would be ACTIVE in production)')
        lines.append('')
        lines.append('| PROJECT | TICKER | SECTOR | MARKET CAP | DEV ACTIVITY | LAST COMMIT | CONTRIBUTORS 90D | ACTIVITY STATUS |')
        lines.append('|---|---|---|---|---|---|---|---|')
        for a in self.additions[:50]:
            mc = f"${a['MARKET_CAP']:,.0f}" if a['MARKET_CAP'] else 'N/A'
            lines.append(
                f"| {a['PROJECT']} | {a['TICKER']} | {a['SECTOR']} | {mc} | "
                f"{a['DEVELOPER_ACTIVITY']} | {a['LAST_COMMIT'] or 'N/A'} | "
                f"{a['CONTRIBUTORS_90D'] if a['CONTRIBUTORS_90D'] is not None else 'N/A'} | "
                f"{a['ACTIVITY_STATUS']} |"
            )
        if len(self.additions) > 50:
            lines.append(f'| ... | | | | | | | _{len(self.additions) - 50} more rows in JSON_ |')
        lines.append('')

        # Final note
        lines.append('## Dependency Status')
        lines.append('')
        if self.is_dry_run:
            lines.append('⚠️ **This is a DRY-RUN.** The GitHub Developer Activity snapshot has not')
            lines.append('been validated and merged. No project should be evicted from production')
            lines.append('using these results. Re-run after Phase 2B snapshot validation completes.')
        else:
            lines.append('✅ **PRODUCTION MODE.** GitHub snapshot is validated and merged.')
            lines.append('Removals/additions may be applied to canonical enrichment layer.')
        lines.append('')

        lines.append('## Artifacts')
        lines.append('')
        for path in [OUT_ACTIVITY, OUT_HISTORY, OUT_ACTIVE_UNIVERSE,
                     OUT_REMOVALS, OUT_ADDITIONS, OUT_REPORT_JSON]:
            lines.append(f'- `{path}`')
        lines.append('')

        # Save
        with open(OUT_REPORT_MD, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))

        # JSON report
        report_data = {
            'metadata': self._metadata(),
            'activity_status_distribution': dict(counter),
            'sector_summary': {
                sector: {
                    'total': len(self.active_universe.get(sector, [])),
                    'mc_eligible': sum(1 for x in self.active_universe.get(sector, []) if x['gate_market_cap']),
                    'activity_eligible': sum(1 for x in self.active_universe.get(sector, []) if x['gate_activity']),
                    'both_eligible': sum(1 for x in self.active_universe.get(sector, []) if x['ACTIVE_ELIGIBLE']),
                }
                for sector in ALL_SECTORS
            },
            'removals_count': len(self.removals),
            'additions_count': len(self.additions),
        }
        with open(OUT_REPORT_JSON, 'w', encoding='utf-8') as f:
            json.dump(report_data, f, ensure_ascii=False, indent=2)


def main():
    """CLI entry point."""
    # Load inputs
    with open(PROJECTS_FILE, 'r', encoding='utf-8') as f:
        projects_data = json.load(f)
    projects = projects_data.get('projects', projects_data)

    with open(SECTOR_CONFIG_FILE, 'r', encoding='utf-8') as f:
        sector_config = json.load(f)

    with open(REGISTRY_FILE, 'r', encoding='utf-8') as f:
        registry = json.load(f)

    # Try to load GitHub snapshot if present
    github_snapshot = {}
    github_validated = False
    if os.path.exists(GITHUB_SNAPSHOT_FILE):
        github_snapshot = load_github_snapshot(GITHUB_SNAPSHOT_FILE)
        github_validated = False  # Always False until snapshot is officially validated
        print(f'Loaded GitHub snapshot: {len(github_snapshot)} entries (validation status: NOT VALIDATED)')
    else:
        print('No GitHub snapshot found; running in DATA_UNAVAILABLE mode.')

    # Run engine
    engine = SectorRotationEngineV2(
        projects=projects,
        sector_config=sector_config,
        registry=registry,
        github_snapshot=github_snapshot,
        github_snapshot_validated=github_validated,
    )
    engine.run()


if __name__ == '__main__':
    main()
