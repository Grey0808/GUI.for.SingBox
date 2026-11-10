import { computed, ref } from 'vue'

import {
  Download,
  Exec,
  FileExists,
  HttpCancel,
  HttpGet,
  MakeDir,
  MoveFile,
  ReadDir,
  RemoveFile,
  UnzipZIPFile,
} from '@/bridge'
import { Branch } from '@/enums/app'
import { useAppSettingsStore, useEnvStore, useKernelApiStore } from '@/stores'
import { parseCoreVersion } from '@/utils/coreCapabilities'
import {
  coreReleaseSources,
  lxCoreDirectory,
  lxCorePath,
  sha256FromSums,
  windowsAmd64AssetName,
} from '@/utils/coreReleases'

type Release = {
  tag_name: string
  draft: boolean
  assets: { name: string; browser_download_url: string; digest?: string | null }[]
}

export function useCoreLx() {
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
  const supported = computed(() => env.env.os === 'windows' && env.env.arch === 'amd64')
  const active = computed(() =>
    settings.app.kernel.branch === Branch.Lx ? settings.app.kernel.lxVersion || '' : '',
  )

  async function refreshInstalled() {
    const root = 'data/sing-box/versions/lx'
    await MakeDir(root)
    const entries = await ReadDir(root)
    const found: string[] = []
    for (const entry of entries) {
      if (!entry.isDir) continue
      try {
        if (await FileExists(lxCorePath(entry.name))) found.push(entry.name)
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
    const { status, body } = await HttpGet<Release[]>(`${coreReleaseSources.lx.api}?per_page=100`)
    if (status < 200 || status >= 300 || !Array.isArray(body))
      throw new Error(`GitHub releases: HTTP ${status}`)
    releases.value = body.filter((release) => {
      try {
        lxCoreDirectory(release.tag_name)
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
    if (busy.value) return
    busy.value = true
    canceled = false
    const stage = `data/.cache/lx-install-${Date.now()}-${Math.random().toString(36).slice(2)}`
    try {
      const release = releases.value.find((item) => item.tag_name === selectedRelease.value)
      if (!release) throw new Error('Select an available release')
      const version = release.tag_name.replace(/^v/, '')
      const target = lxCoreDirectory(version)
      if (await FileExists(target)) throw new Error('This version is already installed')
      const assetName = windowsAmd64AssetName(version)
      const asset = release.assets.find((item) => item.name === assetName)!
      if (
        !asset.browser_download_url.startsWith(
          'https://github.com/Leadaxe/sing-box-lx/releases/download/',
        )
      )
        throw new Error('Unexpected release download URL')
      const digest = asset.digest || ''
      if (digest && !/^sha256:[a-f\d]{64}$/i.test(digest))
        throw new Error('Invalid release SHA-256 digest')
      let sha256 = digest.slice(7).toLowerCase()
      if (!sha256) {
        const sums = release.assets.find((item) => item.name === 'SHA256SUMS')
        if (
          !sums?.browser_download_url.startsWith(
            'https://github.com/Leadaxe/sing-box-lx/releases/download/',
          )
        )
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
      await MakeDir('data/sing-box/versions/lx')
      if (await FileExists(target)) throw new Error('This version was installed concurrently')
      await MoveFile(unpacked, target)
      await refreshInstalled()
      selectedInstalled.value = version
    } finally {
      cancelId.value = ''
      busy.value = false
      progress.value = ''
      await RemoveFile(stage).catch(() => {})
    }
  }

  async function activate() {
    if (kernel.running || kernel.starting || kernel.restarting)
      throw new Error('Stop the core before changing its version')
    const path = lxCorePath(selectedInstalled.value)
    if (!(await FileExists(path))) throw new Error('Selected version is not installed')
    settings.app.kernel.lxVersion = selectedInstalled.value
    settings.app.kernel.branch = Branch.Lx
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
  }
}
