/** A lossless import boundary. Conversion to sing-box must not mutate source. */
export type XrayNode = {
  tag: string
  protocol: string
  source: Record<string, unknown>
  groups: string[]
}

type JsonObject = Record<string, unknown>

function object(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Returns null for other subscription formats, preserving existing detection paths. */
export function parseXraySubscription(body: string): XrayNode[] | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return null
  }
  const configs = Array.isArray(parsed) ? parsed : [parsed]
  if (
    !configs.length ||
    !configs.every((config) => object(config) && Array.isArray(config.outbounds))
  )
    return null
  const records = configs as JsonObject[]
  if (
    !records.some((config) =>
      (config.outbounds as unknown[]).some(
        (entry) => object(entry) && typeof entry.protocol === 'string',
      ),
    )
  )
    return null
  if (
    records.some((config) =>
      (config.outbounds as unknown[]).some(
        (entry) => !object(entry) || typeof entry.protocol !== 'string',
      ),
    )
  ) {
    throw new Error('Xray subscription contains an invalid outbound')
  }

  const result: XrayNode[] = []
  for (const config of records) {
    const routing = object(config.routing) ? config.routing : {}
    const balancers = Array.isArray(routing.balancers) ? routing.balancers : []
    for (const source of config.outbounds as JsonObject[]) {
      const protocol = source.protocol as string
      if (['freedom', 'blackhole', 'dns'].includes(protocol)) continue
      const tag = typeof source.tag === 'string' ? source.tag : ''
      const groups = balancers.flatMap((group): string[] => {
        if (!object(group) || typeof group.tag !== 'string' || !Array.isArray(group.selector))
          return []
        return group.selector.some((prefix) => typeof prefix === 'string' && tag.startsWith(prefix))
          ? [group.tag]
          : []
      })
      result.push({ tag, protocol, source: structuredClone(source), groups })
    }
  }
  return result
}
