'use strict';
/** gen-lua.js - ubah hasil parse-s.js jadi file Lua 5.1 (data + runtime.lua). Output murni ASCII. */
const fs = require('fs');
const path = require('path');

function luaStr(s) {
  let o = '"';
  for (const b of Buffer.from(s, 'utf8')) {
    if (b === 0x5c) o += '\\\\';
    else if (b === 0x22) o += '\\"';
    else if (b === 0x0a) o += '\\n';
    else if (b === 0x0d) o += '\\r';
    else if (b === 0x09) o += '\\t';
    else if (b < 32 || b >= 127) o += '\\' + String(b).padStart(3, '0');
    else o += String.fromCharCode(b);
  }
  return o + '"';
}

const rec = (a) => a.join('\t');
const check = (v, what) => {
  if (/[\t\n]/.test(v)) throw new Error('tab/newline di dalam ' + what + ': ' + JSON.stringify(v.slice(0, 80)));
  return v;
};

function dataBlock(dump) {
  const lines = ['local CLS = {'];
  for (const c of dump.classes) {
    const F = c.f.map((x) => rec([check(x.n, 'field'), check(x.t, 'field'), check(x.x, 'field')])).join('\n');
    const P = c.p.map((x) => rec([check(x.n, 'prop'), check(x.t, 'prop'), check(x.x, 'prop')])).join('\n');
    const M = c.m.map((x) => rec([check(x.n, 'method'), check(x.r, 'method'), check(x.p, 'method'), x.kind, x.argc])).join('\n');
    lines.push(' {' + [c.n, c.ns, c.dll, c.decl, F, P, M].map(luaStr).join(',') + '},');
  }
  lines.push('}');
  lines.push('local HKEYS = {');
  const keys = dump.heroKeys.map(luaStr);
  for (let i = 0; i < keys.length; i += 6) lines.push(' ' + keys.slice(i, i + 6).join(',') + ',');
  lines.push('}');
  return lines.join('\n');
}

function generate(dump, opts) {
  opts = opts || {};
  const tpl = fs.readFileSync(opts.runtime || path.join(__dirname, 'runtime.lua'), 'utf8');
  const s = dump.stats;
  return tpl
    .replace('@@DATA@@', () => dataBlock(dump))
    .replace(/@@CLASSES@@/g, s.classes).replace(/@@FIELDS@@/g, s.fields).replace(/@@PROPS@@/g, s.props)
    .replace(/@@METHODS@@/g, s.methods).replace(/@@KEYS@@/g, s.keys).replace(/@@HEROES@@/g, s.heroes);
}

/** library + script user dalam satu chunk (library dibungkus function supaya `return M` tidak memotong script) */
function bundle(libSource, scriptSources) {
  let out = '-- bundle: BattleData library + script (Lua 5.1)\n(function(...)\n' + libSource + '\nend)()\n';
  for (const sc of scriptSources) out += '\n-- ' + sc.name + '\n' + sc.text + '\n';
  return out;
}

module.exports = { generate, bundle, luaStr };
