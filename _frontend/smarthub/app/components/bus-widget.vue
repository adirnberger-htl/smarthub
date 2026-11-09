<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import type { BusRouteApiResponse } from '../types/bus'
import { formatDurationMinutes, formatTime } from '../types/bus'
import { useSmarthubApi } from '../composables/use-smarthub-api'
import { useSettings } from '../composables/use-settings'
import type { RoutineItem } from '../composables/use-settings'

const { state, updateRoutineItem } = useSettings()

const props = defineProps<{
  routine?: RoutineItem | null
}>()

const MAX_TRANSFERS = 2
const { geocodePlace, get } = useSmarthubApi()

const busRoutine = computed(() => props.routine)

const startPlace = computed(() => busRoutine.value?.startAddress ?? '')
const endPlace = computed(() => busRoutine.value?.destination ?? '')
const hasStops = computed(() => startPlace.value.trim() !== '' && endPlace.value.trim() !== '')

function isMinorWalk(leg: any) {
  return leg.route_type === 99 && leg.distance !== undefined && leg.distance < 200
}

function getTransitIcon(routeType: number) {
  switch (routeType) {
    case 0: return 'fa-solid fa-train-tram'
    case 1: return 'fa-solid fa-train-subway'
    case 2: return 'fa-solid fa-train'
    case 3: return 'fa-solid fa-bus'
    case 99: return 'fa-solid fa-person-walking'
    default: return 'fa-solid fa-bus'
  }
}

function getTransitColor(routeType: number) {
  switch (routeType) {
    case 0: return 'var(--color-error)'
    case 1: return '#ec4899'
    case 2: return '#6366f1'
    case 3: return '#17af7a'
    case 99: return 'var(--color-primary)'
    default: return 'var(--color-primary)'
  }
}

function getStopDotColor(index: number): string {
  const legs = route.value?.legs || []
  const currentLeg = legs[index]
  if (!currentLeg) return 'var(--border-stronger)'
  if (isMinorWalk(currentLeg)) {
    if (index > 0) return getTransitColor(legs[index - 1].route_type)
    if (index + 1 < legs.length) return getTransitColor(legs[index + 1].route_type)
  }
  return getTransitColor(currentLeg.route_type)
}

function getFinalStopDotColor(): string {
  const legs = route.value?.legs || []
  if (legs.length === 0) return 'var(--border-stronger)'
  const lastLeg = legs[legs.length - 1]
  if (isMinorWalk(lastLeg) && legs.length > 1) {
    return getTransitColor(legs[legs.length - 2].route_type)
  }
  return getTransitColor(lastLeg.route_type)
}

function getTransitName(leg: any) {
  const shortName = leg.route_short_name || ''
  switch (leg.route_type) {
    case 0: return `Tram ${shortName}`
    case 1: return `Subway ${shortName}`
    case 2: return `Train ${shortName}`
    case 3: return `Bus ${shortName}`
    default: return `Line ${shortName}`
  }
}

const loading = ref(true)
const error = ref('')
const route = ref<BusRouteApiResponse | null>(null)

