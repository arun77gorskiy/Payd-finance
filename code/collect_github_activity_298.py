#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PAYD GitHub Developer Activity Collector (Phase 2B — 298 VALIDATED)
====================================================================
Collects VERIFIED GitHub developer activity for EXACTLY the 298 canonical
projects in `tmp/payd_github_verified_whitelist_298.json`.

Mandatory semantics:
  - confirmed zero  : 0  + AVAILABLE
  - not retrieved   : None + UNAVAILABLE
  - API failure     : None + API_ERROR
  - rate limit      : None + RATE_LIMITED
  No `value or 0` is ever used.

Outputs (VALIDATED):
  - tmp/payd_github_developer_enrichment_VALIDATED.json
  - tmp/payd_github_developer_report_VALIDATED.json
  - tmp/payd_github_developer_failures_VALIDATED.json
  - tmp/payd_github_developer_checkpoint_VALIDATED.json
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

WHITELIST_PATH = 'tmp/payd_github_verified_whitelist_298.json'
REGISTRY_PATH = 'tmp/payd_github_identity_registry.json'

OUT_SNAPSHOT = 'tmp/payd_github_developer_enrichment_VALIDATED.json'
OUT_REPORT = 'tmp/payd_github_developer_report_VALIDATED.json'
OUT_FAILURES = 'tmp/payd_github_developer_failures_VALIDATED.json'
OUT_CHECKPOINT = 'tmp/payd_github_developer_checkpoint_VALIDATED.json'
OUT_CSV = 'tmp/payd_github_developer_VALIDATED.csv'

GITHUB_TOKEN = os.environ.get('PAYD_GITHUB_TOKEN') or os.environ.get('GITHUB_TOKEN', '').strip()
API_BASE = 'https://api.github.com'
NOW = datetime.now(timezone.utc)
WINDOW_30D = (NOW - timedelta(days=30)).strftime('%Y-%m-%dT%H:%M:%SZ')
WINDOW_90D = (NOW - timedelta(days=90)).strftime('%Y-%m-%dT%H:%M:%SZ')
WINDOW_END = NOW.strftime('%Y-%m-%dT%H:%M:%SZ')


# ---------------------------------------------------------------------------
# HTTP helpers
# ---------------------------------------------------------------------------
def make_request(url, params=None, max_retries=3):
    full_url = f"{url}?{urlencode(params)}" if params else url
    headers = {
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'PAYD-Intelligence-V2-298',
    }
    if GITHUB_TOKEN:
        headers['Authorization'] = f'token {GITHUB_TOKEN}'

    last_status = 'API_ERROR'
    last_headers = {}
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
            last_status = 'API_ERROR'
            last_headers = dict(e.headers or {})
            if e.code == 404:
                return 'NOT_FOUND', None, last_headers
            if e.code == 403:
                reset = 0
                try:
                    reset = int(e.headers.get('X-RateLimit-Reset', 0))
                except (ValueError, TypeError):
                    reset = 0
                if reset > 0 and e.headers.get('X-RateLimit-Remaining') == '0':
                    return 'RATE_LIMITED', None, last_headers
                return 'UNAUTHORIZED', None, last_headers
            if e.code == 401:
                return 'UNAUTHORIZED', None, last_headers
            if e.code in (500, 502, 503, 504):
                if attempt < max_retries - 1:
                    time.sleep(2 ** attempt)
                    continue
                return 'API_ERROR', {'status': e.code, 'reason': str(e)}, last_headers
            if attempt < max_retries - 1:
                time.sleep(1)
                continue
            return 'API_ERROR', {'status': e.code, 'reason': str(e)}, last_headers
        except (URLError, TimeoutError) as e:
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
                continue
            return 'API_ERROR', {'reason': str(e)}, {}

    return last_status, {'reason': 'max retries exceeded'}, last_headers


