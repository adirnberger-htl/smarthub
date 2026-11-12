<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  modelValue: string
  minTime?: string
  maxTime?: string
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', val: string): void
}>()

const localHours = ref(props.modelValue.split(':')[0] || '00')
const localMinutes = ref((props.modelValue.split(':')[1] || '00').substring(0, 2))

watch(() => props.modelValue, (newVal) => {
  localHours.value = newVal.split(':')[0] || '00'
  localMinutes.value = (newVal.split(':')[1] || '00').substring(0, 2)
})

const localTime = computed(() => {
  const h = String(parseInt(localHours.value) || 0).padStart(2, '0')
  const m = String(parseInt(localMinutes.value) || 0).padStart(2, '0')
  return `${h}:${m}`
})

const isInvalid = computed(() => {
  if (props.minTime && localTime.value < props.minTime) return true
  if (props.maxTime && localTime.value > props.maxTime) return true
  return false
})

const handleBlur = () => {
  if (isInvalid.value) {
    localHours.value = props.modelValue.split(':')[0] || '00'
    localMinutes.value = (props.modelValue.split(':')[1] || '00').substring(0, 2)
  } else {
    localHours.value = String(Math.min(23, Math.max(0, parseInt(localHours.value) || 0))).padStart(2, '0')
    localMinutes.value = String(Math.min(59, Math.max(0, parseInt(localMinutes.value) || 0))).padStart(2, '0')
    if (localTime.value !== props.modelValue) {
      emit('update:modelValue', localTime.value)
    }
  }
}
</script>

<template>
  <div class="time-picker" :class="{ 'is-invalid': isInvalid }">
    <input 
      type="number" 
      v-model="localHours" 
      class="time-input" 
      min="0" 
      max="23" 
      @blur="handleBlur"
    />
    <span class="time-separator">:</span>
    <input 
      type="number" 
      v-model="localMinutes" 
      class="time-input" 
      min="0" 
      max="59" 
      @blur="handleBlur"
    />
  </div>
</template>

<style scoped>
.time-picker {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border-base);
  border-radius: 8px;
  padding: 4px 8px;
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.02);
  transition: border-color 0.2s, box-shadow 0.2s;
}

.time-picker.is-invalid {
  border-color: var(--color-error);
  box-shadow: 0 0 0 1px var(--color-error);
}

.time-input {
  border: none;
  background: transparent;
  padding: 4px;
  font-size: 1rem;
  font-family: inherit;
  font-weight: 500;
  color: var(--text-primary);
  width: 36px;
  text-align: center;
  -moz-appearance: textfield;
  transition: all 0.2s;
}

.time-input:focus {
  outline: none;
  background: var(--bg-surface-hover);
  border-radius: 6px;
}

.time-input::-webkit-outer-spin-button,
.time-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.time-separator {
  font-weight: 700;
  color: var(--text-light);
}
</style>
