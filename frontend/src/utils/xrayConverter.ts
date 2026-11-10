import { parseXraySubscription } from './xraySubscription.ts'

type Obj = Record<string, any>
function obj(value: unknown, path: string): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw Error(`Xray: expected object at ${path}`)
  return value as Obj
}
function keys(value: Obj, allowed: string[], path: string) {
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw Error(`Xray: unsupported field ${path}.${key}`)
}
function str(value: unknown, path: string, empty = false): string {
  if (typeof value !== 'string' || (!empty && !value))
    throw Error(`Xray: expected string at ${path}`)
  return value
}
function bool(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw Error(`Xray: expected boolean at ${path}`)
  return value
}
function integer(value: unknown, path: string, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || Number(value) < min || Number(value) > max)
    throw Error(`Xray: invalid integer at ${path}`)
  return Number(value)
}
function range(value: unknown, path: string): string {
  if (value === '') return ''
  if (
    Array.isArray(value) &&
    (value.length !== 2 || !value.every((v) => Number.isSafeInteger(v) && v >= 0))
  )
    throw Error(`Xray: invalid range at ${path}`)
  const text = Array.isArray(value) && value.length === 2 ? value.join('-') : String(value)
  if (!/^\d+(?:-\d+)?$/.test(text)) throw Error(`Xray: invalid range at ${path}`)
  const [a, b = a] = text.split('-').map(Number) as [number, number?]
  if (!Number.isSafeInteger(a) || !Number.isSafeInteger(b) || a > b)
    throw Error(`Xray: invalid range at ${path}`)
  return text
}

function tls(stream: Obj): Obj | undefined {
  const security = stream.security || 'none'
  if (
    (security === 'tls' && stream.realitySettings) ||
    (security === 'reality' && stream.tlsSettings)
  )
    throw Error('Xray: conflicting TLS security settings')
  if (security === 'none') {
    if (stream.tlsSettings || stream.realitySettings)
      throw Error('Xray: TLS settings without TLS security')
    return undefined
  }
  if (!['tls', 'reality'].includes(security)) throw Error('Xray: unsupported stream security')
  const source = obj(stream[security === 'tls' ? 'tlsSettings' : 'realitySettings'] || {}, security)
  keys(
    source,
    [
      'serverName',
      'fingerprint',
      'allowInsecure',
      'alpn',
      'minVersion',
      'maxVersion',
      'publicKey',
      'password',
      'shortId',
      'show',
      'spiderX',
    ],
    security,
  )
  if (source.show) throw Error('Xray: unsupported reality.show')
  if (source.spiderX) throw Error('Xray: unsupported reality.spiderX')
  const result: Obj = { enabled: true }
  if (source.serverName !== undefined)
    result.server_name = str(source.serverName, 'tls.serverName', true)
  if (source.allowInsecure !== undefined)
    result.insecure = bool(source.allowInsecure, 'tls.allowInsecure')
  if (source.fingerprint)
    result.utls = { enabled: true, fingerprint: str(source.fingerprint, 'tls.fingerprint') }
  if (source.alpn !== undefined) {
    if (!Array.isArray(source.alpn) || !source.alpn.every((v: unknown) => typeof v === 'string'))
      throw Error('Xray: invalid tls.alpn')
    result.alpn = source.alpn
  }
  for (const [input, output] of [
    ['minVersion', 'min_version'],
    ['maxVersion', 'max_version'],
  ]) {
    if (source[input!] !== undefined) result[output!] = str(source[input!], `tls.${input}`)
  }
  if (security === 'reality') {
    if (!source.fingerprint) throw Error('Xray: REALITY fingerprint is required')
    if (source.publicKey && source.password && source.publicKey !== source.password)
      throw Error('Xray: conflicting REALITY keys')
    result.reality = {
      enabled: true,
      public_key: str(source.publicKey || source.password, 'reality.publicKey'),
      short_id: str(source.shortId ?? '', 'reality.shortId', true),
    }
  } else if (source.publicKey || source.password || source.shortId)
    throw Error('Xray: REALITY fields with TLS security')
  return result
}

