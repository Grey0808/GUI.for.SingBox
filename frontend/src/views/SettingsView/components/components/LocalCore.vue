<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useLocalCore } from '@/hooks/useLocalCore'
import { message } from '@/utils'
const { t } = useI18n()
const local = useLocalCore()
const run = async (action: () => unknown | Promise<unknown>) => {
  try {
    await action()
    message.success('common.success')
  } catch (error: any) {
    message.error(error?.message || String(error))
  }
}
</script>
<template>
  <div class="px-8 py-12 text-18 font-bold">{{ t('settings.kernel.localExecutable') }}</div>
  <Card>
    <div class="py-8 break-all">{{ t('settings.kernel.lxActive') }}: {{ local.active.value }}</div>
    <div class="flex gap-8 py-8">
      <Button @click="run(local.pin)">{{
        local.pinned.value ? t('settings.kernel.unpin') : t('settings.kernel.pin')
      }}</Button>
      <Button
        :disabled="!local.canRollback.value || local.busy.value"
        @click="run(local.rollback)"
        >{{ t('settings.kernel.usePrevious') }}</Button
      >
    </div>
    <div class="text-12">{{ t('settings.kernel.localExecutableInfo') }}</div>
    <div class="flex gap-8 py-8">
      <Input v-model="local.path.value" placeholder="C:\path\sing-box.exe" class="flex-1" />
      <Button :disabled="local.busy.value" @click="run(local.inspect)">{{
        t('settings.kernel.validateExecutable')
      }}</Button>
      <Button :loading="local.busy.value" @click="run(local.activate)">{{
        t('settings.kernel.lxUse')
      }}</Button>
    </div>
    <div class="text-12 break-all">{{ local.details.value }}</div>
  </Card>
</template>
