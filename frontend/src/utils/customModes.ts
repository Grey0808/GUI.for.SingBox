export type CustomMode = {
  id: string
  name: string
  icon: string
  outbound: string
  rules: Record<string, any>[]
}
export const modeKey = (mode: CustomMode) => `Custom_${mode.id}`
const standard = ['rule', 'global', 'direct']
export function validateModes(modes: CustomMode[]) {
  const names = new Set<string>()
  const ids = new Set<string>()
  for (const mode of modes) {
    if (
      typeof mode.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,80}$/.test(mode.id) ||
      ids.has(mode.id.toLowerCase())
    )
      throw Error('Invalid or duplicate mode ID')
    ids.add(mode.id.toLowerCase())
    if (typeof mode.name !== 'string') throw Error('Mode name must be a string')
    const name = mode.name.trim().toLowerCase()
    if (!name || standard.includes(name) || names.has(name))
      throw Error('Mode names must be unique and cannot be Rule, Global or Direct')
    names.add(name)
    if (
      typeof mode.icon !== 'string' ||
      !mode.icon.trim() ||
      mode.icon.length > 32 ||
      typeof mode.outbound !== 'string' ||
      !mode.outbound
    )
      throw Error('Mode requires an icon and target outbound')
    if (!Array.isArray(mode.rules)) throw Error('Mode rules must be an array')
    for (const rule of mode.rules) {
      if (!rule || typeof rule !== 'object' || Array.isArray(rule) || !Object.keys(rule).length)
        throw Error('Mode rule must contain conditions')
      for (const [key, value] of Object.entries(rule)) {
        if (
          ![
            'domain',
            'domain_suffix',
            'domain_keyword',
            'domain_regex',
            'ip_cidr',
            'port',
            'network',
            'protocol',
            'process_name',
            'process_path',
          ].includes(key)
        )
          throw Error(`Unsupported mode condition: ${key}`)
        const values = Array.isArray(value) ? value : [value]
        if (
          !values.length ||
          !values.every((v) =>
            key === 'port'
              ? Number.isInteger(v) && v > 0 && v <= 65535
              : typeof v === 'string' && v.length > 0,
          )
        )
          throw Error(`Invalid mode condition: ${key}`)
        if (key === 'network' && !values.every((v) => ['tcp', 'udp'].includes(v)))
          throw Error('Invalid network condition')
      }
    }
  }
}

export function rulesForMode(
  mode: CustomMode,
  profileOutbounds: { id: string; tag: string }[],
  available: Set<string>,
) {
  const tag = profileOutbounds.find((p) => p.id === mode.outbound)?.tag
  if (!tag || !available.has(tag))
    return {
      error: 'Target outbound is missing or incompatible with this core',
      rules: [{ clash_mode: modeKey(mode), action: 'reject' }],
    }
  return {
    error: '',
    rules: (mode.rules.length ? mode.rules : [{}]).map((conditions) => ({
      ...conditions,
      clash_mode: modeKey(mode),
      action: 'route',
      outbound: tag,
    })),
  }
}

export function applyCustomModes(
  input: Record<string, any>,
  modes: CustomMode[],
  profileOutbounds: { id: string; tag: string }[],
  selected?: string,
) {
  validateModes(modes)
  const config = structuredClone(input)
  if (!modes.length && !selected) return config
  config.route ||= {}
  config.route.rules ||= []
  config.outbounds ||= []
  const available = new Set<string>(config.outbounds.map((p: any) => p.tag))
  const customKeys = new Set(modes.map(modeKey))
  // Applying twice (after callbacks) replaces our rules rather than duplicating them.
  config.route.rules = config.route.rules.filter((r: any) => !customKeys.has(r.clash_mode))
  const added: any[] = []
  const valid = new Set(standard)
  for (const mode of modes) {
    const result = rulesForMode(mode, profileOutbounds, available)
    added.push(...result.rules)
    if (!result.error) valid.add(modeKey(mode).toLowerCase())
  }
  const registered = new Set<string>()
  const spellings = new Map<string, string>()
  const collect = (rules: any[]) => {
    for (const rule of rules || []) {
      if (rule.clash_mode) {
        registered.add(String(rule.clash_mode).toLowerCase())
        spellings.set(String(rule.clash_mode).toLowerCase(), rule.clash_mode)
      }
      if (rule.rules) collect(rule.rules)
    }
  }
  collect(config.route.rules)
  collect(config.dns?.rules)
  const final = config.route.final || config.outbounds[0]?.tag
  if (!final || !available.has(final)) throw Error('Modes require a valid default outbound')
  if (!registered.has('global'))
    added.push({ clash_mode: 'Global', action: 'route', outbound: final })
  if (!registered.has('direct')) {
    let direct = config.outbounds.find((p: any) => p.type === 'direct')?.tag
    if (!direct) {
      direct = 'mode-direct'
      while (available.has(direct)) direct += '_'
      config.outbounds.push({ type: 'direct', tag: direct })
    }
    added.push({ clash_mode: 'Direct', action: 'route', outbound: direct })
  }
  let index = config.route.rules.findIndex(
    (r: any) => !['sniff', 'hijack-dns', 'resolve'].includes(r.action),
  )
  if (index < 0) index = config.route.rules.length
  config.route.rules.splice(index, 0, ...added)
  if (!registered.has('rule'))
    config.route.rules.push({ clash_mode: 'Rule', action: 'route', outbound: final })
  config.experimental ||= {}
  config.experimental.clash_api ||= {}
  collect(config.route.rules)
  if (selected)
    config.experimental.clash_api.default_mode = valid.has(selected.toLowerCase())
      ? spellings.get(selected.toLowerCase()) || selected
      : spellings.get('rule') || 'Rule'
  return config
}

export function modeDefinitionMatches(
  mode: CustomMode,
  profileOutbounds: { id: string; tag: string }[],
  runtime: Record<string, any> | undefined,
) {
  if (!runtime) return false
  try {
    validateModes([mode])
  } catch {
    return false
  }
  const expected = rulesForMode(
    mode,
    profileOutbounds,
    new Set((runtime.outbounds || []).map((p: any) => p.tag)),
  )
  if (expected.error) return false
  const actual = (runtime.route?.rules || []).filter((r: any) => r.clash_mode === modeKey(mode))
  const canonical = (value: any): string => {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
    if (value && typeof value === 'object')
      return `{${Object.keys(value)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
        .join(',')}}`
    return JSON.stringify(value)
  }
  return canonical(actual) === canonical(expected.rules)
}

export async function switchClashMode(
  mode: string,
  api: {
    get: () => Promise<{ mode: string; 'mode-list'?: string[] }>
    patch: (mode: string) => Promise<unknown>
  },
) {
  const before = await api.get()
  if (
    before['mode-list']
      ? !before['mode-list'].some((value) => value.toLowerCase() === mode.toLowerCase())
      : !standard.includes(mode.toLowerCase())
  )
    throw Error('Mode is not loaded by the core. Apply the new configuration explicitly first.')
  await api.patch(mode)
  const after = await api.get()
  if (after.mode.toLowerCase() !== mode.toLowerCase())
    throw Error('Core did not apply the requested mode')
  return after.mode
}
