<template>
  <Transition name="osd-fade">
    <div v-if="state.visible" class="osd-overlay" role="status" aria-live="polite">
      <div class="osd-card">
        <!-- Mode pill badge -->
        <div class="osd-header">
          <div class="osd-icon-badge" :style="iconBadgeStyle">
            <i :class="headerIcon"></i>
          </div>
          <div class="osd-titles">
            <div class="osd-title">{{ headerTitle }}</div>
            <div class="osd-subtitle">{{ headerSubtitle }}</div>
          </div>
          <div v-if="modeStepBadge" class="osd-step-pill">
            {{ modeStepBadge }}
          </div>
        </div>

        <!-- 1. Quick Toggle / Action Toast -->
        <div v-if="state.mode === 'TOAST'" class="osd-body osd-body--toast">
          <div class="osd-status-indicator" :class="{ 'osd-status-indicator--on': isToastDeviceOn }">
            <span class="osd-status-dot"></span>
            <span>{{ state.toastSubtitle }}</span>
          </div>
        </div>

        <!-- 2. RGB LED Color Mode -->
        <div v-else-if="state.mode === 'LED_COLOR'" class="osd-body">
          <div class="osd-rgb-row">
            <div
              class="osd-color-swatch"
              :style="{
                backgroundColor: state.ledHex,
                boxShadow: `0 0 24px ${state.ledHex}, inset 0 0 8px rgba(255,255,255,0.5)`,
              }"
            ></div>
            <div class="osd-spectrum-wrap">
              <div class="osd-spectrum-bar">
                <div
                  class="osd-spectrum-thumb"
                  :style="{ left: `${(state.ledHue / 360) * 100}%`, borderColor: state.ledHex }"
                ></div>
              </div>
              <div class="osd-meta-row">
                <span>Hue: {{ state.ledHue }}°</span>
                <span class="osd-mono">{{ state.ledHex.toUpperCase() }}</span>
              </div>
            </div>
          </div>
          <div class="osd-hint">
            <span><i class="fa-solid fa-rotate"></i> Turn knob to change color</span>
            <span><i class="fa-solid fa-sliders"></i> Press Button 2 for LED Brightness</span>
          </div>
        </div>

        <!-- 3. LED Brightness or Desk Lamp Brightness Mode -->
        <div
          v-else-if="state.mode === 'LED_BRIGHTNESS' || state.mode === 'DESK_BRIGHTNESS'"
          class="osd-body"
        >
          <div class="osd-progress-header">
            <span>Brightness</span>
            <span class="osd-value-large">{{ activeBrightness }}%</span>
          </div>
          <div class="osd-progress-track">
            <div
              class="osd-progress-fill"
              :style="{
                width: `${activeBrightness}%`,
                background:
                  state.mode === 'LED_BRIGHTNESS'
                    ? `linear-gradient(90deg, ${state.ledHex}, #ffffff)`
                    : 'linear-gradient(90deg, #f59e0b, #fde047)',
              }"
            ></div>
          </div>
          <div class="osd-hint">
            <span><i class="fa-solid fa-rotate"></i> Turn knob to dim (0–100%)</span>
            <span>
              <i class="fa-solid fa-sliders"></i>
              {{
                state.mode === 'LED_BRIGHTNESS'
                  ? 'Press Button 2 for Desk Brightness'
                  : 'Press Button 2 to Finish'
              }}
            </span>
          </div>
        </div>

        <!-- 4. Window Blind Slat Angle Mode -->
        <div v-else-if="state.mode === 'BLIND_ANGLE'" class="osd-body">
          <div class="osd-blind-layout">
            <div class="osd-blind-window" aria-label="Window blind slat angle preview">
              <div
                v-for="idx in 6"
                :key="idx"
                class="osd-blind-slat"
                :style="{
                  transform: `perspective(220px) rotateX(${slatTiltDegrees}deg)`,
                }"
              >
                <span class="osd-blind-slat-edge"></span>
              </div>
            </div>
            <div class="osd-blind-metrics">
              <div class="osd-value-large">{{ slatTiltDegrees }}°</div>
              <div class="osd-subtitle">{{ state.blindAngle }}% Slat Tilt</div>
              <div class="osd-progress-track osd-progress-track--compact">
                <div
                  class="osd-progress-fill osd-progress-fill--blind"
                  :style="{ width: `${state.blindAngle}%` }"
                ></div>
              </div>
              <div class="osd-slat-labels">
                <span>0° Open</span>
                <span>45° Half</span>
                <span>90° Closed</span>
              </div>
            </div>
          </div>
          <div class="osd-hint">
            <span><i class="fa-solid fa-rotate"></i> Turn knob to tilt blind slats</span>
            <span><i class="fa-solid fa-bars-staggered"></i> Press Button 7 to close</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useDeviceOsd } from '../composables/use-device-osd'

