import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

import { Exec, FileSHA256, ReadFile } from '@/bridge'
import { useAppSettingsStore, useSubscribesStore, useEnvStore } from '@/stores'
import { parseCoreVersion } from '@/utils/coreCapabilities'
import { lxCorePath } from '@/utils/coreReleases'
import { eventBus } from '@/utils/eventBus'
import { xhttpUnavailableReason, type CoreFacts } from '@/utils/xhttpCompatibility'

export const useCoreCapabilitiesStore = defineStore('core-capabilities', () => {
  const settings = useAppSettingsStore()
  const subscriptions = useSubscribesStore()
  const env = useEnvStore()
  const facts = ref<CoreFacts>()
  const nodes = ref<Record<string, Record<string, any>>>({})
  const nodesLoaded = ref(false)
  let sequence = 0
  const selectedPath = () =>
    settings.app.kernel.branch === 'lx'
      ? lxCorePath(settings.app.kernel.lxVersion || '')
      : `data/sing-box/sing-box${settings.app.kernel.branch === 'alpha' ? '-latest' : ''}${env.env.os === 'windows' ? '.exe' : ''}`
  async function refresh() {
    const token = ++sequence
    facts.value = undefined
    try {
      const path = selectedPath()
      const sha256 = await FileSHA256(path)
      const details = parseCoreVersion(await Exec(path, ['version']))
      if (sha256 !== (await FileSHA256(path)))
        throw Error('Core changed during capability detection')
      if (token === sequence && selectedPath() === path) facts.value = { ...details, sha256 }
    } catch {
      /* Unknown capability remains unavailable. */
    }
    return facts.value
  }
  async function loadNodes() {
    const result: typeof nodes.value = {}
    for (const sub of subscriptions.subscribes) {
      try {
        const proxies = JSON.parse(await ReadFile(sub.path))
        for (const proxy of proxies) result[`${sub.id}/${proxy.tag}`] = proxy
      } catch {
        /* Generation separately reports unreadable subscriptions. */
      }
    }
    nodes.value = result
    nodesLoaded.value = true
  }
  const reason = (subID: string, tag: string) => {
    const node = nodes.value[`${subID}/${tag}`]
    if (!node && subscriptions.subscribes.some((s) => s.id === subID))
      return 'Compatibility metadata is not available yet'
    return xhttpUnavailableReason(node || {}, facts.value)
  }
  const reasonByTag = (tag: string) => {
    if (!nodesLoaded.value) return 'Compatibility metadata is not available yet'
    const matching = subscriptions.subscribes.filter((s) => s.proxies?.some((p) => p.tag === tag))
    if (matching.some((s) => !nodes.value[`${s.id}/${tag}`]))
      return 'Compatibility metadata could not be read'
    return (
      Object.values(nodes.value)
        .filter((p) => p.tag === tag)
        .map((p) => xhttpUnavailableReason(p, facts.value))
        .find(Boolean) || ''
    )
  }
  watch(() => [settings.app.kernel.branch, settings.app.kernel.lxVersion, env.env.os], refresh, {
    immediate: true,
  })
  watch(
    () => subscriptions.subscribes.map((s) => `${s.id}:${s.updateTime}:${s.path}`).join('|'),
    loadNodes,
    { immediate: true },
  )
  eventBus.on('subscriptionChange', loadNodes)
  eventBus.on('subscriptionsChange', loadNodes)
  return { facts, refresh, loadNodes, reason, reasonByTag }
})
