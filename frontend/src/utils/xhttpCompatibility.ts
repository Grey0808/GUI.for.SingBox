import { parseCoreVersion } from './coreCapabilities.ts'

export type CoreFacts = ReturnType<typeof parseCoreVersion> & { sha256?: string }
function transportForProfile(value: Record<string, any>) {
  const transport = structuredClone(value)
  const ranges = [
    'x_padding_bytes',
    'uplink_chunk_size',
    'sc_max_each_post_bytes',
    'sc_min_posts_interval_ms',
    'sc_stream_up_server_secs',
    'session_length',
  ]
  const strings = [
    'type',
    'host',
    'path',
    'mode',
    'session_placement',
    'session_key',
    'session_table',
    'seq_placement',
    'seq_key',
    'uplink_data_placement',
    'uplink_data_key',
    'uplink_http_method',
    'x_padding_placement',
    'x_padding_key',
    'x_padding_header',
    'x_padding_method',
  ]
  const booleans = ['no_grpc_header', 'no_sse_header', 'x_padding_obfs_mode']
  const numbers = ['sc_max_concurrent_posts', 'server_max_header_bytes', 'sc_max_buffered_posts']
  const range = (v: any) => {
    if (v === '') return ''
    if (Array.isArray(v) && (v.length !== 2 || !v.every(Number.isSafeInteger)))
      throw Error('invalid range')
    const text = Array.isArray(v) ? v.join('-') : String(v)
    if (!/^\d+(?:-\d+)?$/.test(text)) throw Error('invalid range')
    const [min, max = min] = text.split('-').map(Number)
    if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min! > max!)
      throw Error('invalid range')
    return text
  }
  for (const key of Object.keys(transport)) {
    const value = transport[key]
    if (ranges.includes(key)) transport[key] = range(value)
    else if (strings.includes(key)) {
      if (typeof value !== 'string') throw Error(`invalid ${key}`)
    } else if (booleans.includes(key)) {
      if (typeof value !== 'boolean') throw Error(`invalid ${key}`)
    } else if (numbers.includes(key)) {
      if (!Number.isSafeInteger(value) || value < 0) throw Error(`invalid ${key}`)
    } else if (key === 'headers') {
      if (
        !value ||
        typeof value !== 'object' ||
        Array.isArray(value) ||
        !Object.values(value).every(
          (v) =>
            typeof v === 'string' || (Array.isArray(v) && v.every((s) => typeof s === 'string')),
        )
      )
        throw Error('invalid headers')
    } else if (key === 'xmux') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('invalid xmux')
      for (const k of Object.keys(value)) {
        if (
          [
            'max_concurrency',
            'max_connections',
            'c_max_reuse_times',
            'h_max_request_times',
            'h_max_reusable_secs',
          ].includes(k)
        )
          value[k] = range(value[k])
        else if (k === 'h_keep_alive_period') {
          if (!Number.isSafeInteger(value[k])) throw Error('invalid keepalive')
        } else throw Error(`unsupported xmux.${k}`)
      }
    } else throw Error(`unsupported parameter ${key}`)
  }
  if (transport.mode && !['auto', 'packet-up', 'stream-up', 'stream-one'].includes(transport.mode))
    throw Error('invalid mode')
  if (!!transport.session_table !== !!transport.session_length)
    throw Error('session table and length must be paired')
  if (transport.session_length && Number(transport.session_length.split('-')[0]) < 1)
    throw Error('invalid session length')
  for (const [key, values] of Object.entries({
    session_placement: ['path', 'query', 'header', 'cookie'],
    seq_placement: ['path', 'query', 'header', 'cookie'],
    uplink_data_placement: ['auto', 'body', 'header', 'cookie'],
    x_padding_placement: ['cookie', 'header', 'query', 'queryInHeader'],
    x_padding_method: ['repeat-x', 'tokenish'],
  })) {
    if (transport[key] && !values.includes(transport[key])) throw Error(`invalid ${key}`)
  }
  if (
    Number(transport.xmux?.max_concurrency?.split('-').at(-1)) > 0 &&
    Number(transport.xmux?.max_connections?.split('-').at(-1)) > 0
  )
    throw Error('conflicting XMUX limits')
  return transport
}
export function xhttpUnavailableReason(proxy: Record<string, any>, facts?: CoreFacts): string {
  if (proxy.transport?.type !== 'xhttp') return ''
  if (!facts?.version || !/^[a-f0-9]{64}$/i.test(facts.sha256 || ''))
    return 'XHTTP: selected binary could not be identified'
  if (facts.xhttp !== true) return 'XHTTP: binary does not report with_xhttp build tag'
  if (facts.version !== '1.14.4-lx.33')
    return 'XHTTP: this core version has no verified transport profile'
  if (!['vless', 'vmess', 'trojan'].includes(proxy.type))
    return 'XHTTP: unsupported outbound protocol'
  if (
    proxy.tls?.enabled &&
    proxy.tls.alpn?.length === 1 &&
    proxy.tls.alpn[0] === 'h3' &&
    !facts.tags.includes('with_quic')
  )
    return 'XHTTP: HTTP/3 requires with_quic'
  if (proxy.tls?.reality?.enabled && !facts.tags.includes('with_utls'))
    return 'XHTTP: REALITY requires with_utls'
  try {
    const transport = transportForProfile(proxy.transport)
    const mode =
      !transport.mode || transport.mode === 'auto'
        ? proxy.tls?.reality?.enabled
          ? 'stream-one'
          : 'packet-up'
        : transport.mode
    if (
      mode !== 'packet-up' &&
      (['header', 'cookie'].includes(transport.uplink_data_placement) ||
        transport.uplink_http_method?.toUpperCase() === 'GET')
    )
      throw Error('uplink placement or method requires packet-up')
  } catch (error) {
    return `XHTTP: ${String(error)}`
  }
  return ''
}

