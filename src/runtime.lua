local M = {}
M.VERSION = "1.0.0"
M.LUA = "5.1"

local type, tostring, tonumber, pairs, ipairs, pcall = type, tostring, tonumber, pairs, ipairs, pcall
local floor, random = math.floor, math.random
local sfind, ssub, sbyte, sgsub, smatch, slower =
  string.find, string.sub, string.byte, string.gsub, string.match, string.lower

@@DATA@@

M.stats = { classes = #CLS, fields = @@FIELDS@@, props = @@PROPS@@, methods = @@METHODS@@, keys = #HKEYS, heroes = @@HEROES@@ }
local NHERO = M.stats.heroes
local NKEYS = #HKEYS
M.NHERO, M.NKEYS = NHERO, NKEYS
M.heroKeys = HKEYS

local KIND = { void = 1, int = 2, long = 3, float = 4, double = 5 }
local KNAME = { "void", "int", "long", "float", "double" }
M.KIND = KIND

local function eachLine(s, fn)
  if s == "" then return end
  local pos, n = 1, #s
  while pos <= n + 1 do
    local e = sfind(s, "\n", pos, true) or (n + 1)
    fn(ssub(s, pos, e - 1))
    pos = e + 1
  end
end

local function fields(line, cnt)
  local out, pos = {}, 1
  for i = 1, cnt - 1 do
    local e = sfind(line, "\t", pos, true)
    if not e then out[i] = ssub(line, pos); pos = #line + 2; break end
    out[i] = ssub(line, pos, e - 1)
    pos = e + 1
  end
  if pos <= #line + 1 and #out < cnt then out[cnt] = ssub(line, pos) end
  for i = 1, cnt do if out[i] == nil then out[i] = "" end end
  return out
end

local function toKind(k)
  if k == nil then return nil end
  if type(k) == "number" then return (k >= 1 and k <= 5) and floor(k) or nil end
  return KIND[slower(tostring(k))]
end

local function paramCount(p)
  if not p or sfind(p, "^%s*$") then return 0 end
  local depth, count = 0, 1
  for i = 1, #p do
    local c = sbyte(p, i)
    if c == 60 or c == 91 or c == 40 then depth = depth + 1
    elseif c == 62 or c == 93 or c == 41 then depth = depth - 1
    elseif c == 44 and depth == 0 then count = count + 1 end
  end
  return count
end
M.paramCount = paramCount

local function containsCI(h, n)
  return sfind(slower(h), slower(n), 1, true) ~= nil
end

local KEYWORDS = { "damage", "dmg", "hurt", "harm", "crit", "penetr", "lifesteal",
                   "thorn", "sunder", "poison", "burn", "bleed" }
local function matchKeyword(name, pattern)
  if pattern then return containsCI(name, pattern) end
  for i = 1, #KEYWORDS do
    if containsCI(name, KEYWORDS[i]) then return true end
  end
  return false
end

local decoded = {}

local function decode(ci)
  local d = decoded[ci]
  if d then return d end
  local r = CLS[ci]
  d = { n = r[1], ns = r[2], dll = r[3], decl = r[4], fields = {}, props = {}, methods = {}, index = ci }
  eachLine(r[5], function(l) local f = fields(l, 3); d.fields[#d.fields + 1] = { n = f[1], t = f[2], x = f[3] } end)
  eachLine(r[6], function(l) local f = fields(l, 3); d.props[#d.props + 1] = { n = f[1], t = f[2], x = f[3] } end)
  eachLine(r[7], function(l)
    local f = fields(l, 5)
    d.methods[#d.methods + 1] = { n = f[1], r = f[2], p = f[3], kind = tonumber(f[4]) or 0, argc = tonumber(f[5]) or 0 }
  end)
  decoded[ci] = d
  return d
end

local byName
local function buildIndex()
  byName = {}
  for i = 1, #CLS do
    local n = CLS[i][1]
    local l = byName[n]
    if not l then l = {}; byName[n] = l end
    l[#l + 1] = i
  end
end

local function dumpClass(ns, cls)
  if not byName then buildIndex() end
  local l = byName[cls]
  if not l then return nil end
  for i = 1, #l do
    if ns == nil or CLS[l[i]][2] == ns then return decode(l[i]) end
  end
  return nil
end

local function kindFor(dc, name, pc, sig)
  local ms = dc.methods
  for i = 1, #ms do
    local m = ms[i]
    if m.n == name and (sig == nil or m.p == sig) and paramCount(m.p) == pc then return m.kind end
  end
  for i = 1, #ms do
    local m = ms[i]
    if m.n == name and (sig == nil or m.p == sig) then return m.kind end
  end
  return 0
end

function M.kindOf(ns, cls, method, sig)
  local dc = dumpClass(ns, cls)
  if not dc then return nil end
  local pc = sig and paramCount(sig) or 0
  local k = kindFor(dc, method, pc, sig)
  return KNAME[k]
end

local H = {}
local function rnd() return random(200, 400) / 100 end

local function roll(id)
  local h = {}
  for i = 0, NKEYS do h[i] = rnd() end
  H[id] = h
  return h
end

local keyIndex
local function findKey(k)
  if not keyIndex then
    keyIndex = {}
    for i = 1, NKEYS do if keyIndex[HKEYS[i]] == nil then keyIndex[HKEYS[i]] = i end end
  end
  return keyIndex[k]
end

function M.heroValue(id, key)
  id = tonumber(id)
  if not id or id < 1 or id > NHERO then return 1.0 end
  id = floor(id)
  local h = H[id] or roll(id)
  if key then
    local s = key
    s = (sgsub(s, "^get_", ""))
    s = (sgsub(s, "^set_", ""))
    local c2 = (sgsub((sgsub(s, "^m_[ifdblu]?(%u)", "%1")), "^m_", ""))
    local c3 = (sgsub(s, "^Get", ""))
    local cand = { key, s, c2, c3 }
    for i = 1, 4 do
      local idx = findKey(cand[i])
      if idx then return h[idx] end
    end
  end
  return h[0]
end

function M.rerollHero(id)
  id = tonumber(id) or 0
  if id ~= 0 then
    if id < 1 or id > NHERO then return false end
    roll(floor(id))
    return true
  end
  H = {}
  return true
end

function M.hero(id)
  id = tonumber(id)
  if not id or id < 1 or id > NHERO then return nil end
  id = floor(id)
  local h = H[id] or roll(id)
  local t = { scale = h[0] }
  for i = 1, NKEYS do t[HKEYS[i]] = h[i] end
  return t
end

function M.eachHero(cb)
  for id = 1, NHERO do cb(id, M.hero(id)) end
  return NHERO
end

local backend, backendName
M.soPath = "BattleData.so"
M.dryRun = false

local function wrapTable(t, label)
  local function pick(...)
    for i = 1, select("#", ...) do
      local f = t[(select(i, ...))]
      if type(f) == "function" then return f end
    end
  end
  local b = {
    edit = pick("Edit", "edit", "BD_Edit"),
    restore = pick("Restore", "restore", "BD_Restore"),
    methodAddress = pick("MethodAddress", "methodAddress", "BD_MethodAddress"),
    fieldOffset = pick("FieldOffset", "fieldOffset", "BD_FieldOffset"),
    editField = pick("EditField", "editField", "BD_EditField"),
    resolveClass = pick("ResolveClass", "resolveClass", "BD_ResolveClass"),
  }
  if not b.edit then return nil end
  return b, label
end

local function detectBackend()
  if M.dryRun then return nil end
  if type(BD) == "table" then
    local b, n = wrapTable(BD, "global BD")
    if b then return b, n end
  end
  if type(BD_Edit) == "function" then
    return wrapTable({ BD_Edit = BD_Edit, BD_Restore = BD_Restore, BD_MethodAddress = BD_MethodAddress,
                       BD_FieldOffset = BD_FieldOffset, BD_EditField = BD_EditField,
                       BD_ResolveClass = BD_ResolveClass }, "global BD_*")
  end
  local okf, ffi = pcall(require, "ffi")
  if okf and type(ffi) == "table" and ffi.cdef then
    local okc = pcall(ffi.cdef, [[
      int BD_Edit(const char*, const char*, const char*, double, const char*, const char*);
      int BD_Restore(void);
      void *BD_MethodAddress(const char*, const char*, const char*, const char*);
      int BD_FieldOffset(const char*, const char*, const char*);
      int BD_EditField(const char*, const char*, const char*, void*, int64_t, int);
      void *BD_ResolveClass(const char*, const char*);
    ]])
    local okl, lib = pcall(ffi.load, M.soPath)
    if okl then return wrapTable(lib, "ffi " .. M.soPath) end
  end
  return nil
end

function M.setBackend(b, label)
  if b == nil then backend, backendName = nil, nil; return end
  assert(type(b.edit) == "function", "backend.edit(ns, cls, method, value, sig, kind) wajib ada")
  backend, backendName = b, label or "custom"
end

local detectBackendCached

function M.backendName() local _, n = detectBackendCached(); return n or "dry-run" end

detectBackendCached = function()
  if not backend and not M.dryRun then
    local b, n = detectBackend()
    if b then backend, backendName = b, n end
  end
  return backend, backendName
end

local function be(op)
  local b = detectBackendCached()
  return b and b[op] or nil
end

function M.edit(ns, cls, method, value, sig, kind)
  local k = toKind(kind)
  local kname = k and KNAME[k] or nil
  local f = be("edit")
  if not f then
    return 0
  end
  return f(ns, cls, method, value or 0, sig, kname) or 0
end

function M.editHero(ns, cls, method, heroId, base, sig, kind)
  heroId = tonumber(heroId) or 0
  if heroId == 0 then heroId = random(1, NHERO) end
  return M.edit(ns, cls, method, (base or 1) * M.heroValue(heroId, method), sig, kind)
end

function M.editHeroRandom(ns, cls, method, base, sig, kind)
  return M.edit(ns, cls, method, (base or 1) * rnd(), sig, kind)
end

function M.editAll(base, heroId, pattern, opts)
  base = base or 1
  heroId = tonumber(heroId) or 0
  opts = opts or {}
  local withParams, withVoid = opts.params ~= false, opts.void ~= false
  if opts.strict then withParams, withVoid = false, false end
  local n = 0
  for ci = 1, #CLS do
    local c = decode(ci)
    local seen = {}
    local ms = c.methods
    for j = 1, #ms do
      local m = ms[j]
      local id_ = m.n .. "(" .. m.p .. ")"
      if m.kind ~= 0 and m.n ~= ".ctor" and m.n ~= ".cctor" and not seen[id_]
         and (withParams or m.p == "") and (withVoid or m.kind ~= 1) and matchKeyword(m.n, pattern) then
        seen[id_] = true
        local id = heroId ~= 0 and heroId or random(1, NHERO)
        n = n + M.edit(c.ns, c.n, m.n, base * M.heroValue(id, m.n), m.p, m.kind)
      end
    end
  end
  return n
end

local NUMERIC = { int = 1, uint = 1, long = 1, ulong = 1, short = 1, ushort = 1, byte = 1, sbyte = 1, float = 1, double = 1 }

local function collect(pattern, opts)
  opts = opts or {}
  local withParams, withVoid = opts.params ~= false, opts.void ~= false
  if opts.strict then withParams, withVoid = false, false end
  local withFields = opts.fields ~= false
  local list = {}
  for ci = 1, #CLS do
    local c = decode(ci)
    local seen = {}
    for j = 1, #c.methods do
      local m = c.methods[j]
      local id_ = m.n .. "(" .. m.p .. ")"
      if m.kind ~= 0 and m.n ~= ".ctor" and m.n ~= ".cctor" and not seen[id_]
         and (withParams or m.p == "") and (withVoid or m.kind ~= 1) and matchKeyword(m.n, pattern) then
        seen[id_] = true
        list[#list + 1] = { what = "method", ns = c.ns, cls = c.n, name = m.n, sig = m.p, kind = KNAME[m.kind] }
      end
    end
    if withFields then
      for j = 1, #c.fields do
        local f = c.fields[j]
        if matchKeyword(f.n, pattern) then
          local ty = smatch(f.t, "([%w_%.]+)%s*$") or f.t
          list[#list + 1] = { what = "field", ns = c.ns, cls = c.n, name = f.n, type = f.t, numeric = NUMERIC[ty] ~= nil, const = sfind(f.x, "^v=") ~= nil }
        end
      end
    end
  end
  return list
end

function M.heroPlan(id, base, pattern, opts)
  base = base or 1
  local out, nm, nf = {}, 0, 0
  for _, e in ipairs(collect(pattern, opts)) do
    local t = {}
    for k, v in pairs(e) do t[k] = v end
    t.value = base * M.heroValue(id, e.name)
    out[#out + 1] = t
    if e.what == "method" then nm = nm + 1 else nf = nf + 1 end
  end
  return out, nm, nf
end

function M.eachHeroAll(cb, base, pattern, opts)
  local entries = collect(pattern, opts)
  base = base or 1
  for id = 1, NHERO do
    local plan = {}
    for i = 1, #entries do
      local e, t = entries[i], {}
      for k, v in pairs(e) do t[k] = v end
      t.value = base * M.heroValue(id, e.name)
      plan[i] = t
    end
    cb(id, plan)
  end
  return NHERO
end

function M.editAllForHero(id, base, pattern, opts)
  local plan = M.heroPlan(id, base, pattern, opts)
  local n, fields = 0, {}
  for _, e in ipairs(plan) do
    if e.what == "method" then n = n + M.edit(e.ns, e.cls, e.name, e.value, e.sig, e.kind) else fields[#fields + 1] = e end
  end
  return n, fields
end

function M.editAllHeroes(base, pattern, opts)
  opts = opts or {}
  base = base or 1
  local mode = opts.combine or "max"
  local n, nf = 0, 0
  for _, e in ipairs(collect(pattern, opts)) do
    if e.what == "method" then
      local v, sum = nil, 0
      for id = 1, NHERO do
        local x = M.heroValue(id, e.name)
        sum = sum + x
        if v == nil or (mode == "max" and x > v) or (mode == "min" and x < v) or mode == "last" then v = x end
      end
      if mode == "avg" then v = sum / NHERO elseif mode == "sum" then v = sum end
      n = n + M.edit(e.ns, e.cls, e.name, base * v, e.sig, e.kind)
    else
      nf = nf + 1
    end
  end
  return n, NHERO, nf
end

function M.restore()
  local f = be("restore")
  if not f then return 0 end
  return f() or 0
end

function M.classCount() return #CLS end

function M.getClass(ns, cls) return dumpClass(ns, cls) end

function M.getField(ns, cls, field)
  local c = dumpClass(ns, cls)
  if not c then return nil end
  for i = 1, #c.fields do if c.fields[i].n == field then return c.fields[i] end end
  return nil
end

function M.getMethods(ns, cls, method, sig, cb)
  local c = dumpClass(ns, cls)
  local out = {}
  if not c then return out, 0 end
  for i = 1, #c.methods do
    local m = c.methods[i]
    if (method == nil or m.n == method) and (sig == nil or m.p == sig) then
      out[#out + 1] = m
      if cb then cb(m, c) end
    end
  end
  return out, #out
end

function M.eachClass(cb)
  for i = 1, #CLS do cb(decode(i), i) end
  return #CLS
end

function M.findField(pattern, cb)
  local out = {}
  for ci = 1, #CLS do
    local c = decode(ci)
    for j = 1, #c.fields do
      local f = c.fields[j]
      if containsCI(f.n, pattern) then
        out[#out + 1] = { class = c, field = f }
        if cb then cb(c, f) end
      end
    end
  end
  return out, #out
end

function M.findMethod(pattern, cb)
  local out = {}
  for ci = 1, #CLS do
    local c = decode(ci)
    for j = 1, #c.methods do
      local m = c.methods[j]
      if containsCI(m.n, pattern) then
        out[#out + 1] = { class = c, method = m }
        if cb then cb(c, m) end
      end
    end
  end
  return out, #out
end

function M.resolveClass(ns, cls) local f = be("resolveClass"); return f and f(ns, cls) or nil end
function M.methodAddress(ns, cls, method, sig) local f = be("methodAddress"); return f and f(ns, cls, method, sig) or nil end
function M.fieldOffset(ns, cls, field) local f = be("fieldOffset"); return f and f(ns, cls, field) or -1 end
function M.editField(ns, cls, field, instance, value, size)
  local f = be("editField")
  if not f then return 0 end
  return f(ns, cls, field, instance, value, size or 4)
end

math.randomseed((os and os.time and os.time()) or 1)
random(); random()
BattleData = M
return M
