#!/usr/bin/env python3
"""More targeted searches."""
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

# Try users (not orgs) — some crypto projects are personal accounts
to_check = [
    ('users', 'getgrass'),
    ('users', 'getgrass-io'),
    ('users', 'grassnetwork'),
    ('users', 'grassnetwork-io'),
    ('users', 'grass-laboratories'),
    ('users', 'virtualsprotocol'),
    ('users', 'arkm-network'),
    ('users', 'arkham'),
    ('users', 'arkhamintel'),
    ('users', 'arkhq'),
    ('orgs', 'grassnetwork'),
    ('orgs', 'grass-network'),
    ('orgs', 'grasslabs'),
    ('orgs', 'getgrasslabs'),
    ('orgs', 'aria-protocol'),
    ('orgs', 'arkham-intelligence'),
]

for kind, name in to_check:
    path = f'/{kind}/{name}'
    status, data = gh(path)
    if data:
        print(f'{kind:6s} {name:35s} status={status} login={data.get("login")} type={data.get("type") if kind=="users" else None} name={data.get("name")} repos={data.get("public_repos")}')
    else:
        print(f'{kind:6s} {name:35s} status={status} (NOT FOUND)')