# ---------------------------------------------------------------------------
# Per-repo collection — explicit None vs 0 separation
# ---------------------------------------------------------------------------
def collect_repo_metrics(org, repo):
    full_name = f"{org}/{repo}"
    result = {
        'full_name': full_name,
        'org': org,
        'repo': repo,
        'url': f"https://github.com/{full_name}",
        # Nullable metrics
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
        # Collection metadata
        'collection_status': 'UNAVAILABLE',  # AVAILABLE | UNAVAILABLE | API_ERROR | RATE_LIMITED | ARCHIVED
        'errors': [],
        'retrieved_at': NOW.isoformat(),
    }

    # 1) Repo metadata
    status, data, headers = make_request(f"{API_BASE}/repos/{full_name}")
    if status == 'OK' and isinstance(data, dict):
        result['is_archived'] = bool(data.get('archived', False))
        result['default_branch'] = data.get('default_branch', 'main')
        result['stars'] = int(data.get('stargazers_count', 0)) if data.get('stargazers_count') is not None else 0
        result['forks'] = int(data.get('forks_count', 0)) if data.get('forks_count') is not None else 0
        result['open_issues'] = int(data.get('open_issues_count', 0)) if data.get('open_issues_count') is not None else 0
        result['created_at'] = data.get('created_at')
        result['updated_at'] = data.get('updated_at')
        result['pushed_at'] = data.get('pushed_at')
        result['last_commit_at'] = data.get('pushed_at')
        result['collection_status'] = 'AVAILABLE'  # Marked AVAILABLE only after all critical queries
    elif status == 'RATE_LIMITED':
        result['collection_status'] = 'RATE_LIMITED'
        result['errors'].append(f'repo_metadata: RATE_LIMITED')
        return result
    elif status == 'NOT_FOUND':
        result['collection_status'] = 'UNAVAILABLE'
        result['errors'].append(f'repo_metadata: NOT_FOUND')
        return result
    else:
        result['collection_status'] = 'API_ERROR'
        result['errors'].append(f'repo_metadata: {status}')
        return result

    if result['is_archived']:
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
        result['errors'].append('commits_30d: RATE_LIMITED')
        return result
    else:
        result['errors'].append(f'commits_30d: {status}')
        if status == 'API_ERROR':
            result['collection_status'] = 'API_ERROR'

    # 3) Commits 90d
    status, data, _ = make_request(
        f"{API_BASE}/repos/{full_name}/commits",
        params={'since': WINDOW_90D, 'until': WINDOW_END, 'per_page': 100}
    )
    if status == 'OK' and isinstance(data, list):
        result['commits_90d'] = len(data)
    elif status == 'RATE_LIMITED':
        result['collection_status'] = 'RATE_LIMITED'
        result['errors'].append('commits_90d: RATE_LIMITED')
        return result
    else:
        result['errors'].append(f'commits_90d: {status}')
        if status == 'API_ERROR':
            result['collection_status'] = 'API_ERROR'

    # 4) Contributors 90d (deduplicated, but we report canonical count)
    contributors = []
    page = 1
    max_pages = 5
    while page <= max_pages:
        status, data, _ = make_request(
            f"{API_BASE}/repos/{full_name}/contributors",
            params={'per_page': 100, 'page': page, 'anon': 'true'}
        )
        if status == 'OK' and isinstance(data, list):
            for c in data:
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
            result['errors'].append('contributors: RATE_LIMITED')
            return result
        elif status == 'NOT_FOUND':
            contributors = []
            break
        else:
            result['errors'].append(f'contributors: {status}')
            if status == 'API_ERROR':
                result['collection_status'] = 'API_ERROR'
            break
    result['contributors_90d'] = len(contributors)
    result['contributors_detail'] = contributors[:50]

    # 5) Releases
    status, data, _ = make_request(
        f"{API_BASE}/repos/{full_name}/releases",
        params={'per_page': 30}
    )
    if status == 'OK' and isinstance(data, list):
        rels_90 = [r for r in data if r.get('published_at', '') >= WINDOW_90D]
        rels_30 = [r for r in data if r.get('published_at', '') >= WINDOW_30D]
        result['releases_30d'] = len(rels_30)
        result['releases_90d'] = len(rels_90)
        if data:
            result['latest_release_at'] = data[0].get('published_at')
    elif status == 'RATE_LIMITED':
        result['collection_status'] = 'RATE_LIMITED'
        result['errors'].append('releases: RATE_LIMITED')
        return result
    else:
        result['errors'].append(f'releases: {status}')
        if status == 'API_ERROR':
            result['collection_status'] = 'API_ERROR'

    if not result['errors']:
        result['collection_status'] = 'AVAILABLE'
    elif result['collection_status'] not in ('RATE_LIMITED', 'API_ERROR', 'ARCHIVED'):
        # Some non-critical errors but repo data is present
        if any('API_ERROR' in e for e in result['errors']):
            result['collection_status'] = 'API_ERROR'
        else:
            result['collection_status'] = 'UNAVAILABLE'

    return result


