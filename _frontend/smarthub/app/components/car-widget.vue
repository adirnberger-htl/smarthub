<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { RoutineItem } from '../composables/use-settings'
import { useSettings } from '../composables/use-settings'
import { useSmarthubApi, type CarRouteResponse } from '../composables/use-smarthub-api'

const props = defineProps<{
  routine?: RoutineItem | null
}>()

const { updateRoutineItem } = useSettings()
const { geocodePlace, get } = useSmarthubApi()

const carRoutine = computed(() => props.routine)
const startPlace = computed(() => carRoutine.value?.startAddress ?? '')
const endPlace = computed(() => carRoutine.value?.destination ?? '')

const hasStops = computed(() => startPlace.value.trim() !== '' && endPlace.value.trim() !== '')
const missingStart = computed(() => startPlace.value.trim() === '')
const missingEnd = computed(() => endPlace.value.trim() === '')

const loading = ref(true)
const error = ref('')
const route = ref<CarRouteResponse | null>(null)
const lastFetched = ref<Date | null>(null)

const formattedDuration = computed(() => {
  if (!route.value) return '-'
  const mins = Math.round(route.value.durationInTrafficSeconds / 60)
  if (mins >= 60) {
    const hours = Math.floor(mins / 60)
    const remMins = mins % 60
    return `${hours}h ${remMins}m`
  }
  return `${mins} min`
})

const formattedDistance = computed(() => {
  if (!route.value) return '-'
  return `${(route.value.distanceMeters / 1000).toFixed(1)} km`
})

const departureTime = computed(() => {
  if (!route.value?.departureTime) return '--:--'
  return route.value.departureTime.slice(0, 5)
})

const arrivalTime = computed(() => {
  if (!route.value?.arrivalTime) return '--:--'
  return route.value.arrivalTime.slice(0, 5)
})

const departureCountdown = computed(() => {
  if (!route.value?.departureTime) return ''
  const [depH, depM] = route.value.departureTime.split(':').map(Number)
  const now = new Date()
  const depDate = new Date()
  depDate.setHours(depH, depM, 0, 0)
  
  const diffMinutes = Math.round((depDate.getTime() - now.getTime()) / 60000)
  if (diffMinutes > 1) return `Leave in ${diffMinutes} min`
  if (diffMinutes === 1) return 'Leave in 1 min'
  if (diffMinutes === 0) return 'Leave now'
  return `Departed ${Math.abs(diffMinutes)}m ago`
})

const trafficBadgeClass = computed(() => {
  if (!route.value) return 'traffic-badge--normal'
  switch (route.value.trafficCondition) {
    case 'heavy': return 'traffic-badge--heavy'
    case 'moderate': return 'traffic-badge--moderate'
    default: return 'traffic-badge--normal'
  }
})

const trafficBadgeText = computed(() => {
  if (!route.value) return ''
  if (route.value.trafficCondition === 'heavy') {
    return `+${route.value.trafficDelayMinutes}m heavy delay`
  }
  if (route.value.trafficCondition === 'moderate') {
    return `+${route.value.trafficDelayMinutes}m moderate delay`
  }
  return 'Normal traffic'
})

const trafficBadgeIcon = computed(() => {
  if (!route.value) return 'fa-solid fa-circle-check'
  switch (route.value.trafficCondition) {
    case 'heavy': return 'fa-solid fa-triangle-exclamation'
    case 'moderate': return 'fa-solid fa-circle-exclamation'
    default: return 'fa-solid fa-circle-check'
  }
})

