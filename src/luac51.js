'use strict';
/**
 * luac51.js - baca / tulis / ubah bytecode Lua 5.1 (format luac 5.1).
 *
 * Kenapa perlu: bytecode luac bergantung pada ukuran size_t host. Android arm64 = 8 byte, armeabi-v7a = 4 byte,
 * jadi satu file .luac dari PC (64-bit) TIDAK bisa dimuat di arm32. Di sini bytecode 64-bit dibaca lalu ditulis ulang
 * dengan size_t 4 byte (satu-satunya bagian format yang berbeda) dan debug info bisa dibuang (setara `luac -s`).
 */

const SIG = Buffer.from([0x1b, 0x4c, 0x75, 0x61]);

function headerFor(sizeT) {
  // version 0x51, format 0, little endian, sizeof(int)=4, sizeof(size_t), sizeof(Instruction)=4, sizeof(lua_Number)=8, integral=0
  return Buffer.concat([SIG, Buffer.from([0x51, 0, 1, 4, sizeT, 4, 8, 0])]);
}

function detect(buf) {
  if (buf.length < 12 || !buf.subarray(0, 4).equals(SIG)) throw new Error('bukan bytecode Lua (signature salah)');
  const h = buf.subarray(0, 12);
  const sizeT = h[8];
  if (!h.equals(headerFor(sizeT)) || (sizeT !== 4 && sizeT !== 8)) {
    throw new Error('header bytecode tidak didukung: ' + h.toString('hex') + ' (harus Lua 5.1, little endian, double, size_t 4/8)');
  }
  return sizeT;
}

function parse(buf) {
  const sizeT = detect(buf);
  let p = 12;
  const need = (n) => { if (p + n > buf.length) throw new Error('bytecode terpotong'); };
  const u8 = () => { need(1); return buf[p++]; };
  const i32 = () => { need(4); const v = buf.readUInt32LE(p); p += 4; return v; };
  const szt = () => {
    need(sizeT);
    let v;
    if (sizeT === 8) { v = Number(buf.readBigUInt64LE(p)); } else { v = buf.readUInt32LE(p); }
    p += sizeT;
    return v;
  };
  const bytes = (n) => { need(n); const b = Buffer.from(buf.subarray(p, p + n)); p += n; return b; };
  const str = () => { const n = szt(); return n === 0 ? null : bytes(n); };
  function func() {
    const f = {};
    f.source = str();
    f.line = i32(); f.lastline = i32();
    f.nups = u8(); f.numparams = u8(); f.vararg = u8(); f.maxstack = u8();
    f.code = bytes(i32() * 4);
    f.k = [];
    for (let n = i32(); n > 0; n--) {
      const t = u8();
      if (t === 0) f.k.push({ t });
      else if (t === 1) f.k.push({ t, v: u8() });
      else if (t === 3) f.k.push({ t, v: bytes(8) });
      else if (t === 4) f.k.push({ t, v: str() });
      else throw new Error('tipe konstanta tak dikenal: ' + t);
    }
    f.p = [];
    for (let n = i32(); n > 0; n--) f.p.push(func());
    f.lineinfo = bytes(i32() * 4);
    f.locvars = [];
    for (let n = i32(); n > 0; n--) f.locvars.push({ name: str(), s: i32(), e: i32() });
    f.upvals = [];
    for (let n = i32(); n > 0; n--) f.upvals.push(str());
    return f;
  }
  const main = func();
  if (p !== buf.length) throw new Error('ada ' + (buf.length - p) + ' byte sisa setelah fungsi utama');
  return { sizeT, main };
}

function serialize(tree, sizeT, opts) {
  const strip = !!(opts && opts.strip);
  const out = [headerFor(sizeT)];
  const i32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v >>> 0); out.push(b); };
  const u8 = (v) => out.push(Buffer.from([v]));
  const szt = (v) => {
    if (sizeT === 4 && v > 0xffffffff) throw new Error('string terlalu panjang untuk size_t 4 byte');
    const b = Buffer.alloc(sizeT);
    if (sizeT === 8) b.writeBigUInt64LE(BigInt(v)); else b.writeUInt32LE(v);
    out.push(b);
  };
  const str = (s) => { if (!s) szt(0); else { szt(s.length); out.push(s); } };
  function func(f) {
    str(strip ? null : f.source);
    i32(f.line); i32(f.lastline);
    u8(f.nups); u8(f.numparams); u8(f.vararg); u8(f.maxstack);
    i32(f.code.length / 4); out.push(f.code);
    i32(f.k.length);
    for (const c of f.k) {
      u8(c.t);
      if (c.t === 1) u8(c.v); else if (c.t === 3) out.push(c.v); else if (c.t === 4) str(c.v);
    }
    i32(f.p.length);
    for (const q of f.p) func(q);
    if (strip) { i32(0); i32(0); i32(0); return; }
    i32(f.lineinfo.length / 4); out.push(f.lineinfo);
    i32(f.locvars.length);
    for (const l of f.locvars) { str(l.name); i32(l.s); i32(l.e); }
    i32(f.upvals.length);
    for (const u of f.upvals) str(u);
  }
  func(tree.main);
  return Buffer.concat(out);
}

/** ubah size_t bytecode (8 <-> 4) dan/atau strip debug info */
function convert(buf, targetSizeT, opts) {
  const t = parse(buf);
  return serialize(t, targetSizeT, opts);
}

module.exports = { detect, parse, serialize, convert, headerFor };
