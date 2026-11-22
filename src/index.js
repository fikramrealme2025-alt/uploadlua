'use strict';
/** index.js - API framework: parse BattleData.S -> Lua 5.1 -> luac (arm64 + arm32). */
const fs = require('fs');
const path = require('path');
const { parse } = require('./parse-s');
const { generate, bundle } = require('./gen-lua');
const { compile, check, findLuac, findLua } = require('./compile');
const bc = require('./luac51');

const ROOT = path.join(__dirname, '..');

function loadDump(input) {
  return parse(fs.readFileSync(input, 'utf8'));
}

/**
 * build({ input, out, scripts:[], compile:true, strip:true })
 * hasil: dist/BattleData.lua, BattleData.luac (arm64), BattleData32.luac (arm32), + dump.json bila json:true
 */
function build(opts) {
  opts = Object.assign({ input: path.join(ROOT, 'input/BattleData.S'), out: path.join(ROOT, 'dist'), scripts: [], compile: true, strip: true, json: false }, opts);
  fs.mkdirSync(opts.out, { recursive: true });
  const dump = loadDump(opts.input);
  const s = dump.stats;
  const files = [];
  const emit = (name, data) => {
    const f = path.join(opts.out, name);
    fs.writeFileSync(f, data);
    files.push(f);
    return f;
  };

  const lib = generate(dump);
  const libLua = emit('BattleData.lua', lib);
  const jobs = [{ name: 'BattleData', lua: libLua }];
  if (opts.json) emit('BattleData.json', JSON.stringify(dump));

  for (const sp of opts.scripts) {
    const name = path.basename(sp).replace(/\.lua$/i, '');
    const text = fs.readFileSync(sp, 'utf8');
    const f = emit(name + '.lua', bundle(lib, [{ name: path.basename(sp), text }]));
    jobs.push({ name, lua: f });
  }

  for (const j of jobs) {
    const c = check(j.lua);
    if (c.ok === false) throw new Error('sintaks Lua 5.1 salah di ' + j.lua + ':\n' + c.msg);
    if (!opts.compile) continue;
    const r = compile(j.lua, { strip: opts.strip });
    emit(j.name + '.luac', r.luac64);
    emit(j.name + '32.luac', r.luac32);
  }
  return { dump, files };
}

module.exports = { build, loadDump, parse, generate, bundle, compile, check, findLuac, findLua, bc };
