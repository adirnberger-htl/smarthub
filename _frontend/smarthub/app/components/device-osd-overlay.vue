<template>
  <Transition name="osd-fade">
    <div
      v-if="state.visible && state.mode !== 'IDLE'"
      class="osd-backdrop"
      role="status"
      aria-live="polite"
    >
      <div class="osd-hud" :class="{ 'osd-hud--toast': state.mode === 'TOAST' }">
        <div class="osd-hud__shell">
          <!-- Main Content Area -->
          <div class="osd-main">
            <!-- Header Row -->
            <div class="osd-header">
              <div class="osd-icon-badge" :style="iconBadgeStyle">
                <i :class="headerIcon"></i>
              </div>
              <div class="osd-titles">
                <div class="osd-eyebrow">{{ headerEyebrow }}</div>
                <div class="osd-title">{{ headerTitle }}</div>
              </div>

              <!-- Status Pill in TOAST Mode -->
              <div
                v-if="state.mode === 'TOAST'"
                class="osd-status-indicator"
                :class="{
                  'osd-status-indicator--on': isToastPositive,
                  'osd-status-indicator--scene': state.toastKind !== 'device',
                }"
              >
                <span class="osd-status-dot"></span>
                <span>{{ state.toastSubtitle }}</span>
              </div>

              <!-- Large Value Readout in Knob Config Slots -->
              <div v-else class="osd-metric-readout">
                <span class="osd-value-large">{{ activeMetricPrimary }}</span>
                <span v-if="activeMetricSecondary" class="osd-value-sub">
                  {{ activeMetricSecondary }}
                </span>
              </div>
            </div>

            <!-- 0. TOAST Body: Smart Light Scene Memory Chips or Quick State -->
            <div
              v-if="state.mode === 'TOAST' && state.sceneChips.length > 0"
              class="osd-scene-grid"
            >
              <div
                v-for="chip in state.sceneChips"
                :key="chip.id"
                class="osd-scene-chip"
                :class="{ 'osd-scene-chip--active': chip.active }"
              >
                <span
                  class="osd-scene-chip__dot"
                  :style="chip.color && chip.active ? { background: chip.color, boxShadow: `0 0 8px ${chip.color}` } : {}"
                ></span>
                <div class="osd-scene-chip__text">
                  <span class="osd-scene-chip__label">{{ chip.label }}</span>
                  <span class="osd-scene-chip__status">{{ chip.statusText }}</span>
                </div>
              </div>
            </div>

            <!-- 1. Blind Slat Angle Mode (3D Three.js Simulation) -->
            <div v-else-if="state.mode === 'blind_angle'" class="osd-body">
              <Blind3dViewport
                :slat-angle-percent="state.blindAngle"
                :environment="state.environment"
              />
              <div class="osd-progress-track osd-progress-track--slim">
                <div
                  class="osd-progress-fill osd-progress-fill--blind"
                  :style="{ width: `${state.blindAngle}%` }"
                ></div>
              </div>
              <div class="osd-scale-labels">
                <span>0° Open</span>
                <span>45° Half</span>
                <span>90° Closed</span>
              </div>
            </div>

            <!-- 2. LED Strip RGB Color Mode -->
            <div v-else-if="state.mode === 'led_rgb'" class="osd-body">
              <div class="osd-rgb-row">
                <div
                  class="osd-color-swatch"
                  :style="{
                    backgroundColor: state.ledHex,
                    boxShadow: `0 0 28px ${state.ledHex}77`,
                  }"
                ></div>
                <div class="osd-spectrum-wrap">
                  <div class="osd-spectrum-bar">
                    <div
                      class="osd-spectrum-thumb"
                      :style="{
                        left: `${(state.ledHue / 360) * 100}%`,
                        borderColor: state.ledHex,
                      }"
                    ></div>
                  </div>
                  <div class="osd-scale-labels">
                    <span>0° Red</span>
                    <span>120° Green</span>
                    <span>240° Blue</span>
                    <span>360°</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 3. Brightness Mode (Desk Light or LED Strip) -->
            <div
              v-else-if="
                state.mode === 'desk_brightness' || state.mode === 'led_brightness'
              "
              class="osd-body"
            >
              <div class="osd-progress-track">
                <div
                  class="osd-progress-fill"
                  :style="{
                    width: `${activeBrightness}%`,
                    background: brightnessFillGradient,
                  }"
                ></div>
              </div>
              <div class="osd-scale-labels">
                <span>0% Off</span>
                <span>50%</span>
                <span>100% Max</span>
              </div>
            </div>
          </div>

          <!-- Subtle Vertical 4-Segment Side Progress Rail (Knob Click Cycle) -->
          <!-- Only rendered when cycling knob configuration slots; hidden during pure button toasts -->
          <div
            v-if="state.mode !== 'TOAST'"
            class="osd-side-rail"
            aria-label="Knob configuration slot progress rail"
          >
            <div
              v-for="(slotKey, idx) in state.slotOrder"
              :key="slotKey"
              class="osd-rail-step"
              :class="{
                'osd-rail-step--active': state.activeSlotIndex === idx,
                'osd-rail-step--passed': idx < state.activeSlotIndex,
              }"
            >
              <div class="osd-rail-bar"></div>
              <div class="osd-rail-meta">
                <i :class="KNOB_SLOT_METADATA[slotKey].icon"></i>
                <span>{{ KNOB_SLOT_METADATA[slotKey].shortLabel }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Bottom Smooth Countdown Progress Bar -->
        <div class="osd-timer-track">
          <div
            :key="state.timerRevision"
            class="osd-timer-bar"
            :class="{ 'osd-timer-bar--animating': state.isCountingDown }"
          ></div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import {
  useDeviceOsd,
  KNOB_SLOT_METADATA,
} from '../composables/use-device-osd'
import Blind3dViewport from './blind-3d-viewport.vue'

const { state, activeDevice, initDeviceOsd, destroyDeviceOsd } = useDeviceOsd()

onMounted(() => {
  initDeviceOsd()
})

onUnmounted(() => {
  destroyDeviceOsd()
})

const activeBrightness = computed(() => {
  if (state.value.mode === 'led_brightness') {
    return state.value.ledBrightness
  }
  return state.value.deskBrightness
})

const brightnessFillGradient = computed(() => {
  if (state.value.mode === 'led_brightness') {
    return `linear-gradient(90deg, ${state.value.ledHex}, var(--color-primary))`
  }
  return 'linear-gradient(90deg, var(--color-primary), #f59e0b)'
})

const slatTiltDegrees = computed(() => Math.round((state.value.blindAngle / 100) * 90))

const isToastPositive = computed(() => {
  if (state.value.toastKind === 'scene_restored') return true
  if (state.value.toastKind === 'scene_saved') return false
  const dev = activeDevice.value
  if (!dev) return false
  if (dev.category === 'blind') {
    return dev.state.lastAction === 'up' || dev.state.lastAction === 'down'
  }
  return Boolean(dev.state.on)
})

const headerIcon = computed(() => {
  if (state.value.mode !== 'TOAST' && state.value.mode !== 'IDLE') {
    return KNOB_SLOT_METADATA[state.value.mode].icon
  }
  return state.value.toastIcon || 'fa-solid fa-bolt'
})

const headerEyebrow = computed(() => {
  if (state.value.mode !== 'TOAST' && state.value.mode !== 'IDLE') {
    return `SLOT ${state.value.activeSlotIndex + 1} OF ${state.value.slotOrder.length} • ${KNOB_SLOT_METADATA[state.value.mode].label.toUpperCase()}`
  }
  if (state.value.toastKind === 'scene_saved' || state.value.toastKind === 'scene_restored') {
    return 'BUTTON 6 • SMART LIGHT SCENE MEMORY'
  }
  return 'KZ WEST • HARDWARE CONTROL'
})

const headerTitle = computed(() => {
  switch (state.value.mode) {
    case 'blind_angle':
      return 'Alle Jalousien KZ West'
    case 'desk_brightness':
      return 'Schreibtischlicht Arthur'
    case 'led_rgb':
      return 'LED Strip KZ West — Color'
    case 'led_brightness':
      return 'LED Strip KZ West — Brightness'
    default:
      return state.value.toastTitle || 'KZ West Smart Control'
  }
})

const activeMetricPrimary = computed(() => {
  switch (state.value.mode) {
    case 'blind_angle':
      return `${slatTiltDegrees.value}°`
    case 'desk_brightness':
    case 'led_brightness':
      return `${activeBrightness.value}%`
    case 'led_rgb':
      return `${state.value.ledHue}°`
    default:
      return ''
  }
})

const activeMetricSecondary = computed(() => {
  switch (state.value.mode) {
    case 'blind_angle':
      return `${state.value.blindAngle}% Tilt`
    case 'led_rgb':
      return state.value.ledHex.toUpperCase()
    default:
      return ''
  }
})

const iconBadgeStyle = computed(() => {
  if (state.value.mode === 'led_rgb' || state.value.mode === 'led_brightness') {
    return {
      background: `${state.value.ledHex}22`,
      color: state.value.ledHex,
      borderColor: `${state.value.ledHex}55`,
    }
  }
  return {}
})
</script>

<style scoped>
.osd-backdrop {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 10000;
  pointer-events: none;
  width: min(92vw, 680px);
  font-family: var(--font-sans);
}

.osd-hud {
  background: var(--bg-surface);
  border: 1.5px solid var(--border-strong);
  border-radius: 26px;
  color: var(--text-primary);
  box-shadow: 0 28px 70px rgba(15, 23, 42, 0.35), 0 6px 20px rgba(15, 23, 42, 0.18);
  overflow: hidden;
  transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease;
}

.osd-hud__shell {
  display: flex;
  align-items: stretch;
  padding: 28px 24px 26px 30px;
  gap: 24px;
}

.osd-hud--toast .osd-hud__shell {
  padding: 26px 30px;
}

.osd-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 22px;
}

