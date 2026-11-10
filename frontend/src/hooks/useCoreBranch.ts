import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  Download,
  HttpCancel,
  UnzipZIPFile,
  UnzipTarGZFile,
  HttpGet,
  Exec,
  MoveFile,
  RemoveFile,
  AbsolutePath,
  BrowserOpenURL,
  MakeDir,
  FileExists,
  OpenDir,
} from '@/bridge'
import { CoreWorkingDirectory } from '@/constant/kernel'
import { Branch, OS } from '@/enums/app'
import { parseCoreVersion } from '@/utils/coreCapabilities'
import { coreReleaseSources } from '@/utils/coreReleases'
import { useAppSettingsStore, useEnvStore, useKernelApiStore } from '@/stores'
import {
  getGitHubApiAuthorization,
  GrantTUNPermission,
  PreserveCorePermissions,
  ignoredError,
  confirm,
  message,
  debounce,
  getKernelFileName,
  getKernelAssetFileName,
} from '@/utils'

const StableUrl = `${coreReleaseSources.official.api}/latest`
const AlphaUrl = `${coreReleaseSources.official.api}?per_page=3`

const StablePage = `${coreReleaseSources.official.page}/latest`
const AlphaPage = coreReleaseSources.official.page

export const useCoreBranch = (isAlpha = false) => {
  const releaseUrl = isAlpha ? AlphaUrl : StableUrl

  const localVersion = ref('')
  const remoteVersion = ref('')
  const versionDetail = ref('')
  const capabilities = computed(() => parseCoreVersion(versionDetail.value))

  const localVersionLoading = ref(false)
  const remoteVersionLoading = ref(false)
  const downloading = ref(false)
  const downloadCompleted = ref(false)
  const downloadProgress = ref('')
  const cancelDownload = ref<() => void>()

  const rollbackable = ref(false)

  const { t } = useI18n()
  const envStore = useEnvStore()
  const appSettings = useAppSettingsStore()
  const kernelApiStore = useKernelApiStore()

  const restartable = computed(() => {
    const { branch } = appSettings.app.kernel
    if (!kernelApiStore.running) return false
    return localVersion.value && downloadCompleted.value && branch === (isAlpha ? Branch.Alpha : Branch.Main)
  })

  const updatable = computed(
    () => remoteVersion.value && localVersion.value !== remoteVersion.value,
  )

  const grantable = computed(() => localVersion.value && envStore.env.os !== OS.Windows)

  const CoreFilePath = `${CoreWorkingDirectory}/${getKernelFileName(isAlpha)}`
  const CoreBakFilePath = `${CoreFilePath}.bak`

  const downloadCore = async () => {
    downloading.value = true
    downloadProgress.value = ''
    cancelDownload.value = undefined
    try {
      const { body } = await HttpGet<Record<string, any>>(releaseUrl, {
        Authorization: getGitHubApiAuthorization(),
      })
      if (body.message) throw body.message

      const release = isAlpha ? body.find((v: any) => v.prerelease === true) : body
      if (!release) throw 'Not Found'
      const { assets, tag_name } = release
      const assetName = getKernelAssetFileName(tag_name.replace('v', ''))
      const asset = assets.find((v: any) => v.name === assetName)
      if (!asset) throw 'Asset Not Found:' + assetName
      const digest = typeof asset.digest === 'string' ? asset.digest : ''
      if (digest && !/^sha256:[a-f\d]{64}$/i.test(digest)) {
        throw new Error('Unsupported or invalid release digest')
      }
      if (!digest) message.warn('Release does not provide a SHA-256 digest; download is not checksum verified')
      if (asset.uploader.login !== 'github-actions[bot]') {
        await confirm('common.warning', 'settings.kernel.risk', {
          type: 'text',
          okText: 'settings.kernel.stillDownload',
        })
      }

      const downloadCacheFile = `data/.cache/${assetName}`

      cancelDownload.value = () => {
        HttpCancel(downloadCacheFile)
        cancelDownload.value = undefined
      }

      await MakeDir(CoreWorkingDirectory)

      await Download(
        asset.browser_download_url,
        downloadCacheFile,
        undefined,
        (progress, total) => {
          const txt = t('common.downloading') + ((progress / total) * 100).toFixed(2) + '%'
          downloadProgress.value = txt
        },
        {
          CancelId: downloadCacheFile,
          Sha256: digest.slice(7).toLowerCase(),
        },
      )

      const stableFileName = getKernelFileName()

      let tmpPath: string
      if (assetName.endsWith('.zip')) {
        tmpPath = `data/.cache/${assetName.replace('.zip', '')}`
        await RemoveFile(tmpPath)
        await UnzipZIPFile(downloadCacheFile, 'data/.cache')
      } else if (assetName.endsWith('.tar.gz')) {
        tmpPath = `data/.cache/${assetName.replace('.tar.gz', '')}`
        await RemoveFile(tmpPath)
        await UnzipTarGZFile(downloadCacheFile, 'data/.cache')
      } else {
        throw new Error('Unsupported core archive format')
      }

      const candidate = `${tmpPath}/${stableFileName}`
      if (!(await FileExists(candidate))) throw new Error('Core executable missing from archive')
      if (!candidate.endsWith('.exe')) await Exec('chmod', ['+x', await AbsolutePath(candidate)])
      await Exec(candidate, ['version'])

      if (kernelApiStore.running && appSettings.app.kernel.branch === (isAlpha ? Branch.Alpha : Branch.Main)) {
        throw new Error('Stop the running core before installing this version')
      }

      const hadCore = await FileExists(CoreFilePath)
      if (hadCore) await MoveFile(CoreFilePath, CoreBakFilePath)
      try {
        await MoveFile(candidate, CoreFilePath)
      } catch (error) {
        if (hadCore) {
          try {
            await MoveFile(CoreBakFilePath, CoreFilePath)
          } catch (restoreError) {
            throw new Error(`Core installation failed: ${error}; restore failed: ${restoreError}. Backup: ${CoreBakFilePath}`)
          }
        }
        throw error
      }

      await RemoveFile(tmpPath)
      await RemoveFile(downloadCacheFile)

      if (!CoreFilePath.endsWith('.exe')) {
        await ignoredError(Exec, 'chmod', ['+x', await AbsolutePath(CoreFilePath)])
        await PreserveCorePermissions(CoreBakFilePath, CoreFilePath)
      }

      refreshLocalVersion()
      downloadCompleted.value = true
      message.success('common.success')
    } catch (error: any) {
      console.log(error)
      message.error(error.message || error)
      downloadCompleted.value = false
    } finally {
      cancelDownload.value = undefined
      downloading.value = false
    }
  }

  const getLocalVersion = async (showTips = false) => {
    localVersionLoading.value = true
    try {
      const res = await Exec(CoreFilePath, ['version'])
      versionDetail.value = res.trim()
      return parseCoreVersion(res).version
    } catch (error: any) {
      versionDetail.value = ''
      console.log(error)
      showTips && message.error(error)
    } finally {
      localVersionLoading.value = false
    }
    return ''
  }

  const getRemoteVersion = async (showTips = false) => {
    remoteVersionLoading.value = true
    try {
      const { body } = await HttpGet<Record<string, any>>(releaseUrl, {
        Authorization: getGitHubApiAuthorization(),
      })
      const release = isAlpha ? body.find((v: any) => v.prerelease === true) : body
      if (!release) throw 'Not Found'
      const { tag_name } = release
      return tag_name.replace('v', '') as string
    } catch (error: any) {
      console.log(error)
      showTips && message.error(error)
    } finally {
      remoteVersionLoading.value = false
    }
    return ''
  }

  const restartCore = async () => {
    if (!kernelApiStore.running) return
    try {
      await kernelApiStore.restartCore()
      downloadCompleted.value = false
    } catch (error: any) {
      message.error(error)
    }
  }

  const refreshLocalVersion = async (showTips = false) => {
    localVersion.value = await getLocalVersion(showTips)
  }

  const refreshRemoteVersion = async (showTips = false) => {
    remoteVersion.value = await getRemoteVersion(showTips)
  }

  const grantCorePermission = async () => {
    await GrantTUNPermission(CoreFilePath)
    message.success('common.success')
  }

  const rollbackCore = async () => {
    await confirm('common.warning', 'settings.kernel.rollback')

    const doRollback = () => MoveFile(CoreBakFilePath, CoreFilePath)

    const { branch } = appSettings.app.kernel
    const isCurrentRunning = kernelApiStore.running && branch === (isAlpha ? Branch.Alpha : Branch.Main)
    if (isCurrentRunning) {
      await kernelApiStore.restartCore(doRollback)
    } else {
      await doRollback()
    }
    refreshLocalVersion()
    message.success('common.success')
  }

  const openReleasePage = () => {
    BrowserOpenURL(isAlpha ? AlphaPage : StablePage)
  }

  const openFileLocation = async () => {
    await OpenDir(CoreWorkingDirectory)
  }

  watch(
    () => appSettings.app.kernel.branch,
    () => (downloadCompleted.value = false),
  )

  watch(
    [localVersion, downloadCompleted],
    debounce(async () => {
      rollbackable.value = await FileExists(CoreBakFilePath)
    }, 500),
  )

  refreshLocalVersion()
  refreshRemoteVersion()

  return {
    restartable,
    updatable,
    grantable,
    rollbackable,
    versionDetail,
    capabilities,
    localVersion,
    localVersionLoading,
    remoteVersion,
    remoteVersionLoading,
    downloading,
    downloadProgress,
    refreshLocalVersion,
    refreshRemoteVersion,
    downloadCore,
    cancelDownload,
    restartCore,
    rollbackCore,
    grantCorePermission,
    openReleasePage,
    openFileLocation,
  }
}
