import { computed, ref } from 'vue'

import {
  Download,
  Exec,
  FileExists,
  HttpCancel,
  HttpGet,
  MakeDir,
  MoveFile,
  PathsReferToSameFile,
  ReadDir,
  RemoveFile,
  UnzipZIPFile,
} from '@/bridge'
import { useAppSettingsStore, useEnvStore, useKernelApiStore } from '@/stores'
import { parseCoreVersion } from '@/utils/coreCapabilities'
import {
  coreReleaseSources,
  coreVersionDirectory,
  managedCorePath,
  sha256FromSums,
  windowsAmd64AssetName,
  type CoreFlavor,
} from '@/utils/coreReleases'
import {
  selectCore,
  coreIdentity,
  isCorePinned,
  setCorePinned,
  beginCoreMutation,
  type Selection,
} from '@/utils/coreSelection'

type Release = {
  tag_name: string
  draft: boolean
  assets: { name: string; browser_download_url: string; digest?: string | null }[]
}

export function useCoreLx(flavor: CoreFlavor = 'lx') {
  const settings = useAppSettingsStore()
  const kernel = useKernelApiStore()
  const env = useEnvStore()
  const releases = ref<Release[]>([])
  const installed = ref<string[]>([])
  const selectedRelease = ref('')
  const selectedInstalled = ref('')
  const busy = ref(false)
  const progress = ref('')
  const cancelId = ref('')
  let canceled = false
  const root = `data/sing-box/versions/${flavor}`
  const directory = (version: string) => coreVersionDirectory(flavor, version)
  const pathFor = (version: string) => managedCorePath(flavor, version)
  const selection = (version: string): Selection =>
    flavor === 'lx'
      ? { branch: 'lx', lxVersion: version }
      : { branch: 'official', officialVersion: version }
  const supported = computed(() => env.env.os === 'windows' && env.env.arch === 'amd64')
  const active = computed(() =>
    settings.app.kernel.branch === flavor
      ? (flavor === 'lx' ? settings.app.kernel.lxVersion : settings.app.kernel.officialVersion) ||
        ''
      : '',
  )

  async function refreshInstalled() {
    await MakeDir(root)
    const entries = await ReadDir(root)
    const found: string[] = []
    for (const entry of entries) {
      if (!entry.isDir) continue
      try {
        if (await FileExists(pathFor(entry.name))) found.push(entry.name)
      } catch {
        /* Ignore unknown directories. */
      }
    }
    installed.value = found.sort().reverse()
    if (!installed.value.includes(selectedInstalled.value))
      selectedInstalled.value = installed.value.includes(active.value)
        ? active.value
        : found[0] || ''
  }

  async function refreshReleases() {
    const { status, body } = await HttpGet<Release[]>(
      `${coreReleaseSources[flavor].api}?per_page=100`,
    )
    if (status < 200 || status >= 300 || !Array.isArray(body))
      throw new Error(`GitHub releases: HTTP ${status}`)
    releases.value = body.filter((release) => {
      try {
        directory(release.tag_name)
        return (
          !release.draft &&
          release.assets.some((asset) => asset.name === windowsAmd64AssetName(release.tag_name))
        )
      } catch {
        return false
      }
    })
    if (!releases.value.some((release) => release.tag_name === selectedRelease.value)) {
      selectedRelease.value = releases.value[0]?.tag_name || ''
    }
  }

  async function install() {
    if (!supported.value) throw new Error('Managed installation requires Windows AMD64')
    if (busy.value) return
    busy.value = true
    canceled = false
    let releaseMutation: (() => void) | undefined
    const stage = `data/.cache/${flavor}-install-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      const release = releases.value.find((item) => item.tag_name === selectedRelease.value)
      if (!release) throw new Error('Select an available release')
      const version = release.tag_name.replace(/^v/, '')
      const target = directory(version)
      releaseMutation = beginCoreMutation(selection(version))
      if (await FileExists(target)) throw new Error('This version is already installed')
      const assetName = windowsAmd64AssetName(version)
      const asset = release.assets.find((item) => item.name === assetName)!
      if (!asset.browser_download_url.startsWith(`${coreReleaseSources[flavor].page}/download/`))
        throw new Error('Unexpected release download URL')
      const digest = asset.digest || ''
      if (digest && !/^sha256:[a-f\d]{64}$/i.test(digest))
        throw new Error('Invalid release SHA-256 digest')
      let sha256 = digest.slice(7).toLowerCase()
      if (!sha256) {
        const sums = release.assets.find((item) => item.name === 'SHA256SUMS')
        if (!sums?.browser_download_url.startsWith(`${coreReleaseSources[flavor].page}/download/`))
          throw new Error('Release has no published checksum')
        const response = await HttpGet<string>(sums.browser_download_url)
        if (response.status < 200 || response.status >= 300 || typeof response.body !== 'string')
          throw new Error('Failed to retrieve release checksums')
        sha256 = sha256FromSums(response.body, assetName)
      }
      const archive = `${stage}/release.zip`
      const unpacked = `${stage}/${assetName.slice(0, -4)}`
      cancelId.value = archive
      await MakeDir(stage)
      await Download(
        asset.browser_download_url,
        archive,
        undefined,
        (done, total) => {
          progress.value = total > 0 ? `${Math.round((done * 100) / total)}%` : `${done} bytes`
        },
        { CancelId: archive, Sha256: sha256 },
      )
      if (canceled) throw new Error('Installation canceled')
      cancelId.value = ''
      await UnzipZIPFile(archive, stage)
      const executable = `${unpacked}/sing-box.exe`
      if (!(await FileExists(executable)))
        throw new Error('Release archive does not contain sing-box.exe')
      const details = parseCoreVersion(await Exec(executable, ['version']))
      if (details.version.replace(/^v/, '') !== version)
        throw new Error('Downloaded executable version does not match release')
      await MakeDir(root)
      if (await FileExists(target)) throw new Error('This version was installed concurrently')
      await MoveFile(unpacked, target)
      await refreshInstalled()
      selectedInstalled.value = version
    } finally {
      cancelId.value = ''
      busy.value = false
      progress.value = ''
      await RemoveFile(stage).catch(() => {})
      releaseMutation?.()
    }
  }

  async function activate() {
    if (!supported.value) throw new Error('Managed selection requires Windows AMD64')
    if (kernel.running || kernel.starting || kernel.stopping || kernel.restarting)
      throw new Error('Stop the core before changing its version')
    const path = pathFor(selectedInstalled.value)
    if (!(await FileExists(path))) throw new Error('Selected version is not installed')
    if (kernel.running || kernel.starting || kernel.stopping || kernel.restarting)
      throw new Error('Core state changed while selecting a version')
    selectCore(settings.app.kernel, selection(selectedInstalled.value))
  }

  const pinned = computed(
    () =>
      !!selectedInstalled.value &&
      isCorePinned(settings.app.kernel, selection(selectedInstalled.value)),
  )
  function pin() {
    if (!installed.value.includes(selectedInstalled.value))
      throw Error('Select an installed version')
    setCorePinned(settings.app.kernel, selection(selectedInstalled.value), !pinned.value)
  }
  async function remove() {
    if (busy.value) throw Error('Core operation is in progress')
    const version = selectedInstalled.value
    const target = directory(version)
    const chosen = selection(version)
    const allowed = () => {
      if (kernel.running || kernel.starting || kernel.stopping || kernel.restarting)
        throw Error('Stop the core before deleting a managed version')
      if (
        coreIdentity(settings.app.kernel) === coreIdentity(chosen) ||
        (settings.app.kernel.previousKernelSelection &&
          coreIdentity(settings.app.kernel.previousKernelSelection) === coreIdentity(chosen))
      )
        throw Error('Selected and rollback versions cannot be deleted')
      if (
        settings.app.kernel.lastWorkingSelection &&
        coreIdentity(settings.app.kernel.lastWorkingSelection) === coreIdentity(chosen)
      )
        throw Error('Rollback version cannot be deleted')
      if (isCorePinned(settings.app.kernel, chosen))
        throw Error('Unpin this version before deleting')
    }
    allowed()
    const release = beginCoreMutation(chosen)
    busy.value = true
    try {
      if (!(await FileExists(target))) throw Error('Version is not installed')
      const selections = [
        settings.app.kernel,
        settings.app.kernel.previousKernelSelection,
        settings.app.kernel.lastWorkingSelection,
      ]
      const customPaths = selections.flatMap((item) =>
        item?.branch === 'custom' && item.customPath ? [item.customPath] : [],
      )
      customPaths.push(
        ...(settings.app.kernel.pinnedCores || [])
          .filter((id) => id.startsWith('custom:'))
          .map((id) => id.slice(7)),
      )
      for (const path of new Set(customPaths)) {
        if ((await FileExists(path)) && (await PathsReferToSameFile(path, pathFor(version))))
          throw Error('Custom selected, pinned or rollback executable refers to this version')
      }
      allowed()
      await RemoveFile(target)
      await refreshInstalled()
    } finally {
      release()
      busy.value = false
    }
  }

  function cancel() {
    if (cancelId.value) {
      canceled = true
      HttpCancel(cancelId.value)
    }
  }

  return {
    releases,
    installed,
    selectedRelease,
    selectedInstalled,
    busy,
    progress,
    cancelId,
    supported,
    active,
    refreshInstalled,
    refreshReleases,
    install,
    activate,
    cancel,
    pinned,
    pin,
    remove,
  }
}