.osd-header {
  display: flex;
  align-items: center;
  gap: 18px;
}

.osd-icon-badge {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  background: var(--bg-primary-light);
  border: 1px solid var(--border-base);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.65rem;
  flex-shrink: 0;
}

.osd-titles {
  flex: 1;
  min-width: 0;
}

.osd-eyebrow {
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: var(--color-primary);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.osd-title {
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--text-primary-strong);
  letter-spacing: -0.02em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.osd-metric-readout {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  flex-shrink: 0;
}

.osd-value-large {
  font-size: 2.15rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary-strong);
  letter-spacing: -0.03em;
}

.osd-value-sub {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--text-muted);
  margin-top: 4px;
  font-variant-numeric: tabular-nums;
}

.osd-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-base);
  font-weight: 700;
  font-size: 1.02rem;
  color: var(--text-secondary);
  white-space: nowrap;
  flex-shrink: 0;
}

.osd-status-indicator--on {
  background: var(--weather-dest-bg);
  border-color: transparent;
  color: var(--weather-dest-color);
}

.osd-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-light);
}

.osd-status-indicator--on .osd-status-dot {
  background: var(--weather-dest-color);
  box-shadow: 0 0 10px var(--weather-dest-color);
}

/* ── Smart Light Scene Memory Grid (Button 6) ── */
.osd-scene-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.osd-scene-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 14px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-base);
  opacity: 0.7;
}