/** Applies after scripts/plugins too. It never mutates subscription data. */
export function compatibleConfig(input: Record<string, any>, facts?: CoreFacts) {
  const config = structuredClone(input)
  const original: Record<string, any>[] = config.outbounds || []
  const excluded = new Set(
    original.filter((p) => xhttpUnavailableReason(p, facts)).map((p) => p.tag),
  )
  for (const proxy of original)
    if (proxy.transport?.type === 'xhttp' && !excluded.has(proxy.tag))
      proxy.transport = transportForProfile(proxy.transport)
  if (!excluded.size) return config
  let outbounds = original.filter((p) => !excluded.has(p.tag))
  // Empty groups cannot be emitted. Propagate their exclusion through nested groups.
  let changed = true
  while (changed) {
    changed = false
    for (const p of outbounds)
      if (['selector', 'urltest'].includes(p.type)) {
        p.outbounds = (p.outbounds || []).filter((tag: string) => !excluded.has(tag))
        if (!p.outbounds.length) {
          excluded.add(p.tag)
          changed = true
        }
      }
    outbounds = outbounds.filter((p) => !excluded.has(p.tag))
  }
  const fallback = outbounds.find(
    (p) => !['direct', 'block', 'dns', 'selector', 'urltest'].includes(p.type) && !p.detour,
  )?.tag
  const replace = (tag: string) => {
    if (!excluded.has(tag)) return tag
    if (!fallback) throw Error('XHTTP is unavailable and no compatible proxy route remains')
    return fallback
  }
  if (!config.route?.final && excluded.has(original[0]?.tag)) {
    config.route ||= {}
    config.route.final = replace(original[0]!.tag)
  }
  for (const p of outbounds) {
    if (p.default && excluded.has(p.default)) p.default = p.outbounds?.[0] || replace(p.default)
    if (p.detour) p.detour = replace(p.detour)
  }
  const rules = (items: any[]) => {
    for (const rule of items || []) {
      if (rule.outbound) rule.outbound = replace(rule.outbound)
      if (rule.rules) rules(rule.rules)
    }
  }
  if (config.route?.final) config.route.final = replace(config.route.final)
  rules(config.route?.rules)
  for (const server of config.dns?.servers || [])
    if (server.detour) server.detour = replace(server.detour)
  for (const client of config.http_clients || [])
    if (client.detour) client.detour = replace(client.detour)
  const clash = config.experimental?.clash_api
  if (clash?.external_ui_download_detour)
    clash.external_ui_download_detour = replace(clash.external_ui_download_detour)
  config.outbounds = outbounds
  return config
}
