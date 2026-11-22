'use strict';
/**
 * compile.js - Lua 5.1 source -> bytecode (.luac).
 *   1. luac 5.1 asli (env LUAC, luac5.1, luac51, luac) dengan -s
 *   2. kalau tidak ada: interpreter lua 5.1 (env LUA, lua5.1, lua51, lua, luajit TIDAK dipakai) + string.dump, lalu di-strip lewat luac51.js
 * Hasil selalu 64-bit (size_t 8, arm64) dan dikonversi ke 32-bit (size_t 4, armeabi-v7a) lewat luac51.convert().
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const bc = require('./luac51');

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return r.error ? null : r;
}

function isLua51(cmd) {
  const r = run(cmd, ['-v']);
  const t = r ? (r.stdout || '') + (r.stderr || '') : '';
  return /Lua 5\.1/.test(t) && !/LuaJIT/i.test(t);
}

function findTool(envName, names) {
  const cands = [process.env[envName], ...names].filter(Boolean);
  for (const c of cands) if (isLua51(c)) return c;
  return null;
}

const findLuac = () => findTool('LUAC', ['luac5.1', 'luac51', 'luac']);
const findLua = () => findTool('LUA', ['lua5.1', 'lua51', 'lua']);

const DUMP = 'local f=assert(loadfile(arg[1])); local o=assert(io.open(arg[2],"wb")); o:write(string.dump(f)); o:close()';

/** kembalikan { luac64: Buffer, luac32: Buffer, tool: string } */
function compile(srcPath, opts) {
  opts = opts || {};
  const strip = opts.strip !== false;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bdlua-'));
  const out = path.join(tmp, 'out.luac');
  let tool, raw;
  try {
    const luac = findLuac();
    const lua = luac ? null : findLua();
    if (luac) {
      const r = run(luac, ['-s', '-o', out, srcPath]);
      if (!r || r.status !== 0) throw new Error('luac gagal:\n' + (r ? r.stderr : 'tidak bisa dijalankan'));
      tool = luac + ' -s';
    } else if (lua) {
      const helper = path.join(tmp, 'dump.lua');
      fs.writeFileSync(helper, DUMP);
      const r = run(lua, [helper, srcPath, out]);
      if (!r || r.status !== 0) throw new Error('lua string.dump gagal:\n' + (r ? r.stderr : 'tidak bisa dijalankan'));
      tool = lua + ' (string.dump + strip)';
    } else {
      throw new Error('luac / lua 5.1 tidak ditemukan. Pasang `lua5.1` (apt install lua5.1) atau set env LUAC=/path/luac5.1. ' +
        'Di GitHub Actions kompilasi dikerjakan otomatis (lihat .github/workflows/build.yml).');
    }
    raw = fs.readFileSync(out);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  bc.detect(raw);
  const luac64 = bc.convert(raw, 8, { strip });
  const luac32 = bc.convert(raw, 4, { strip });
  return { luac64, luac32, tool };
}

/** cek sintaks saja (tanpa menulis hasil) */
function check(srcPath) {
  const luac = findLuac();
  if (luac) { const r = run(luac, ['-p', srcPath]); return { ok: !!r && r.status === 0, msg: r && r.stderr }; }
  const lua = findLua();
  if (lua) {
    const h = path.join(os.tmpdir(), 'bdlua-check-' + process.pid + '.lua');
    fs.writeFileSync(h, 'local f,e=loadfile(arg[1]); if not f then io.stderr:write(e,"\\n"); os.exit(1) end');
    const r = run(lua, [h, srcPath]);
    fs.rmSync(h, { force: true });
    return { ok: !!r && r.status === 0, msg: r && r.stderr };
  }
  return { ok: null, msg: 'luac/lua 5.1 tidak ada' };
}

module.exports = { compile, check, findLuac, findLua };