const { state, initDeviceOsd, destroyDeviceOsd } = useDeviceOsd()

onMounted(() => {
  initDeviceOsd()
})

onUnmounted(() => {
  destroyDeviceOsd()
})

const activeBrightness = computed(() =>
  state.value.mode === 'LED_BRIGHTNESS'
    ? state.value.ledBrightness
    : state.value.deskBrightness
)

const slatTiltDegrees = computed(() => Math.round((state.value.blindAngle / 100) * 90))

const isToastDeviceOn = computed(() => {
  const id = state.value.activeDeviceId
  if (!id) return false
  const dev = state.value.devices[id]
  if (!dev) return false
  if (dev.category === 'blind') return dev.state.lastAction === 'up' || dev.state.lastAction === 'down'
  return Boolean(dev.state.on)
})

const headerIcon = computed(() => {
  switch (state.value.mode) {
    case 'LED_COLOR':
      return 'fa-solid fa-palette'
    case 'LED_BRIGHTNESS':
      return 'fa-solid fa-sun'
    case 'DESK_BRIGHTNESS':
      return 'fa-solid fa-lamp'
    case 'BLIND_ANGLE':
      return 'fa-solid fa-bars-staggered'
    default:
      return state.value.toastIcon || 'fa-solid fa-bolt'
  }
})

const headerTitle = computed(() => {
  switch (state.value.mode) {
    case 'LED_COLOR':
      return 'LED Strip KZ West — RGB Color'
    case 'LED_BRIGHTNESS':
      return 'LED Strip KZ West — Brightness'
    case 'DESK_BRIGHTNESS':
      return 'Schreibtischlicht Arthur — Brightness'
    case 'BLIND_ANGLE':
      return 'Alle Jalousien KZ West — Slat Angle'
    default:
      return state.value.toastTitle || 'KZ West Smart Control'
  }
})

const headerSubtitle = computed(() => {
  switch (state.value.mode) {
    case 'LED_COLOR':
      return 'Rotary Knob Config • Step 1 of 3'
    case 'LED_BRIGHTNESS':
      return 'Rotary Knob Config • Step 2 of 3'
    case 'DESK_BRIGHTNESS':
      return 'Rotary Knob Config • Step 3 of 3'
    case 'BLIND_ANGLE':
      return 'Rotary Knob Config • Slat Tilt'
    default:
      return 'KZ West Hardware Control'
  }
})

const modeStepBadge = computed(() => {
  switch (state.value.mode) {
    case 'LED_COLOR':
      return '1 / 3'
    case 'LED_BRIGHTNESS':
      return '2 / 3'
    case 'DESK_BRIGHTNESS':
      return '3 / 3'
    case 'BLIND_ANGLE':
      return 'SLATS'
    default:
      return ''
  }
})

const iconBadgeStyle = computed(() => {
  if (state.value.mode === 'LED_COLOR' || state.value.mode === 'LED_BRIGHTNESS') {
    return {
      background: `${state.value.ledHex}28`,
      color: state.value.ledHex,
      borderColor: `${state.value.ledHex}66`,
    }
  }
  return {}
})
</script>

