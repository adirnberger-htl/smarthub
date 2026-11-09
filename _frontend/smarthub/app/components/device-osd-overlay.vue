<template>
  <Transition name="osd-fade">
    <div
      v-if="state.visible && state.mode !== 'IDLE'"
      class="osd-overlay"
      :class="{ 'osd-overlay--compact': state.mode === 'TOAST' }"
      role="status"
      aria-live="polite"
    >
      <!-- Option B: Compact Single-Row Pill for Quick Toggles / Blind Moves -->
      <div v-if="state.mode === 'TOAST'" class="osd-pill">
        <div class="osd-pill__icon">
          <i :class="headerIcon"></i>
        </div>
        <div class="osd-pill__info">
          <span class="osd-pill__title">{{ headerTitle }}</span>
          <span v-if="toastKnobHint" class="osd-pill__hint">
            <i class="fa-solid fa-rotate"></i> {{ toastKnobHint }}
          </span>
        </div>
        <div
          class="osd-status-indicator"
          :class="{ 'osd-status-indicator--on': isToastDeviceOn }"
        >
          <span class="osd-status-dot"></span>
          <span>{{ state.toastSubtitle }}</span>
        </div>
      </div>

      <!-- Expanded Widget Card for Interactive Rotary Knob Modes -->
      <div v-else class="osd-card">
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

        <!-- 1. RGB Color Mode (All Lights or Individual Light) -->
        <div
          v-if="state.mode === 'ALL_RGB' || state.mode === 'DEVICE_RGB'"
          class="osd-body"
        >
          <div class="osd-rgb-row">
            <div
              class="osd-color-swatch"
              :style="{
                backgroundColor: state.ledHex,
                boxShadow: `0 0 18px ${state.ledHex}66`,
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
              <div class="osd-meta-row">
                <span>Hue: {{ state.ledHue }}°</span>
                <span class="osd-mono">{{ state.ledHex.toUpperCase() }}</span>
              </div>
            </div>
          </div>
          <div class="osd-hint">
            <span><i class="fa-solid fa-rotate"></i> Turn knob to change color</span>
            <span>
              <i class="fa-solid fa-sliders"></i>
              {{
                state.mode === 'ALL_RGB'
                  ? 'Press Button 2 for All Brightness'
                  : 'Press light button for Brightness'
              }}
            </span>
          </div>
        </div>

        <!-- 2. Brightness Mode (All Lights or Individual Light) -->
        <div
          v-else-if="
            state.mode === 'ALL_BRIGHTNESS' || state.mode === 'DEVICE_BRIGHTNESS'
          "
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
                background: brightnessFillGradient,
              }"
            ></div>
          </div>
          <div class="osd-hint">
            <span><i class="fa-solid fa-rotate"></i> Turn knob to dim (0–100%)</span>
            <span>
              <i class="fa-solid fa-check"></i>
              {{
                state.mode === 'ALL_BRIGHTNESS'
                  ? 'Press Button 2 to Finish'
                  : 'Press light button to Finish'
              }}
            </span>
          </div>
        </div>

        <!-- 3. Window Blind Slat Angle Mode -->
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
            <span><i class="fa-solid fa-check"></i> Press Blind button to Finish</span>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'
import { useDeviceOsd } from '../composables/use-device-osd'

const { state, activeDevice, initDeviceOsd, destroyDeviceOsd } = useDeviceOsd()

onMounted(() => {
  initDeviceOsd()
})

onUnmounted(() => {
  destroyDeviceOsd()
})

const activeBrightness = computed(() => {
  if (state.value.mode === 'ALL_BRIGHTNESS') {
    return state.value.groupBrightness
  }
  if (state.value.activeDeviceId === 'room-leds') {
    return state.value.ledBrightness
  }
  return state.value.deskBrightness
})