function getCurrentTimeParam() {
  const now = new Date()
  const hh = String(now.getHours()).padStart(2, '0')
  const mm = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

const travelTime = computed(() => route.value ? formatDurationMinutes(route.value.total_duration_minutes) : '-')
const transferCount = computed(() => route.value?.num_transfers ?? 0)
const arrivalTime = computed(() => route.value ? formatTime(route.value.arrival_time) : '--:--')

const fetchActiveRoute = async () => {
  if (!hasStops.value) {
    route.value = null
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''
  try {
    const currentRoutine = busRoutine.value
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

    const targetArrival = currentRoutine?.arrivalTime ? `${currentRoutine.arrivalTime}:00` : '08:00:00'
    const nowTime = getCurrentTimeParam()

    const routes = await get<BusRouteApiResponse[]>('/api/bus/route', {
      lat_a: resolvedStart.coordinates.lat,
      lon_a: resolvedStart.coordinates.lon,
      lat_b: resolvedEnd.coordinates.lat,
      lon_b: resolvedEnd.coordinates.lon,
      arrival_time: targetArrival,
      min_departure_time: nowTime,
      max_transfers: MAX_TRANSFERS,
    })

    route.value = routes[0] ?? null
    if (!route.value) {
      error.value = 'No route found'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not load routes'
    route.value = null
  } finally {
    loading.value = false
  }
}

watch(
  () => [busRoutine.value?.startAddress, busRoutine.value?.destination, busRoutine.value?.arrivalTime] as const,
  () => {
    fetchActiveRoute()
  },
  { immediate: true }
)

const timelineRef = ref<HTMLElement | null>(null)
const isHovered = ref(false)
let animationFrameId: number | null = null
const speedMap = {
  'very-slow': 10,
  'slow': 18,
  'medium': 28,
  'fast': 45,
  'very-fast': 70
} as const

const pauseMap = {
  'very-slow': 5000,
  'slow': 4000,
  'medium': 3000,
  'fast': 2000,
  'very-fast': 1000
} as const

const scrollSpeed = computed(() => {
  const speed = state.value.global?.displaySpeed || 'medium'
  return speedMap[speed] ?? 28
})

const scrollPause = computed(() => {
  const speed = state.value.global?.displaySpeed || 'medium'
  return pauseMap[speed] ?? 3000
})

function startAutoscroll() {
  stopAutoscroll()
  const el = timelineRef.value
  if (!el || el.scrollHeight <= el.clientHeight) return
  let direction = 1
  let scrollPos = el.scrollTop
  let lastTime = performance.now()
  let pauseUntil = performance.now() + (scrollPause.value / 2)
  const tick = (now: number) => {
    const el = timelineRef.value
    if (!el) return
    if (isHovered.value) { scrollPos = el.scrollTop; lastTime = now; animationFrameId = requestAnimationFrame(tick); return }
    if (now < pauseUntil) { scrollPos = el.scrollTop; lastTime = now; animationFrameId = requestAnimationFrame(tick); return }
    const elapsed = (now - lastTime) / 1000
    lastTime = now
    const maxScroll = el.scrollHeight - el.clientHeight
    if (direction === 1) {
      scrollPos += scrollSpeed.value * elapsed
      if (scrollPos >= maxScroll) { scrollPos = maxScroll; direction = -1; pauseUntil = now + scrollPause.value }
    } else {
      scrollPos -= scrollSpeed.value * elapsed
      if (scrollPos <= 0) { scrollPos = 0; direction = 1; pauseUntil = now + scrollPause.value }
    }
    el.scrollTop = scrollPos
    animationFrameId = requestAnimationFrame(tick)
  }
  animationFrameId = requestAnimationFrame(tick)
}

function stopAutoscroll() {
  if (animationFrameId !== null) { cancelAnimationFrame(animationFrameId); animationFrameId = null }
}

watch([route, loading], async () => { await nextTick(); startAutoscroll() })

let resizeObserver: ResizeObserver | null = null
let mutationObserver: MutationObserver | null = null

watch(timelineRef, (newEl, oldEl) => {
  if (oldEl) { if (resizeObserver) resizeObserver.unobserve(oldEl); if (mutationObserver) mutationObserver.disconnect() }
  if (newEl) {
    if (!resizeObserver) resizeObserver = new ResizeObserver(() => startAutoscroll())
    resizeObserver.observe(newEl)
    if (!mutationObserver) mutationObserver = new MutationObserver(() => startAutoscroll())
    mutationObserver.observe(newEl, { childList: true, subtree: true, characterData: true })
    nextTick(() => startAutoscroll())
  } else stopAutoscroll()
})

onUnmounted(() => {
  stopAutoscroll()
  if (resizeObserver) resizeObserver.disconnect()
  if (mutationObserver) mutationObserver.disconnect()
})
</script>

<template>
  <div class="bus-widget">
    <h3 class="bus-widget__title"><i class="fa-solid fa-route" style="color: var(--color-primary); margin-right: 8px;"></i>Route</h3>
    <div v-if="!busRoutine" class="bus-widget__status">
      No active routine configuration.
    </div>
    <div v-else-if="!hasStops" class="bus-widget__status">
      Please configure start and destination addresses in settings.
    </div>
    <template v-else-if="loading">
      <div class="bus-skeleton">
        <!-- Route label skeleton -->
        <div class="bus-skeleton__line bus-skeleton__line--route"></div>
        <!-- Timeline skeleton -->
        <div class="bus-skeleton__timeline">
          <!-- Stop 1 -->
          <div class="bus-skeleton__stop">
            <div class="bus-skeleton__dot"></div>
            <div class="bus-skeleton__line bus-skeleton__line--stop-name"></div>
          </div>
          <!-- Connection 1 -->
          <div class="bus-skeleton__connection">
            <div class="bus-skeleton__connection-rail"></div>
            <div class="bus-skeleton__connection-card"></div>
          </div>
          <!-- Stop 2 -->
          <div class="bus-skeleton__stop">
            <div class="bus-skeleton__dot"></div>
            <div class="bus-skeleton__line bus-skeleton__line--stop-name bus-skeleton__line--short"></div>
          </div>
          <!-- Connection 2 -->
          <div class="bus-skeleton__connection">
            <div class="bus-skeleton__connection-rail"></div>
            <div class="bus-skeleton__connection-card bus-skeleton__connection-card--narrow"></div>
          </div>
          <!-- Stop 3 (final) -->
          <div class="bus-skeleton__stop">
            <div class="bus-skeleton__dot bus-skeleton__dot--filled"></div>
            <div class="bus-skeleton__line bus-skeleton__line--stop-name"></div>
          </div>
        </div>
        <!-- Summary skeleton -->
        <div class="bus-skeleton__summary">
          <div class="bus-skeleton__summary-item">
            <div class="bus-skeleton__line bus-skeleton__line--label"></div>
            <div class="bus-skeleton__line bus-skeleton__line--value"></div>
          </div>
          <div class="bus-skeleton__summary-item">
            <div class="bus-skeleton__line bus-skeleton__line--label"></div>
            <div class="bus-skeleton__line bus-skeleton__line--value"></div>
          </div>
          <div class="bus-skeleton__summary-item">
            <div class="bus-skeleton__line bus-skeleton__line--label"></div>
            <div class="bus-skeleton__line bus-skeleton__line--value"></div>
          </div>
        </div>
      </div>
    </template>
    <div v-else-if="error" class="bus-widget__status bus-widget__status--error">{{ error }}</div>
    <template v-else>
      <div class="bus-widget__route-label">{{ startPlace }} → {{ endPlace }}</div>
      <div 
        ref="timelineRef"
        class="bus-widget__timeline"
        @mouseenter="isHovered = true"
        @mouseleave="isHovered = false"
      >
        <template v-for="(leg, index) in route?.legs || []" :key="index">
          <!-- Boarding Stop -->
          <div class="bus-widget__stop">
            <div class="bus-widget__stop-dot" :style="{ borderColor: getStopDotColor(index) }"></div>
            <div class="bus-widget__stop-info">
              <div class="bus-widget__stop-name">{{ leg.board_stop_name }}</div>
            </div>
          </div>

          <!-- Connection -->
          <div class="bus-widget__connection" :class="{ 'bus-widget__connection--minor': isMinorWalk(leg) }">
            <div 
              class="bus-widget__connection-line" 
              :style="{ 
                backgroundColor: isMinorWalk(leg) ? 'transparent' : getTransitColor(leg.route_type) 
              }"
            ></div>
            <div class="bus-widget__connection-content">
              <div v-if="!isMinorWalk(leg)" class="bus-widget__connection-times">
                <div class="bus-widget__connection-time">{{ formatTime(leg.departure_time) }}</div>
                <div class="bus-widget__connection-divider"></div>
                <div class="bus-widget__connection-time">{{ formatTime(leg.arrival_time) }}</div>
              </div>
              <div class="bus-widget__connection-mode">
                <i 
                  :class="getTransitIcon(leg.route_type)" 
                  :style="{ 
                    color: isMinorWalk(leg) ? 'var(--text-light)' : getTransitColor(leg.route_type), 
                    width: '24px', 
                    textAlign: 'center', 
                    fontSize: isMinorWalk(leg) ? '1.45rem' : 'inherit' 
                  }"
                ></i>
                <template v-if="leg.route_type === 99">
                  Walk <span class="bus-widget__walk-distance">({{ leg.distance !== undefined ? Math.round(leg.distance) + 'm' : '' }})</span>
                </template>
                <template v-else>
                  {{ getTransitName(leg) }}
                </template>
              </div>
            </div>
          </div>

          <!-- Final Stop -->
          <div v-if="index === route!.legs.length - 1" class="bus-widget__stop">
            <div class="bus-widget__stop-dot bus-widget__stop-dot--end" :style="{ borderColor: getFinalStopDotColor(), backgroundColor: getFinalStopDotColor() }"></div>
            <div class="bus-widget__stop-info">
              <div class="bus-widget__stop-name">{{ leg.alight_stop_name }}</div>
            </div>
          </div>
        </template>
      </div>

      <div class="bus-widget__summary">
        <div class="bus-widget__summary-item">
          <div class="bus-widget__summary-label">Travel time</div>
          <div class="bus-widget__summary-value">{{ travelTime }}</div>
        </div>
        <div class="bus-widget__summary-item">
          <div class="bus-widget__summary-label">Transfers</div>
          <div class="bus-widget__summary-value">{{ transferCount }}</div>
        </div>
        <div class="bus-widget__summary-item">
          <div class="bus-widget__summary-label">Arrival</div>
          <div class="bus-widget__summary-value">{{ arrivalTime }}</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.bus-widget {
  background: var(--bg-surface);
  border-radius: 12px;
  box-shadow: 0 2px 8px var(--shadow-widget);
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
  min-height: 0;
}

.bus-widget__title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--text-primary-alt-2);
  margin: 0;
}

