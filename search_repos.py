#!/usr/bin/env python3
"""Search GitHub repos for the missing/unverified candidates."""
import os, urllib.request, urllib.error, urllib.parse, json

token = os.environ.get('GITHUB_TOKEN', '')

def gh_search_repos(q):
    headers = {'Accept': 'application/vnd.github+json', 'User-Agent': 'payd-test', 'Authorization': f'Bearer {token}'}
    encoded = urllib.parse.quote(q)
    url = f'https://api.github.com/search/repositories?q={encoded}&per_page=10&sort=stars&order=desc'
    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return e.code, None

queries = [
    'grass in:name OR org:getgrass',
    'arkham blockchain',
    'virtuals protocol blockchain',
    'sentient AI agent blockchain',
    'aethir GPU cloud',
]

for q in queries:
    status, data = gh_search_repos(q)
    print(f'\n=== Query: {q} ===')
    if data and 'items' in data:
        for r in data['items'][:5]:
            print(f"  {r['full_name']:50s} stars={r.get('stargazers_count', 0):5d} pushed_at={r.get('pushed_at', 'N/A')[:10]} org_type={r.get('owner', {}).get('type')} desc={(r.get('description') or '')[:60]}")
    else:
        print(f'  No data, status={status}')
