type Selection = { branch: 'main' | 'alpha' | 'lx'; lxVersion?: string }
type KernelSelection = Selection & { previousKernelSelection?: Selection }

export function selectCore(kernel: KernelSelection, selection: Selection) {
  if (
    kernel.branch !== selection.branch ||
    (selection.branch === 'lx' && kernel.lxVersion !== selection.lxVersion)
  ) {
    kernel.previousKernelSelection ??= { branch: kernel.branch, lxVersion: kernel.lxVersion }
  }
  if (selection.branch === 'lx') kernel.lxVersion = selection.lxVersion
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
  delete kernel.previousKernelSelection
  return true
}