const fetchCarRoute = async () => {
  if (!hasStops.value) {
    route.value = null
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''

  try {
    const currentRoutine = carRoutine.value
    const sAddr = startPlace.value.trim()
    const eAddr = endPlace.value.trim()

    let startCoords = currentRoutine?.startCoords?.address === sAddr ? currentRoutine.startCoords : undefined
    let destCoords = currentRoutine?.destCoords?.address === eAddr ? currentRoutine.destCoords : undefined
    let coordsUpdated = false

    const [resolvedStart, resolvedEnd] = await Promise.all([
      startCoords
        ? Promise.resolve({ coordinates: { lat: startCoords.lat, lon: startCoords.lon }, formattedAddress: startCoords.formattedAddress })
        : geocodePlace(sAddr),
      destCoords
        ? Promise.resolve({ coordinates: { lat: destCoords.lat, lon: destCoords.lon }, formattedAddress: destCoords.formattedAddress })
        : geocodePlace(eAddr),
    ])

    if (currentRoutine) {
      if (!startCoords) {
        currentRoutine.startCoords = {
          address: sAddr,
          lat: resolvedStart.coordinates.lat,
          lon: resolvedStart.coordinates.lon,
          formattedAddress: resolvedStart.formattedAddress
        }
        coordsUpdated = true
      }
      if (!destCoords) {
        currentRoutine.destCoords = {
          address: eAddr,
          lat: resolvedEnd.coordinates.lat,
          lon: resolvedEnd.coordinates.lon,
          formattedAddress: resolvedEnd.formattedAddress
        }
        coordsUpdated = true
      }
      if (coordsUpdated) {
        updateRoutineItem(currentRoutine)
      }
    }

    const targetArrival = currentRoutine?.arrivalTime
      ? (currentRoutine.arrivalTime.length === 5 ? `${currentRoutine.arrivalTime}:00` : currentRoutine.arrivalTime)
      : '08:30:00'

    const carData = await get<CarRouteResponse>('/api/car/route', {
      lat_a: resolvedStart.coordinates.lat,
      lon_a: resolvedStart.coordinates.lon,
      lat_b: resolvedEnd.coordinates.lat,
      lon_b: resolvedEnd.coordinates.lon,
      arrival_time: targetArrival,
    })

    route.value = carData
    lastFetched.value = new Date()
  } catch (err: any) {
    error.value = err instanceof Error ? err.message : 'Could not calculate car route'
    route.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [carRoutine.value?.startAddress, carRoutine.value?.destination, carRoutine.value?.arrivalTime] as const,
  () => {
    fetchCarRoute()
  },
  { immediate: true }
)

let refreshTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  // Refresh traffic conditions every 5 minutes while active
  refreshTimer = setInterval(() => {
    if (hasStops.value) {
      fetchCarRoute()
    }
  }, 5 * 60 * 1000)
})

