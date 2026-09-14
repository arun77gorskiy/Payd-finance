#!/usr/bin/env python3
"""Search GitHub for missing candidates using different strategies."""
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

# Search-based: check if some other org exists
queries_to_check = [
    ('org', 'grass-network'),
    ('org', 'grasslabs'),
    ('org', 'arkham-intelligence'),
    ('org', 'virtual'),
    ('org', 'virtuals-protocol'),
    ('org', 'virtuals_io'),
    ('repo', 'arkham-intelligence/arkham'),
    ('repo', 'arkham-intelligence/contracts'),
    ('repo', 'sentientfoundation/sentient'),
    ('repo', 'aethir/aethir'),
    ('repo', 'getgrass-io/getgrass-io'),
]

for kind, name in queries_to_check:
    if kind == 'org':
        path = f'/orgs/{name}'
    else:
        path = f'/repos/{name}'
    status, data = gh(path)
    if data:
        if kind == 'org':
            print(f'{kind:5s} {name:40s} status={status} login={data.get("login")} name={data.get("name")} repos={data.get("public_repos")}')
        else:
            print(f'{kind:5s} {name:40s} status={status} stars={data.get("stargazers_count")} pushed_at={data.get("pushed_at")} desc={(data.get("description") or "")[:60]}')
    else:
        print(f'{kind:5s} {name:40s} status={status} (NOT FOUND)')
