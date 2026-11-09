<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useRuntimeConfig } from '#app'
import { useSettings } from '../composables/use-settings.js'
import { useSmarthubApi } from '../composables/use-smarthub-api.js'
import { useDeviceOsd, OSD_ACTION_METADATA, type OsdHardwareAction } from '../composables/use-device-osd'
import DatePickerPopup from '../components/date-picker-popup.vue'
import AddressAutocomplete from '../components/address-autocomplete.vue'

definePageMeta({
  alias: ['/routine-settings'],
})

const router = useRouter()
const route = useRoute()

const { state, getGlobalSettings, addRoutineItem, updateRoutineItem, removeRoutineItem, setPreview, saveGlobalSettings } = useSettings()
const { geocodePlace, get, fetchMe, logout } = useSmarthubApi()
const { state: osdState, startLearningKey, cancelLearningKey, resetKeymapToDefaults, triggerAction: triggerOsdAction } = useDeviceOsd()

function toggleLearnAction(action: OsdHardwareAction) {
  if (osdState.value.learningAction === action) {
    cancelLearningKey()
  } else {
    startLearningKey(action)
  }
}

const globalSettings = computed(() => getGlobalSettings())

const speedValues = ['very-slow', 'slow', 'medium', 'fast', 'very-fast'] as const
const speedLabels = ['Very Slow', 'Slow', 'Medium', 'Fast', 'Very Fast'] as const

const displaySpeedNumber = computed({
  get() {
    const speed = globalSettings.value.displaySpeed || 'medium'
    const idx = speedValues.indexOf(speed)
    return idx !== -1 ? idx + 1 : 3
  },
  set(val: number) {
    const idx = val - 1
    if (idx >= 0 && idx < speedValues.length) {
      globalSettings.value.displaySpeed = speedValues[idx]
      saveGlobalSettings()
    }
  }
})

const currentDisplaySpeedLabel = computed(() => {
  const speed = globalSettings.value.displaySpeed || 'medium'
  const idx = speedValues.indexOf(speed)
  return idx !== -1 ? speedLabels[idx] : 'Medium'
})

const routines = computed(() => state.value.routines)

function addNewRoutine() { addRoutineItem() }

function addAlarm(item: any) {
  if (!item.alarms) item.alarms = []
  item.alarms.push({
    id: crypto.randomUUID(),
    time: item.startTime,
    enabled: true
  })
}

function removeAlarm(item: any, alarmId: string) {
  item.alarms = item.alarms.filter((a: any) => a.id !== alarmId)
}

function toggleDay(item: any, dayIndex: number) {
  if (!item.activeDays) item.activeDays = []
  const idx = item.activeDays.indexOf(dayIndex)
  if (idx === -1) {
    item.activeDays.push(dayIndex)
  } else {
    item.activeDays.splice(idx, 1)
  }
  updateRoutineItem(item)
}

const daysOfWeek = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

const googleConnected = ref(false)
const googleEmail = ref<string | null>(null)
const statusMessage = ref('')
const loadingStatus = ref(true)

const config = useRuntimeConfig()
const apiBase = String(config.public.apiBaseUrl || '').replace(/\/$/, '')



const refreshGoogleStatus = async () => {
  loadingStatus.value = true
  try {
    const me = await fetchMe()
    googleConnected.value = me.googleConnected
    googleEmail.value = me.googleEmail
  } catch {
    statusMessage.value = 'Could not load status'
  } finally {
    loadingStatus.value = false
  }
}

const connectGoogle = () => {
  statusMessage.value = ''
  window.location.href = `${apiBase}/api/auth/google/connect`
}

const handleLogout = async () => {
  await logout()
  await router.push('/login')
}

const toastMessage = ref('')
let toastTimeout: any = null
function showToast(msg: string) {
  toastMessage.value = msg
  if (toastTimeout) clearTimeout(toastTimeout)
  toastTimeout = setTimeout(() => { toastMessage.value = '' }, 6000)
}