.bus-widget__route-label {
  color: var(--text-muted);
  font-size: 1.1rem;
  margin-top: -8px;
}

.bus-widget__status {
  color: var(--text-muted);
  font-size: 1.1rem;
}

.bus-widget__status--error {
  color: var(--color-error-dark);
}

.bus-widget__timeline {
  position: relative;
  padding-left: 48px;
  flex: 1;
  overflow: hidden; /* Prevent manual scroll and hide scrollbars */
  min-height: 0;
  padding-right: 8px;
}

.bus-widget__stop {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}

.bus-widget__stop-dot {
  position: absolute;
  box-sizing: border-box;
  left: -36px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--bg-surface);
  border: 4px solid var(--color-primary);
  z-index: 1;
}

.bus-widget__stop-dot--end {
  background: var(--color-primary);
}

.bus-widget__stop-info {
  flex: 1;
}

.bus-widget__stop-name {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--text-primary);
}

.bus-widget__connection {
  position: relative;
  display: flex;
  padding: 4px 0 4px 0;
}

.bus-widget__connection-line {
  position: absolute;
  box-sizing: border-box;
  left: -29px; /* -36px left + 9px half width = -27px center. line width 4px => left -29px */
  top: -8px;
  bottom: -8px;
  width: 4px;
  background: var(--color-primary);
  border-radius: 2px;
}

