#!/usr/bin/env python3
"""Find what repos actually exist for each verified org."""
import os, urllib.request, urllib.error, json

token = os.environ.get('GITHUB_TOKEN', '')

def gh(path):
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'payd-test', 'Authorization': f'Bearer {token}'}
    url = f'https://api.github.com{path}'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, None

# For each org, list its repos and find ones with descriptions matching
orgs_to_check = [
    ('rendernetwork', 'render'),
    ('veniceai', 'venice'),
    ('thetatoken', 'theta'),
    ('OriginTrail', 'origintrail'),
    ('sentient-agi', 'sentient'),
    ('AethirCloud', 'aethir'),
]

for org_login, _ in orgs_to_check:
    print(f'\n=== {org_login} ===')
    # List orgs repos
    status, data = gh(f'/orgs/{org_login}/repos?per_page=30&sort=pushed')
    if not data:
        print(f'  status={status}, no data')
        continue
    # Filter for non-archived
    repos = [r for r in data if not r.get('archived')]
    repos.sort(key=lambda r: r.get('stargazers_count', 0), reverse=True)
    for r in repos[:10]:
        print(f"  {r['name']:35s} stars={r.get('stargazers_count', 0):4d} pushed_at={r.get('pushed_at', 'N/A')} desc={(r.get('description') or '')[:60]}")