async function autoConfigure(item: any) {
  if (!item.destination) { alert('Please set a destination first.'); return; }
  if (item.transportMode === 'bus' && !item.startAddress) { alert('Please set a start address first.'); return; }

  try {
    let destCoords = item.destCoords?.address === item.destination ? item.destCoords : undefined
    if (!destCoords) {
      const place = await geocodePlace(item.destination)
      destCoords = {
        address: item.destination,
        lat: place.coordinates.lat,
        lon: place.coordinates.lon,
        formattedAddress: place.formattedAddress
      }
      item.destCoords = destCoords
    }

    let startCoords = item.startCoords?.address === item.startAddress ? item.startCoords : undefined
    if (item.transportMode === 'bus' && !startCoords) {
      const home = await geocodePlace(item.startAddress)
      startCoords = {
        address: item.startAddress,
        lat: home.coordinates.lat,
        lon: home.coordinates.lon,
        formattedAddress: home.formattedAddress
      }
      item.startCoords = startCoords
    }

    const arrival = item.arrivalTime.includes(':') && item.arrivalTime.split(':').length >= 2 ? (item.arrivalTime.length === 5 ? item.arrivalTime + ':00' : item.arrivalTime) : item.arrivalTime + ':00'

    let departureTimeStr = ''
    
    if (item.transportMode === 'bus' && startCoords && destCoords) {
      const routes = await get<any[]>('/api/bus/route', {
        lat_a: startCoords.lat,
        lon_a: startCoords.lon,
        lat_b: destCoords.lat,
        lon_b: destCoords.lon,
        arrival_time: arrival,
        max_transfers: 2,
      })
      if (!routes || routes.length === 0) throw new Error('No bus routes found for this arrival time.')
      
      const firstRoute = routes[0]
      if (firstRoute && firstRoute.departure_time) {
        departureTimeStr = firstRoute.departure_time.slice(0, 5)
      } else {
        throw new Error('Could not parse departure time.')
      }
    } else {
      throw new Error('Auto-configure is currently optimized for Public Transport.')
    }

    if (departureTimeStr) {
      const shiftTime = (timeStr: string, diffMins: number) => {
        const [h, m] = timeStr.split(':').map(Number);
        const total = h * 60 + m + diffMins;
        const wrapped = ((total % 1440) + 1440) % 1440;
        return `${String(Math.floor(wrapped / 60)).padStart(2, '0')}:${String(wrapped % 60).padStart(2, '0')}`;
      };

      const newVisibilityStart = shiftTime(departureTimeStr, -60)
      const newVisibilityEnd = shiftTime(item.arrivalTime, 30)
      const alarmTime = shiftTime(departureTimeStr, -45)

      item.startTime = newVisibilityStart
      item.endTime = newVisibilityEnd
      
      if (!item.alarms) item.alarms = []
      item.alarms = [{ id: crypto.randomUUID(), time: alarmTime, enabled: true }]
      
      updateRoutineItem(item)
      showToast(`To arrive at ${item.arrivalTime}, you depart at ${departureTimeStr}. Alarm set to ${alarmTime}.`)
    }

  } catch (e) {
    alert(e instanceof Error ? e.message : String(e))
  }
}

onMounted(async () => {
  await refreshGoogleStatus()
  if (route.query.google === 'connected') {
    statusMessage.value = 'Google account connected'
  }
})
</script>