<style scoped>
.osd-overlay {
  position: fixed;
  bottom: 36px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  pointer-events: none;
  width: min(92vw, 480px);
}

.osd-card {
  background: rgba(18, 22, 32, 0.88);
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 24px;
  padding: 20px 24px;
  color: #f8fafc;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.osd-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.osd-icon-badge {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  background: rgba(99, 102, 241, 0.2);
  border: 1px solid rgba(99, 102, 241, 0.4);
  color: #818cf8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  flex-shrink: 0;
}

.osd-titles {
  flex: 1;
  min-width: 0;
}

.osd-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #ffffff;
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.osd-subtitle {
  font-size: 0.8rem;
  color: #94a3b8;
  margin-top: 2px;
}

.osd-step-pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.1);
  color: #e2e8f0;
  letter-spacing: 0.04em;
}

.osd-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.osd-body--toast {
  padding-top: 2px;
}

.osd-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  font-weight: 600;
  font-size: 0.95rem;
  color: #cbd5e1;
}

.osd-status-indicator--on {
  background: rgba(34, 197, 94, 0.16);
  color: #4ade80;
}

.osd-status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #64748b;
}

.osd-status-indicator--on .osd-status-dot {
  background: #22c55e;
  box-shadow: 0 0 10px #22c55e;
}

.osd-rgb-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.osd-color-swatch {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  border: 2px solid rgba(255, 255, 255, 0.75);
  flex-shrink: 0;
  transition: background-color 0.06s linear, box-shadow 0.06s linear;
}

.osd-spectrum-wrap {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.osd-spectrum-bar {
  position: relative;
  height: 16px;
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
  box-shadow: inset 0 1px 3px rgba(0, 0, 0, 0.4);
}

.osd-spectrum-thumb {
  position: absolute;
  top: 50%;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: #ffffff;
  border: 3px solid #00ff66;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
  transition: left 0.05s linear;
}

.osd-meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: #cbd5e1;
  font-weight: 600;
}

.osd-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.osd-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.85rem;
  color: #cbd5e1;
  font-weight: 600;
}

.osd-value-large {
  font-size: 1.5rem;
  font-weight: 800;
  color: #ffffff;
  letter-spacing: -0.02em;
}

.osd-progress-track {
  height: 14px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.osd-progress-track--compact {
  height: 10px;
  margin-top: 6px;
}

.osd-progress-fill {
  height: 100%;
  border-radius: 999px;
  transition: width 0.06s linear;
}

.osd-progress-fill--blind {
  background: linear-gradient(90deg, #38bdf8, #6366f1);
}

.osd-blind-layout {
  display: flex;
  align-items: center;
  gap: 20px;
}

.osd-blind-window {
  width: 120px;
  height: 104px;
  border-radius: 12px;
  border: 2px solid rgba(255, 255, 255, 0.22);
  background: linear-gradient(180deg, rgba(56, 189, 248, 0.18), rgba(15, 23, 42, 0.65));
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  flex-shrink: 0;
}

.osd-blind-slat {
  position: relative;
  height: 10px;
  border-radius: 3px;
  background: linear-gradient(180deg, #f8fafc 0%, #94a3b8 100%);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.35);
  transform-origin: center center;
  transition: transform 0.05s linear;
}

.osd-blind-slat-edge {
  display: block;
  width: 100%;
  height: 2px;
  background: rgba(255, 255, 255, 0.85);
}

.osd-blind-metrics {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.osd-slat-labels {
  display: flex;
  justify-content: space-between;
  font-size: 0.72rem;
  color: #94a3b8;
  margin-top: 4px;
}

.osd-hint {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  font-size: 0.75rem;
  color: #94a3b8;
}

.osd-fade-enter-active,
.osd-fade-leave-active {
  transition: opacity 0.22s ease, transform 0.22s cubic-bezier(0.16, 1, 0.3, 1);
}

.osd-fade-enter-from,
.osd-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 16px) scale(0.96);
}
</style>
