<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useSmarthubApi } from '../composables/use-smarthub-api.js'
import { useSettings } from '../composables/use-settings.js'

interface ForecastInterval {
  time: string
  temperature: number
  weatherDescription: string
  conditions: {
    rain: boolean
    snow: boolean
    cloudy: boolean
  }
}

interface WeatherResponse {
  forecasts: ForecastInterval[]
  formattedAddress?: string
}

const props = defineProps<{
  activeDestination?: string
}>()

const configuredWeather = ref<ForecastInterval | null>(null)
const destinationWeather = ref<ForecastInterval | null>(null)

const configuredAddress = ref('')
const destinationAddress = ref('')

const configuredError = ref('')
const destinationError = ref('')

const configuredLoading = ref(true)
const destinationLoading = ref(true)

const showingDestination = ref(false)

const { get } = useSmarthubApi()
const { getGlobalSettings, state } = useSettings()

const configuredLocation = computed(() => getGlobalSettings().weatherLocation || 'Linz, Austria')

async function fetchWeatherForLocation(locationName: string) {
  const response = await get<WeatherResponse>('/api/weather/forecast', {
    place: locationName,
  })
  return {
    forecast: response.forecasts[0] ?? null,
    formattedAddress: response.formattedAddress || locationName
  }
}

// Watch configured location from settings
watch(configuredLocation, async (newVal) => {
  if (!newVal) return
  configuredLoading.value = true
  configuredError.value = ''
  try {
    const res = await fetchWeatherForLocation(newVal)
    configuredWeather.value = res.forecast
    configuredAddress.value = res.formattedAddress
  } catch (e) {
    configuredError.value = e instanceof Error ? e.message : 'Could not load weather'
  } finally {
    configuredLoading.value = false
  }
}, { immediate: true })

// Watch active destination from active routine
watch(() => props.activeDestination, async (newVal) => {
  if (!newVal) {
    destinationWeather.value = null
    destinationAddress.value = ''
    destinationError.value = ''
    showingDestination.value = false
    return
  }
  destinationLoading.value = true
  destinationError.value = ''
  try {
    const res = await fetchWeatherForLocation(newVal)
    destinationWeather.value = res.forecast
    destinationAddress.value = res.formattedAddress
  } catch (e) {
    destinationError.value = e instanceof Error ? e.message : 'Could not load weather'
  } finally {
    destinationLoading.value = false
  }
}, { immediate: true })

// Cycle mechanism
const weatherCycleIntervalMap = {
  'very-slow': 20000,
  'slow': 15000,
  'medium': 10000,
  'fast': 6000,
  'very-fast': 3000
} as const

const cycleSpeedDuration = computed(() => {
  const speed = state.value.global?.displaySpeed || 'medium'
  return weatherCycleIntervalMap[speed] ?? 10000
})

let cycleInterval: ReturnType<typeof setInterval> | null = null

const startCycling = () => {
  stopCycling()
  if (props.activeDestination) {
    cycleInterval = setInterval(() => {
      // Toggle display between configured location and active destination
      showingDestination.value = !showingDestination.value
    }, cycleSpeedDuration.value)
  }
}

const stopCycling = () => {
  if (cycleInterval) {
    clearInterval(cycleInterval)
    cycleInterval = null
  }
}

watch([() => props.activeDestination, cycleSpeedDuration], ([newDest]) => {
  if (newDest) {
    startCycling()
  } else {
    stopCycling()
    showingDestination.value = false
  }
}, { immediate: true })

onUnmounted(() => {
  stopCycling()
})

const currentWeather = computed(() => {
  if (showingDestination.value && destinationWeather.value) {
    return destinationWeather.value
  }
  return configuredWeather.value
})

const currentAddress = computed(() => {
  if (showingDestination.value && destinationAddress.value) {
    return destinationAddress.value
  }
  return configuredAddress.value
})

const currentError = computed(() => {
  if (showingDestination.value) {
    return destinationError.value || configuredError.value
  }
  return configuredError.value
})

const currentLoading = computed(() => {
  if (showingDestination.value) {
    return destinationLoading.value
  }
  return configuredLoading.value
})

