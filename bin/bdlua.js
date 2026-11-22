#!/usr/bin/env node
'use strict';
const path = require('path');
const api = require('../src');

const argv = process.argv.slice(2);
const cmd = argv.shift();
const opt = { scripts: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--input' || a === '-i') opt.input = argv[++i];
  else if (a === '--out' || a === '-o') opt.out = argv[++i];
  else if (a === '--script' || a === '-s') opt.scripts.push(argv[++i]);
  else if (a === '--no-compile') opt.compile = false;
  else if (a === '--no-strip') opt.strip = false;
}

try {
  if (cmd !== 'build') { console.error('usage: bdlua build [-i input.S] [-o dist] [-s script.lua] [--no-compile] [--no-strip]'); process.exit(1); }
  api.build(opt);
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