.bus-widget__connection-content {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-start;
  background: var(--border-light);
  border-radius: 8px;
  padding: 12px 16px;
  width: 100%;
  gap: 20px;
}

.bus-widget__connection--minor {
  padding: 2px 0 !important;
}

.bus-widget__connection--minor .bus-widget__connection-line {
  background: transparent !important;
  border-left: 2px dashed var(--border-strong);
  left: -28px;
  width: 0;
}

.bus-widget__connection--minor .bus-widget__connection-content {
  background: var(--bg-surface-hover);
  border: 1px dashed var(--border-base);
  padding: 6px 12px;
  gap: 2px;
}

.bus-widget__connection--minor .bus-widget__connection-mode {
  font-size: 0.95rem;
  color: var(--text-muted);
  font-weight: 600;
}

.bus-widget__connection--minor .bus-widget__connection-time {
  font-size: 0.85rem;
  color: var(--text-light);
}

.bus-widget__walk-distance {
  font-size: 0.9rem;
  color: var(--text-light);
  font-weight: 500;
}

.bus-widget__connection-times {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 48px;
}

.bus-widget__connection-divider {
  width: 2px;
  height: 8px;
  background-color: var(--border-stronger);
  margin: 2px 0;
}

.bus-widget__connection-time {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary-alt-2);
  line-height: 1.1;
}