const xhttpStrings: Record<string, string> = {
  host: 'host',
  path: 'path',
  mode: 'mode',
  sessionIDPlacement: 'session_placement',
  sessionIDKey: 'session_key',
  sessionIDTable: 'session_table',
  seqPlacement: 'seq_placement',
  seqKey: 'seq_key',
  uplinkDataPlacement: 'uplink_data_placement',
  uplinkDataKey: 'uplink_data_key',
  uplinkHTTPMethod: 'uplink_http_method',
  xPaddingPlacement: 'x_padding_placement',
  xPaddingKey: 'x_padding_key',
  xPaddingHeader: 'x_padding_header',
  xPaddingMethod: 'x_padding_method',
}
const xhttpRanges: Record<string, string> = {
  xPaddingBytes: 'x_padding_bytes',
  scMaxEachPostBytes: 'sc_max_each_post_bytes',
  scMinPostsIntervalMs: 'sc_min_posts_interval_ms',
  scStreamUpServerSecs: 'sc_stream_up_server_secs',
  uplinkChunkSize: 'uplink_chunk_size',
  sessionIDLength: 'session_length',
}
function xhttp(value: unknown): Obj {
  const source = obj(value || {}, 'xhttp')
  const extra = source.extra === undefined ? {} : obj(source.extra, 'xhttp.extra')
  for (const key of Object.keys(extra))
    if (key in source) throw Error(`Xray: conflicting xhttp.${key}`)
  const input = { ...source, ...extra }
  delete input.extra
  const booleans: Record<string, string> = {
    noGRPCHeader: 'no_grpc_header',
    noSSEHeader: 'no_sse_header',
    xPaddingObfsMode: 'x_padding_obfs_mode',
  }
  const numbers: Record<string, string> = {
    scMaxConcurrentPosts: 'sc_max_concurrent_posts',
    scMaxBufferedPosts: 'sc_max_buffered_posts',
    serverMaxHeaderBytes: 'server_max_header_bytes',
  }
  keys(
    input,
    [
      ...Object.keys(xhttpStrings),
      ...Object.keys(xhttpRanges),
      ...Object.keys(booleans),
      ...Object.keys(numbers),
      'headers',
      'xmux',
    ],
    'xhttp',
  )
  const output: Obj = { type: 'xhttp' }
  for (const [key, target] of Object.entries(xhttpStrings))
    if (input[key] !== undefined) output[target] = str(input[key], `xhttp.${key}`, true)
  for (const [key, target] of Object.entries(xhttpRanges))
    if (input[key] !== undefined) output[target] = range(input[key], `xhttp.${key}`)
  for (const [key, target] of Object.entries(booleans))
    if (input[key] !== undefined) output[target] = bool(input[key], `xhttp.${key}`)
  for (const [key, target] of Object.entries(numbers))
    if (input[key] !== undefined) output[target] = integer(input[key], `xhttp.${key}`)
  if (output.mode && !['auto', 'packet-up', 'stream-up', 'stream-one'].includes(output.mode))
    throw Error('Xray: invalid xhttp.mode')
  if (Boolean(output.session_table) !== Boolean(output.session_length))
    throw Error('Xray: sessionIDTable and sessionIDLength must be specified together')
  if (output.session_length && Number(output.session_length.split('-')[0]) < 1)
    throw Error('Xray: sessionIDLength must be positive')
  for (const [field, allowed] of Object.entries({
    session_placement: ['path', 'query', 'header', 'cookie'],
    seq_placement: ['path', 'query', 'header', 'cookie'],
    uplink_data_placement: ['auto', 'body', 'header', 'cookie'],
    x_padding_placement: ['cookie', 'header', 'query', 'queryInHeader'],
    x_padding_method: ['repeat-x', 'tokenish'],
  }))
    if (output[field] && !allowed.includes(output[field]))
      throw Error(`Xray: invalid xhttp.${field}`)
  if (input.headers !== undefined) {
    output.headers = obj(input.headers, 'xhttp.headers')
    for (const v of Object.values(output.headers)) str(v, 'xhttp.headers value', true)
  }
  if (input.xmux !== undefined) {
    const xm = obj(input.xmux, 'xhttp.xmux')
    const fields: Record<string, string> = {
      maxConcurrency: 'max_concurrency',
      maxConnections: 'max_connections',
      cMaxReuseTimes: 'c_max_reuse_times',
      hMaxRequestTimes: 'h_max_request_times',
      hMaxReusableSecs: 'h_max_reusable_secs',
    }
    keys(xm, [...Object.keys(fields), 'hKeepAlivePeriod'], 'xhttp.xmux')
    output.xmux = {}
    for (const [key, target] of Object.entries(fields))
      if (xm[key] !== undefined) output.xmux[target] = range(xm[key], `xhttp.xmux.${key}`)
    if (xm.hKeepAlivePeriod !== undefined)
      output.xmux.h_keep_alive_period = integer(
        xm.hKeepAlivePeriod,
        'xhttp.xmux.hKeepAlivePeriod',
        -Number.MAX_SAFE_INTEGER,
      )
    if (
      Number(output.xmux.max_concurrency?.split('-').at(-1)) > 0 &&
      Number(output.xmux.max_connections?.split('-').at(-1)) > 0
    )
      throw Error('Xray: xmux maxConcurrency and maxConnections are mutually exclusive')
  }
  return output
}

