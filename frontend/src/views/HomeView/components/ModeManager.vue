<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useProfilesStore, useKernelApiStore } from '@/stores'
import { sampleID, message } from '@/utils'
import { modeKey, validateModes } from '@/utils/customModes'

const props = defineProps<{ profile: App.Profile }>()
const { t } = useI18n()
const profiles = useProfilesStore()
const kernel = useKernelApiStore()
const draft = ref(
  (props.profile.customModes || []).map((mode) => ({
    ...mode,
    text: JSON.stringify(mode.rules, null, 2),
  })),
)
const savedSelection = props.profile.selectedMode || 'Rule'
const selected = ref(
  ['Rule', 'Global', 'Direct'].find(
    (mode) => mode.toLowerCase() === savedSelection.toLowerCase(),
  ) || savedSelection,
)
const targets = computed(() => props.profile.outbounds.map((p) => ({ label: p.tag, value: p.id })))
const choices = computed(() => [
  { label: 'Rule', value: 'Rule' },
  { label: 'Global', value: 'Global' },
  { label: 'Direct', value: 'Direct' },
  ...draft.value.map((m) => ({ label: m.name, value: modeKey(m) })),
])
const submit = inject('submit') as () => void
const saving = ref(false)
const move = (index: number, offset: number) => {
  const next = index + offset
  if (next >= 0 && next < draft.value.length)
    [draft.value[index], draft.value[next]] = [draft.value[next]!, draft.value[index]!]
}
const save = async () => {
  if (saving.value) return
  const target = profiles.getProfileById(props.profile.id)
  if (!target) {
    message.error('Profile was removed')
    return
  }
  const before = target.customModes
  const previous = target.selectedMode
  let changed = false
  saving.value = true
  try {
    const modes = draft.value.map(({ text, ...mode }) => ({
      ...mode,
      name: mode.name.trim(),
      rules: JSON.parse(text),
    }))
    validateModes(modes)
    if (modes.some((m) => !target.outbounds.some((p) => p.id === m.outbound)))
      throw Error('Mode target outbound is missing')
    changed = true
    target.customModes = modes
    target.selectedMode = choices.value.some((c) => c.value === selected.value)
      ? selected.value
      : 'Rule'
    await profiles.saveProfiles()
    if (
      kernel.running &&
      profiles.currentProfile?.id === target.id &&
      kernel.config.mode.startsWith('Custom_') &&
      !modes.some((m) => modeKey(m).toLowerCase() === kernel.config.mode.toLowerCase())
    )
      await kernel.updateConfig('mode', 'Rule')
    submit()
  } catch (error: any) {
    if (changed) {
      target.customModes = before
      target.selectedMode = previous
      await profiles.saveProfiles().catch(() => {})
    }
    message.error(error?.message || String(error))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <ModalContainer>
    <template #body>
      <div class="flex flex-col gap-8">
        <div class="text-12">{{ t('customModes.pending') }}</div>
        <Button
          @click="
            draft.push({
              id: sampleID(),
              name: '',
              icon: '⚙',
              outbound: targets[0]?.value || '',
              rules: [],
              text: '[]',
            })
          "
          >{{ t('common.add') }}</Button
        >
        <Card v-for="(mode, index) in draft" :key="mode.id">
          <div class="flex gap-8 items-center">
            <Input v-model="mode.name" :placeholder="t('customModes.name')" />
            <Input v-model="mode.icon" :placeholder="t('customModes.icon')" />
            <Button :disabled="index === 0" @click="move(index, -1)">↑</Button>
            <Button :disabled="index === draft.length - 1" @click="move(index, 1)">↓</Button>
            <Button @click="draft.splice(index, 1)">{{ t('common.delete') }}</Button>
          </div>
          <div class="py-8">
            {{ t('customModes.target') }} <Select v-model="mode.outbound" :options="targets" />
          </div>
          <div class="text-12">{{ t('customModes.rules') }}</div>
          <CodeEditor v-model="mode.text" lang="json" editable />
        </Card>
        <div>{{ t('customModes.nextStart') }} <Select v-model="selected" :options="choices" /></div>
        <Button type="primary" :loading="saving" @click="save">{{ t('common.save') }}</Button>
      </div>
    </template>
  </ModalContainer>
</template>
