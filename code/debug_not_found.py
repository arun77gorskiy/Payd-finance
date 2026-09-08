#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
import csv
from collections import Counter

with open('public/data/projects_enriched.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
projects = data['projects']

with open('tmp/payd_github_mapping_report.csv', 'r', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

not_found = [r for r in rows if r['status'] == 'NOT_FOUND']
print('NOT_FOUND projects ({}):'.format(len(not_found)))
for r in not_found[:15]:
    print('  id={:30s} sector={:20s}'.format(r['canonical_id'], r['sector']))
print('...')
print()
print('NOT_FOUND секторы:')
sectors = Counter(r['sector'] for r in not_found)
for s, c in sectors.most_common():
    print('  {:20s} {}'.format(s, c))

# Проверим, есть ли у них githubOrg/githubRepo
print()
print('=== NOT_FOUND с existing githubOrg/githubRepo ===')
not_found_ids = [r['canonical_id'] for r in not_found]
for p in projects:
    if p.get('id') in not_found_ids:
        org = p.get('githubOrg')
        repo = p.get('githubRepo')
        ids = p.get('identifiers', {})
        gh_ids = ids.get('github', []) if isinstance(ids, dict) else []
        if org or repo:
            print('  id={:30s} githubOrg={!r:25s} githubRepo={!r:30s} identifiers.github={!r}'.format(
                p.get('id'), org, repo, gh_ids
            ))
