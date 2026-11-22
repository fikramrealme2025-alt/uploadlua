'use strict';
/**
 * parse-s.js - baca bagian DATA dari BattleData.S (AArch64) dan ubah jadi objek JS.
 *
 * Layout data di BattleData.S (lihat tools/core.c di BattleData_Dobby):
 *   bd_classes : per class  .quad n, ns, dll, decl, bd_fld+O, bd_prp+O, bd_mth+O  /  .hword nf, npr, nm, 0
 *   bd_fld     : per field  .quad n, t, x          (x = 0 bila tidak ada)
 *   bd_prp     : per prop   .quad n, t, x
 *   bd_mth     : per method .quad n, r, p / .byte kind, argc / .zero 6
 *   bd_hkeys   : .quad <ptr string> per key hero
 *   .LsN       : .asciz "..."   (tabel string)
 * Offset: fld/prp = O/24, mth = O/32.
 */

const DATA_MARK = '// ================================================================ DATA (from BattleData.lua)';
const DATA_END = '// ---- internal PRNG';
const KIND = ['-', 'void', 'int', 'long', 'float', 'double'];

function unescapeAsm(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { out.push(c); continue; }
    const n = s[++i];
    if (n === 'n') out.push('\n');
    else if (n === 't') out.push('\t');
    else if (n === 'r') out.push('\r');
    else if (n === 'b') out.push('\b');
    else if (n === 'f') out.push('\f');
    else if (n === '"' || n === '\\') out.push(n);
    else if (/[0-7]/.test(n)) {
      let o = n;
      while (o.length < 3 && /[0-7]/.test(s[i + 1] || '')) o += s[++i];
      out.push(String.fromCharCode(parseInt(o, 8)));
    } else out.push(n);
  }
  // string asm = byte; latin1 -> utf8 supaya karakter non-ASCII utuh
  return Buffer.from(out.join(''), 'latin1').toString('utf8');
}

function parse(text) {
  const i = text.indexOf(DATA_MARK);
  if (i < 0) throw new Error('DATA marker tidak ditemukan di BattleData.S');
  let j = text.indexOf(DATA_END, i);
  if (j < 0) throw new Error('akhir DATA tidak ditemukan di BattleData.S');
  const head = text.slice(0, i);
  const data = text.slice(i, j).split('\n');

  const hm = /(\d+) classes, (\d+) fields, (\d+) properties, (\d+) methods\), (\d+) hero tables x (\d+) keys/.exec(head);
  const expect = hm ? { classes: +hm[1], fields: +hm[2], props: +hm[3], methods: +hm[4], heroes: +hm[5], keys: +hm[6] } : null;

  const strs = new Map();
  const tables = { bd_classes: [], bd_fld: [], bd_prp: [], bd_mth: [], bd_hkeys: [] };
  let cur = null;
  let mth = null;
  for (const raw of data) {
    const line = raw.trim();
    if (!line || line.startsWith('//')) continue;
    let m = /^(\.Ls\d+):\s*\.asciz\s+"(.*)"\s*$/.exec(line);
    if (m) { strs.set(m[1], unescapeAsm(m[2])); cur = null; continue; }
    m = /^(bd_classes|bd_fld|bd_prp|bd_mth|bd_hkeys):$/.exec(line);
    if (m) { cur = m[1]; continue; }
    if (line.startsWith('.section')) { cur = null; continue; }
    if (!cur) continue;
    if (cur === 'bd_mth') {
      if (line.startsWith('.quad')) {
        const a = line.slice(5).split(',').map((x) => x.trim());
        mth = { a };
        tables.bd_mth.push(mth);
      } else if (line.startsWith('.byte')) {
        const a = line.slice(5).split(',').map((x) => parseInt(x, 10));
        mth.kind = a[0]; mth.argc = a[1];
      }
      continue;
    }
    if (line.startsWith('.quad')) {
      const a = line.slice(5).split(',').map((x) => x.trim());
      if (cur === 'bd_prp' && a.length === 1 && a[0] === '0') continue; // sentinel
      tables[cur].push({ a });
    } else if (line.startsWith('.hword') && cur === 'bd_classes') {
      const a = line.slice(6).split(',').map((x) => parseInt(x, 10));
      const c = tables.bd_classes[tables.bd_classes.length - 1];
      c.nf = a[0]; c.npr = a[1]; c.nm = a[2];
    }
  }

  const S = (ref) => {
    if (ref === '0') return '';
    if (!strs.has(ref)) throw new Error('string ' + ref + ' tidak ada');
    return strs.get(ref);
  };
  const off = (ref, name, size) => {
    const m = new RegExp('^' + name + '\\+(\\d+)$').exec(ref);
    if (!m) throw new Error('referensi tabel tak dikenal: ' + ref);
    const o = +m[1];
    if (o % size) throw new Error('offset tidak sejajar: ' + ref);
    return o / size;
  };

  const flds = tables.bd_fld.map((r) => ({ n: S(r.a[0]), t: S(r.a[1]), x: S(r.a[2]) }));
  const prps = tables.bd_prp.map((r) => ({ n: S(r.a[0]), t: S(r.a[1]), x: S(r.a[2]) }));
  const mths = tables.bd_mth.map((r) => ({ n: S(r.a[0]), r: S(r.a[1]), p: S(r.a[2]), kind: r.kind, argc: r.argc }));
  const classes = tables.bd_classes.map((r) => {
    const fo = off(r.a[4], 'bd_fld', 24), po = off(r.a[5], 'bd_prp', 24), mo = off(r.a[6], 'bd_mth', 32);
    return {
      n: S(r.a[0]), ns: S(r.a[1]), dll: S(r.a[2]), decl: S(r.a[3]),
      f: flds.slice(fo, fo + r.nf), p: prps.slice(po, po + r.npr), m: mths.slice(mo, mo + r.nm),
    };
  });
  const heroKeys = tables.bd_hkeys.map((r) => S(r.a[0]));

  const stats = {
    classes: classes.length,
    fields: classes.reduce((s, c) => s + c.f.length, 0),
    props: classes.reduce((s, c) => s + c.p.length, 0),
    methods: classes.reduce((s, c) => s + c.m.length, 0),
    keys: heroKeys.length,
    heroes: expect ? expect.heroes : 300,
  };
  if (expect) {
    for (const k of ['classes', 'methods', 'keys']) {
      if (stats[k] !== expect[k]) throw new Error(`jumlah ${k} tidak cocok: baca ${stats[k]}, header ${expect[k]}`);
    }
  }
  return { stats, classes, heroKeys };
}

module.exports = { parse, KIND };
