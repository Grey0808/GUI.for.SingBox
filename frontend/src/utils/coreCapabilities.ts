/** Facts reported by a binary, not assumptions based on its release name. */
export function parseCoreVersion(output: string) {
  const version = output.match(/\bsing-box version\s+(\S+)/i)?.[1] ?? ''
  const tagsLine = output.match(/^\s*Tags:\s*(.*)$/im)
  const tags = tagsLine ? tagsLine[1]!.split(/[\s,]+/).filter(Boolean) : []
  return {
    version,
    flavor: version ? (/\blx[.-]/i.test(version) ? 'lx' : 'official-or-custom') : 'unknown',
    tags,
    // A missing tag list is unknown, rather than evidence of absence.
    xhttp: tagsLine ? tags.includes('with_xhttp') : null,
    clashApi: tagsLine ? tags.includes('with_clash_api') : null,
  }
}
