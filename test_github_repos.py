#!/usr/bin/env python3
"""Quick test of GitHub API responses for known candidate orgs/repos."""
import os, urllib.request, urllib.error, json

token = os.environ.get('GITHUB_TOKEN', '')

def gh(path):
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'payd-test', 'Authorization': f'Bearer {token}'}
    url = f'https://api.github.com{path}'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, None

# Check known good repos
test_repos = [
    ('org', 'rendernetwork'),
    ('org', 'veniceai'),
    ('org', 'thetatoken'),
    ('org', 'virtuals-protocol'),
    ('org', 'getgrass-io'),
    ('org', 'OriginTrail'),
    ('org', 'sentient-agi'),
    ('org', 'AethirCloud'),
    ('org', 'arkm-network'),
    ('repo', 'rendernetwork/docs'),
    ('repo', 'veniceai/api'),
    ('repo', 'thetatoken/theta-protocol-ledger'),
    ('repo', 'thetatoken/theta-protocol-chain'),
    ('repo', 'virtuals-protocol/virtuals-protocol'),
    ('repo', 'getgrass-io/grass'),
    ('repo', 'OriginTrail/ot-node'),
    ('repo', 'sentient-agi/sentient'),
    ('repo', 'AethirCloud/aethir'),
    ('repo', 'arkm-network/arkham-contracts'),
]
for kind, name in test_repos:
    if kind == 'org':
        path = f'/orgs/{name}'
    else:
        path = f'/repos/{name}'
    status, data = gh(path)
    if data:
        if kind == 'org':
            print(f'{kind:5s} {name:40s} status={status} login={data.get("login")} name={data.get("name")} repos={data.get("public_repos")}')
        else:
            print(f'{kind:5s} {name:40s} status={status} stars={data.get("stargazers_count")} pushed_at={data.get("pushed_at")}')
    else:
        print(f'{kind:5s} {name:40s} status={status} (NOT FOUND)')
