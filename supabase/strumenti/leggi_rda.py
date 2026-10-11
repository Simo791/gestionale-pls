import struct, sys, json, bz2
d = bz2.decompress(open(sys.argv[1],'rb').read())
assert d[:3] == b'RDX' and d[5:7] == b'X\n'
V3 = d[3:4] == b'3'
p = 7
def i32():
    global p; v = struct.unpack('>i', d[p:p+4])[0]; p += 4; return v
def f64():
    global p; v = struct.unpack('>d', d[p:p+8])[0]; p += 8; return v
i32(); i32(); i32()  # versions
if V3:
    n = struct.unpack('>i', d[p:p+4])[0]; p += 4 + n
refs = []
def item():
    global p
    flags = i32()
    t = flags & 0xFF; has_attr = flags & (1<<9); has_tag = flags & (1<<10)
    if t == 254: return None  # NILVALUE
    if t == 242: return None  # EMPTYENV
    if t == 253: return '<globalenv>'
    if t == 255: return refs[(flags >> 8) - 1]
    if t == 1:  # SYMSXP
        s = item(); refs.append(s); return s
    if t == 9:  # CHARSXP
        n = i32()
        if n == -1: return None
        s = d[p:p+n].decode('utf-8','replace'); p += n; return s
    if t in (2,):  # LISTSXP pairlist
        out = []
        while True:
            attr = item() if has_attr else None
            tag = item() if has_tag else None
            car = item()
            out.append((tag, car))
            flags2 = i32(); t2 = flags2 & 0xFF
            if t2 == 254: break
            has_attr = flags2 & (1<<9); has_tag = flags2 & (1<<10)
        return dict(out) if all(k is not None for k,_ in out) else out
    if t in (13, 10):  # INTSXP, LGLSXP
        n = i32(); v = [i32() for _ in range(n)]
    elif t == 14:
        n = i32(); v = [f64() for _ in range(n)]
    elif t == 16:
        n = i32(); v = [item() for _ in range(n)]
    elif t == 19:
        n = i32(); v = [item() for _ in range(n)]
    elif t == 25:  # S4
        v = {}
    else:
        raise Exception(f'tipo {t} a {p}')
    if has_attr:
        a = item()
        return {'__v': v, '__a': a}
    return v
top = item()
def clean(x):
    if isinstance(x, dict):
        return {str(k): clean(v) for k, v in x.items()}
    if isinstance(x, list):
        return [clean(y) for y in x]
    if isinstance(x, tuple):
        return [clean(y) for y in x]
    return x
json.dump(clean(top), open(sys.argv[2], 'w'), indent=0, default=str)
