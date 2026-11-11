<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { useProfilesStore } from '@/stores'
import { modal } from '@/utils'

import ModeManager from './ModeManager.vue'
const { t } = useI18n()
const profiles = useProfilesStore()
const open = () => {
  if (profiles.currentProfile)
    modal({ title: 'customModes.manage', width: '75', submit: false, cancelText: 'common.close' })
      .setContent(ModeManager, { profile: profiles.currentProfile })
      .open()
}
</script>
<template>
  <Button :disabled="!profiles.currentProfile" type="text" size="small" @click="open">{{
    t('customModes.manage')
  }}</Button>
</template>