<template>
  <div class="settings-page">
    <transition name="toast-slide">
      <div v-if="toastMessage" class="ios-toast">
        <div class="ios-toast-icon"><i class="fa-solid fa-circle-check" style="color: var(--weather-dest-color);"></i></div>
        <div class="ios-toast-text">{{ toastMessage }}</div>
      </div>
    </transition>
    <div class="settings-left">
      <div class="settings-page-header">
        <button class="back-btn-premium" @click="router.push('/dashboard')">
          <i class="fa-solid fa-arrow-left"></i>
          Back to Dashboard
        </button>
        <h2>Settings</h2>
      </div>

      <section class="routines-section">
        <div class="routines-section-header">
          <h3><i class="fa-solid fa-display" style="color: var(--color-primary); margin-right: 8px;"></i>Dashboard View</h3>
        </div>
        <div class="routine-card">
          <div class="routine-card__body" style="padding: 16px 20px;">
            <div class="routine-card__row" style="align-items: center; justify-content: space-between;">
              <div class="routine-card__field">
                <label class="field-label" style="font-size: 0.95rem; color: var(--text-primary-strong); margin: 0; text-transform: none; letter-spacing: normal;">Clock Type</label>
                <p class="helper-text" style="margin-top: 4px;">Choose how the time is displayed on your dashboard.</p>
              </div>
              <div class="transport-segment" style="min-width: 200px; justify-content: center;">
                <button 
                  type="button"
                  class="segment-btn" 
                  :class="{ active: globalSettings.clockType === 'digital' }"
                  style="flex: 1; text-align: center;"
                  @click="() => { getGlobalSettings().clockType = 'digital'; saveGlobalSettings() }"
                >
                  Digital
                </button>
                <button 
                  type="button"
                  class="segment-btn" 
                  :class="{ active: globalSettings.clockType === 'analog' }"
                  style="flex: 1; text-align: center;"
                  @click="() => { getGlobalSettings().clockType = 'analog'; saveGlobalSettings() }"
                >
                  Analog
                </button>
              </div>
            </div>
            <div class="routine-card__row" style="align-items: center; justify-content: space-between; margin-top: 16px; border-top: 1px solid var(--border-light); padding-top: 16px;">
              <div class="routine-card__field">
                <label class="field-label" style="font-size: 0.95rem; color: var(--text-primary-strong); margin: 0; text-transform: none; letter-spacing: normal;">Information Cycle Speed</label>
                <p class="helper-text" style="margin-top: 4px;">Set how fast the dashboard cycles through upcoming connections.</p>
              </div>
              <div style="display: flex; flex-direction: column; align-items: center; width: 200px; gap: 8px;">
                <input 
                  type="range" 
                  min="1" 
                  max="5" 
                  :value="displaySpeedNumber" 
                  @input="(e) => { displaySpeedNumber = parseInt((e.target as HTMLInputElement).value) }" 
                  class="premium-slider"
                  style="width: 100%;"
                />
                <span style="font-size: 0.85rem; color: var(--color-primary); font-weight: 600;">{{ currentDisplaySpeedLabel }}</span>
              </div>
            </div>
            <div class="routine-card__row" style="align-items: center; justify-content: space-between; margin-top: 16px; border-top: 1px solid var(--border-light); padding-top: 16px;">
              <div class="routine-card__field">
                <label class="field-label" style="font-size: 0.95rem; color: var(--text-primary-strong); margin: 0; text-transform: none; letter-spacing: normal;">Weather Location</label>
                <p class="helper-text" style="margin-top: 4px;">Set your default city for local weather updates.</p>
              </div>
              <div style="width: 200px;">
                <AddressAutocomplete 
                  v-model="globalSettings.weatherLocation"
                  placeholder="e.g. Linz, Austria"
                  @update:modelValue="saveGlobalSettings"
                />
              </div>
            </div>
            <div class="routine-card__row" style="align-items: center; justify-content: space-between; margin-top: 16px; border-top: 1px solid var(--border-light); padding-top: 16px;">
              <div class="routine-card__field">
                <label class="field-label" style="font-size: 0.95rem; color: var(--text-primary-strong); margin: 0; text-transform: none; letter-spacing: normal;">Theme Appearance</label>
                <p class="helper-text" style="margin-top: 4px;">Switch between light and dark mode, or set an automatic schedule.</p>
              </div>
              <div class="transport-segment" style="min-width: 200px; justify-content: center;">
                <button 
                  type="button"
                  class="segment-btn" 
                  :class="{ active: globalSettings.theme === 'light' }"
                  style="flex: 1; text-align: center;"
                  @click="() => { getGlobalSettings().theme = 'light'; saveGlobalSettings() }"
                >
                  <i class="fa-solid fa-sun" style="margin-right: 6px;"></i> Light
                </button>
                <button 
                  type="button"
                  class="segment-btn" 
                  :class="{ active: globalSettings.theme === 'dark' }"
                  style="flex: 1; text-align: center;"
                  @click="() => { getGlobalSettings().theme = 'dark'; saveGlobalSettings() }"
                >
                  <i class="fa-solid fa-moon" style="margin-right: 6px;"></i> Dark
                </button>
                <button 
                  type="button"
                  class="segment-btn" 
                  :class="{ active: globalSettings.theme === 'auto' }"
                  style="flex: 1; text-align: center;"
                  @click="() => { getGlobalSettings().theme = 'auto'; saveGlobalSettings() }"
                >
                  <i class="fa-solid fa-clock" style="margin-right: 6px;"></i> Auto
                </button>
              </div>
            </div>
            
            <div v-if="globalSettings.theme === 'auto'" class="routine-card__row" style="margin-top: 12px; align-items: center; justify-content: space-between; padding-top: 12px; border-top: 1px dashed var(--border-light);">
              <div class="routine-card__field">
                <label class="field-label" style="font-size: 0.85rem; color: var(--text-secondary);">Light Mode Starts</label>
                <TimePicker 
                  :model-value="globalSettings.themeSchedule?.light || '07:00'"
                  @update:model-value="(val) => { 
                    if (!globalSettings.themeSchedule) globalSettings.themeSchedule = { light: '07:00', dark: '19:00' };
                    globalSettings.themeSchedule.light = val;
                    saveGlobalSettings();
                  }"
                />
              </div>
              <div class="routine-card__field">
                <label class="field-label" style="font-size: 0.85rem; color: var(--text-secondary);">Dark Mode Starts</label>
                <TimePicker 
                  :model-value="globalSettings.themeSchedule?.dark || '19:00'"
                  @update:model-value="(val) => { 
                    if (!globalSettings.themeSchedule) globalSettings.themeSchedule = { light: '07:00', dark: '19:00' };
                    globalSettings.themeSchedule.dark = val;
                    saveGlobalSettings();
                  }"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="routines-section">
        <div class="routines-section-header">
          <h3><i class="fa-solid fa-clock" style="color: var(--color-primary); margin-right: 8px;"></i>Your Routines</h3>
          <button class="add-routine-btn-premium" @click="addNewRoutine">+ New Routine</button>
        </div>

        <div v-for="item in routines" :key="item.id" class="routine-card">
          <div class="routine-card__header">
            <div class="transport-segment">
              <button 
                type="button" 
                class="segment-btn" 
                :class="{ active: item.transportMode === 'bus' }"
                @click="item.transportMode = 'bus'; updateRoutineItem(item)"
              ><i class="fa-solid fa-bus" style="margin-right: 4px;"></i>Public Transport</button>
              <button 
                type="button" 
                class="segment-btn" 
                :class="{ active: item.transportMode === 'car' }"
                @click="item.transportMode = 'car'; updateRoutineItem(item)"
              ><i class="fa-solid fa-car" style="margin-right: 4px;"></i>Car</button>
            </div>
            <button class="delete-routine-btn" @click.prevent="removeRoutineItem(item.id)" aria-label="Delete routine">Delete</button>
          </div>

          <div class="routine-card__body">
            <div class="routine-card__section">
              <label class="field-label">Active on days</label>
              <div class="days-pill-container">
                <button 
                  v-for="(dayStr, idx) in daysOfWeek" 
                  :key="idx" 
                  class="day-pill" 
                  :class="{ 'day-pill--active': item.activeDays?.includes(idx) }"
                  @click="toggleDay(item, idx)"
                >
                  {{ dayStr }}
                </button>
              </div>
            </div>

            <div class="routine-card__section">
              <label class="field-label">Target Arrival Time</label>
              <p class="helper-text">The router will find a connection that gets you to the destination by this time.</p>
              <div class="routine-card__row" style="align-items: center; gap: 12px; margin-top: 4px; display: flex; width: 100%;">
                <TimePicker 
                  :model-value="item.arrivalTime"
                  @update:model-value="(val) => { 
                    item.arrivalTime = val;
                    if (item.startTime > val) item.startTime = val;
                    if (item.endTime < val) item.endTime = val;
                    updateRoutineItem(item);
                  }"
                />
                <button class="auto-configure-btn" @click="autoConfigure(item)" :disabled="item.transportMode !== 'bus'">
                  <i class="fa-solid fa-wand-magic-sparkles" style="margin-right: 6px;"></i>Auto-Configure
                </button>
              </div>
            </div>

            <div class="routine-card__section" style="margin-top: 8px;">
              <label class="field-label">Dashboard Visibility Window</label>
              <p class="helper-text">When should this routine be displayed on your dashboard?</p>
              <div class="routine-card__row" style="align-items: center; gap: 12px; margin-top: 4px;">
                <TimePicker 
                  :model-value="item.startTime"
                  :max-time="item.arrivalTime"
                  @update:model-value="(val) => { 
                    item.startTime = val;
                    updateRoutineItem(item);
                  }"
                />
                <span style="color: var(--text-muted); font-weight: 500;">to</span>
                <TimePicker 
                  :model-value="item.endTime"
                  :min-time="item.arrivalTime"
                  @update:model-value="(val) => { 
                    item.endTime = val;
                    updateRoutineItem(item);
                  }"
                />
              </div>
            </div>

            <div class="routine-card__section">
              <div class="routine-card__field">
                <label class="field-label">Start Address</label>
                <AddressAutocomplete 
                  :model-value="item.startAddress" 
                  @update:model-value="(val) => {
                    if (item.startAddress !== val) {
                      item.startAddress = val;
                      item.startCoords = undefined;
                      updateRoutineItem(item);
                    }
                  }"
                  placeholder="e.g. Central Station" 
                />
              </div>
              <div class="routine-card__field">
                <label class="field-label">Destination Address</label>
                <AddressAutocomplete 
                  :model-value="item.destination" 
                  @update:model-value="(val) => {
                    if (item.destination !== val) {
                      item.destination = val;
                      item.destCoords = undefined;
                      updateRoutineItem(item);
                    }
                  }"
                  placeholder="e.g. City Center" 
                />
              </div>
            </div>

            <div class="routine-card__section">
              <div class="alarms-header">
                <label class="field-label">Linked Alarms</label>
                <button class="add-alarm-btn" @click="addAlarm(item); updateRoutineItem(item)">+ Add Alarm</button>
              </div>
              <div class="alarms-list" v-if="item.alarms && item.alarms.length > 0">
                <div v-for="alarm in item.alarms" :key="alarm.id" class="alarm-pill">
                  <TimePicker 
                    :model-value="alarm.time"
                    @update:model-value="(val) => { alarm.time = val; updateRoutineItem(item) }"
                  />
                  <label class="alarm-toggle">
                    <input 
                      type="checkbox" 
                      :checked="alarm.enabled"
                      @change="(e) => { alarm.enabled = (e.target as HTMLInputElement).checked; updateRoutineItem(item) }"
                    />
                    <span class="slider"></span>
                  </label>
                  <button class="remove-alarm-btn" @click="removeAlarm(item, alarm.id); updateRoutineItem(item)"><i class="fa-solid fa-xmark"></i></button>
                </div>
              </div>
              <div v-else class="alarms-empty">No alarms set</div>
            </div>
          </div>
        </div>
      </section>



      <section class="routines-section">
        <div class="routines-section-header">
          <h3><i class="fa-solid fa-keyboard" style="color: var(--color-primary); margin-right: 8px;"></i>Hardware Keypad &amp; Knob Mapping</h3>
          <button type="button" class="add-routine-btn-premium" @click="resetKeymapToDefaults">
            Reset Defaults
          </button>
        </div>

        <div class="routine-card">
          <div class="routine-card__body" style="padding: 16px 20px; display: flex; flex-direction: column; gap: 12px;">
            <p class="helper-text" style="margin: 0 0 4px 0;">
              Click a key badge below, then press one of the 6 buttons or turn the rotary knob on your USB keypad to bind it. Double-press light or blind buttons (or click <b>Test</b> twice quickly) to jump straight to RGB, Brightness, or Slat Angle config. Press <b>Esc</b> to cancel learning.
            </p>

            <div
              v-for="(meta, idx) in OSD_ACTION_METADATA"
              :key="meta.action"
              class="routine-card__row"
              :style="{
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: idx > 0 ? '12px' : '0',
                borderTop: idx > 0 ? '1px solid var(--border-light)' : 'none',
              }"
            >
              <div class="routine-card__field" style="flex: 1; padding-right: 12px;">
                <label class="field-label" style="font-size: 0.92rem; color: var(--text-primary-strong); margin: 0; text-transform: none; letter-spacing: normal; display: flex; align-items: center; gap: 8px;">
                  <i :class="meta.icon" style="color: var(--color-primary); width: 16px; text-align: center;"></i>
                  {{ meta.label }}
                </label>
                <p class="helper-text" style="margin: 2px 0 0 24px;">{{ meta.description }}</p>
              </div>

              <div style="display: flex; align-items: center; gap: 8px;">
                <button
                  type="button"
                  class="segment-btn"
                  style="padding: 6px 10px; font-size: 0.8rem;"
                  title="Test this OSD action"
                  @click="triggerOsdAction(meta.action)"
                >
                  Test
                </button>
                <button
                  type="button"
                  class="add-routine-btn-premium"
                  :style="{
                    minWidth: '140px',
                    textAlign: 'center',
                    fontWeight: 700,
                    letterSpacing: '0.01em',
                    background: osdState.learningAction === meta.action ? 'var(--color-primary)' : 'var(--border-strong)',
                    color: osdState.learningAction === meta.action ? '#ffffff' : 'var(--text-primary-strong)',
                  }"
                  @click="toggleLearnAction(meta.action)"
                >
                  {{
                    osdState.learningAction === meta.action
                      ? 'Press key / knob...'
                      : osdState.keymap[meta.action]
                  }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="routines-section">
        <div class="routines-section-header">
          <h3><i class="fa-solid fa-calendar-day" style="color: var(--color-primary); margin-right: 8px;"></i>Integrations & Account</h3>
        </div>
        
        <div class="routine-card">
          <div class="routine-card__body">
            <!-- Commented out for now since the integration isn't fully ready.
            <div class="routine-card__row" style="align-items: center; justify-content: space-between;">
              <div class="routine-card__field">
                <label class="field-label">Google Calendar</label>
                <div style="font-size: 0.9rem; color: var(--text-secondary);">
                  <span v-if="loadingStatus">Loading status...</span>
                  <span v-else-if="googleConnected">Connected as <b>{{ googleEmail }}</b></span>
                  <span v-else>Not connected</span>
                </div>
              </div>
              <button class="add-routine-btn-premium" @click="connectGoogle">
                {{ googleConnected ? 'Reconnect' : 'Connect' }}
              </button>
            </div>
            
            <hr style="border: none; border-top: 1px solid var(--border-light); margin: 0;" />
            -->
            
            <div class="routine-card__row" style="align-items: center; justify-content: space-between;">
              <div class="routine-card__field">
                <label class="field-label">SmartHub Account</label>
                <div style="font-size: 0.9rem; color: var(--text-secondary);">Logged in on this device</div>
              </div>
              <button class="delete-routine-btn" @click="handleLogout">
                Logout
              </button>
            </div>
          </div>
        </div>
      </section>

      <p v-if="statusMessage" class="settings-status">{{ statusMessage }}</p>
    </div>

    <div class="settings-right"></div>
  </div>
</template>

<style scoped>
.toast-slide-enter-active, .toast-slide-leave-active {
  transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}
.toast-slide-enter-from, .toast-slide-leave-to {
  opacity: 0;
  transform: translate(-50%, -20px) scale(0.95);
}
.toast-slide-enter-to, .toast-slide-leave-from {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}

.ios-toast {
  position: fixed;
  top: 32px;
  left: 50%;
  transform: translateX(-50%);
  background: var(--bg-surface);
  padding: 12px 20px;
  border-radius: 999px;
  box-shadow: var(--shadow-overlay);
  display: flex;
  align-items: center;
  gap: 12px;
  z-index: 9999;
  border: 1px solid var(--border-base);
}

.ios-toast-icon {
  font-size: 1.2rem;
}

.ios-toast-text {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text-primary-strong);
  letter-spacing: -0.01em;
}