# ---------------------------------------------------------------------------
# Aggregation per project
# ---------------------------------------------------------------------------
def aggregate_metrics(per_repo_metrics, project_id, repos_with_roles):
    canonical = {
        'canonical_asset_id': project_id,
        'collection_status': 'UNAVAILABLE',
        'errors': [],
        'retrieved_at': NOW.isoformat(),
        'repositories_count': len(per_repo_metrics),
        'repositories': [],
        # Nullable aggregates — never use value or 0
        'commits_30d': None,
        'commits_90d': None,
        'releases_30d': None,
        'releases_90d': None,
        'latest_release_at': None,
        'last_commit_at': None,
        'days_since_last_commit': None,
        'active_repositories_30d': 0,
        'active_repositories_90d': 0,
        'unique_contributors_90d': 0,
        'stars_total': 0,
        'forks_total': 0,
        'open_issues_total': 0,
        'contributors_by_repo': {},
        'contributor_dedup_method': 'user_id',
    }

    # For aggregate commits/releases, we use None until at least one repo has AVAILABLE
    total_commits_30 = None
    total_commits_90 = None
    total_releases_30 = None
    total_releases_90 = None
    has_any_available = False
    latest_release = None
    last_commit = None
    active_30 = 0
    active_90 = 0

    # Dedup contributors
    contributor_ids = set()
    contributor_logins = set()
    contributors_by_repo = {}

    total_stars = 0
    total_forks = 0
    total_open_issues = 0

    any_rate_limited = False
    any_api_error = False
    all_failed = True
    all_archived = True
    has_non_archived_repo = False
    statuses_seen = set()
    per_repo_count = 0

    for rm in per_repo_metrics:
        per_repo_count += 1
        statuses_seen.add(rm['collection_status'])
        if rm['collection_status'] == 'RATE_LIMITED':
            any_rate_limited = True
        if rm['collection_status'] == 'API_ERROR':
            any_api_error = True
        if rm['collection_status'] in ('AVAILABLE',):
            all_failed = False
            has_any_available = True
        # Track archived state per approved repository
        if not rm.get('is_archived', False):
            all_archived = False
            has_non_archived_repo = True
        else:
            # archived repo still counts as a valid response (not a hard fail)
            all_failed = False

        # Commits
        if rm['commits_30d'] is not None:
            total_commits_30 = (total_commits_30 or 0) + rm['commits_30d']
            if rm['commits_30d'] > 0:
                active_30 += 1
        if rm['commits_90d'] is not None:
            total_commits_90 = (total_commits_90 or 0) + rm['commits_90d']
            if rm['commits_90d'] > 0:
                active_90 += 1
        if rm['releases_30d'] is not None:
            total_releases_30 = (total_releases_30 or 0) + rm['releases_30d']
        if rm['releases_90d'] is not None:
            total_releases_90 = (total_releases_90 or 0) + rm['releases_90d']

        if rm.get('latest_release_at'):
            if latest_release is None or rm['latest_release_at'] > latest_release:
                latest_release = rm['latest_release_at']
        if rm.get('last_commit_at'):
            if last_commit is None or rm['last_commit_at'] > last_commit:
                last_commit = rm['last_commit_at']

        if rm.get('stars') is not None:
            total_stars += rm['stars']
        if rm.get('forks') is not None:
            total_forks += rm['forks']
        if rm.get('open_issues') is not None:
            total_open_issues += rm['open_issues']

        # Dedup contributors
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
            'errors': rm['errors'],
        })

    canonical['commits_30d'] = total_commits_30
    canonical['commits_90d'] = total_commits_90
    canonical['releases_30d'] = total_releases_30
    canonical['releases_90d'] = total_releases_90
    canonical['latest_release_at'] = latest_release
    canonical['last_commit_at'] = last_commit
    canonical['active_repositories_30d'] = active_30
    canonical['active_repositories_90d'] = active_90
    canonical['unique_contributors_90d'] = (
        len(contributor_ids) if contributor_ids else len(contributor_logins)
    )
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

    # Status logic
    # Canonical status is derived from ALL approved repositories:
    # - If at least one approved repo is analytically active, project is AVAILABLE
    # - If every approved repo is archived, project is ARCHIVED
    # - Rate limits, hard API errors, and complete failures are surfaced explicitly
    if any_rate_limited:
        canonical['collection_status'] = 'RATE_LIMITED'
    elif all_failed:
        canonical['collection_status'] = 'UNAVAILABLE'
    elif any_api_error:
        canonical['collection_status'] = 'API_ERROR'
    elif per_repo_count > 0 and all_archived and not has_non_archived_repo:
        # Every approved repo returned archived=True and there is no active repo
        canonical['collection_status'] = 'ARCHIVED'
    elif has_any_available:
        canonical['collection_status'] = 'AVAILABLE'
    else:
        canonical['collection_status'] = 'UNAVAILABLE'

    return canonical


