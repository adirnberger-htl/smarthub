<script setup lang="ts">
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useDevStatus } from '../composables/use-dev-status'
import { useDeviceOsd } from '../composables/use-device-osd'

const route = useRoute()
const {
  devStatus,
  loading,
  error,
  latencyMs,
  isLeftCollapsed,
  isRightCollapsed,
  refresh,
  toggleLeftCollapse,
  toggleRightCollapse,
} = useDevStatus()

const { state: osdState } = useDeviceOsd()
const sseConnected = computed(() => osdState.value.sseConnected)

const isSettingsRoute = computed(() => route.path === '/settings')

const now = ref(Date.now())
let clockTimer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  clockTimer = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
})

function formatTimeAgo(isoString: string | null | undefined): string {
  if (!isoString) return 'never'
  const diffSec = Math.max(0, Math.floor((now.value - new Date(isoString).getTime()) / 1000))
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.floor(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  return `${Math.floor(diffMin / 60)}h ago`
}

const knx = computed(() => devStatus.value?.knx)
const apis = computed(() => devStatus.value?.apis)

const knxStatusType = computed<'ok' | 'error' | 'mock'>(() => {
  if (!knx.value) return 'mock'
  if (!knx.value.enabled) return 'mock'
  return knx.value.connected ? 'ok' : 'error'
})

const knxStatusLabel = computed(() => {
  if (!knx.value) return 'DISCONNECTED'
  if (!knx.value.enabled) return 'MOCK'
  return knx.value.connected ? 'ONLINE' : 'DISCONNECTED'
})

const healthyApiCount = computed(() => {
  if (!apis.value) return 0
  let count = 0
  if (apis.value.backend.status === 'ok') count++
  if (apis.value.csaTransit.ready) count++
  if (apis.value.weather.status === 'ok') count++
  if (apis.value.googlePlaces.status === 'ok') count++
  if (apis.value.googleAuth.connected) count++
  return count
})
</script>

<template>
  <div class="dev-overlay-container">
    <!-- TOP-LEFT: KNX ROUTER HUD -->
    <div
      class="dev-hud-card dev-hud-card--left"
      :class="{ 'dev-hud-card--collapsed': isLeftCollapsed }"
    >
      <div class="dev-hud-header" @click="toggleLeftCollapse">
        <div class="dev-hud-header__title">
          <span class="status-dot" :class="`status-dot--${knxStatusType}`"></span>
          KNX ROUTER
        </div>
        <button class="dev-hud-toggle-btn" :title="isLeftCollapsed ? 'Expand' : 'Collapse'">
          {{ isLeftCollapsed ? '+' : '–' }}
        </button>
      </div>

      <!-- Collapsed pill contents -->
      <div v-if="isLeftCollapsed" class="dev-hud-pill-body" @click="toggleLeftCollapse">
        <span class="badge" :class="`badge--${knxStatusType}`">{{ knxStatusLabel }}</span>
        <span class="hud-meta">{{ knx?.physAddr || '1.2.6' }}</span>
      </div>

      <!-- Expanded details -->
      <div v-else class="dev-hud-body">
        <div class="dev-hud-row">
          <span class="hud-label">STATE:</span>
          <span class="badge" :class="`badge--${knxStatusType}`">{{ knxStatusLabel }}</span>
        </div>
        <div class="dev-hud-row">
          <span class="hud-label">TARGET:</span>
          <span class="hud-value">{{ knx?.multicastIp || '224.0.23.12' }}:{{ knx?.port || 3671 }}</span>
        </div>
        <div class="dev-hud-row">
          <span class="hud-label">PHYS ADDR:</span>
          <span class="hud-value">{{ knx?.physAddr || '1.2.6' }}</span>
        </div>
        <div class="dev-hud-row">
          <span class="hud-label">SSE STREAM:</span>
          <span class="badge" :class="sseConnected ? 'badge--cyan' : 'badge--error'">
            {{ sseConnected ? 'ACTIVE' : 'RECONNECTING' }}
          </span>
        </div>
        <div class="dev-hud-row">
          <span class="hud-label">TELEGRAM:</span>
          <span class="hud-value hud-value--accent">{{ formatTimeAgo(knx?.lastTelegram) }}</span>
        </div>
      </div>
    </div>

    <!-- TOP-RIGHT: API HEALTH HUD -->
    <div
      class="dev-hud-card dev-hud-card--right"
      :class="{
        'dev-hud-card--collapsed': isRightCollapsed,
        'dev-hud-card--settings-offset': isSettingsRoute,
      }"
    >
      <div class="dev-hud-header" @click="toggleRightCollapse">
        <div class="dev-hud-header__title">
          <span class="status-dot" :class="healthyApiCount >= 4 ? 'status-dot--ok' : 'status-dot--mock'"></span>
          API STATUS
        </div>
        <div class="dev-hud-header__actions">
          <button class="dev-hud-refresh-btn" @click.stop="refresh" :disabled="loading" title="Refresh diagnostics">
            <i class="fa-solid fa-arrows-rotate" :class="{ 'fa-spin': loading }"></i>
          </button>
          <button class="dev-hud-toggle-btn" :title="isRightCollapsed ? 'Expand' : 'Collapse'">
            {{ isRightCollapsed ? '+' : '–' }}
          </button>
        </div>
      </div>

      <!-- Collapsed pill contents -->
      <div v-if="isRightCollapsed" class="dev-hud-pill-body" @click="toggleRightCollapse">
        <span class="badge" :class="healthyApiCount >= 4 ? 'badge--ok' : 'badge--mock'">
          {{ healthyApiCount }}/5 OK
        </span>
        <span class="hud-meta">{{ latencyMs }}ms</span>
      </div>

      <!-- Expanded details -->
      <div v-else class="dev-hud-body">
        <!-- Backend -->
        <div class="dev-hud-row">
          <span class="hud-label">BACKEND:</span>
          <span class="hud-value">{{ latencyMs }}ms</span>
          <span class="badge badge--ok">200 OK</span>
        </div>

        <!-- CSA Transit -->
        <div class="dev-hud-row">
          <span class="hud-label">CSA GTFS:</span>
          <span class="hud-value">{{ apis?.csaTransit.backend || 'in-memory' }}</span>
          <span class="badge" :class="apis?.csaTransit.ready ? 'badge--ok' : 'badge--mock'">
            {{ apis?.csaTransit.ready ? 'READY' : 'LOADING' }}
          </span>
        </div>

        <!-- Weather -->
        <div class="dev-hud-row">
          <span class="hud-label">WEATHER:</span>
          <span class="hud-value">Open-Meteo</span>
          <span class="badge" :class="apis?.weather.status === 'ok' ? 'badge--ok' : 'badge--error'">
            {{ apis?.weather.status === 'ok' ? 'CACHED' : 'ERR' }}
          </span>
        </div>

        <!-- Places / Geocoding -->
        <div class="dev-hud-row">
          <span class="hud-label">GEOCODE:</span>
          <span class="hud-value">Google Maps</span>
          <span class="badge" :class="apis?.googlePlaces.keyConfigured ? 'badge--ok' : 'badge--error'">
            {{ apis?.googlePlaces.keyConfigured ? 'KEY SET' : 'NO KEY' }}
          </span>
        </div>

        <!-- Google Auth -->
        <div class="dev-hud-row">
          <span class="hud-label">GOOGLE:</span>
          <span class="hud-value">{{ apis?.googleAuth.connected ? 'OAuth' : 'Unlinked' }}</span>
          <span class="badge" :class="apis?.googleAuth.connected ? 'badge--ok' : 'badge--mock'">
            {{ apis?.googleAuth.connected ? 'LINKED' : 'NONE' }}
          </span>
        </div>

        <div v-if="error" class="dev-hud-error">
          {{ error }}
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dev-overlay-container {
  pointer-events: none;
  position: fixed;
  inset: 0;
  z-index: 9500;
  overflow: hidden;
}

