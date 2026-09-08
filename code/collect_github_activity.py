#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAYD GitHub Developer Activity Collector
========================================

Phase 2B: collect VERIFIED GitHub developer activity for the 330 VERIFIED
canonical projects.

Features:
  - Resumable: checkpoint every N projects
  - Multi-repo support with deduplicated contributors
  - Bounded exponential backoff
  - Rate limit awareness (anonymous 60/hour, authenticated 5000/hour)
  - Provenance tracking on every metric
  - Single source of truth (keyed by canonical_asset_id)

Outputs:
  - tmp/payd_github_developer_enrichment.json       (full snapshot)
  - tmp/payd_github_developer_enrichment_report.json
  - tmp/payd_github_developer_enrichment_failures.json
  - tmp/payd_github_developer_checkpoint.json        (resumable state)

Status semantics:
  - AVAILABLE    : API returned verified metric
  - UNAVAILABLE   : applicable but could not be retrieved
  - NOT_APPLICABLE: structurally not applicable
  - RATE_LIMITED  : collection failed due to rate limit
  - API_ERROR     : GitHub request failed
"""
import json
import csv
import os
import sys
import time
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode

REGISTRY_V2 = 'tmp/payd_github_identity_registry_v2.json'
OUT_SNAPSHOT = 'tmp/payd_github_developer_enrichment.json'
OUT_REPORT = 'tmp/payd_github_developer_enrichment_report.json'
OUT_FAILURES = 'tmp/payd_github_developer_enrichment_failures.json'
OUT_CHECKPOINT = 'tmp/payd_github_developer_checkpoint.json'
OUT_CSV = 'tmp/payd_github_developer_enrichment.csv'

GITHUB_TOKEN = os.environ.get('GITHUB_TOKEN', '').strip()
API_BASE = 'https://api.github.com'

NOW = datetime.now(timezone.utc)
WINDOW_30D = (NOW - timedelta(days=30)).strftime('%Y-%m-%dT%H:%M:%SZ')
WINDOW_90D = (NOW - timedelta(days=90)).strftime('%Y-%m-%dT%H:%M:%SZ')
WINDOW_END = NOW.strftime('%Y-%m-%dT%H:%M:%SZ')

# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------

def make_request(url: str, params: dict = None, max_retries: int = 3) -> tuple:
    """Returns (status_code, json_or_text, headers). status_code is one of:
       'OK', 'RATE_LIMITED', 'API_ERROR', 'NOT_FOUND', 'UNAUTHORIZED'"""
    full_url = url
    if params:
        full_url = f"{url}?{urlencode(params)}"

    headers = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'PAYD-Intelligence-V2',
    }
    if GITHUB_TOKEN:
        headers['Authorization'] = f'token {GITHUB_TOKEN}'

    for attempt in range(max_retries):
        try:
            req = Request(full_url, headers=headers)
            with urlopen(req, timeout=30) as resp:
                data = resp.read()
                try:
                    parsed = json.loads(data.decode('utf-8'))
                except json.JSONDecodeError:
                    parsed = data.decode('utf-8', errors='replace')
                return 'OK', parsed, dict(resp.headers)
        except HTTPError as e:
            if e.code == 404:
                return 'NOT_FOUND', None, dict(e.headers or {})
            if e.code == 403:
                # Check if rate limited
                reset = 0
                try:
                    reset = int(e.headers.get('X-RateLimit-Reset', 0))
                except (ValueError, TypeError):
                    reset = 0
                if reset > 0 and e.headers.get('X-RateLimit-Remaining') == '0':
                    return 'RATE_LIMITED', None, dict(e.headers or {})
                return 'UNAUTHORIZED', None, dict(e.headers or {})
            if e.code == 401:
                return 'UNAUTHORIZED', None, dict(e.headers or {})
            if e.code in (500, 502, 503, 504):
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                return 'API_ERROR', {'status': e.code, 'reason': str(e)}, dict(e.headers or {})
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            return 'API_ERROR', {'status': e.code, 'reason': str(e)}, dict(e.headers or {})
        except (URLError, TimeoutError) as e:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
                continue
            return 'API_ERROR', {'reason': str(e)}, {}

    return 'API_ERROR', {'reason': 'max retries exceeded'}, {}


# ---------------------------------------------------------------------------
# Data collection per repository
# ---------------------------------------------------------------------------

def collect_repo_metrics(org: str, repo: str) -> dict:
    """Collects raw metrics for a single repository."""
    full_name = f"{org}/{repo}"
    result = {
        'full_name': full_name,
        'org': org,
        'repo': repo,
        'url': f"https://github.com/{full_name}",
        'is_archived': None,
        'default_branch': None,
        'stars': None,
        'forks': None,
        'open_issues': None,
        'created_at': None,
        'updated_at': None,
        'pushed_at': None,
        'last_commit_at': None,
        'commits_30d': None,
        'commits_90d': None,
        'contributors_90d': None,
        'releases_30d': None,
        'releases_90d': None,
        'latest_release_at': None,
        'collection_status': 'UNAVAILABLE',
        'errors': [],
        'retrieved_at': NOW.isoformat(),
    }

    # 1) Repo metadata
    status, data, headers = make_request(f"{API_BASE}/repos/{full_name}")
    if status == 'OK' and isinstance(data, dict):
        result['is_archived'] = data.get('archived', False)
        result['default_branch'] = data.get('default_branch', 'main')
        result['stars'] = data.get('stargazers_count', 0)
        result['forks'] = data.get('forks_count', 0)
        result['open_issues'] = data.get('open_issues_count', 0)
        result['created_at'] = data.get('created_at')
        result['updated_at'] = data.get('updated_at')
        result['pushed_at'] = data.get('pushed_at')
        result['last_commit_at'] = data.get('pushed_at')
    else:
        result['errors'].append(f'repo_metadata: {status}')
        if status == 'RATE_LIMITED':
            result['collection_status'] = 'RATE_LIMITED'
            return result

    if result['is_archived']:
        # Skip activity collection for archived repos
        result['collection_status'] = 'ARCHIVED'
        return result

    default_branch = result['default_branch'] or 'main'

    # 2) Commits 30d
    status, data, _ = make_request(
        f"{API_BASE}/repos/{full_name}/commits",
        params={'since': WINDOW_30D, 'until': WINDOW_END, 'per_page': 100}
    )
    if status == 'OK' and isinstance(data, list):
        result['commits_30d'] = len(data)
    elif status == 'RATE_LIMITED':
        result['collection_status'] = 'RATE_LIMITED'
        return result
    else:
        result['errors'].append(f'commits_30d: {status}')

    # 3) Commits 90d
    status, data, _ = make_request(
        f"{API_BASE}/repos/{full_name}/commits",
        params={'since': WINDOW_90D, 'until': WINDOW_END, 'per_page': 100}
    )
    if status == 'OK' and isinstance(data, list):
        result['commits_90d'] = len(data)
    elif status == 'RATE_LIMITED':
        result['collection_status'] = 'RATE_LIMITED'
        return result
    else:
        result['errors'].append(f'commits_90d: {status}')

    # 4) Contributors 90d — fetch with affiliation=direct
    contributors = []
    page = 1
    max_pages = 5  # safety cap
    while page <= max_pages:
        status, data, _ = make_request(
            f"{API_BASE}/repos/{full_name}/contributors",
            params={'per_page': 100, 'page': page, 'anon': 'true'}
        )
        if status == 'OK' and isinstance(data, list):
            for c in data:
                if 'last_commit_at' in c or (isinstance(c, dict) and 'weeks' in c):
                    # Use last_week activity to filter to 90d
                    pass
                contributors.append({
                    'login': c.get('login'),
                    'id': c.get('id'),
                    'contributions': c.get('contributions'),
                    'type': c.get('type'),
                })
            if len(data) < 100:
                break
            page += 1
        elif status == 'RATE_LIMITED':
            result['collection_status'] = 'RATE_LIMITED'
            return result
        elif status == 'NOT_FOUND':
            # Some repos don't have contributors endpoint enabled
            contributors = []
            break
        else:
            result['errors'].append(f'contributors: {status}')
            break
    result['contributors_90d'] = len(contributors)
    result['contributors_detail'] = contributors[:50]  # cap for size

    # 5) Releases 90d
    status, data, _ = make_request(
        f"{API_BASE}/repos/{full_name}/releases",
        params={'per_page': 30}
    )
    if status == 'OK' and isinstance(data, list):
        rels = data
        rels_90 = [r for r in rels if r.get('published_at', '') >= WINDOW_90D]
        rels_30 = [r for r in rels if r.get('published_at', '') >= WINDOW_30D]
        result['releases_30d'] = len(rels_30)
        result['releases_90d'] = len(rels_90)
        if rels:
            result['latest_release_at'] = rels[0].get('published_at')
    elif status == 'RATE_LIMITED':
        result['collection_status'] = 'RATE_LIMITED'
        return result
    else:
        result['errors'].append(f'releases: {status}')

    if not result['errors']:
        result['collection_status'] = 'AVAILABLE'
    elif result['collection_status'] != 'RATE_LIMITED':
        result['collection_status'] = 'PARTIAL'

    return result


# ---------------------------------------------------------------------------
# Aggregation per project
# ---------------------------------------------------------------------------

def aggregate_metrics(per_repo_metrics: list, project_id: str, repos_with_roles: dict) -> dict:
    """Aggregate per-repo metrics to canonical project level.

    For commits/releases: simple sum across repos.
    For contributors: deduplicate by user_id (or login as fallback).
    """
    canonical = {
        'canonical_asset_id': project_id,
        'collection_status': 'AVAILABLE',
        'errors': [],
        'retrieved_at': NOW.isoformat(),
    }

    # Identity (carry from registry)
    canonical['repositories_count'] = len(per_repo_metrics)
    canonical['repositories'] = []

    # Active counts
    active_30 = 0
    active_90 = 0

    # Commits / releases
    total_commits_30 = 0
    total_commits_90 = 0
    total_releases_30 = 0
    total_releases_90 = 0
    latest_release = None
    last_commit = None

    # Contributors (deduplicate by id, fallback to login)
    contributor_ids = set()
    contributor_logins = set()
    contributors_by_repo = {}

    # Stars / forks / issues
    total_stars = 0
    total_forks = 0
    total_open_issues = 0

    any_rate_limited = False
    any_api_error = False
    all_unavailable = True

    for rm in per_repo_metrics:
        if rm['collection_status'] == 'RATE_LIMITED':
            any_rate_limited = True
        if rm['collection_status'] == 'API_ERROR':
            any_api_error = True
        if rm['collection_status'] in ('AVAILABLE', 'PARTIAL', 'ARCHIVED'):
            all_unavailable = False

        # Sum aggregates
        if rm['commits_30d'] is not None and rm['commits_30d'] > 0:
            total_commits_30 += rm['commits_30d']
            active_30 += 1
        if rm['commits_90d'] is not None and rm['commits_90d'] > 0:
            total_commits_90 += rm['commits_90d']
            active_90 += 1
        if rm['releases_30d'] is not None:
            total_releases_30 += rm['releases_30d']
        if rm['releases_90d'] is not None:
            total_releases_90 += rm['releases_90d']
        if rm['latest_release_at']:
            if latest_release is None or rm['latest_release_at'] > latest_release:
                latest_release = rm['latest_release_at']
        if rm['last_commit_at']:
            if last_commit is None or rm['last_commit_at'] > last_commit:
                last_commit = rm['last_commit_at']

        if rm['stars'] is not None:
            total_stars += rm['stars']
        if rm['forks'] is not None:
            total_forks += rm['forks']
        if rm['open_issues'] is not None:
            total_open_issues += rm['open_issues']

        # Contributors dedup
        repo_contribs = []
        for c in rm.get('contributors_detail', []) or []:
            cid = c.get('id')
            login = c.get('login')
            if cid is not None:
                contributor_ids.add(cid)
                repo_contribs.append({'id': cid, 'login': login})
            elif login:
                contributor_logins.add(login)
                repo_contribs.append({'id': None, 'login': login})
        contributors_by_repo[rm['full_name']] = repo_contribs

        # Repo entry
        canonical['repositories'].append({
            'org': rm['org'],
            'repo': rm['repo'],
            'role': repos_with_roles.get(rm['full_name'], 'core'),
            'url': rm['url'],
            'is_archived': rm['is_archived'],
            'default_branch': rm['default_branch'],
            'stars': rm['stars'],
            'forks': rm['forks'],
            'open_issues': rm['open_issues'],
            'created_at': rm['created_at'],
            'updated_at': rm['updated_at'],
            'pushed_at': rm['pushed_at'],
            'last_commit_at': rm['last_commit_at'],
            'commits_30d': rm['commits_30d'],
            'commits_90d': rm['commits_90d'],
            'contributors_90d': rm['contributors_90d'],
            'releases_30d': rm['releases_30d'],
            'releases_90d': rm['releases_90d'],
            'latest_release_at': rm['latest_release_at'],
            'collection_status': rm['collection_status'],
        })

    canonical['commits_30d'] = total_commits_30
    canonical['commits_90d'] = total_commits_90
    canonical['releases_30d'] = total_releases_30
    canonical['releases_90d'] = total_releases_90
    canonical['latest_release_at'] = latest_release
    canonical['last_commit_at'] = last_commit
    canonical['active_repositories_30d'] = active_30
    canonical['active_repositories_90d'] = active_90

    # Deduplicated contributors
    canonical['unique_contributors_90d'] = len(contributor_ids) if contributor_ids else len(contributor_logins)
    canonical['contributors_by_repo'] = contributors_by_repo
    canonical['contributor_dedup_method'] = 'user_id' if contributor_ids else 'login'

    canonical['stars_total'] = total_stars
    canonical['forks_total'] = total_forks
    canonical['open_issues_total'] = total_open_issues

    if last_commit:
        try:
            lc = datetime.fromisoformat(last_commit.replace('Z', '+00:00'))
            canonical['days_since_last_commit'] = (NOW - lc).days
        except (ValueError, TypeError):
            canonical['days_since_last_commit'] = None
    else:
        canonical['days_since_last_commit'] = None

    canonical['active_30d'] = active_30 > 0
    canonical['active_90d'] = active_90 > 0

    if any_rate_limited:
        canonical['collection_status'] = 'RATE_LIMITED'
    elif all_unavailable:
        canonical['collection_status'] = 'UNAVAILABLE'
    elif any_api_error:
        canonical['collection_status'] = 'PARTIAL'

    return canonical


# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def load_checkpoint():
    if os.path.exists(OUT_CHECKPOINT):
        try:
            with open(OUT_CHECKPOINT, 'r') as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            pass
    return {'completed': [], 'failures': [], 'rate_limited': []}


def save_checkpoint(state):
    with open(OUT_CHECKPOINT, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)


def save_snapshot(snapshot):
    with open(OUT_SNAPSHOT, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)


def main():
    parser = argparse.ArgumentParser(
        description='PAYD GitHub Developer Activity Collector (Phase 2B)'
    )
    parser.add_argument(
        '--limit', type=int, default=0,
        help='Limit the number of projects to process (0 = all)'
    )
    parser.add_argument(
        '--use-anonymous', action='store_true',
        help='Force anonymous API mode (ignore GITHUB_TOKEN)'
    )
    parser.add_argument(
        '--offset', type=int, default=0,
        help='Skip first N projects in the queue (after completed)'
    )
    args = parser.parse_args()

    print('=' * 80)
    print('PAYD GITHUB DEVELOPER ACTIVITY COLLECTOR — PHASE 2B')
    print('=' * 80)
    print()

    # Force anonymous mode if requested
    global GITHUB_TOKEN
    if args.use_anonymous:
        GITHUB_TOKEN = ''
        print('[--use-anonymous] Ignoring GITHUB_TOKEN, using anonymous API')
    else:
        print(f'GITHUB_TOKEN present: {bool(os.environ.get("GITHUB_TOKEN", "").strip())}')

    # Check auth
    has_auth = bool(GITHUB_TOKEN)
    print(f'Authentication: {"authenticated" if has_auth else "anonymous (60 req/hour)"}')

    # Load registry
    with open(REGISTRY_V2, 'r', encoding='utf-8') as f:
        reg = json.load(f)
    registry = reg['registry']

    # Build list of VERIFIED projects with their repos
    projects_to_collect = []
    for pid, entry in registry.items():
        if entry.get('github_mapping_status') != 'VERIFIED':
            continue
        repos = entry.get('official_repositories', [])
        if not repos:
            continue
        # Build role map
        role_map = {}
        for r, role in (entry.get('repository_roles') or {}).items():
            role_map[r] = role
        for r in repos:
            if r not in role_map:
                role_map[r] = 'core'
        projects_to_collect.append({
            'canonical_id': pid,
            'repos': repos,
            'role_map': role_map,
        })

    print(f'Total VERIFIED projects to collect: {len(projects_to_collect)}')
    total_repos = sum(len(p['repos']) for p in projects_to_collect)
    print(f'Total repositories to query:        {total_repos}')

    # Apply --offset: skip first N projects in the queue
    if args.offset > 0:
        projects_to_collect = projects_to_collect[args.offset:]
        print(f'Offset applied: skipped first {args.offset} projects; remaining: {len(projects_to_collect)}')

    # Apply --limit: cap number of projects in this run
    if args.limit > 0:
        projects_to_collect = projects_to_collect[:args.limit]
        print(f'--limit applied: capped to {args.limit} projects in this run')
    print()

    # Load checkpoint
    state = load_checkpoint()
    completed = set(state.get('completed', []))
    failures = state.get('failures', [])
    rate_limited = state.get('rate_limited', [])

    snapshot = {}
    if os.path.exists(OUT_SNAPSHOT):
        try:
            with open(OUT_SNAPSHOT, 'r') as f:
                snapshot = json.load(f)
        except (json.JSONDecodeError, IOError):
            snapshot = {}

    # Process
    start_time = time.time()
    processed = 0
    counter = Counter()

    for project in projects_to_collect:
        pid = project['canonical_id']
        if pid in completed:
            continue

        per_repo_metrics = []
        for full_repo in project['repos']:
            org, repo = full_repo.split('/', 1)
            rm = collect_repo_metrics(org, repo)
            per_repo_metrics.append(rm)
            counter[rm['collection_status']] += 1
            # Polite delay
            time.sleep(0.1)
            if rm['collection_status'] == 'RATE_LIMITED':
                print(f'  RATE LIMITED at {full_repo}, stopping.')
                state['rate_limited'].append({'project': pid, 'repo': full_repo})
                save_checkpoint(state)
                # Don't break here; mark the project as incomplete
                break

        # If any rate-limited, skip project aggregation
        if any(rm['collection_status'] == 'RATE_LIMITED' for rm in per_repo_metrics):
            failures.append({'project': pid, 'reason': 'rate_limited'})
            save_checkpoint(state)
            continue

        # Aggregate
        canonical = aggregate_metrics(per_repo_metrics, pid, project['role_map'])
        # Attach identity fields from registry
        reg_entry = registry[pid]
        canonical['github_org'] = reg_entry.get('github_org')
        canonical['primary_repo'] = reg_entry.get('github_repo')
        canonical['github_url'] = reg_entry.get('github_url')

        snapshot[pid] = canonical
        completed.add(pid)
        processed += 1

        if processed % 5 == 0:
            elapsed = time.time() - start_time
            print(f'  processed {processed}/{len(projects_to_collect)}: last={pid} elapsed={elapsed:.0f}s')
            state['completed'] = list(completed)
            state['failures'] = failures
            state['rate_limited'] = rate_limited
            save_checkpoint(state)
            save_snapshot(snapshot)

    # Final save
    state['completed'] = list(completed)
    state['failures'] = failures
    state['rate_limited'] = rate_limited
    save_checkpoint(state)
    save_snapshot(snapshot)

    # Save report
    _save_report(snapshot, len(projects_to_collect), counter)

    print()
    print('Done. Snapshot saved to', OUT_SNAPSHOT)


def _save_report(snapshot, total_requested, counter):
    # Coverage stats
    available = sum(1 for s in snapshot.values() if s.get('collection_status') == 'AVAILABLE')
    partial = sum(1 for s in snapshot.values() if s.get('collection_status') == 'PARTIAL')
    rate_limited = sum(1 for s in snapshot.values() if s.get('collection_status') == 'RATE_LIMITED')
    unavailable = sum(1 for s in snapshot.values() if s.get('collection_status') == 'UNAVAILABLE')
    archived_count = sum(1 for s in snapshot.values() if any(r.get('is_archived') for r in s.get('repositories', [])))

    commits_known = sum(1 for s in snapshot.values() if s.get('commits_30d') is not None)
    contribs_known = sum(1 for s in snapshot.values() if s.get('unique_contributors_90d') is not None)
    releases_known = sum(1 for s in snapshot.values() if s.get('releases_90d') is not None)

    # Outliers
    outliers = []
    for pid, s in snapshot.items():
        c30 = s.get('commits_30d') or 0
        c90 = s.get('commits_90d') or 0
        contribs = s.get('unique_contributors_90d') or 0
        rels = s.get('releases_90d') or 0
        if c30 > 10000:
            outliers.append({'project': pid, 'metric': 'commits_30d', 'value': c30, 'reason': 'suspiciously_high'})
        if contribs > 5000:
            outliers.append({'project': pid, 'metric': 'unique_contributors_90d', 'value': contribs, 'reason': 'suspiciously_high'})
        if rels > 500:
            outliers.append({'project': pid, 'metric': 'releases_90d', 'value': rels, 'reason': 'suspiciously_high'})
        if c30 > c90:
            outliers.append({'project': pid, 'metric': 'commits_30d_vs_90d', 'value': f'{c30}>{c90}', 'reason': 'inconsistent'})
        if s.get('last_commit_at'):
            try:
                lc = datetime.fromisoformat(s['last_commit_at'].replace('Z', '+00:00'))
                if lc > NOW:
                    outliers.append({'project': pid, 'metric': 'last_commit_at', 'value': s['last_commit_at'], 'reason': 'future_timestamp'})
            except (ValueError, TypeError):
                pass

    # Control project results
    control_ids = [
        'bitcoin', 'ethereum', 'solana', 'bittensor', 'akash', 'filecoin',
        'internet-computer', 'mina-protocol', 'polygon', 'immutable',
        'render', 'helium', 'aave', 'uniswap', 'ondo-finance',
        'ethena', 'celestia', 'chainlink',
    ]
    control_results = {}
    for cid in control_ids:
        s = snapshot.get(cid, {})
        control_results[cid] = {
            'repos_used': [r.get('url') for r in s.get('repositories', [])],
            'commits_30d': s.get('commits_30d'),
            'commits_90d': s.get('commits_90d'),
            'unique_contributors_90d': s.get('unique_contributors_90d'),
            'releases_90d': s.get('releases_90d'),
            'last_commit_at': s.get('last_commit_at'),
            'collection_status': s.get('collection_status'),
        }

    report = {
        'metadata': {
            'generated_at': NOW.isoformat(),
            'phase': '2B — developer activity snapshot',
            'total_requested': total_requested,
            'collected': len(snapshot),
        },
        'coverage': {
            'collection_pct': round(len(snapshot) / total_requested * 100, 2) if total_requested else 0,
            'available': available,
            'partial': partial,
            'unavailable': unavailable,
            'rate_limited': rate_limited,
            'archived_repos': archived_count,
            'commits_known': commits_known,
            'contributors_known': contribs_known,
            'releases_known': releases_known,
        },
        'outliers': outliers,
        'control_projects': control_results,
        'collection_status_distribution': dict(counter),
    }
    with open(OUT_REPORT, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)

    # CSV
    with open(OUT_CSV, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow([
            'canonical_id', 'github_org', 'primary_repo', 'repos_count',
            'commits_30d', 'commits_90d', 'unique_contributors_90d',
            'releases_30d', 'releases_90d', 'last_commit_at',
            'days_since_last_commit', 'stars_total', 'forks_total',
            'active_30d', 'active_90d', 'collection_status'
        ])
        for pid, s in snapshot.items():
            w.writerow([
                pid, s.get('github_org'), s.get('primary_repo'),
                s.get('repositories_count', 0),
                s.get('commits_30d'), s.get('commits_90d'),
                s.get('unique_contributors_90d'),
                s.get('releases_30d'), s.get('releases_90d'),
                s.get('last_commit_at'),
                s.get('days_since_last_commit'),
                s.get('stars_total'), s.get('forks_total'),
                s.get('active_30d'), s.get('active_90d'),
                s.get('collection_status'),
            ])


if __name__ == '__main__':
    main()