.bus-widget__connection-mode {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.bus-widget__summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
  text-align: center;
}

.bus-widget__summary-label {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.bus-widget__summary-value {
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-primary);
}

/* ── Skeleton Loading ── */

@keyframes bus-skeleton-pulse {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

.bus-skeleton {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.bus-skeleton__line {
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    var(--border-base) 25%,
    var(--border-light) 50%,
    var(--border-base) 75%
  );
  background-size: 200% 100%;
  animation: bus-skeleton-pulse 1.8s ease-in-out infinite;
}

.bus-skeleton__line--route {
  width: 65%;
  height: 16px;
  margin-top: -4px;
}

.bus-skeleton__timeline {
  padding-left: 48px;
  position: relative;
  flex: 1;
  min-height: 0;
}

.bus-skeleton__stop {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 0;
}

.bus-skeleton__dot {
  position: absolute;
  left: -36px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  box-sizing: border-box;
  border: 4px solid var(--border-strong);
  background: var(--bg-surface);
  animation: bus-skeleton-pulse 1.8s ease-in-out infinite;
  background: linear-gradient(
    90deg,
    var(--border-strong) 25%,
    var(--border-base) 50%,
    var(--border-strong) 75%
  );
  background-size: 200% 100%;
  border-color: transparent;
}

.bus-skeleton__dot--filled {
  background: linear-gradient(
    90deg,
    var(--border-strong) 25%,
    var(--border-base) 50%,
    var(--border-strong) 75%
  );
  background-size: 200% 100%;
}

.bus-skeleton__line--stop-name {
  width: 55%;
  height: 18px;
}

.bus-skeleton__line--stop-name.bus-skeleton__line--short {
  width: 40%;
}

.bus-skeleton__connection {
  position: relative;
  display: flex;
  padding: 4px 0;
}

.bus-skeleton__connection-rail {
  position: absolute;
  left: -29px;
  top: -8px;
  bottom: -8px;
  width: 4px;
  border-radius: 2px;
  background: linear-gradient(
    90deg,
    var(--border-strong) 25%,
    var(--border-base) 50%,
    var(--border-strong) 75%
  );
  background-size: 200% 100%;
  animation: bus-skeleton-pulse 1.8s ease-in-out infinite;
}

.bus-skeleton__connection-card {
  width: 100%;
  height: 52px;
  border-radius: 8px;
  background: linear-gradient(
    90deg,
    var(--border-base) 25%,
    var(--border-light) 50%,
    var(--border-base) 75%
  );
  background-size: 200% 100%;
  animation: bus-skeleton-pulse 1.8s ease-in-out infinite;
}

.bus-skeleton__connection-card--narrow {
  height: 44px;
}

.bus-skeleton__summary {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border-light);
}

.bus-skeleton__summary-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
}

.bus-skeleton__line--label {
  width: 60%;
  height: 10px;
}

.bus-skeleton__line--value {
  width: 45%;
  height: 20px;
}
</style>