const weatherIcon = computed(() => {
  const current = currentWeather.value
  if (!current) return '<i class="fa-solid fa-circle-question" style="color: var(--text-light);"></i>'
  if (current.conditions.snow) return '<i class="fa-solid fa-snowflake" style="color: #60a5fa;"></i>'
  if (current.conditions.rain) return '<i class="fa-solid fa-cloud-rain" style="color: #94a3b8;"></i>'
  if (current.conditions.cloudy) return '<i class="fa-solid fa-cloud" style="color: var(--text-light);"></i>'
  return '<i class="fa-solid fa-sun" style="color: #f59e0b;"></i>'
})
</script>

<template>
  <div class="weather-widget" :class="showingDestination ? 'weather-widget--destination' : 'weather-widget--local'">
    <div v-if="currentLoading" class="weather-widget__status">Loading weather...</div>
    <div v-else-if="currentError" class="weather-widget__status weather-widget__status--error">{{ currentError }}</div>
    <div v-else-if="currentWeather" class="weather-widget__content-wrapper">
      <transition name="weather-fade" mode="out-in">
        <div :key="showingDestination ? 'destination' : 'local'" class="weather-widget__fade-container">
          <div class="weather-widget__badge">
            {{ showingDestination ? 'Commute Destination' : 'Local Weather' }}
          </div>
          <div class="weather-widget__location">
            <i class="fa-solid fa-location-dot" style="color: var(--theme-color); transition: color 0.4s ease;"></i>
            {{ currentAddress }}
          </div>
          
          <div class="weather-widget__content">
            <div class="weather-widget__icon" v-html="weatherIcon"></div>
            <div class="weather-widget__info">
              <div class="weather-widget__temp">{{ Math.round(currentWeather.temperature) }}°C</div>
              <div class="weather-widget__sky">{{ currentWeather.weatherDescription }}</div>
            </div>
          </div>
        </div>
      </transition>
      
      <div v-if="activeDestination" class="weather-widget__indicators">
        <span class="weather-widget__dot" :class="{ active: !showingDestination }"></span>
        <span class="weather-widget__dot" :class="{ active: showingDestination }"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.weather-widget {
  background: var(--bg-surface);
  border-radius: 12px;
  box-shadow: 0 2px 8px var(--shadow-widget);
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
  transition: all 0.4s ease;
}

.weather-widget--local {
  --theme-color: var(--color-primary);
  --theme-bg-light: var(--bg-primary-light);
}

.weather-widget--destination {
  --theme-color: var(--weather-dest-color);
  --theme-bg-light: var(--weather-dest-bg);
}

.weather-widget__content-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.weather-widget__fade-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.weather-widget__badge {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 4px 10px;
  border-radius: 20px;
  margin-bottom: 8px;
  background: var(--theme-bg-light);
  color: var(--theme-color);
  transition: all 0.4s ease;
}

.weather-widget__location {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.weather-widget__content {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 32px;
  width: 100%;
}

.weather-widget__status {
  color: var(--text-light);
  font-size: 1.1rem;
  font-weight: 500;
}

.weather-widget__status--error {
  color: var(--color-error);
}

.weather-widget__icon {
  font-size: 6rem;
  line-height: 1;
  filter: drop-shadow(0 4px 6px var(--shadow-widget));
  animation: float 6s ease-in-out infinite;
}

@keyframes float {
  0% { transform: translateY(0px); }
  50% { transform: translateY(-8px); }
  100% { transform: translateY(0px); }
}

.weather-widget__info {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
}

.weather-widget__temp {
  font-size: 3.5rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--theme-color);
  letter-spacing: -0.04em;
  line-height: 1;
  text-align: center;
  transition: color 0.4s ease;
}

.weather-widget__sky {
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: capitalize;
  letter-spacing: 0.01em;
  text-align: center;
}

.weather-widget__indicators {
  display: flex;
  gap: 6px;
  margin-top: 16px;
}

.weather-widget__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--border-base);
  transition: all 0.4s ease;
}

.weather-widget__dot.active {
  background: var(--theme-color);
  transform: scale(1.25);
}

/* Smooth Fade & Slide Transition */
.weather-fade-enter-active,
.weather-fade-leave-active {
  transition: opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1), transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}

.weather-fade-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.weather-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
