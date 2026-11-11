export type Selection = {
  branch: 'main' | 'alpha' | 'lx' | 'official' | 'custom'
  lxVersion?: string
  officialVersion?: string
  customPath?: string
}
export type KernelSelection = Selection & {
  previousKernelSelection?: Selection
  pinnedCores?: string[]
}
const mutations = new Set<string>()
export function coreIdentity(selection: Selection): string {
  if (selection.branch === 'lx') return `lx:${selection.lxVersion || ''}`
  if (selection.branch === 'official') return `official:${selection.officialVersion || ''}`
  if (selection.branch === 'custom')
    return `custom:${(selection.customPath || '').replaceAll('\\', '/').toLowerCase()}`
  return selection.branch
}
export function isCorePinned(kernel: KernelSelection, selection: Selection = kernel) {
  return !!kernel.pinnedCores?.includes(coreIdentity(selection))
}
export function setCorePinned(kernel: KernelSelection, selection: Selection, pin: boolean) {
  const id = coreIdentity(selection)
  if (mutations.size) throw Error('Core operation is in progress')
  kernel.pinnedCores = pin
    ? [...new Set([...(kernel.pinnedCores || []), id])]
    : (kernel.pinnedCores || []).filter((value) => value !== id)
}
export function beginCoreMutation(selection: Selection) {
  const id = coreIdentity(selection)
  if (mutations.has(id)) throw Error('Core operation is already in progress')
  mutations.add(id)
  return () => mutations.delete(id)
}
export function assertCoreAvailable(selection: Selection) {
  // Also prevents a custom path alias being selected while a managed file is removed.
  if (mutations.size) throw Error(`Core operation is in progress: ${coreIdentity(selection)}`)
}

export function selectCore(kernel: KernelSelection, selection: Selection) {
  assertCoreAvailable(selection)
  if (isCorePinned(kernel) && coreIdentity(kernel) !== coreIdentity(selection))
    throw Error('Unpin the selected core before switching')
  if (kernel.branch !== selection.branch || coreIdentity(kernel) !== coreIdentity(selection)) {
    kernel.previousKernelSelection ??= {
      branch: kernel.branch,
      lxVersion: kernel.lxVersion,
      officialVersion: kernel.officialVersion,
      customPath: kernel.customPath,
    }
  }
  if (selection.branch === 'lx') kernel.lxVersion = selection.lxVersion
  if (selection.branch === 'official') kernel.officialVersion = selection.officialVersion
  if (selection.branch === 'custom') kernel.customPath = selection.customPath
  kernel.branch = selection.branch
}

export function selectLX(kernel: KernelSelection, version: string) {
  selectCore(kernel, { branch: 'lx', lxVersion: version })
}

export function restorePreviousCore(kernel: KernelSelection): boolean {
  const previous = kernel.previousKernelSelection
  if (!previous) return false
  kernel.branch = previous.branch
  kernel.lxVersion = previous.lxVersion
  kernel.officialVersion = previous.officialVersion
  kernel.customPath = previous.customPath
  delete kernel.previousKernelSelection
  return true
}