const brightnessFillGradient = computed(() => {
  if (
    state.value.mode === 'DEVICE_BRIGHTNESS' &&
    state.value.activeDeviceId === 'room-leds'
  ) {
    return `linear-gradient(90deg, ${state.value.ledHex}, var(--color-primary))`
  }
  return 'linear-gradient(90deg, var(--color-primary), #f59e0b)'
})

const slatTiltDegrees = computed(() => Math.round((state.value.blindAngle / 100) * 90))

const isToastDeviceOn = computed(() => {
  const dev = activeDevice.value
  if (!dev) return false
  if (dev.category === 'blind') {
    return dev.state.lastAction === 'up' || dev.state.lastAction === 'down'
  }
  return Boolean(dev.state.on)
})

const toastKnobHint = computed(() => {
  const dev = activeDevice.value
  if (!dev) return ''
  if (dev.category === 'blind' && dev.capabilities.includes('blind_angle')) {
    return 'Turn knob for Slat Angle'
  }
  if (dev.category === 'light' && dev.state.on) {
    if (dev.capabilities.includes('rgb')) return 'Turn knob for RGB'
    if (dev.capabilities.includes('brightness')) return 'Turn knob for Brightness'
  }
  return ''
})

const headerIcon = computed(() => {
  switch (state.value.mode) {
    case 'ALL_RGB':
    case 'DEVICE_RGB':
      return 'fa-solid fa-palette'
    case 'ALL_BRIGHTNESS':
      return 'fa-solid fa-sun'
    case 'DEVICE_BRIGHTNESS':
      return state.value.activeDeviceId === 'desk-light'
        ? 'fa-solid fa-lamp'
        : 'fa-solid fa-sun'
    case 'BLIND_ANGLE':
      return 'fa-solid fa-bars-staggered'
    default:
      return state.value.toastIcon || 'fa-solid fa-bolt'
  }
})

const headerTitle = computed(() => {
  switch (state.value.mode) {
    case 'ALL_RGB':
      return 'All Room Lights — RGB Color'
    case 'ALL_BRIGHTNESS':
      return 'All Room Lights — Brightness'
    case 'DEVICE_RGB':
      return `${activeDevice.value?.name || 'LED Strip KZ West'} — RGB Color`
    case 'DEVICE_BRIGHTNESS':
      return `${activeDevice.value?.name || 'Schreibtischlicht Arthur'} — Brightness`
    case 'BLIND_ANGLE':
      return 'Alle Jalousien KZ West — Slat Angle'
    default:
      return state.value.toastTitle || 'KZ West Smart Control'
  }
})

const headerSubtitle = computed(() => {
  switch (state.value.mode) {
    case 'ALL_RGB':
      return 'Group Light Config • Step 1 of 2'
    case 'ALL_BRIGHTNESS':
      return 'Group Light Config • Step 2 of 2 (LEDs + Desk)'
    case 'DEVICE_RGB':
      return 'Individual Light Config • Step 1 of 2'
    case 'DEVICE_BRIGHTNESS':
      return activeDevice.value?.capabilities.includes('rgb')
        ? 'Individual Light Config • Step 2 of 2'
        : 'Individual Light Config • Brightness'
    case 'BLIND_ANGLE':
      return 'Rotary Knob Config • Slat Tilt'
    default:
      return 'KZ West Hardware Control'
  }
})

const modeStepBadge = computed(() => {
  switch (state.value.mode) {
    case 'ALL_RGB':
    case 'DEVICE_RGB':
      return '1 / 2'
    case 'ALL_BRIGHTNESS':
      return '2 / 2'
    case 'DEVICE_BRIGHTNESS':
      return activeDevice.value?.capabilities.includes('rgb') ? '2 / 2' : 'DIM'
    case 'BLIND_ANGLE':
      return 'SLATS'
    default:
      return ''
  }
})

