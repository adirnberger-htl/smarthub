<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useSettings } from '../composables/use-settings'
import BusWidget from '../components/bus-widget.vue'
import CarWidget from '../components/car-widget.vue'
import MotivationWidget from '../components/motivation-widget.vue'

const { preview, clearPreview, state } = useSettings()

const today = ref(new Date().toISOString().slice(0, 10))
const currentDayOfWeek = ref(new Date().getDay())
const currentTime = ref('')

function updateTime() {
  const now = new Date()
  today.value = now.toISOString().slice(0, 10)
  currentDayOfWeek.value = now.getDay()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  currentTime.value = `${hh}:${mm}`
}

updateTime()

let timeInterval: ReturnType<typeof setInterval>
onMounted(() => {
  timeInterval = setInterval(updateTime, 10000) // check every 10s
})
onUnmounted(() => clearInterval(timeInterval))

const activeRoutine = computed(() => {
  const timeVal = currentTime.value
  if (!timeVal) return undefined

  return state.value.routines.find(r => {
    if (!r.activeDays?.includes(currentDayOfWeek.value)) return false

    const start = r.startTime || '00:00'
    const end = r.endTime || '23:59'

    if (start <= end) {
      return timeVal >= start && timeVal <= end
    } else {
      return timeVal >= start || timeVal <= end
    }
  })
})

const transportMode = computed(() => activeRoutine.value?.transportMode)
</script>

<template>
  <div class="dashboard">
    <div class="dashboard__left">
      <clock-widget class="dashboard__clock" />
      <weather-widget
        class="dashboard__weather"
        :active-destination="activeRoutine?.destination"
        :active-destination-coords="activeRoutine?.destCoords"
      />
      <appointments-widget class="dashboard__appointments" />
    </div>
    <div class="dashboard__right">
      <div v-if="preview" class="route-preview">
        <div class="route-preview__header">
          <h3>Route Preview</h3>
          <button @click="clearPreview">Close</button>
        </div>
        <div v-if="Array.isArray(preview.routes) && preview.routes.length>0">
          <div v-for="(r, idx) in preview.routes" :key="idx" class="route-card">
            <div><strong>Departure:</strong> {{ r.departure_time }} → <strong>Arrival:</strong> {{ r.arrival_time }}</div>
            <div><strong>Duration:</strong> {{ r.total_duration_minutes }} minutes</div>
            <div v-for="(leg, i) in r.legs" :key="i" class="leg">
              <div>{{ leg.board_stop_name }} → {{ leg.alight_stop_name }} ({{ leg.route_short_name }})</div>
              <div>{{ leg.departure_time }} → {{ leg.arrival_time }}</div>
            </div>
          </div>
        </div>
        <div v-else>No routes found</div>
      </div>

      <transition name="widget-fade" mode="out-in">
        <bus-widget v-if="transportMode === 'bus'" :routine="activeRoutine" key="bus" />
        <car-widget v-else-if="transportMode === 'car'" :routine="activeRoutine" key="car" />
        <motivation-widget v-else key="motivation" />
      </transition>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  gap: 20px;
  height: 100%;
}

.dashboard__left {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 35%;
  min-width: 320px;
  height: 100%;
  min-height: 0;
}

.dashboard__clock,
.dashboard__weather,
.dashboard__appointments {
  flex: 1;
  min-height: 0;
}

.dashboard__right {
  width: 65%;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.route-preview { background: var(--bg-surface); padding:12px; border-radius:8px; margin-bottom:12px; box-shadow: var(--shadow-widget) }
.route-preview__header { display:flex; justify-content:space-between; align-items:center; color: var(--text-primary) }
.route-card { padding:8px; border:1px solid var(--border-base); border-radius:6px; margin-bottom:8px; color: var(--text-primary) }

/* Widget transition styles */
.widget-fade-enter-active,
.widget-fade-leave-active {
  transition: opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.widget-fade-enter-from {
  opacity: 0;
  transform: translateY(12px) scale(0.98);
}

.widget-fade-leave-to {
  opacity: 0;
  transform: translateY(-12px) scale(0.98);
}
</style>
