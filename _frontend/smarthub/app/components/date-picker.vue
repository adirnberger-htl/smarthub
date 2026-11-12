<template>
  <div class="datepicker">
    <div class="dp-header">
      <button @click="prevMonth" aria-label="Previous month">‹</button>
      <div class="dp-month">{{ monthYearLabel }}</div>
      <button @click="nextMonth" aria-label="Next month">›</button>
    </div>

    <div class="dp-grid">
      <div class="dp-weekday" v-for="d in weekdays" :key="d">{{ d }}</div>

      <div v-for="cell in cells" :key="cell.key" :class="['dp-cell', { 'dp-empty': !cell.date, 'dp-selected': cell.date===modelValue }]" @click="onClick(cell.date)">
        <span v-if="cell.date">{{ new Date(cell.date).getDate() }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, toRaw } from 'vue'

const props = defineProps({
  modelValue: { type: String, default: '' }
})
const emit = defineEmits(['update:modelValue'])

const today = new Date()
const activeYear = ref(today.getFullYear())
const activeMonth = ref(today.getMonth()) // 0-based

// initialize from modelValue if present
watch(() => props.modelValue, (v) => {
  if (v) {
    const d = new Date(v)
    if (!isNaN(d.getTime())) {
      activeYear.value = d.getFullYear()
      activeMonth.value = d.getMonth()
    }
  }
}, { immediate: true })

const weekdays = ['Mo','Tu','We','Th','Fr','Sa','Su']

const monthYearLabel = computed(() => {
  const d = new Date(activeYear.value, activeMonth.value, 1)
  return d.toLocaleString(undefined, { month: 'long', year: 'numeric' })
})

function prevMonth() { if (activeMonth.value === 0) { activeMonth.value = 11; activeYear.value -= 1 } else { activeMonth.value -= 1 } }
function nextMonth() { if (activeMonth.value === 11) { activeMonth.value = 0; activeYear.value += 1 } else { activeMonth.value += 1 } }

function startDayOfMonth(year: number, month: number) {
  // return 1 (Monday) .. 7 (Sunday) for first day
  const d = new Date(year, month, 1)
  const jsDay = d.getDay() // 0 Sun .. 6 Sat
  return jsDay === 0 ? 7 : jsDay
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month+1, 0).getDate()
}

const cells = computed(() => {
  const start = startDayOfMonth(activeYear.value, activeMonth.value) // 1..7
  const dim = daysInMonth(activeYear.value, activeMonth.value)
  const total = Math.ceil((start - 1 + dim) / 7) * 7
  const arr: Array<{ key: string, date?: string | null }> = []
  for (let i = 0; i < total; i++) {
    const dayIndex = i - (start - 1) + 1
    if (dayIndex >= 1 && dayIndex <= dim) {
      const dateObj = new Date(activeYear.value, activeMonth.value, dayIndex)
      const iso = dateObj.toISOString().slice(0,10)
      arr.push({ key: iso, date: iso })
    } else {
      arr.push({ key: `empty-${i}`, date: null })
    }
  }
  return arr
})

function onClick(dateStr?: string | null) {
  if (!dateStr) return
  emit('update:modelValue', dateStr)
}
</script>

<style scoped>
.datepicker { width: 320px; background: var(--bg-surface); border-radius: 10px; padding: 12px; box-shadow: var(--shadow-widget) }
.dp-header { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px }
.dp-header button { background: transparent; border: none; font-size:18px; cursor:pointer }
.dp-month { font-weight:700 }
.dp-grid { display:grid; grid-template-columns: repeat(7, 1fr); gap:6px }
.dp-weekday { font-size:12px; color:var(--text-muted); text-align:center }
.dp-cell { height:36px; border-radius:6px; display:flex; align-items:center; justify-content:center; cursor:pointer }
.dp-empty { background: transparent }
.dp-cell:hover { background: var(--bg-surface-hover) }
.dp-selected { background: var(--color-primary); color: #ffffff; font-weight:700 }
</style>