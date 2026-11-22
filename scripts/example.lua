local BD = BattleData

local SIZE = { byte = 1, sbyte = 1, short = 2, ushort = 2, int = 4, uint = 4, long = 8, ulong = 8 }

BD.eachHeroAll(function(id, plan)
  for i = 1, #plan do
    local e = plan[i]
    if e.what == "method" then
      BD.edit(e.ns, e.cls, e.name, e.value, e.sig, e.kind)
    elseif HeroInstance and e.numeric and not e.const then
      local size = SIZE[e.type:match("([%w_]+)%s*$")]
      if size then BD.editField(e.ns, e.cls, e.name, HeroInstance, math.floor(e.value), size) end
    end
  end
end, 100)

BD.restore()