const iconBadgeStyle = computed(() => {
  if (state.value.mode === 'ALL_RGB' || state.value.mode === 'DEVICE_RGB') {
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
.osd-overlay {
  position: fixed;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  pointer-events: none;
  width: min(92vw, 480px);
  font-family: var(--font-sans);
}

.osd-overlay--compact {
  width: auto;
  max-width: min(92vw, 520px);
}

/* ── Option B: Compact Single-Row Pill (TOAST Mode) ── */
.osd-pill {
  background: var(--bg-surface);
  border: 1px solid var(--border-base);
  border-radius: 999px;
  padding: 10px 14px 10px 12px;
  color: var(--text-primary);
  box-shadow: var(--shadow-overlay);
  display: inline-flex;
  align-items: center;
  gap: 12px;
  transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease;
}

.osd-pill__icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--bg-primary-light);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1rem;
  flex-shrink: 0;
}

.osd-pill__info {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding-right: 4px;
}

.osd-pill__title {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary-strong);
  white-space: nowrap;
}

.osd-pill__hint {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--text-muted);
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

/* ── Expanded Widget Card (Rotary Knob Modes) ── */
.osd-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-base);
  border-radius: 16px;
  padding: 20px 24px;
  color: var(--text-primary);
  box-shadow: var(--shadow-overlay);
  display: flex;
  flex-direction: column;
  gap: 16px;
  transition: background-color 0.25s ease, border-color 0.25s ease, color 0.25s ease;
}

.osd-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.osd-icon-badge {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--bg-primary-light);
  border: 1px solid var(--border-base);
  color: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.2rem;
  flex-shrink: 0;
}

.osd-titles {
  flex: 1;
  min-width: 0;
}

.osd-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--text-primary-strong);
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.osd-subtitle {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.osd-step-pill {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  background: var(--bg-primary-light);
  color: var(--color-primary);
  letter-spacing: 0.04em;
}

.osd-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.osd-status-indicator {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--bg-surface-hover);
  border: 1px solid var(--border-base);
  font-weight: 600;
  font-size: 0.85rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.osd-status-indicator--on {
  background: var(--weather-dest-bg);
  border-color: transparent;
  color: var(--weather-dest-color);
}

.osd-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-light);
}

.osd-status-indicator--on .osd-status-dot {
  background: var(--weather-dest-color);
  box-shadow: 0 0 8px var(--weather-dest-color);
}

.osd-rgb-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.osd-color-swatch {
  width: 48px;
  height: 48px;
  border-radius: 12px;
  border: 2px solid var(--border-strong);
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
  height: 14px;
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
  box-shadow: inset 0 1px 2px rgba(0, 0, 0, 0.25);
}

.osd-spectrum-thumb {
  position: absolute;
  top: 50%;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffffff;
  border: 3px solid #00ff66;
  transform: translate(-50%, -50%);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
  transition: left 0.05s linear;
}

.osd-meta-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--text-secondary);
  font-weight: 600;
}

.osd-mono {
  font-family: var(--font-sans);
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.02em;
}

.osd-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 0.85rem;
  color: var(--text-secondary);
  font-weight: 700;
}

.osd-value-large {
  font-size: 1.5rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  color: var(--text-primary-strong);
  letter-spacing: -0.02em;
}

.osd-progress-track {
  height: 12px;
  border-radius: 999px;
  background: var(--border-base);
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
  background: linear-gradient(90deg, var(--color-primary), var(--transit-train));
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
  border: 1px solid var(--border-strong);
  background: var(--blind-window-bg);
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
  background: var(--blind-slat-bg);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transform-origin: center center;
  transition: transform 0.05s linear;
}

.osd-blind-slat-edge {
  display: block;
  width: 100%;
  height: 2px;
  background: var(--blind-slat-edge);
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
  color: var(--text-muted);
  margin-top: 4px;
}

.osd-hint {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding-top: 10px;
  border-top: 1px solid var(--border-light);
  font-size: 0.75rem;
  color: var(--text-muted);
}

.osd-fade-enter-active,
.osd-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

.osd-fade-enter-from,
.osd-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 14px) scale(0.97);
}
</style>
