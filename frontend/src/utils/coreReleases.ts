export type CoreFlavor = 'official' | 'lx'

export const coreReleaseSources: Record<CoreFlavor, { api: string; page: string }> = {
  official: {
    api: 'https://api.github.com/repos/SagerNet/sing-box/releases',
    page: 'https://github.com/SagerNet/sing-box/releases',
  },
  lx: {
    api: 'https://api.github.com/repos/Leadaxe/sing-box-lx/releases',
    page: 'https://github.com/Leadaxe/sing-box-lx/releases',
  },
}

export function windowsAmd64AssetName(tag: string): string {
  const version = tag.replace(/^v/, '')
  if (!/^[0-9][0-9A-Za-z.+-]*$/.test(version)) throw new Error('Invalid release version')
  return `sing-box-${version}-windows-amd64.zip`
}

export function lxCoreDirectory(version: string): string {
  const name = windowsAmd64AssetName(version)
  if (!/-lx\.[0-9]+(?:[-.][0-9A-Za-z]+)*-windows-amd64\.zip$/.test(name)) {
    throw new Error('Invalid sing-box-lx version')
  }
  return `data/sing-box/versions/lx/${version.replace(/^v/, '')}`
}

export function lxCorePath(version: string): string {
  return `${lxCoreDirectory(version)}/sing-box.exe`
}

export function sha256FromSums(text: string, assetName: string): string {
  const matches = text.split(/\r?\n/).flatMap((line) => {
    const match = line.match(/^([a-f\d]{64})\s+\*?(.+)$/i)
    return match && match[2] === assetName ? [match[1]!.toLowerCase()] : []
  })
  if (matches.length !== 1) throw new Error('Release checksum is missing or ambiguous')
  return matches[0]!
}
