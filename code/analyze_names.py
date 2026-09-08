#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Анализ структуры projects_enriched.json для понимания формата имён."""
import json
import sys
import re
from collections import Counter

with open('public/data/projects_enriched.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

projects = data['projects']
print('Total projects:', len(projects))
print()
print('=== Первые 15 проектов ===')
for p in projects[:15]:
    print('  id={!r:30s} name={!r:30s} symbol={!r:12s} sector={!r}'.format(
        p.get('id', ''), p.get('name', ''), p.get('symbol', ''), p.get('sector', '')
    ))

print()
print('=== Известные активы (cross-sector) ===')
known_ids = ['bitcoin', 'ethereum', 'bittensor', 'render-token', 'render', 'helium',
             'akash-network', 'akash', 'aethir', 'io-net', 'filecoin', 'the-graph',
             'chainlink', 'uniswap', 'aave', 'fetch-ai', 'fetch.ai', 'near', 'solana']
for p in projects:
    if p.get('id') in known_ids:
        print('  id={!r:28s} name={!r:30s} sectors={!r}'.format(
            p.get('id', ''), p.get('name', ''), p.get('sectors', [])
        ))

print()
print('=== Статистика наличия name ===')
has_name = sum(1 for p in projects if p.get('name'))
no_name = sum(1 for p in projects if not p.get('name'))
print('has name:', has_name)
print('missing name:', no_name)

print()
print('=== Проверка уникальности id ===')
ids = [p.get('id') for p in projects]
print('unique ids:', len(set(ids)))
print('duplicates:', len(ids) - len(set(ids)))
if len(ids) != len(set(ids)):
    dupes = [k for k, v in Counter(ids).items() if v > 1]
    print('duplicate keys:', dupes[:5])

print()
print('=== Типичные паттерны "плохих" имён (raw slugs) ===')
suspicious = []
for p in projects:
    name = p.get('name', '')
    pid = p.get('id', '')
    if name and (
        name == pid
        or (re.match(r'^[a-z0-9-]+$', name) and '-' in name and len(name) > 5)
    ):
        suspicious.append((pid, name, p.get('symbol', ''), p.get('sector', '')))
print('Подозрительных имён:', len(suspicious))
for s in suspicious[:25]:
    print('  ', s)