.osd-scene-chip--active {
  opacity: 1;
  border-color: var(--border-strong);
  background: var(--bg-surface-active);
}

.osd-scene-chip__dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-light);
  flex-shrink: 0;
}

.osd-scene-chip--active .osd-scene-chip__dot {
  background: var(--color-primary);
}

.osd-scene-chip__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.osd-scene-chip__label {
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--text-primary-strong);
}

.osd-scene-chip__status {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Knob Mode Bodies ── */
.osd-body {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.osd-rgb-row {
  display: flex;
  align-items: center;
  gap: 20px;
}

.osd-color-swatch {
  width: 68px;
  height: 68px;
  border-radius: 18px;
  border: 2px solid var(--border-strong);
  flex-shrink: 0;
  transition: background-color 0.06s linear, box-shadow 0.06s linear;
}

.osd-spectrum-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.osd-spectrum-bar {
  position: relative;
  height: 22px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    #ff0000 0%,
    #ffff00 17%,
    #00ff00 33%,
    #00ffff 50%,
    #0000ff 67%,
    #ff00ff 83%,
    #ff0000 100%
  );
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.3);
}

.osd-spectrum-thumb {
  position: absolute;
  top: 50%;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #ffffff;
  border: 4px solid #00ff66;
  transform: translate(-50%, -50%);
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
  transition: left 0.05s linear;
}

.osd-progress-track {
  height: 20px;
  border-radius: 999px;
  background: var(--border-base);
  overflow: hidden;
}

.osd-progress-track--slim {
  height: 12px;
}

.osd-progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.06s linear;
}

.osd-progress-fill--blind {
  background: linear-gradient(90deg, var(--color-primary), var(--transit-train));
}

.osd-scale-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--text-muted);
}

/* ── Subtle Vertical 4-Segment Side Progress Rail ── */
.osd-side-rail {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 8px;
  padding-left: 18px;
  border-left: 1px solid var(--border-base);
  width: 76px;
  flex-shrink: 0;
}

.osd-rail-step {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 24px;
  opacity: 0.42;
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.osd-rail-step--passed {
  opacity: 0.68;
}

.osd-rail-step--active {
  opacity: 1;
  transform: translateX(-2px);
}

.osd-rail-bar {
  width: 6px;
  height: 100%;
  min-height: 20px;
  border-radius: 999px;
  background: var(--border-strong);
  transition: background-color 0.2s ease, box-shadow 0.2s ease, width 0.2s ease;
}

.osd-rail-step--passed .osd-rail-bar {
  background: var(--color-primary);
  opacity: 0.55;
}

.osd-rail-step--active .osd-rail-bar {
  width: 8px;
  background: var(--color-primary);
  box-shadow: 0 0 12px var(--color-primary);
}

.osd-rail-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.03em;
  color: var(--text-secondary);
}

.osd-rail-step--active .osd-rail-meta {
  color: var(--color-primary);
}

/* ── Bottom Smooth Countdown Bar ── */
.osd-timer-track {
  width: 100%;
  height: 4px;
  background: var(--border-light);
  overflow: hidden;
}

.osd-timer-bar {
  width: 100%;
  height: 100%;
  background: var(--color-primary);
  transform-origin: left center;
  transform: scaleX(1);
}

.osd-timer-bar--animating {
  animation: osd-countdown 2.4s linear forwards;
}

@keyframes osd-countdown {
  from {
    transform: scaleX(1);
  }
  to {
    transform: scaleX(0);
  }
}

.osd-fade-enter-active,
.osd-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.osd-fade-enter-from,
.osd-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -46%) scale(0.95);
}
</style>
