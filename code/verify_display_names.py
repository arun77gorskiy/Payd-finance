#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import json
from collections import Counter

with open('public/data/projects_enriched.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
projects = data['projects']

# Проверим бывшие проблемные
check = ['franklin-templeton', 'ipfs', 'mantra-dao', 'realio-network', 'benji', 'mantra', 'realio']
for p in projects:
    if p.get('id') in check:
        print("  id={!r:30s} name={!r:30s} -> display_name={!r:30s} src={!r:20s} symbol={!r}".format(
            p.get('id'), p.get('name'), p.get('display_name'),
            p.get('display_name_source'), p.get('symbol')
        ))

# Проверим duplicates по display_name
print()
print('=== Проверка уникальности display_name ===')
dn_counts = Counter(p.get('display_name') for p in projects)
duplicates = [(k, v) for k, v in dn_counts.items() if v > 1]
print('  Duplicates: {}'.format(len(duplicates)))
for dn, count in duplicates[:5]:
    matches = [p.get('id') for p in projects if p.get('display_name') == dn]
    print('    {!r} x{}: {}'.format(dn, count, matches))

# Подсчёт по секторам
print()
print('=== Распределение по секторам ===')
sector_count = {}
for p in projects:
    s = p.get('sector', 'unknown')
    sector_count[s] = sector_count.get(s, 0) + 1
for s, c in sorted(sector_count.items(), key=lambda x: -x[1]):
    print('  {:25s} {}'.format(s, c))

# Статистика источников
print()
print('=== Источники display_name ===')
src_count = Counter(p.get('display_name_source') for p in projects)
for s, c in src_count.most_common():
    print('  {:15s} {}'.format(s, c))

# Примеры по секторам (для каждого сектора первые 3 проекта)
print()
print('=== Примеры по секторам (по 3 на сектор) ===')
for sector in sorted(sector_count.keys()):
    print()
    print('  --- {} ---'.format(sector))
    projs = [p for p in projects if p.get('sector') == sector][:3]
    for p in projs:
        print("    {:30s} -> {!r:30s} ({})".format(
            p.get('id'), p.get('display_name'), p.get('display_name_source')
        ))
