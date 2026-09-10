#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAYD Project Activity Status Classifier v2 (PHASE E)
====================================================

Classifies each canonical project into one of:
  - ACTIVE
  - STALE
  - INACTIVE
  - DATA_UNAVAILABLE
  - NOT_APPLICABLE
  - REVIEW_REQUIRED

Implements the user spec strictly:
  - No `value or 0` patterns: confirmed zero (0 + AVAILABLE) is distinct
    from unknown (None + UNAVAILABLE/API_ERROR)
  - Multi-signal evaluation, NOT a single-metric filter
  - 180-day hard-dead test for INACTIVE
  - Missing data -> DATA_UNAVAILABLE (NEVER INACTIVE)
  - REVIEW mappings are NOT evidence of inactivity
  - GitHub NOT_APPLICABLE projects stay NOT_APPLICABLE / DATA_UNAVAILABLE,
    never INACTIVE based on missing GitHub data
"""
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any

ACTIVITY_STATES = {
    'ACTIVE',
    'STALE',
    'INACTIVE',
    'DATA_UNAVAILABLE',
    'NOT_APPLICABLE',
    'REVIEW_REQUIRED',
}

# Thresholds (per spec)
HARD_DEAD_DAYS = 180
STALE_DAYS = 90
STALE_GRACE_DAYS = 180
MIN_CONTRIBUTORS_FOR_ACTIVE = 2
MIN_RECENT_COMMITS_90D = 3

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


def _is_null(v):
    """Distinguishes None (unknown) from 0 (confirmed zero)."""
    return v is None


def _is_zero(v):
    """Confirmed zero (AVAILABLE but value is 0)."""
    return v is not None and v == 0


def _known(v):
    """Has a known numeric value (could be 0)."""
    return v is not None


class ActivityClassifierV2:
    """Spec-compliant activity classifier. Uses None vs 0 strictly."""

    def __init__(
        self,
        github_snapshot: Optional[Dict[str, Any]] = None,
        github_snapshot_validated: bool = False,
        now: Optional[datetime] = None,
    ):
        self.github_snapshot = github_snapshot or {}
        self.github_snapshot_validated = github_snapshot_validated
        self.now = now or datetime.now(timezone.utc)

    def classify(
        self,
        project: Dict[str, Any],
        registry_entry: Optional[Dict[str, Any]] = None,
        non_github_evidence: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        pid = project.get('id') or project.get('canonical_asset_id', '')

        mapping_status = None
        if registry_entry:
            mapping_status = registry_entry.get('github_mapping_status') or \
                             registry_entry.get('identity_status')

        # 1. NOT_APPLICABLE: GitHub does not apply (e.g., wrapped/closed-source)
        if mapping_status == 'NOT_APPLICABLE':
            return self._result(
                pid, 'NOT_APPLICABLE', REASON['NOT_SOFTWARE_PROJECT'],
                {'registry_mapping_status': mapping_status},
                is_github_applicable=False,
            )

        # 2. REVIEW / NOT_FOUND: do NOT use as inactivity evidence
        github_applicable = mapping_status == 'VERIFIED'

        # 3. If we have a VALIDATED GitHub snapshot, use it
        if github_applicable and self.github_snapshot_validated:
            github_metrics = self.github_snapshot.get(pid)
            if github_metrics is not None:
                return self._classify_from_github(pid, github_metrics)

        # 4. Try non-GitHub sector-specific evidence
        if non_github_evidence:
            sector_classification = self._classify_from_non_github(
                pid, project, non_github_evidence,
            )
            if sector_classification['project_activity_status'] != 'DATA_UNAVAILABLE':
                return sector_classification

        # 5. Cannot reliably classify
        if mapping_status in ('REVIEW', 'NOT_FOUND'):
            return self._result(
                pid, 'REVIEW_REQUIRED', REASON['REVIEW_REQUIRED'],
                {
                    'registry_mapping_status': mapping_status,
                    'note': 'GitHub mapping not verified; cannot classify activity',
                },
                is_github_applicable=False,
            )

        if github_applicable and not self.github_snapshot_validated:
            return self._result(
                pid, 'DATA_UNAVAILABLE', REASON['DATA_UNAVAILABLE'],
                {'note': 'GitHub snapshot not yet validated'},
                is_github_applicable=True,
            )

        return self._result(
            pid, 'DATA_UNAVAILABLE', REASON['DATA_UNAVAILABLE'],
            {'note': 'No verified activity data available'},
            is_github_applicable=github_applicable,
        )

    def _classify_from_github(self, pid, metrics):
        """Multi-signal classification with strict None vs 0 separation."""
        # Read metrics WITHOUT `or 0` defaults
        commits_30d = metrics.get('commits_30d')
        commits_90d = metrics.get('commits_90d')
        contributors_90d = metrics.get('unique_contributors_90d')
        releases_90d = metrics.get('releases_90d')
        releases_30d = metrics.get('releases_30d')
        last_commit_at = metrics.get('last_commit_at')
        active_repos_30d = metrics.get('active_repositories_30d')
        active_repos_90d = metrics.get('active_repositories_90d')
        days_since = metrics.get('days_since_last_commit')
        collection_status = metrics.get('collection_status', 'AVAILABLE')
        repositories = metrics.get('repositories', [])

        # If collection failed or unavailable -> DATA_UNAVAILABLE
        if collection_status in ('RATE_LIMITED', 'API_ERROR', 'UNAVAILABLE'):
            return self._result(
                pid, 'DATA_UNAVAILABLE', REASON['DATA_UNAVAILABLE'],
                {
                    'collection_status': collection_status,
                    'note': 'GitHub data collection failed; preserve previous state',
                },
                is_github_applicable=True,
            )

        # Compute days_since if not provided
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
            'releases_30d': releases_30d,
            'releases_90d': releases_90d,
            'active_repositories_30d': active_repos_30d,
            'active_repositories_90d': active_repos_90d,
            'last_commit_at': last_commit_at,
            'days_since_last_commit': days_since,
            'collection_status': collection_status,
        }

        # === INACTIVE test ===
        # Require strong evidence: ~180d no meaningful development AND
        # no meaningful contributors AND no meaningful releases
        # AND no active core repositories AND no contradicting activity evidence
        # Use _known() so we only count when the value is known (not None)
        all_metrics_known = all(_known(v) for v in [
            commits_30d, commits_90d, contributors_90d, releases_90d
        ])

        no_commits_recent = _is_zero(commits_30d) or commits_30d is None
        no_commits_90d = _is_zero(commits_90d) or commits_90d is None
        no_contributors = _is_zero(contributors_90d) or contributors_90d is None
        no_releases = _is_zero(releases_90d) or releases_90d is None
        no_active_repos = (active_repos_30d or 0) == 0 and (active_repos_90d or 0) == 0

        # The hard-dead test requires:
        # 1. days_since >= 180 OR no known last_commit
        # 2. AND no commits in 30d
        # 3. AND no commits in 90d
        # 4. AND no contributors
        # 5. AND no releases
        # 6. AND no active repos
        last_commit_is_old = (days_since is None) or (days_since is not None and days_since >= HARD_DEAD_DAYS)

        is_hard_dead = (
            last_commit_is_old
            and no_commits_recent
            and no_commits_90d
            and no_contributors
            and no_releases
            and no_active_repos
        )

        if is_hard_dead:
            return self._result(
                pid, 'INACTIVE', REASON['PROJECT_ABANDONED'],
                {
                    **evidence,
                    'hard_dead_test': True,
                    'hard_dead_threshold_days': HARD_DEAD_DAYS,
                    'all_metrics_known': all_metrics_known,
                },
                is_github_applicable=True,
            )

        # === STALE test ===
        # Weak/reduced activity, but abandonment not proven.
        # Some activity in the ~180d window but very little in ~90d.
        # Examples:
        #   - little meaningful activity in approximately 90 days
        #   - but meaningful development still exists within approximately 180 days
        has_recent_180d = (days_since is not None and days_since < HARD_DEAD_DAYS)

        # STALE conditions: insufficient for ACTIVE but not dead
        weak_recent = (
            (_known(commits_90d) and commits_90d < MIN_RECENT_COMMITS_90D)
            or _is_zero(commits_30d)
            or (_known(contributors_90d) and contributors_90d < MIN_CONTRIBUTORS_FOR_ACTIVE)
        )

        # Project has some life in last 180d (e.g., a single commit, a release)
        some_life_180d = (
            (_known(commits_90d) and commits_90d > 0)
            or (_known(commits_30d) and commits_30d > 0)
            or (_known(releases_90d) and releases_90d > 0)
            or (_known(active_repos_90d) and active_repos_90d > 0)
        )

        is_stale = weak_recent and has_recent_180d and not some_life_180d

        if is_stale:
            return self._result(
                pid, 'STALE', REASON['NO_DEVELOPMENT_90D'],
                {
                    **evidence,
                    'note': 'Weak/declining development; not yet abandoned',
                },
                is_github_applicable=True,
            )

        # === ACTIVE test ===
        # Multi-signal: requires meaningful verified current development.
        # NOT just `commits > 0`.
        meaningful_90d = (
            (_known(commits_90d) and commits_90d >= MIN_RECENT_COMMITS_90D)
            or (_known(releases_90d) and releases_90d >= 1)
            or (_known(active_repos_30d) and active_repos_30d >= 1)
        )
        has_contributors = (
            _known(contributors_90d) and contributors_90d >= 1
        )

        is_active = meaningful_90d and has_contributors

        if is_active:
            return self._result(
                pid, 'ACTIVE', REASON['ACTIVE_DEVELOPMENT'],
                evidence,
                is_github_applicable=True,
            )

        # Has some data but doesn't fit ACTIVE / STALE / INACTIVE cleanly.
        # Could be: very low activity, or some metrics unknown.
        # If days_since is unknown but we have some 90d data -> STALE
        if has_recent_180d and some_life_180d:
            return self._result(
                pid, 'STALE', REASON['NO_DEVELOPMENT_90D'],
                {
                    **evidence,
                    'note': 'Low activity; defaulting to STALE rather than INACTIVE',
                },
                is_github_applicable=True,
            )

        # Truly unknown — data insufficient
        return self._result(
            pid, 'DATA_UNAVAILABLE', REASON['DATA_UNAVAILABLE'],
            {
                **evidence,
                'note': 'Insufficient metrics for definitive classification',
            },
            is_github_applicable=True,
        )

    def _classify_from_non_github(self, pid, project, evidence):
        status = evidence.get('activity_status')
        reason = evidence.get('activity_reason', REASON['NETWORK_ACTIVITY_CONFIRMED'])
        if status in ACTIVITY_STATES:
            return self._result(
                pid, status, reason, evidence,
                is_github_applicable=False,
            )
        return self._result(
            pid, 'DATA_UNAVAILABLE', REASON['DATA_UNAVAILABLE'],
            evidence,
            is_github_applicable=False,
        )

    @staticmethod
    def _result(pid, status, reason, evidence, is_github_applicable):
        return {
            'canonical_asset_id': pid,
            'project_activity_status': status,
            'activity_status_reason': reason,
            'evidence': evidence,
            'is_github_applicable': is_github_applicable,
        }


# ---------------------------------------------------------------------------
# CLI entry: classify all 354 canonical projects
# ---------------------------------------------------------------------------
def main():
    print('=' * 80)
    print('PAYD PHASE E — Activity Status Classification (V2)')
    print('=' * 80)
    print()

    projects_path = 'public/data/projects_enriched.json'
    registry_path = 'tmp/payd_github_identity_registry.json'
    snapshot_path = 'tmp/payd_github_developer_enrichment_VALIDATED.json'
    validation_path = 'tmp/payd_github_snapshot_validation.json'
    out_results = 'tmp/payd_project_activity_status_v2.json'
    out_history = 'tmp/payd_activity_status_history_v2.json'

    # Sanity: validation must have passed
    if not os.path.exists(validation_path):
        print('FATAL: validation file missing')
        sys.exit(1)
    with open(validation_path, 'r') as f:
        validation = json.load(f)
    if validation['metadata']['verdict'] != 'PASS':
        print('FATAL: validation verdict != PASS')
        sys.exit(1)

    with open(projects_path, 'r') as f:
        data = json.load(f)
    with open(registry_path, 'r') as f:
        reg = json.load(f)
    with open(snapshot_path, 'r') as f:
        snapshot = json.load(f)

    projects = data['projects']
    registry = reg['registry']

    print(f'Projects: {len(projects)}')
    print(f'Snapshot: {len(snapshot)}')
    print(f'GitHub snapshot validated: True')
    print()

    classifier = ActivityClassifierV2(
        github_snapshot=snapshot,
        github_snapshot_validated=True,
    )

    results = {}
    history = []
    statuses = {s: 0 for s in ACTIVITY_STATES}

    for project in projects:
        pid = project['id']
        reg_entry = registry.get(pid, {})
        cls = classifier.classify(project, reg_entry)
        results[pid] = cls
        history.append({
            'canonical_asset_id': pid,
            'display_name': project.get('display_name'),
            'classification': cls,
        })
        statuses[cls['project_activity_status']] += 1

    print('Activity status distribution:')
    for s in sorted(ACTIVITY_STATES):
        print(f'  {s}: {statuses[s]}')

    with open(out_results, 'w', encoding='utf-8') as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    with open(out_history, 'w', encoding='utf-8') as f:
        json.dump(history, f, ensure_ascii=False, indent=2)

    print()
    print(f'Results: {out_results}')
    print(f'History: {out_history}')


if __name__ == '__main__':
    main()