.auto-configure-btn {
  background: linear-gradient(135deg, var(--color-primary), #8b5cf6);
  color: white;
  border: none;
  border-radius: 12px;
  padding: 8px 14px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
  transition: transform 0.2s, box-shadow 0.2s;
  white-space: nowrap;
}
.auto-configure-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(99, 102, 241, 0.3);
}
.auto-configure-btn:active:not(:disabled) {
  transform: scale(0.95);
  box-shadow: 0 2px 6px rgba(99, 102, 241, 0.2);
  transition: transform 0.05s, box-shadow 0.05s;
}
.auto-configure-btn:disabled {
  background: var(--border-base);
  color: var(--text-light);
  box-shadow: none;
  cursor: not-allowed;
}

.settings-page {
  display: flex;
  justify-content: center;
  padding: 32px;
  align-items: flex-start;
  min-height: 100vh;
  overflow-y: auto;
}

.settings-left {
  width: 100%;
  max-width: 640px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  background: transparent;
  padding: 0;
  border-radius: 0;
  box-shadow: none;
  margin: 0 auto;
}

.settings-right {
  display: none
}

.day-selector, .global-setting {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 200px;
}

.premium-select {
  padding: 10px 36px 10px 14px;
  border-radius: 10px;
  border: 1px solid var(--border-base);
  background: var(--bg-surface-hover) url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234b5563' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e") no-repeat right 12px center;
  background-size: 16px;
  -webkit-appearance: none;
  appearance: none;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  color: var(--text-primary-strong);
  cursor: pointer;
  transition: all 0.2s;
}