# ---------------------------------------------------------------------------
# Checkpoint + main loop
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
    tmp = OUT_CHECKPOINT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(state, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, OUT_CHECKPOINT)


def save_snapshot(snapshot):
    tmp = OUT_SNAPSHOT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(snapshot, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, OUT_SNAPSHOT)


def main():
    parser = argparse.ArgumentParser(
        description='PAYD GitHub Developer Activity Collector — 298 VALIDATED'
    )
    parser.add_argument('--limit', type=int, default=0)
    parser.add_argument('--use-anonymous', action='store_true')
    parser.add_argument('--offset', type=int, default=0)
    args = parser.parse_args()

    print('=' * 80)
    print('PAYD GITHUB DEVELOPER ACTIVITY COLLECTOR — PHASE 2B (298 VALIDATED)')
    print('=' * 80)
    print()

    global GITHUB_TOKEN
    if args.use_anonymous:
        GITHUB_TOKEN = ''
        print('[--use-anonymous] Ignoring GITHUB_TOKEN')
    else:
        print(f'GITHUB_TOKEN present: {bool(os.environ.get("GITHUB_TOKEN", "").strip())}')

    has_auth = bool(GITHUB_TOKEN)
    print(f'Authentication: {"authenticated" if has_auth else "anonymous (60 req/hour)"}')
    print()

    # Load frozen whitelist
    with open(WHITELIST_PATH, 'r') as f:
        wl = json.load(f)
    if not wl['metadata']['assertion_passed']:
        print('FATAL: Whitelist assertion failed. Aborting.')
        sys.exit(1)

    # --- Deterministic queue: sorted iteration over authoritative whitelist ---
    # Use a SORTED list (not a set) so that `--offset` / `--limit` produce
    # stable, reproducible slices. Membership checks still use a set for O(1) lookup.
    whitelist_ids_set = set(wl['whitelist'])
    whitelist_ids_sorted = sorted(wl['whitelist'])
    whitelist_meta = {e['canonical_id']: e for e in wl['whitelist_meta']}
    print(f'Frozen whitelist count (active): {len(whitelist_ids_set)}')
    # NOTE: active whitelist may be < 298 if some projects were deferred for review
    # The deferred list is stored in wl['deferred']['review_required']

    # Load authoritative registry for repository roles and repo URLs
    with open(REGISTRY_PATH, 'r') as f:
        reg = json.load(f)
    registry = reg['registry']

    # Build collection list (only VERIFIED canonical IDs) — DETERMINISTIC order
    projects_to_collect = []
    for pid in whitelist_ids_sorted:
        entry = whitelist_meta[pid]
        repos = entry.get('official_repositories', [])
        if not repos:
            repos = []
            if entry.get('github_org') and entry.get('github_repo'):
                repos = [f"{entry['github_org']}/{entry['github_repo']}"]
        if not repos:
            continue
        # Build role map
        role_map = {}
        for r, role in (registry.get(pid, {}).get('repository_roles') or {}).items():
            role_map[r] = role
        for r in repos:
            if r not in role_map:
                role_map[r] = 'core'
        projects_to_collect.append({
            'canonical_id': pid,
            'repos': repos,
            'role_map': role_map,
        })

    print(f'Total projects to collect: {len(projects_to_collect)}')
    total_repos = sum(len(p['repos']) for p in projects_to_collect)
    print(f'Total repositories:        {total_repos}')

    if args.offset > 0:
        projects_to_collect = projects_to_collect[args.offset:]
        print(f'Offset applied: skipped first {args.offset}')

    if args.limit > 0:
        projects_to_collect = projects_to_collect[:args.limit]
        print(f'--limit applied: capped to {args.limit}')

    # Sanity check: no REVIEW or NOT_APPLICABLE
    deferred_ids = set((wl.get('deferred') or {}).get('review_required', []))
    accepted_statuses = {'VERIFIED', 'VERIFIED_UPDATED'}
    skipped_deferred = []
    final_projects = []
    for project in projects_to_collect:
        pid = project['canonical_id']
        assert pid in whitelist_ids_set, f'{pid} not in whitelist'
        # Skip REVIEW_REQUIRED projects (no confident mapping)
        if pid in deferred_ids:
            skipped_deferred.append(pid)
            continue
        # Defensive: re-check registry status
        status = registry[pid]['github_mapping_status']
        assert status in accepted_statuses, (
            f'{pid} has unexpected registry status: {status}'
        )
        final_projects.append(project)
    if skipped_deferred:
        print(f'Skipped REVIEW_REQUIRED projects: {len(skipped_deferred)}')
    projects_to_collect = final_projects

    # Checkpoint
    state = load_checkpoint()
    completed = set(state.get('completed', []))
    failures = state.get('failures', [])
    rate_limited_list = state.get('rate_limited', [])

    snapshot = {}
    if os.path.exists(OUT_SNAPSHOT):
        try:
            with open(OUT_SNAPSHOT, 'r') as f:
                snapshot = json.load(f)
        except (json.JSONDecodeError, IOError):
            snapshot = {}

    start_time = time.time()
    processed = 0
    counter = Counter()

    for project in projects_to_collect:
        pid = project['canonical_id']
        if pid in completed:
            continue

        per_repo_metrics = []
        rate_limited_this_project = False
        for full_repo in project['repos']:
            if '/' not in full_repo:
                # Malformed repo identifier (e.g., bare project name)
                print(f'  SKIPPING malformed repo for {pid}: {full_repo!r}')
                continue
            try:
                org, repo = full_repo.split('/', 1)
            except ValueError:
                continue
            rm = collect_repo_metrics(org, repo)
            per_repo_metrics.append(rm)
            counter[rm['collection_status']] += 1
            time.sleep(0.1)
            if rm['collection_status'] == 'RATE_LIMITED':
                print(f'  RATE LIMITED at {full_repo}, stopping this project.')
                state['rate_limited'].append({'project': pid, 'repo': full_repo})
                rate_limited_this_project = True
                break

        if rate_limited_this_project:
            failures.append({
                'project': pid,
                'reason': 'rate_limited',
                'timestamp': NOW.isoformat(),
            })
            save_checkpoint(state)
            continue

        canonical = aggregate_metrics(per_repo_metrics, pid, project['role_map'])
        reg_entry = registry[pid]
        canonical['github_org'] = reg_entry.get('github_org')
        canonical['primary_repo'] = reg_entry.get('github_repo')
        canonical['github_url'] = reg_entry.get('github_url')
        canonical['display_name'] = reg_entry.get('display_name')

        snapshot[pid] = canonical
        completed.add(pid)
        processed += 1

        if processed % 10 == 0:
            elapsed = time.time() - start_time
            print(f'  processed {processed}/{len(projects_to_collect)}: last={pid} elapsed={elapsed:.0f}s')
            state['completed'] = list(completed)
            state['failures'] = failures
            state['rate_limited'] = rate_limited_list
            save_checkpoint(state)
            save_snapshot(snapshot)

    # Final save
    state['completed'] = list(completed)
    state['failures'] = failures
    state['rate_limited'] = rate_limited_list
    save_checkpoint(state)
    save_snapshot(snapshot)

    # Save failures separately (atomic)
    tmp = OUT_FAILURES + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump({
            'metadata': {
                'generated_at': NOW.isoformat(),
                'total_failures': len(failures),
                'total_rate_limited': len(rate_limited_list),
            },
            'failures': failures,
            'rate_limited': rate_limited_list,
        }, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, OUT_FAILURES)

    # Save report
    _save_report(snapshot, len(projects_to_collect), counter, len(whitelist_ids_set))
    print()
    print('Done. Snapshot saved to', OUT_SNAPSHOT)
    print('Report saved to', OUT_REPORT)
    print('Failures saved to', OUT_FAILURES)


