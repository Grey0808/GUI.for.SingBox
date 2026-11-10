export type SubscriptionMetadata = {
  profileTitle?: string | string[]
  profileUpdateInterval?: string | string[]
  supportUrl?: string | string[]
  announce?: string | string[]
}

/** Preserve the received values verbatim; a missing header must not erase saved metadata. */
export function readSubscriptionMetadata(headers: Record<string, unknown>): SubscriptionMetadata {
  const keys: Record<string, keyof SubscriptionMetadata> = {
    'profile-title': 'profileTitle',
    'profile-update-interval': 'profileUpdateInterval',
    'support-url': 'supportUrl',
    announce: 'announce',
  }
  const result: SubscriptionMetadata = {}
  for (const [header, value] of Object.entries(headers)) {
    const key = keys[header.toLowerCase()]
    if (key && (typeof value === 'string' || (Array.isArray(value) && value.every((v) => typeof v === 'string')))) result[key] = value
  }
  return result
}