.premium-select:hover {
  border-color: var(--border-strong);
  background-color: var(--border-light);
}

.premium-select:focus {
  outline: none;
  border-color: var(--color-primary);
  background-color: var(--bg-surface);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.premium-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--border-base);
  outline: none;
  transition: background 0.2s;
}

.premium-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  transition: transform 0.1s ease, background-color 0.2s;
}

.premium-slider::-webkit-slider-thumb:hover {
  transform: scale(1.2);
  background: #2563eb;
}

.premium-slider::-moz-range-thumb {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: var(--color-primary);
  cursor: pointer;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
  transition: transform 0.1s ease, background-color 0.2s;
}

.premium-slider::-moz-range-thumb:hover {
  transform: scale(1.2);
  background: #2563eb;
}

button {
  padding: 8px 12px;
  border-radius: 8px;
  border: none;
  background: var(--border-strong);
  color: var(--text-primary-strong);
  cursor: pointer;
}

.button-secondary {
  background: var(--text-muted);
}

.settings-page-header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
}

.settings-page-header h2 {
  font-size: 2rem;
  font-weight: 700;
  color: var(--text-primary-strong);
  margin: 0;
}

.back-btn-premium {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  color: var(--text-muted);
  border: none;
  font-size: 0.95rem;
  font-weight: 500;
  padding: 0;
  cursor: pointer;
  transition: color 0.2s;
  align-self: flex-start;
}