onUnmounted(() => {
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<template>
  <div class="car-widget">
    <div class="car-widget__header">
      <h3 class="car-widget__title">
        <i class="fa-solid fa-car" style="color: var(--color-primary); margin-right: 8px;"></i>
        Route (Car)
      </h3>
      <div v-if="route" class="car-widget__provider-badge">
        <i :class="route.provider === 'google' ? 'fa-brands fa-google' : 'fa-solid fa-map-location-dot'"></i>
        {{ route.provider === 'google' ? 'Google Traffic' : 'OSRM Router' }}
      </div>
    </div>

    <!-- Empty States -->
    <div v-if="!carRoutine" class="car-widget__status">
      No active routine configuration.
    </div>
    <div v-else-if="!hasStops" class="car-widget__empty">
      <div class="car-widget__empty-icon">📍</div>
      <div class="car-widget__empty-title">Address Incomplete</div>
      <div class="car-widget__empty-desc">
        <template v-if="missingStart && missingEnd">
          Please configure both start address and destination in Settings.
        </template>
        <template v-else-if="missingStart">
          Please configure start address in Settings.
        </template>
        <template v-else>
          Please configure destination address in Settings.
        </template>
      </div>
    </div>

    <!-- Skeleton Loader -->
    <template v-else-if="loading">
      <div class="car-skeleton">
        <div class="car-skeleton__line car-skeleton__line--label"></div>
        <div class="car-skeleton__hero">
          <div class="car-skeleton__card"></div>
          <div class="car-skeleton__card"></div>
        </div>
        <div class="car-skeleton__steps">
          <div class="car-skeleton__line car-skeleton__line--step"></div>
          <div class="car-skeleton__line car-skeleton__line--step"></div>
          <div class="car-skeleton__line car-skeleton__line--step"></div>
        </div>
        <div class="car-skeleton__summary">
          <div class="car-skeleton__summary-item"></div>
          <div class="car-skeleton__summary-item"></div>
          <div class="car-skeleton__summary-item"></div>
        </div>
      </div>
    </template>

    <!-- Error State -->
    <div v-else-if="error" class="car-widget__status car-widget__status--error">
      <i class="fa-solid fa-circle-exclamation" style="margin-right: 6px;"></i>
      {{ error }}
      <button class="car-widget__retry-btn" @click="fetchCarRoute">Retry</button>
    </div>

    <!-- Route Data Content -->
    <template v-else-if="route">
      <div class="car-widget__route-label">
        <i class="fa-solid fa-location-dot" style="margin-right: 4px; font-size: 0.85rem;"></i>
        {{ startPlace }} → {{ endPlace }}
      </div>

      <div class="car-widget__hero">
        <div class="car-widget__hero-card">
          <div class="car-widget__hero-eyebrow">ESTIMATED COMMUTE</div>
          <div class="car-widget__hero-main">
            <span class="car-widget__duration-val">{{ formattedDuration }}</span>
          </div>
          <div class="car-widget__traffic-badge" :class="trafficBadgeClass">
            <i :class="trafficBadgeIcon" style="margin-right: 6px;"></i>
            {{ trafficBadgeText }}
          </div>
        </div>

        <div class="car-widget__hero-card car-widget__hero-card--departure">
          <div class="car-widget__hero-eyebrow">TARGET DEPARTURE</div>
          <div class="car-widget__hero-main">
            <span class="car-widget__departure-time">{{ departureTime }}</span>
          </div>
          <div class="car-widget__countdown-badge">
            <i class="fa-solid fa-clock" style="margin-right: 5px;"></i>
            {{ departureCountdown }}
          </div>
        </div>
      </div>

      <!-- Route Path & Road Overview -->
      <div class="car-widget__path-card">
        <div class="car-widget__path-header">
          <i class="fa-solid fa-signs-post" style="color: var(--color-primary); margin-right: 6px;"></i>
          <span class="car-widget__path-summary">via {{ route.summary }}</span>
        </div>
        <div class="car-widget__steps-list" v-if="route.steps && route.steps.length > 0">
          <div v-for="(step, idx) in route.steps.slice(0, 4)" :key="idx" class="car-widget__step-row">
            <span class="car-widget__step-bullet">•</span>
            <span class="car-widget__step-text">{{ step.instruction }}</span>
            <span class="car-widget__step-dist">
              {{ step.distanceMeters >= 1000 ? (step.distanceMeters / 1000).toFixed(1) + 'km' : step.distanceMeters + 'm' }}
            </span>
          </div>
          <div v-if="route.steps.length > 4" class="car-widget__step-more">
            + {{ route.steps.length - 4 }} more maneuvers to arrival
          </div>
        </div>
      </div>

      <!-- Bottom Metric Summary Bar -->
      <div class="car-widget__summary">
        <div class="car-widget__summary-item">
          <div class="car-widget__summary-label">Driving Time</div>
          <div class="car-widget__summary-value">{{ formattedDuration }}</div>
        </div>
        <div class="car-widget__summary-item">
          <div class="car-widget__summary-label">Total Distance</div>
          <div class="car-widget__summary-value">{{ formattedDistance }}</div>
        </div>
        <div class="car-widget__summary-item">
          <div class="car-widget__summary-label">Target Arrival</div>
          <div class="car-widget__summary-value">{{ arrivalTime }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.car-widget {
  background: var(--bg-surface);
  border-radius: 12px;
  box-shadow: 0 2px 8px var(--shadow-widget);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
}

.car-widget__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.car-widget__title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary-alt-2);
  margin: 0;
}

.car-widget__provider-badge {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--bg-surface-hover);
  padding: 4px 8px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.car-widget__route-label {
  color: var(--text-muted);
  font-size: 1.05rem;
  margin-top: -6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.car-widget__status {
  color: var(--text-muted);
  font-size: 0.95rem;
}

.car-widget__status--error {
  color: var(--color-error);
  background: var(--bg-surface-hover);
  padding: 16px;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
}

.car-widget__retry-btn {
  background: var(--color-primary);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 12px;
  font-size: 0.85rem;
  cursor: pointer;
}

.car-widget__empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
  gap: 8px;
  background: var(--bg-surface-hover);
  border-radius: 12px;
  padding: 32px 16px;
}

.car-widget__empty-icon {
  font-size: 2.5rem;
}

.car-widget__empty-title {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 1.1rem;
}

.car-widget__empty-desc {
  color: var(--text-muted);
  font-size: 0.9rem;
  max-width: 320px;
}

/* Hero commute stats */
.car-widget__hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.car-widget__hero-card {
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-base);
  border-radius: 12px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.car-widget__hero-card--departure {
  border-left: 3px solid var(--color-primary);
}

.car-widget__hero-eyebrow {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.car-widget__hero-main {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.car-widget__duration-val,
.car-widget__departure-time {
  font-size: 1.9rem;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
}

.car-widget__traffic-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 4px 8px;
  border-radius: 6px;
  width: fit-content;
}

.traffic-badge--normal {
  background: rgba(23, 175, 122, 0.15);
  color: #10b981;
}

.traffic-badge--moderate {
  background: rgba(245, 158, 11, 0.15);
  color: #f59e0b;
}

.traffic-badge--heavy {
  background: rgba(239, 68, 68, 0.15);
  color: #ef4444;
}

.car-widget__countdown-badge {
  display: inline-flex;
  align-items: center;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-primary);
  background: rgba(99, 102, 241, 0.1);
  padding: 4px 8px;
  border-radius: 6px;
  width: fit-content;
}

/* Path overview & steps */
.car-widget__path-card {
  background: var(--bg-surface-hover);
  border-radius: 10px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.car-widget__path-header {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
}

.car-widget__path-summary {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.car-widget__steps-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.car-widget__step-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.car-widget__step-bullet {
  color: var(--color-primary);
  font-size: 1rem;
}

.car-widget__step-text {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.car-widget__step-dist {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-light);
  white-space: nowrap;
}

.car-widget__step-more {
  font-size: 0.8rem;
  color: var(--text-light);
  font-style: italic;
  padding-left: 12px;
}

/* Metric summary bar */
.car-widget__summary {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid var(--border-base);
  padding-top: 12px;
  margin-top: auto;
}

.car-widget__summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.car-widget__summary-label {
  font-size: 0.8rem;
  color: var(--text-muted);
}

.car-widget__summary-value {
  font-size: 1.15rem;
  font-weight: 600;
  color: var(--text-primary);
}

/* Skeleton Loading */
.car-skeleton {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
}

.car-skeleton__line {
  background: linear-gradient(90deg, var(--bg-surface-hover) 25%, var(--border-base) 50%, var(--bg-surface-hover) 75%);
  background-size: 200% 100%;
  animation: car-pulse 1.5s infinite;
  border-radius: 6px;
}

.car-skeleton__line--label {
  width: 50%;
  height: 18px;
}

.car-skeleton__hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.car-skeleton__card {
  height: 90px;
  border-radius: 12px;
  background: var(--bg-surface-hover);
  animation: car-pulse 1.5s infinite;
}

.car-skeleton__steps {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}

.car-skeleton__line--step {
  width: 100%;
  height: 24px;
}

.car-skeleton__summary {
  display: flex;
  justify-content: space-between;
  border-top: 1px solid var(--border-base);
  padding-top: 12px;
}

.car-skeleton__summary-item {
  width: 25%;
  height: 36px;
  border-radius: 6px;
  background: var(--bg-surface-hover);
  animation: car-pulse 1.5s infinite;
}

@keyframes car-pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}
</style>
