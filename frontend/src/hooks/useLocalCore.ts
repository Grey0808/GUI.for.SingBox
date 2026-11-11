import { computed, ref } from 'vue'

import { AbsolutePath, Exec, FileExists, FileSHA256 } from '@/bridge'
import { useAppSettingsStore, useEnvStore, useKernelApiStore } from '@/stores'
import { parseCoreVersion } from '@/utils/coreCapabilities'
import { selectedCorePath, validateCustomCorePath } from '@/utils/coreReleases'
import { coreIdentity, isCorePinned, selectCore, setCorePinned } from '@/utils/coreSelection'

export function useLocalCore() {
  const settings = useAppSettingsStore()
  const kernel = useKernelApiStore()
  const env = useEnvStore()
  const path = ref(settings.app.kernel.customPath || '')
  const details = ref('')
  const busy = ref(false)
  const active = computed(() => coreIdentity(settings.app.kernel))
  const pinned = computed(() => isCorePinned(settings.app.kernel))
  const canRollback = computed(
    () =>
      !!(settings.app.kernel.previousKernelSelection || settings.app.kernel.lastWorkingSelection),
  )
  const stopped = () => {
    if (kernel.running || kernel.starting || kernel.stopping || kernel.restarting)
      throw Error('Stop the core before changing its executable')
  }
  async function inspect() {
    if (env.env.os !== 'windows' || env.env.arch !== 'amd64')
      throw Error('Custom core selection requires Windows AMD64')
    const chosen = await AbsolutePath(validateCustomCorePath(path.value))
    if (!(await FileExists(chosen))) throw Error('Custom core file does not exist')
    const hash = await FileSHA256(chosen)
    const report = await Exec(chosen, ['version'])
    const parsed = parseCoreVersion(report)
    if (!parsed.version) throw Error('The executable did not report a sing-box version')
    const help = await Exec(chosen, ['check', '--help'])
    if (!/sing-box\s+check\b/i.test(help))
      throw Error('Custom core does not report the check command')
    if (hash !== (await FileSHA256(chosen)))
      throw Error('Custom executable changed during validation')
    details.value = report
    return chosen
  }
  async function activate() {
    if (busy.value) return
    stopped()
    busy.value = true
    try {
      const chosen = await inspect()
      stopped()
      selectCore(settings.app.kernel, { branch: 'custom', customPath: chosen })
    } finally {
      busy.value = false
    }
  }
  function pin() {
    setCorePinned(settings.app.kernel, settings.app.kernel, !pinned.value)
  }
  async function rollback() {
    if (busy.value) return
    stopped()
    const previous =
      settings.app.kernel.previousKernelSelection || settings.app.kernel.lastWorkingSelection
    if (!previous) throw Error('No previous core selection is saved')
    busy.value = true
    try {
      const executable = selectedCorePath(previous, env.env.os)
      if (!(await FileExists(executable))) throw Error('Previous executable is no longer installed')
      if (!parseCoreVersion(await Exec(executable, ['version'])).version)
        throw Error('Previous executable could not be verified')
      stopped()
      selectCore(settings.app.kernel, previous)
      // Pending changes that have not started yet can simply return to their known selection.
      if (
        coreIdentity(previous) ===
        coreIdentity(settings.app.kernel.previousKernelSelection || settings.app.kernel)
      )
        delete settings.app.kernel.previousKernelSelection
    } finally {
      busy.value = false
    }
  }
  return { path, details, busy, active, pinned, canRollback, inspect, activate, pin, rollback }
}
