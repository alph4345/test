"""Tiny S-expression reader/writer for KiCad files."""

import re

_TOKEN = re.compile(r'\s*(?:(\()|(\))|("(?:[^"\\]|\\.)*")|([^\s()"]+))')


class Sym(str):
    """A bare (unquoted) atom such as `pin`, `yes`, or `1.27`."""


def parse(text):
    stack, cur = [], []
    pos = 0
    while True:
        m = _TOKEN.match(text, pos)
        if not m or m.end() == pos:
            break
        pos = m.end()
        lp, rp, qs, atom = m.groups()
        if lp:
            stack.append(cur)
            cur = []
        elif rp:
            done = cur
            cur = stack.pop()
            cur.append(done)
        elif qs is not None:
            cur.append(re.sub(r'\\(.)', lambda e: "\n" if e.group(1) == "n" else e.group(1), qs[1:-1]))
        else:
            cur.append(Sym(atom))
    return cur[0] if len(cur) == 1 else cur


def _atom(x):
    if isinstance(x, Sym):
        return str(x)
    if isinstance(x, bool):
        return "yes" if x else "no"
    if isinstance(x, (int, float)):
        return fmt_num(x)
    s = str(x).replace("\\", "\\\\").replace('"', '\\"').replace("\n", "\\n")
    return f'"{s}"'


def fmt_num(v):
    if isinstance(v, int):
        return str(v)
    s = f"{v:.4f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


def dump(node, indent=0):
    """Serialise with one child list per line, which KiCad reads fine."""
    if not isinstance(node, list):
        return _atom(node)
    pad = "  " * indent
    head = []
    body = []
    for item in node:
        if isinstance(item, list):
            body.append(item)
        elif body:
            body.append(item)
        else:
            head.append(_atom(item))
    if not body:
        return "(" + " ".join(head) + ")"
    # Short leaf lists stay on one line.
    if all(not isinstance(b, list) or not any(isinstance(c, list) for c in b) for b in body) and \
            sum(len(dump(b)) for b in body) < 90:
        return "(" + " ".join(head + [dump(b) for b in body]) + ")"
    out = "(" + " ".join(head)
    for b in body:
        out += "\n" + pad + "  " + dump(b, indent + 1)
    return out + "\n" + pad + ")"


def find(node, key):
    """First direct child list whose head is `key`."""
    for c in node:
        if isinstance(c, list) and c and c[0] == key:
            return c
    return None


def find_all(node, key):
    return [c for c in node if isinstance(c, list) and c and c[0] == key]


def walk(node):
    yield node
    for c in node:
        if isinstance(c, list):
            yield from walk(c)
