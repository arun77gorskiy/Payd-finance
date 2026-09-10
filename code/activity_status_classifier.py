#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAYD Project Activity Status Classifier
========================================

Classifies each canonical project into one of:
  - ACTIVE
  - STALE
  - INACTIVE
  - DATA_UNAVAILABLE
  - NOT_APPLICABLE
  - REVIEW_REQUIRED

Inputs (priority order):
  1. VERIFIED GitHub Developer Activity snapshot (if VALIDATED and MERGED)
  2. Sector-specific non-GitHub evidence (DePIN nodes, DeFi TVL, etc.)
  3. Existing project metadata (sector, delisted flags)

Rules (per spec):
  - Use multi-signal evaluation, NOT single-metric filter.
  - GitHub is NOT the only source.
  - 180-day hard-dead test for abandonment.
  - Missing data -> DATA_UNAVAILABLE (NOT INACTIVE).
  - REVIEW mappings are NOT evidence of inactivity.

CRITICAL DEPENDENCY:
  Until GitHub Developer Activity snapshot has passed validation and
  been merged into the canonical enrichment layer, this classifier
  operates in DRY-RUN mode and returns DATA_UNAVAILABLE for any
  GitHub-dependent classification.
"""
import json
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any


# Activity states (canonical, per spec)
ACTIVITY_STATES = {
    'ACTIVE',
    'STALE',
    'INACTIVE',
    'DATA_UNAVAILABLE',
    'NOT_APPLICABLE',
    'REVIEW_REQUIRED',
}

# Thresholds (per spec)
HARD_DEAD_DAYS = 180         # ~180 days no meaningful commits
STALE_DAYS = 90               # weak/declining development window
STALE_GRACE_DAYS = 180        # still meaningful activity within this
MIN_CONTRIBUTORS_FOR_ACTIVE = 2  # rough minimum
MIN_RECENT_COMMITS_90D = 3    # rough minimum for healthy dev

# Market cap gate
MIN_MARKET_CAP_USD = 5_000_000

# Activity reasons
REASON = {
    'ACTIVE_DEVELOPMENT': 'ACTIVE_DEVELOPMENT',
    'NO_DEVELOPMENT_90D': 'NO_DEVELOPMENT_90D',
    'NO_DEVELOPMENT_180D': 'NO_DEVELOPMENT_180D',
    'PROJECT_ABANDONED': 'PROJECT_ABANDONED',
    'NETWORK_ACTIVITY_CONFIRMED': 'NETWORK_ACTIVITY_CONFIRMED',
    'PRIVATE_DEVELOPMENT': 'PRIVATE_DEVELOPMENT',
    'DATA_UNAVAILABLE': 'DATA_UNAVAILABLE',
    'ACTIVITY_RECOVERED': 'ACTIVITY_RECOVERED',
    'NOT_SOFTWARE_PROJECT': 'NOT_SOFTWARE_PROJECT',
    'REVIEW_REQUIRED': 'REVIEW_REQUIRED',
}


class ActivityClassifier:
    """Classifies a single project's activity status.

    Strict spec-compliance: prefers DATA_UNAVAILABLE over INACTIVE
    when evidence is incomplete.
    """

    def __init__(
        self,
        github_snapshot: Optional[Dict[str, Any]] = None,
        github_snapshot_validated: bool = False,
        now: Optional[datetime] = None,
    ):
        """Args:
          github_snapshot: dict {canonical_id: github_metrics} if available
          github_snapshot_validated: True ONLY if Phase 2B snapshot has been
            officially validated AND merged. Until then, classifier runs
            in DATA_UNAVAILABLE mode for any GitHub-dependent signal.
          now: override current time (for testing).
        """
        self.github_snapshot = github_snapshot or {}
        self.github_snapshot_validated = github_snapshot_validated
        self.now = now or datetime.now(timezone.utc)

    def classify(
        self,
        project: Dict[str, Any],
        registry_entry: Optional[Dict[str, Any]] = None,
        non_github_evidence: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Classify a single project.

        Returns:
          {
            'canonical_asset_id': str,
            'project_activity_status': str (one of ACTIVITY_STATES),
            'activity_status_reason': str,
            'evidence': dict,
            'is_github_applicable': bool,
          }
        """
        pid = project.get('id') or project.get('canonical_asset_id', '')

        # 1. Determine if GitHub is applicable for this project.
        #    Use registry mapping status (NOT_APPLICABLE means no public repo).
        mapping_status = None
        if registry_entry:
            mapping_status = registry_entry.get('github_mapping_status') or \
                             registry_entry.get('identity_status')

        if mapping_status == 'NOT_APPLICABLE':
            return {
                'canonical_asset_id': pid,
                'project_activity_status': 'NOT_APPLICABLE',
                'activity_status_reason': REASON['NOT_SOFTWARE_PROJECT'],
                'evidence': {'registry_mapping_status': mapping_status},
                'is_github_applicable': False,
            }

        # 2. If mapping is REVIEW or NOT_FOUND, do NOT use as inactivity
        #    evidence. Fall through to other signals.
        github_applicable = mapping_status == 'VERIFIED'

        # 3. If we have a VALIDATED GitHub snapshot, use it as PRIMARY signal.
        github_metrics = None
        if github_applicable and self.github_snapshot_validated:
            github_metrics = self.github_snapshot.get(pid)

        if github_metrics is not None:
            return self._classify_from_github(pid, github_metrics, mapping_status)

        # 4. Try non-GitHub sector-specific evidence.
        if non_github_evidence:
            sector_classification = self._classify_from_non_github(
                pid, project, non_github_evidence,
            )
            if sector_classification['project_activity_status'] != 'DATA_UNAVAILABLE':
                return sector_classification

        # 5. Cannot reliably classify.
        #    If GitHub would be applicable but we don't have a validated
        #    snapshot, return DATA_UNAVAILABLE (NOT INACTIVE).
        #    If mapping is REVIEW/NOT_FOUND, return REVIEW_REQUIRED.
        if mapping_status in ('REVIEW', 'NOT_FOUND'):
            return {
                'canonical_asset_id': pid,
                'project_activity_status': 'REVIEW_REQUIRED',
                'activity_status_reason': REASON['REVIEW_REQUIRED'],
                'evidence': {
                    'registry_mapping_status': mapping_status,
                    'note': 'GitHub mapping not verified; cannot classify activity',
                },
                'is_github_applicable': False,
            }

        if github_applicable and not self.github_snapshot_validated:
            return {
                'canonical_asset_id': pid,
                'project_activity_status': 'DATA_UNAVAILABLE',
                'activity_status_reason': REASON['DATA_UNAVAILABLE'],
                'evidence': {
                    'note': 'GitHub Developer Activity snapshot not yet validated',
                    'snapshot_validated': self.github_snapshot_validated,
                },
                'is_github_applicable': True,
            }

        return {
            'canonical_asset_id': pid,
            'project_activity_status': 'DATA_UNAVAILABLE',
            'activity_status_reason': REASON['DATA_UNAVAILABLE'],
            'evidence': {'note': 'No verified activity data available'},
            'is_github_applicable': github_applicable,
        }

    def _classify_from_github(
        self,
        pid: str,
        metrics: Dict[str, Any],
        mapping_status: str,
    ) -> Dict[str, Any]:
        """Classify using GitHub developer activity metrics.

        Implements the spec's multi-signal rule:
          - ACTIVE: meaningful current development
          - STALE: weak/declining but not abandoned
          - INACTIVE: hard-dead test (180d no commits, no contributors,
                      no releases, no activity, no contradiction)
        """
        # Extract signals with safe defaults.
        commits_30d = metrics.get('commits_30d') or 0
        commits_90d = metrics.get('commits_90d') or 0
        contributors_90d = metrics.get('unique_contributors_90d') or 0
        releases_90d = metrics.get('releases_90d') or 0
        last_commit_at = metrics.get('last_commit_at')
        active_repos_30d = metrics.get('active_repositories_30d') or 0
        active_repos_90d = metrics.get('active_repositories_90d') or 0
        days_since = metrics.get('days_since_last_commit')
        collection_status = metrics.get('collection_status', 'AVAILABLE')

        # If collection failed (RATE_LIMITED / API_ERROR), return DATA_UNAVAILABLE.
        if collection_status in ('RATE_LIMITED', 'API_ERROR', 'UNAVAILABLE'):
            return {
                'canonical_asset_id': pid,
                'project_activity_status': 'DATA_UNAVAILABLE',
                'activity_status_reason': REASON['DATA_UNAVAILABLE'],
                'evidence': {
                    'collection_status': collection_status,
                    'note': 'GitHub data collection failed; preserve previous state',
                },
                'is_github_applicable': True,
            }

        # Compute days_since_last_commit if not provided.
        if days_since is None and last_commit_at:
            try:
                lc = datetime.fromisoformat(last_commit_at.replace('Z', '+00:00'))
                days_since = (self.now - lc).days
            except (ValueError, TypeError):
                days_since = None

        evidence = {
            'commits_30d': commits_30d,
            'commits_90d': commits_90d,
            'contributors_90d': contributors_90d,
            'releases_90d': releases_90d,
            'active_repositories_30d': active_repos_30d,
            'active_repositories_90d': active_repos_90d,
            'last_commit_at': last_commit_at,
            'days_since_last_commit': days_since,
            'collection_status': collection_status,
        }

        # Hard-dead test: ~180d no commits + no contributors + no releases
        # + no active repos + no contradiction.
        is_hard_dead = (
            (days_since is None or days_since >= HARD_DEAD_DAYS)
            and commits_90d == 0
            and contributors_90d == 0
            and releases_90d == 0
            and active_repos_90d == 0
        )

        if is_hard_dead:
            return {
                'canonical_asset_id': pid,
                'project_activity_status': 'INACTIVE',
                'activity_status_reason': REASON['PROJECT_ABANDONED'],
                'evidence': {
                    **evidence,
                    'hard_dead_test': True,
                    'hard_dead_threshold_days': HARD_DEAD_DAYS,
                },
                'is_github_applicable': True,
            }

        # STALE: weak/declining dev but some recent activity within ~180d.
        # Examples: little/no activity in last 90d, but commits within 180d.
        is_stale = (
            (commits_90d < MIN_RECENT_COMMITS_90D
             or contributors_90d < MIN_CONTRIBUTORS_FOR_ACTIVE)
            and not is_hard_dead
            and (last_commit_at is not None
                 and days_since is not None
                 and days_since < HARD_DEAD_DAYS)
        )

        if is_stale:
            return {
                'canonical_asset_id': pid,
                'project_activity_status': 'STALE',
                'activity_status_reason': REASON['NO_DEVELOPMENT_90D'],
                'evidence': {
                    **evidence,
                    'note': 'Weak/declining development; not yet abandoned',
                },
                'is_github_applicable': True,
            }

        # ACTIVE: meaningful current development.
        # Use multi-signal evaluation (NOT single-metric).
        is_active = (
            (commits_90d >= MIN_RECENT_COMMITS_90D
             or releases_90d >= 1
             or active_repos_30d >= 1)
            and contributors_90d >= 1
        )

        if is_active:
            return {
                'canonical_asset_id': pid,
                'project_activity_status': 'ACTIVE',
                'activity_status_reason': REASON['ACTIVE_DEVELOPMENT'],
                'evidence': evidence,
                'is_github_applicable': True,
            }

        # Has some data but doesn't fit ACTIVE / STALE / INACTIVE cleanly.
        # Default to STALE rather than INACTIVE (spec: don't kill projects
        # on weak evidence).
        return {
            'canonical_asset_id': pid,
            'project_activity_status': 'STALE',
            'activity_status_reason': REASON['NO_DEVELOPMENT_90D'],
            'evidence': {
                **evidence,
                'note': 'Insufficient activity to confirm ACTIVE; defaulting to STALE',
            },
            'is_github_applicable': True,
        }

    def _classify_from_non_github(
        self,
        pid: str,
        project: Dict[str, Any],
        evidence: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Classify using non-GitHub sector-specific evidence.

        Per spec: only use verified sources, do not fabricate.
        """
        status = evidence.get('activity_status')
        reason = evidence.get('activity_reason', REASON['NETWORK_ACTIVITY_CONFIRMED'])

        if status in ACTIVITY_STATES:
            return {
                'canonical_asset_id': pid,
                'project_activity_status': status,
                'activity_status_reason': reason,
                'evidence': evidence,
                'is_github_applicable': False,
            }

        # Default: insufficient evidence
        return {
            'canonical_asset_id': pid,
            'project_activity_status': 'DATA_UNAVAILABLE',
            'activity_status_reason': REASON['DATA_UNAVAILABLE'],
            'evidence': evidence,
            'is_github_applicable': False,
        }


def load_github_snapshot(path: str) -> Dict[str, Any]:
    """Load GitHub developer activity snapshot if available.

    Returns empty dict if file not found (caller must check
    github_snapshot_validated separately).
    """
    import os
    if not os.path.exists(path):
        return {}
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    # Snapshot is keyed by canonical_asset_id.
    if isinstance(data, dict) and 'metadata' in data:
        # Wrapped format
        return data.get('projects', data.get('snapshot', {}))
    return data


def main():
    """CLI entry: print a brief usage message."""
    print('=' * 80)
    print('PAYD Activity Status Classifier')
    print('=' * 80)
    print()
    print('This module is intended to be imported, not run directly.')
    print('Use the SectorRotationEngine v2 for full pipeline execution.')
    print()
    print('Activity states:')
    for s in sorted(ACTIVITY_STATES):
        print(f'  - {s}')
    print()
    print('Default mode: DATA_UNAVAILABLE (until GitHub snapshot is validated).')


if __name__ == '__main__':
    main()