.dev-hud-card {
  pointer-events: auto;
  position: fixed;
  background: rgba(8, 10, 16, 0.94);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  color: #ffffff;
  font-family: ui-monospace, SFMono-Regular, "Roboto Mono", Menlo, Consolas, monospace;
  font-size: 11px;
  line-height: 1.4;
  user-select: none;
  transition: right 0.25s ease, opacity 0.2s ease, transform 0.2s ease;
  min-width: 230px;
}

.dev-hud-card--left {
  top: 14px;
  left: 14px;
  border-left: 3px solid #00ff66;
}

.dev-hud-card--right {
  top: 14px;
  right: 14px;
  border-right: 3px solid #00e5ff;
}

/* Offset top-right HUD on settings page to prevent colliding with ProfileButton (top: 24px; right: 24px) */
.dev-hud-card--settings-offset {
  right: 84px !important;
}

.dev-hud-card--collapsed {
  min-width: auto;
}

.dev-hud-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.12);
  cursor: pointer;
  letter-spacing: 0.05em;
  font-weight: 700;
}

.dev-hud-header__title {
  display: flex;
  align-items: center;
  gap: 6px;
  color: #e2e8f0;
}

.dev-hud-header__actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dev-hud-toggle-btn,
.dev-hud-refresh-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 11px;
  font-weight: bold;
  padding: 2px 4px;
  border-radius: 3px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s ease, background 0.15s ease;
}

.dev-hud-toggle-btn:hover,
.dev-hud-refresh-btn:hover {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.dev-hud-pill-body {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  cursor: pointer;
}

.dev-hud-body {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 10px;
}

.dev-hud-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hud-label {
  color: #94a3b8;
  font-weight: 600;
}

.hud-value {
  color: #ffffff;
  font-weight: 500;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.hud-value--accent {
  color: #38bdf8;
}

.hud-meta {
  color: #94a3b8;
  font-size: 10px;
}

/* Status dots */
.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  display: inline-block;
}

.status-dot--ok {
  background: #00ff66;
  box-shadow: 0 0 6px #00ff66;
}

.status-dot--error {
  background: #ff0055;
  box-shadow: 0 0 6px #ff0055;
}

.status-dot--mock {
  background: #ffd600;
  box-shadow: 0 0 6px #ffd600;
}

/* Badges */
.badge {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9px;
  font-weight: 800;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.badge--ok {
  color: #00ff66;
  background: rgba(0, 255, 102, 0.16);
  border: 1px solid #00ff66;
}

.badge--error {
  color: #ff0055;
  background: rgba(255, 0, 85, 0.18);
  border: 1px solid #ff0055;
}

.badge--mock {
  color: #ffd600;
  background: rgba(255, 214, 0, 0.18);
  border: 1px solid #ffd600;
}

.badge--cyan {
  color: #00e5ff;
  background: rgba(0, 229, 255, 0.18);
  border: 1px solid #00e5ff;
}

.dev-hud-error {
  margin-top: 4px;
  padding: 4px;
  background: rgba(255, 0, 85, 0.15);
  border: 1px solid #ff0055;
  border-radius: 4px;
  color: #ff85a1;
  font-size: 10px;
}
</style>
