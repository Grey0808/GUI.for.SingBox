<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { useCoreLx } from '@/hooks/useCoreLx'
import { message } from '@/utils'

const { t } = useI18n()
const lx = useCoreLx()
const releaseOptions = computed(() =>
  lx.releases.value.map((item) => ({ label: item.tag_name, value: item.tag_name })),
)
const installedOptions = computed(() =>
  lx.installed.value.map((item) => ({ label: item, value: item })),
)
const run = async (action: () => Promise<void>, showSuccess = false) => {
  try {
    await action()
    if (showSuccess) message.success('common.success')
  } catch (error: any) {
    message.error(error?.message || String(error))
  }
}
onMounted(() => {
  if (lx.supported.value) {
    run(lx.refreshInstalled)
    run(lx.refreshReleases)
  }
})
</script>

<template>
  <div class="px-8 py-12 text-18 font-bold">sing-box-lx</div>
  <Card>
    <div v-if="!lx.supported.value" class="py-8">{{ t('settings.kernel.lxWindowsOnly') }}</div>
    <template v-else>
      <div class="flex items-center gap-8 py-8">
        <span>{{ t('settings.kernel.lxAvailable') }}</span>
        <Select v-model="lx.selectedRelease.value" :options="releaseOptions" />
        <Button
          :loading="lx.busy.value"
          :disabled="!lx.selectedRelease.value || lx.busy.value"
          @click="run(lx.install, true)"
        >
          {{ lx.progress.value || t('settings.kernel.lxInstall') }}
        </Button>
        <Button v-if="lx.cancelId.value" @click="lx.cancel">{{ t('common.cancel') }}</Button>
        <Button :disabled="lx.busy.value" @click="run(lx.refreshReleases)">{{
          t('settings.kernel.lxRefresh')
        }}</Button>
      </div>
      <div class="flex items-center gap-8 py-8">
        <span>{{ t('settings.kernel.lxInstalled') }}</span>
        <Select v-model="lx.selectedInstalled.value" :options="installedOptions" />
        <Button
          :disabled="!lx.selectedInstalled.value || lx.busy.value"
          @click="run(lx.activate, true)"
          >{{ t('settings.kernel.lxUse') }}</Button
        >
        <span v-if="lx.active.value"
          >{{ t('settings.kernel.lxActive') }}: {{ lx.active.value }}</span
        >
      </div>
    </template>
  </Card>
</template>