.back-btn-premium:hover {
  color: var(--text-primary-strong);
}

/* Constrain home location input width so it doesn't span the entire screen */
.home-input { max-width: 560px; width: 100%; display: block }

button:disabled {
  opacity: 0.6
}

.routines-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  max-width: 600px;
}

.routines-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: -8px;
}

.routines-section-header h3 {
  margin: 0;
  font-weight: 600;
  color: var(--text-primary-strong);
}

.add-routine-btn-premium {
  background: var(--border-strong);
  color: var(--text-primary-strong);
  padding: 8px 16px;
  border-radius: 20px;
  font-weight: 500;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.add-routine-btn-premium:hover {
  background: var(--text-primary-alt-2);
  transform: translateY(-1px);
}

.routine-card {
  background: var(--bg-surface);
  border-radius: 16px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-light);
  transition: all 0.2s ease;
}

.routine-card:hover {
  box-shadow: 0 8px 24px var(--shadow-widget);
}

.routine-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: var(--bg-surface-hover);
  border-bottom: 1px solid var(--border-light);
  border-top-left-radius: 15px;
  border-top-right-radius: 15px;
}

.transport-segment {
  display: flex;
  background: var(--border-base);
  border-radius: 8px;
  padding: 4px;
  gap: 4px;
}

.segment-btn {
  background: transparent;
  color: var(--text-muted);
  border: none;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 500;
  transition: all 0.2s;
  cursor: pointer;
}