function convertNode(source: Obj): Obj[] {
  keys(source, ['protocol', 'tag', 'settings', 'streamSettings', 'mux'], 'outbound')
  if (source.mux !== undefined) {
    const mux = obj(source.mux, 'mux')
    keys(mux, ['enabled'], 'mux')
    if (mux.enabled !== false) throw Error('Xray: enabled or unspecified mux is unsupported')
  }
  const settings = obj(source.settings, 'settings')
  const stream = obj(source.streamSettings || {}, 'streamSettings')
  keys(
    stream,
    [
      'network',
      'method',
      'security',
      'tlsSettings',
      'realitySettings',
      'xhttpSettings',
      'splithttpSettings',
      'hysteriaSettings',
      'tcpSettings',
      'rawSettings',
    ],
    'streamSettings',
  )
  if (stream.method && stream.network && stream.method !== stream.network)
    throw Error('Xray: conflicting stream method and network')
  const network = stream.method || stream.network || 'tcp'
  if (stream.xhttpSettings && stream.splithttpSettings)
    throw Error('Xray: conflicting XHTTP settings aliases')
  if (stream.tcpSettings && stream.rawSettings)
    throw Error('Xray: conflicting TCP settings aliases')
  const transportTls = tls(stream)
  for (const key of ['tcpSettings', 'rawSettings'])
    if (stream[key]) {
      const tcp = obj(stream[key], key)
      keys(tcp, ['header'], key)
      if (tcp.header) {
        keys(obj(tcp.header, `${key}.header`), ['type'], `${key}.header`)
        if (tcp.header.type !== 'none') throw Error(`Xray: unsupported ${key}.header`)
      }
    }
  if (source.protocol === 'hysteria' || source.protocol === 'hysteria2') {
    if (
      stream.xhttpSettings ||
      stream.splithttpSettings ||
      stream.tcpSettings ||
      stream.rawSettings
    )
      throw Error('Xray: conflicting Hysteria2 transport settings')
    keys(settings, ['version', 'address', 'port', 'password'], 'settings')
    if (settings.version !== undefined && settings.version !== 2)
      throw Error('Xray: only Hysteria2 is supported')
    if (network !== 'hysteria' && network !== 'hysteria2')
      throw Error('Xray: Hysteria2 requires hysteria transport')
    const hy = obj(stream.hysteriaSettings || {}, 'hysteriaSettings')
    keys(hy, ['version', 'auth'], 'hysteriaSettings')
    if (hy.version !== undefined && hy.version !== 2)
      throw Error('Xray: only Hysteria2 is supported')
    if (!transportTls) throw Error('Xray: Hysteria2 requires TLS')
    if (settings.password !== undefined && hy.auth !== undefined && settings.password !== hy.auth)
      throw Error('Xray: conflicting Hysteria2 passwords')
    return [
      {
        type: 'hysteria2',
        tag: source.tag,
        server: str(settings.address, 'settings.address'),
        server_port: integer(settings.port, 'settings.port', 1, 65535),
        password: str(hy.auth ?? settings.password ?? '', 'hysteriaSettings.auth', true),
        tls: transportTls,
      },
    ]
  }
  if (source.protocol !== 'vless')
    throw Error(`Xray: unsupported outbound protocol ${source.protocol}`)
  keys(
    settings,
    ['vnext', 'address', 'port', 'id', 'encryption', 'flow', 'level', 'email'],
    'settings',
  )
  if (settings.vnext !== undefined && Object.keys(settings).some((key) => key !== 'vnext'))
    throw Error('Xray: conflicting flat and vnext VLESS settings')
  const servers =
    settings.vnext === undefined
      ? [
          {
            address: settings.address,
            port: settings.port,
            users: [
              {
                id: settings.id,
                encryption: settings.encryption,
                flow: settings.flow,
                level: settings.level,
                email: settings.email,
              },
            ],
          },
        ]
      : settings.vnext
  if (!Array.isArray(servers) || !servers.length) throw Error('Xray: invalid settings.vnext')
  let transport: Obj | undefined
  if (['xhttp', 'splithttp'].includes(network))
    transport = xhttp(stream.xhttpSettings ?? stream.splithttpSettings)
  else if (!['tcp', 'raw'].includes(network)) throw Error(`Xray: unsupported transport ${network}`)
  if (!transport && (stream.xhttpSettings || stream.splithttpSettings))
    throw Error('Xray: XHTTP settings on another transport')
  if (stream.hysteriaSettings) throw Error('Xray: hysteriaSettings on VLESS')
  if (transport) {
    const mode =
      !transport.mode || transport.mode === 'auto'
        ? transportTls?.reality
          ? 'stream-one'
          : 'packet-up'
        : transport.mode
    if (
      mode !== 'packet-up' &&
      (['header', 'cookie'].includes(transport.uplink_data_placement) ||
        transport.uplink_http_method?.toUpperCase() === 'GET')
    )
      throw Error('Xray: uplink data placement/method requires packet-up mode')
  }
  return servers.flatMap((value: unknown) => {
    const server = obj(value, 'vnext')
    keys(server, ['address', 'port', 'users'], 'vnext')
    if (!Array.isArray(server.users) || !server.users.length)
      throw Error('Xray: missing vnext.users')
    return server.users.map((value: unknown) => {
      const user = obj(value, 'user')
      keys(user, ['id', 'encryption', 'flow', 'level', 'email'], 'user')
      if (user.level !== undefined) integer(user.level, 'user.level')
      if (user.level) throw Error('Xray: nonzero user.level requires unsupported Xray policy')
      if (user.email !== undefined) str(user.email, 'user.email', true)
      if (user.encryption && user.encryption !== 'none')
        throw Error('Xray: unsupported VLESS encryption')
      if (user.flow && user.flow !== 'xtls-rprx-vision') throw Error('Xray: unsupported VLESS flow')
      if (user.flow && transport)
        throw Error('Xray: Vision over XHTTP requires unsupported VLESS encryption')
      const result: Obj = {
        type: 'vless',
        tag: source.tag,
        server: str(server.address, 'vnext.address'),
        server_port: integer(server.port, 'vnext.port', 1, 65535),
        uuid: str(user.id, 'user.id'),
      }
      if (user.flow) result.flow = user.flow
      if (transportTls) result.tls = transportTls
      if (transport) result.transport = transport
      return result
    })
  })
}