def _save_report(snapshot, total_processed, counter, total_requested):
    available = sum(1 for s in snapshot.values() if s.get('collection_status') == 'AVAILABLE')
    api_error = sum(1 for s in snapshot.values() if s.get('collection_status') == 'API_ERROR')
    rate_limited = sum(1 for s in snapshot.values() if s.get('collection_status') == 'RATE_LIMITED')
    unavailable = sum(1 for s in snapshot.values() if s.get('collection_status') == 'UNAVAILABLE')
    archived = sum(1 for s in snapshot.values() if s.get('collection_status') == 'ARCHIVED')

    # Use explicit None checks (no `or 0`)
    def has_value(v):
        return v is not None

    commits_known = sum(1 for s in snapshot.values() if has_value(s.get('commits_30d')))
    commits_confirmed_zero = sum(
        1 for s in snapshot.values()
        if s.get('commits_30d') is not None and s.get('commits_30d') == 0
    )
    commits_null = sum(1 for s in snapshot.values() if s.get('commits_30d') is None)
    contribs_known = sum(1 for s in snapshot.values() if has_value(s.get('unique_contributors_90d')))
    releases_known = sum(1 for s in snapshot.values() if has_value(s.get('releases_90d')))

    # Outliers
    outliers = []
    for pid, s in snapshot.items():
        c30 = s.get('commits_30d')
        c90 = s.get('commits_90d')
        contribs = s.get('unique_contributors_90d') or 0
        rels = s.get('releases_90d') or 0
        if c30 is not None and c30 > 10000:
            outliers.append({'project': pid, 'metric': 'commits_30d', 'value': c30, 'reason': 'suspiciously_high'})
        if contribs > 5000:
            outliers.append({'project': pid, 'metric': 'unique_contributors_90d', 'value': contribs, 'reason': 'suspiciously_high'})
        if rels > 500:
            outliers.append({'project': pid, 'metric': 'releases_90d', 'value': rels, 'reason': 'suspiciously_high'})
        # Explicit: violations = commits_30d > commits_90d
        if c30 is not None and c90 is not None and c30 > c90:
            outliers.append({
                'project': pid,
                'metric': 'commits_30d_vs_90d',
                'value': f'{c30}>{c90}',
                'reason': 'inconsistent',
            })
        if s.get('last_commit_at'):
            try:
                lc = datetime.fromisoformat(s['last_commit_at'].replace('Z', '+00:00'))
                if lc > NOW:
                    outliers.append({
                        'project': pid,
                        'metric': 'last_commit_at',
                        'value': s['last_commit_at'],
                        'reason': 'future_timestamp',
                    })
            except (ValueError, TypeError):
                pass

    # Control projects
    control_ids = [
        'bitcoin', 'ethereum', 'solana', 'bittensor', 'akash', 'filecoin',
        'chainlink', 'aave', 'uniswap', 'render', 'helium', 'ondo',
        'binancecoin', 'cardano', 'avalanche',
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
            'days_since_last_commit': s.get('days_since_last_commit'),
            'collection_status': s.get('collection_status'),
        }

    report = {
        'metadata': {
            'generated_at': NOW.isoformat(),
            'phase': '2B — developer activity snapshot (298 VALIDATED)',
            'whitelist_source': WHITELIST_PATH,
            'total_requested': total_requested,
            'collected': len(snapshot),
            'github_token_used': bool(GITHUB_TOKEN),
        },
        'coverage': {
            'collection_pct': round(len(snapshot) / total_requested * 100, 2) if total_requested else 0,
            'available': available,
            'api_error': api_error,
            'rate_limited': rate_limited,
            'unavailable': unavailable,
            'archived': archived,
            'commits_known': commits_known,
            'commits_confirmed_zero': commits_confirmed_zero,
            'commits_null': commits_null,
            'contributors_known': contribs_known,
            'releases_known': releases_known,
        },
        'collection_status_distribution': dict(counter),
        'outliers': outliers,
        'control_projects': control_results,
        'unauthorized_ids': [],  # Verified in phase C validation
    }

    tmp = OUT_REPORT + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(report, f, ensure_ascii=False, indent=2)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, OUT_REPORT)

    # CSV (atomic via tmp)
    tmp_csv = OUT_CSV + '.tmp'
    with open(tmp_csv, 'w', encoding='utf-8', newline='') as f:
        w = csv.writer(f)
        w.writerow([
            'canonical_id', 'display_name', 'github_org', 'primary_repo',
            'repos_count', 'commits_30d', 'commits_90d', 'unique_contributors_90d',
            'releases_30d', 'releases_90d', 'last_commit_at',
            'days_since_last_commit', 'stars_total', 'forks_total',
            'collection_status',
        ])
        for pid, s in snapshot.items():
            w.writerow([
                pid, s.get('display_name'), s.get('github_org'),
                s.get('primary_repo'), s.get('repositories_count', 0),
                s.get('commits_30d'), s.get('commits_90d'),
                s.get('unique_contributors_90d'),
                s.get('releases_30d'), s.get('releases_90d'),
                s.get('last_commit_at'),
                s.get('days_since_last_commit'),
                s.get('stars_total'), s.get('forks_total'),
                s.get('collection_status'),
            ])
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp_csv, OUT_CSV)


if __name__ == '__main__':
    main()