.segment-btn.active {
  background: var(--bg-surface);
  color: var(--text-primary-strong);
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}

.delete-routine-btn {
  background: var(--border-light);
  color: var(--text-secondary);
  border: 1px solid var(--border-base);
  border-radius: 8px;
  font-weight: 500;
  font-size: 0.9rem;
  padding: 6px 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.delete-routine-btn:hover {
  background: var(--color-error);
  color: #ffffff;
  border-color: var(--color-error);
}

.routine-card__body {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.routine-card__section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.routine-card__row {
  display: flex;
  gap: 16px;
}

.routine-card__field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.helper-text {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.days-pill-container {
  display: flex;
  gap: 8px;
}

.day-pill {
  flex: 1;
  background: var(--border-light);
  color: var(--text-light);
  border: none;
  padding: 8px 0;
  border-radius: 8px;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.2s ease;
  cursor: pointer;
}

.day-pill--active {
  background: var(--border-strong);
  color: var(--text-primary-strong);
  box-shadow: 0 2px 4px var(--shadow-widget);
}

.alarms-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.add-alarm-btn {
  background: var(--border-light);
  color: var(--text-primary-alt-2);
  padding: 4px 12px;
  font-size: 0.8rem;
  border-radius: 12px;
}

.add-alarm-btn:hover {
  background: var(--border-base);
}

.alarms-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.alarm-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-base);
  padding: 6px 12px;
  border-radius: 12px;
}

.alarms-empty {
  font-size: 0.9rem;
  color: var(--text-light);
  font-style: italic;
}

.alarm-toggle {
  position: relative;
  display: inline-block;
  width: 32px;
  height: 18px;
}

.alarm-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.alarm-toggle .slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: var(--border-strong);
  transition: .3s;
  border-radius: 20px;
}

.alarm-toggle .slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 2px;
  bottom: 2px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}

.alarm-toggle input:checked + .slider {
  background-color: var(--weather-dest-color);
}

.alarm-toggle input:checked + .slider:before {
  transform: translateX(14px);
}

.remove-alarm-btn {
  background: transparent;
  color: var(--color-error);
  font-size: 1rem;
  padding: 0 4px;
}

.remove-alarm-btn:hover {
  color: var(--color-error-dark);
}

.settings-status {
  color: #2563eb;
}

.route-card {
  padding: 8px;
  border: 1px solid #eee;
  border-radius: 6px;
  margin-bottom: 8px
}

.error {
  color: var(--color-error-dark)
}
</style>
