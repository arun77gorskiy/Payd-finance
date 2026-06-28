#!/usr/bin/env python3
"""Преобразует возвращаемые значения тестов в формат {pass, info}."""
import re
import sys

FILE = '/workspace/tests/moduleX.integration.test.ts'

with open(FILE, 'r', encoding='utf-8') as f:
    content = f.read()

# Преобразует `return X ? \`Y\` : \`Z\`;` в `return { pass: X, info: X ? \`Y\` : \`Z\` };`
# Преобразует `return X;` (boolean) в `return { pass: X };`
# Преобразует `return '...'` (просто строка) в `return { pass: true, info: '...' };`

# Паттерн 1: return condition ? `then_str` : `else_str`;
pattern1 = re.compile(r'(\s+)return\s+(.+?)\s*\?\s*(`[^`]*`|"[^"]*"|\'[^\']*\')\s*:\s*(`[^`]*`|"[^"]*"|\'[^\']*\')\s*;', re.DOTALL)
def repl1(m):
    indent = m.group(1)
    cond = m.group(2)
    t_str = m.group(3)
    e_str = m.group(4)
    return f"{indent}return {{ pass: ({cond}), info: ({cond}) ? {t_str} : {e_str} }};"

content = pattern1.sub(repl1, content)

# Паттерн 2: return cond ? single_value : single_value;
pattern2 = re.compile(r'(\s+)return\s+(.+?)\s*\?\s*([^?]+?)\s*:\s*([^;]+?)\s*;', re.DOTALL)
def repl2(m):
    indent = m.group(1)
    cond = m.group(2).strip()
    t_val = m.group(3).strip()
    e_val = m.group(4).strip()
    # Skip if this is already a {pass:...}
    if 'pass:' in cond or 'pass:' in t_val or 'pass:' in e_val:
        return m.group(0)
    return f"{indent}return {{ pass: ({cond}), info: ({cond}) ? ({t_val}) : ({e_val}) }};"

# Применяем только если первый паттерн не сработал (idempotency)
# Уже сработал паттерн 1, теперь проверим, что осталось
# Сначала проверим, что паттерн 1 применился, потом проверим остатки

# Паттерн 3: return '...' (простая строка) - возвращает success
# Это поймает случаи где возвращается просто литеральная строка без условия
pattern3 = re.compile(r'(\s+)return\s+(`[^`]*`|"[^"]*"|\'[^\']*\')\s*;', re.DOTALL)
def repl3(m):
    indent = m.group(1)
    s = m.group(2)
    return f"{indent}return {{ pass: true, info: {s} }};"

content = pattern3.sub(repl3, content)

# Паттерн 4: return simple_value;  (без условий и не строка)
# Возвращает true если truthy, false если falsy
pattern4 = re.compile(r'(\s+)return\s+([a-zA-Z_][a-zA-Z0-9_.()\[\]]*|true|false)\s*;')
def repl4(m):
    indent = m.group(1)
    val = m.group(2)
    return f"{indent}return {{ pass: !!({val}), info: String({val}) }};"

content = pattern4.sub(repl4, content)

# Паттерн 5: return { pass: ... } -> оставляем как есть (уже обработано)
# Уже должны быть готовы

with open(FILE, 'w', encoding='utf-8') as f:
    f.write(content)

print("Преобразование завершено")