function canonical(value: any): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object')
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
      .join(',')}}`
  return JSON.stringify(value)
}

export function convertXraySubscription(body: string) {
  const sources = parseXraySubscription(body)
  if (sources === null) return null
  const parsed = JSON.parse(body)
  for (const config of Array.isArray(parsed) ? parsed : [parsed]) {
    keys(
      config,
      [
        'outbounds',
        'inbounds',
        'routing',
        'dns',
        'log',
        'remarks',
        'name',
        'stats',
        'api',
        'observatory',
        'burstObservatory',
        'policy',
        'transport',
      ],
      'config',
    )
    for (const key of ['policy', 'transport']) {
      if (config[key] !== undefined && Object.keys(obj(config[key], `config.${key}`)).length)
        throw Error(`Xray: unsupported global config.${key}`)
    }
  }
  const outbounds: Obj[] = []
  const seen = new Map<string, Obj>()
  const names = new Set<string>()
  const aliases: { original: string; tag: string; groups: string[] }[] = []
  for (const source of sources)
    for (const outbound of convertNode(source.source)) {
    const { tag: _tag, ...connection } = outbound
      const key = canonical(connection)
      let existing = seen.get(key)
      if (!existing) {
        const name = source.tag || `${source.protocol}-${outbounds.length + 1}`
        let tag = name
        let n = 2
        while (names.has(tag)) tag = `${name} (${n++})`
        existing = { ...outbound, tag }
        names.add(tag)
        seen.set(key, existing)
        outbounds.push(existing)
      }
      aliases.push({ original: source.tag, tag: existing.tag, groups: source.groups })
    }
  if (!outbounds.length) throw Error('Xray: subscription contains no proxy outbounds')
  return { outbounds: structuredClone(outbounds), sources, aliases }
}
