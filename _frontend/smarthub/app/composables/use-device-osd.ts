import { computed } from 'vue'
import { useState } from '#app'
import {
  useSmarthubApi,
  type SmartDeviceDTO,
  type DeviceCommandDTO,
} from './use-smarthub-api'

export type OsdMode =
  | 'IDLE'
  | 'TOAST'
  | 'ALL_RGB'
  | 'ALL_BRIGHTNESS'
  | 'DEVICE_RGB'
  | 'DEVICE_BRIGHTNESS'
  | 'BLIND_ANGLE'

export type OsdHardwareAction =
  | 'btn1_main_light'
  | 'btn2_light_mode'
  | 'btn3_room_leds'
  | 'btn4_desk_light'
  | 'btn5_blinds_up'
  | 'btn6_blinds_down'
  | 'knob_cw'
  | 'knob_ccw'

export type OsdKeymap = Record<OsdHardwareAction, string>

export const OSD_KEYMAP_STORAGE_KEY = 'smarthub_osd_keymap'
export const DOUBLE_PRESS_WINDOW_MS = 280

export const DEFAULT_OSD_KEYMAP: OsdKeymap = {
  btn1_main_light: 'Digit1',
  btn2_light_mode: 'Digit2',
  btn3_room_leds: 'Digit3',
  btn4_desk_light: 'Digit4',
  btn5_blinds_up: 'Digit5',
  btn6_blinds_down: 'Digit6',
  knob_cw: 'ArrowRight',
  knob_ccw: 'ArrowLeft',
}

export const OSD_ACTION_METADATA: Array<{
  action: OsdHardwareAction
  label: string
  description: string
  icon: string
}> = [
  {
    action: 'btn1_main_light',
    label: 'Button 1 — Main Light',
    description: 'Toggle ceiling light (Deckenlicht KZ West) on/off',
    icon: 'fa-solid fa-lightbulb',
  },
  {
    action: 'btn2_light_mode',
    label: 'Button 2 — All Room Lights Mode',
    description: 'Cycle group knob mode: All Lights RGB → All Lights Brightness → Off',
    icon: 'fa-solid fa-sliders',
  },
  {
    action: 'btn3_room_leds',
    label: 'Button 3 — Room LEDs',
    description: 'Single press: toggle on/off (+ turn knob for RGB/Brightness) • Double press: jump straight to RGB',
    icon: 'fa-solid fa-wand-magic-sparkles',
  },
  {
    action: 'btn4_desk_light',
    label: 'Button 4 — Desk Lamp',
    description: 'Single press: toggle on/off (+ turn knob for Brightness) • Double press: jump straight to Brightness',
    icon: 'fa-solid fa-lamp',
  },
  {
    action: 'btn5_blinds_up',
    label: 'Button 5 — Blinds Up',
    description: 'Single press: move blinds up (+ turn knob for Slat Angle) • Double press: jump straight to Slat Angle',
    icon: 'fa-solid fa-angles-up',
  },
  {
    action: 'btn6_blinds_down',
    label: 'Button 6 — Blinds Down',
    description: 'Single press: move blinds down (+ turn knob for Slat Angle) • Double press: jump straight to Slat Angle',
    icon: 'fa-solid fa-angles-down',
  },
  {
    action: 'knob_cw',
    label: 'Rotary Knob — Clockwise (+)',
    description: 'Increase active RGB hue, light brightness, or blind slat angle',
    icon: 'fa-solid fa-rotate-right',
  },
  {
    action: 'knob_ccw',
    label: 'Rotary Knob — Counter-Clockwise (−)',
    description: 'Decrease active RGB hue, light brightness, or blind slat angle',
    icon: 'fa-solid fa-rotate-left',
  },
]

const ALT_DEFAULT_KEY_TO_ACTION: Record<string, OsdHardwareAction> = {
  F13: 'btn1_main_light',
  F14: 'btn2_light_mode',
  F15: 'btn3_room_leds',
  F16: 'btn4_desk_light',
  F17: 'btn5_blinds_up',
  F18: 'btn6_blinds_down',
  AudioVolumeUp: 'knob_cw',
  AudioVolumeDown: 'knob_ccw',
}

export function hslToHex(h: number, s = 100, l = 50): string {
  const normH = ((h % 360) + 360) % 360
  const sFrac = s / 100
  const lFrac = l / 100
  const c = (1 - Math.abs(2 * lFrac - 1)) * sFrac
  const x = c * (1 - Math.abs(((normH / 60) % 2) - 1))
  const m = lFrac - c / 2
  let rPrime = 0
  let gPrime = 0
  let bPrime = 0

  if (normH < 60) {
    rPrime = c
    gPrime = x
  } else if (normH < 120) {
    rPrime = x
    gPrime = c
  } else if (normH < 180) {
    gPrime = c
    bPrime = x
  } else if (normH < 240) {
    gPrime = x
    bPrime = c
  } else if (normH < 300) {
    rPrime = x
    bPrime = c
  } else {
    rPrime = c
    bPrime = x
  }

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(rPrime)}${toHex(gPrime)}${toHex(bPrime)}`
}

export function hexToHue(hex: string): number {
  const clean = hex.replace('#', '')
  if (clean.length !== 6) return 144
  const r = parseInt(clean.slice(0, 2), 16) / 255
  const g = parseInt(clean.slice(2, 4), 16) / 255
  const b = parseInt(clean.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  if (d === 0) return 0
  let h = 0
  if (max === r) {
    h = ((g - b) / d) % 6
  } else if (max === g) {
    h = (b - r) / d + 2
  } else {
    h = (r - g) / d + 4
  }
  return Math.round((h * 60 + 360) % 360)
}

interface OsdState {
  devices: Record<string, SmartDeviceDTO>
  mode: OsdMode
  visible: boolean
  activeDeviceId: string | null
  toastTitle: string
  toastSubtitle: string
  toastIcon: string
  ledHue: number
  ledHex: string
  ledBrightness: number
  deskBrightness: number
  groupBrightness: number
  blindAngle: number
  learningAction: OsdHardwareAction | null
  keymap: OsdKeymap
  sseConnected: boolean
}

let hideTimer: ReturnType<typeof setTimeout> | null = null
let eventSource: EventSource | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let listenerAttached = false

const singlePressTimers = new Map<OsdHardwareAction, ReturnType<typeof setTimeout>>()

const throttleState = new Map<
  string,
  {
    lastSent: number
    timer: ReturnType<typeof setTimeout> | null
    pendingCmd: DeviceCommandDTO | null
  }
>()

export function useDeviceOsd() {
  const api = useSmarthubApi()

  const state = useState<OsdState>('smarthub-device-osd', () => ({
    devices: {
      'ceiling-light': {
        id: 'ceiling-light',
        name: 'Deckenlicht KZ West',
        room: 'KZ West',
        category: 'light',
        capabilities: ['switch'],
        state: { on: false, updatedAt: null },
      },
      'desk-light': {
        id: 'desk-light',
        name: 'Schreibtischlicht Arthur',
        room: 'KZ West',
        category: 'light',
        capabilities: ['switch', 'brightness'],
        state: { on: false, brightness: 75, updatedAt: null },
      },
      'room-leds': {
        id: 'room-leds',
        name: 'LED Strip KZ West',
        room: 'KZ West',
        category: 'light',
        capabilities: ['switch', 'brightness', 'rgb'],
        state: { on: false, brightness: 100, rgb: '#00ff66', updatedAt: null },
      },
      outlet: {
        id: 'outlet',
        name: 'Steckdose KZ West',
        room: 'KZ West',
        category: 'outlet',
        capabilities: ['switch'],
        state: { on: false, updatedAt: null },
      },
      'blind-west': {
        id: 'blind-west',
        name: 'Jalousie West',
        room: 'KZ West',
        category: 'blind',
        capabilities: ['blind_move', 'blind_angle'],
        state: { lastAction: null, slatAngle: 0, updatedAt: null },
      },
      'blind-south': {
        id: 'blind-south',
        name: 'Jalousie Süd',
        room: 'KZ West',
        category: 'blind',
        capabilities: ['blind_move', 'blind_angle'],
        state: { lastAction: null, slatAngle: 0, updatedAt: null },
      },
      'blinds-all': {
        id: 'blinds-all',
        name: 'Alle Jalousien KZ West',
        room: 'KZ West',
        category: 'blind',
        capabilities: ['blind_move', 'blind_angle'],
        state: { lastAction: null, slatAngle: 0, updatedAt: null },
      },
    },
    mode: 'IDLE',
    visible: false,
    activeDeviceId: null,
    toastTitle: '',
    toastSubtitle: '',
    toastIcon: 'fa-solid fa-bolt',
    ledHue: 144,
    ledHex: '#00ff66',
    ledBrightness: 100,
    deskBrightness: 75,
    groupBrightness: 100,
    blindAngle: 0,
    learningAction: null,
    keymap: { ...DEFAULT_OSD_KEYMAP },
    sseConnected: false,
  }))

  function loadKeymapFromStorage() {
    if (!import.meta.client) return
    try {
      const raw = localStorage.getItem(OSD_KEYMAP_STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          const nextMap: OsdKeymap = { ...DEFAULT_OSD_KEYMAP }
          for (const key of Object.keys(DEFAULT_OSD_KEYMAP) as OsdHardwareAction[]) {
            if (typeof parsed[key] === 'string' && parsed[key].length > 0) {
              nextMap[key] = parsed[key]
            }
          }
          state.value.keymap = nextMap
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  function saveKeymapToStorage() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(OSD_KEYMAP_STORAGE_KEY, JSON.stringify(state.value.keymap))
    } catch {
      // Ignore storage errors
    }
  }

  function setKeyBinding(action: OsdHardwareAction, keyCode: string) {
    state.value.keymap = {
      ...state.value.keymap,
      [action]: keyCode,
    }
    saveKeymapToStorage()
  }

  function resetKeymapToDefaults() {
    state.value.keymap = { ...DEFAULT_OSD_KEYMAP }
    saveKeymapToStorage()
  }

  function startLearningKey(action: OsdHardwareAction) {
    state.value.learningAction = action
  }

  function cancelLearningKey() {
    state.value.learningAction = null
  }

  function applyDeviceSnapshot(list: SmartDeviceDTO[]) {
    for (const dev of list) {
      applySingleDeviceState(dev)
    }
  }

  function applySingleDeviceState(dev: SmartDeviceDTO) {
    state.value.devices[dev.id] = dev
    if (dev.id === 'room-leds') {
      if (dev.state.rgb) {
        state.value.ledHex = dev.state.rgb
        state.value.ledHue = hexToHue(dev.state.rgb)
      }
      if (dev.state.brightness !== undefined) {
        state.value.ledBrightness = dev.state.brightness
        state.value.groupBrightness = dev.state.brightness
      }
    } else if (dev.id === 'desk-light') {
      if (dev.state.brightness !== undefined) {
        state.value.deskBrightness = dev.state.brightness
      }
    } else if (dev.id === 'blinds-all' || dev.id === 'blind-west') {
      if (dev.state.slatAngle !== undefined) {
        state.value.blindAngle = dev.state.slatAngle
      }
    }
  }

  function resetAutoHideTimer(durationMs = 4000) {
    if (hideTimer) clearTimeout(hideTimer)
    state.value.visible = true
    hideTimer = setTimeout(() => {
      state.value.visible = false
      state.value.mode = 'IDLE'
      state.value.activeDeviceId = null
    }, durationMs)
  }

  function clearSinglePressTimers() {
    for (const timer of singlePressTimers.values()) {
      clearTimeout(timer)
    }
    singlePressTimers.clear()
  }

  function hideOsdImmediately() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    clearSinglePressTimers()
    state.value.visible = false
    state.value.mode = 'IDLE'
    state.value.activeDeviceId = null
  }

  function dispatchCommandThrottled(id: string, cmd: DeviceCommandDTO, throttleMs = 150) {
    const now = Date.now()
    const entry = throttleState.get(id) ?? {
      lastSent: 0,
      timer: null,
      pendingCmd: null,
    }

    const elapsed = now - entry.lastSent
    if (elapsed >= throttleMs && !entry.timer) {
      entry.lastSent = now
      throttleState.set(id, entry)
      api.sendDeviceCommand(id, cmd).then(applySingleDeviceState).catch(() => {})
      return
    }

    entry.pendingCmd = { ...(entry.pendingCmd ?? {}), ...cmd }
    if (!entry.timer) {
      const wait = Math.max(10, throttleMs - elapsed)
      entry.timer = setTimeout(() => {
        const latest = throttleState.get(id)
        if (!latest) return
        const payload = latest.pendingCmd
        latest.timer = null
        latest.pendingCmd = null
        latest.lastSent = Date.now()
        if (payload) {
          api.sendDeviceCommand(id, payload).then(applySingleDeviceState).catch(() => {})
        }
      }, wait)
    }
    throttleState.set(id, entry)
  }

  function executeLightToggle(
    deviceId: 'room-leds' | 'desk-light',
    title: string,
    icon: string
  ) {
    const dev = state.value.devices[deviceId]
    const nextOn = !(dev?.state.on ?? false)
    if (dev) dev.state.on = nextOn
    state.value.mode = 'TOAST'
    state.value.activeDeviceId = deviceId
    state.value.toastTitle = title
    state.value.toastSubtitle = nextOn ? 'Switched ON' : 'Switched OFF'
    state.value.toastIcon = icon
    resetAutoHideTimer()
    api.sendDeviceCommand(deviceId, { on: nextOn }).then(applySingleDeviceState).catch(() => {})
  }

  function enterDeviceKnobMode(deviceId: 'room-leds' | 'desk-light') {
    const dev = state.value.devices[deviceId]
    state.value.activeDeviceId = deviceId
    if (dev?.capabilities.includes('rgb')) {
      state.value.mode = 'DEVICE_RGB'
    } else {
      state.value.mode = 'DEVICE_BRIGHTNESS'
    }
    resetAutoHideTimer()
  }

  function handleConfigurableLightButton(
    action: 'btn3_room_leds' | 'btn4_desk_light',
    deviceId: 'room-leds' | 'desk-light',
    title: string,
    icon: string
  ) {
    // If already in individual knob mode for this specific light, step through its modes:
    // DEVICE_RGB -> DEVICE_BRIGHTNESS -> HIDE
    if (state.value.visible && state.value.activeDeviceId === deviceId) {
      if (state.value.mode === 'DEVICE_RGB') {
        const dev = state.value.devices[deviceId]
        if (dev?.capabilities.includes('brightness')) {
          state.value.mode = 'DEVICE_BRIGHTNESS'
          resetAutoHideTimer()
        } else {
          hideOsdImmediately()
        }
        return
      }
      if (state.value.mode === 'DEVICE_BRIGHTNESS') {
        hideOsdImmediately()
        return
      }
    }

    // Check for double press within DOUBLE_PRESS_WINDOW_MS
    const pendingTimer = singlePressTimers.get(action)
    if (pendingTimer) {
      clearTimeout(pendingTimer)
      singlePressTimers.delete(action)
      enterDeviceKnobMode(deviceId)
      return
    }

    const timer = setTimeout(() => {
      singlePressTimers.delete(action)
      executeLightToggle(deviceId, title, icon)
    }, DOUBLE_PRESS_WINDOW_MS)
    singlePressTimers.set(action, timer)
  }

  function executeBlindMove(direction: 'up' | 'down') {
    const dev = state.value.devices['blinds-all']
    if (dev) dev.state.lastAction = direction
    state.value.mode = 'TOAST'
    state.value.activeDeviceId = 'blinds-all'
    state.value.toastTitle = 'Alle Jalousien KZ West'
    state.value.toastSubtitle = direction === 'up' ? 'Moving UP ▲' : 'Moving DOWN ▼'
    state.value.toastIcon =
      direction === 'up' ? 'fa-solid fa-angles-up' : 'fa-solid fa-angles-down'
    resetAutoHideTimer()
    api
      .sendDeviceCommand('blinds-all', { blindAction: direction })
      .then(applySingleDeviceState)
      .catch(() => {})
  }

  function handleBlindButton(
    action: 'btn5_blinds_up' | 'btn6_blinds_down',
    direction: 'up' | 'down'
  ) {
    // If already in BLIND_ANGLE mode, pressing a blind button finishes/closes the OSD
    if (state.value.visible && state.value.mode === 'BLIND_ANGLE') {
      hideOsdImmediately()
      return
    }

    // Check if either blind button has a pending single-press timer (double-press jumps straight to BLIND_ANGLE)
    const pendingSame = singlePressTimers.get(action)
    if (pendingSame) {
      clearTimeout(pendingSame)
      singlePressTimers.delete(action)
      state.value.mode = 'BLIND_ANGLE'
      state.value.activeDeviceId = 'blinds-all'
      resetAutoHideTimer()
      return
    }

    const timer = setTimeout(() => {
      singlePressTimers.delete(action)
      executeBlindMove(direction)
    }, DOUBLE_PRESS_WINDOW_MS)
    singlePressTimers.set(action, timer)
  }

  function triggerAction(action: OsdHardwareAction) {
    if (action === 'btn1_main_light') {
      const dev = state.value.devices['ceiling-light']
      const nextOn = !(dev?.state.on ?? false)
      if (dev) dev.state.on = nextOn
      state.value.mode = 'TOAST'
      state.value.activeDeviceId = 'ceiling-light'
      state.value.toastTitle = 'Deckenlicht KZ West'
      state.value.toastSubtitle = nextOn ? 'Switched ON' : 'Switched OFF'
      state.value.toastIcon = 'fa-solid fa-lightbulb'
      resetAutoHideTimer()
      api.sendDeviceCommand('ceiling-light', { on: nextOn }).then(applySingleDeviceState).catch(() => {})
      return
    }

    if (action === 'btn2_light_mode') {
      clearSinglePressTimers()
      if (!state.value.visible || (state.value.mode !== 'ALL_RGB' && state.value.mode !== 'ALL_BRIGHTNESS')) {
        state.value.mode = 'ALL_RGB'
        state.value.activeDeviceId = null
        resetAutoHideTimer()
      } else if (state.value.mode === 'ALL_RGB') {
        state.value.mode = 'ALL_BRIGHTNESS'
        state.value.activeDeviceId = null
        resetAutoHideTimer()
      } else {
        hideOsdImmediately()
      }
      return
    }

    if (action === 'btn3_room_leds') {
      handleConfigurableLightButton(
        'btn3_room_leds',
        'room-leds',
        'LED Strip KZ West',
        'fa-solid fa-wand-magic-sparkles'
      )
      return
    }

    if (action === 'btn4_desk_light') {
      handleConfigurableLightButton(
        'btn4_desk_light',
        'desk-light',
        'Schreibtischlicht Arthur',
        'fa-solid fa-lamp'
      )
      return
    }

    if (action === 'btn5_blinds_up') {
      handleBlindButton('btn5_blinds_up', 'up')
      return
    }

    if (action === 'btn6_blinds_down') {
      handleBlindButton('btn6_blinds_down', 'down')
      return
    }

    if (action === 'knob_cw' || action === 'knob_ccw') {
      const dir = action === 'knob_cw' ? 1 : -1

      // Transition from TOAST into context-appropriate knob mode when a device was just activated
      if (state.value.visible && state.value.mode === 'TOAST') {
        const activeId = state.value.activeDeviceId
        const dev = activeId ? state.value.devices[activeId] : null
        if (dev) {
          if (dev.category === 'blind' && dev.capabilities.includes('blind_angle')) {
            state.value.mode = 'BLIND_ANGLE'
          } else if (dev.category === 'light' && dev.state.on) {
            if (dev.capabilities.includes('rgb')) {
              state.value.mode = 'DEVICE_RGB'
            } else if (dev.capabilities.includes('brightness')) {
              state.value.mode = 'DEVICE_BRIGHTNESS'
            } else {
              return
            }
          } else {
            return
          }
        } else {
          return
        }
      } else if (!state.value.visible || state.value.mode === 'IDLE') {
        // Default knob turn from idle opens All Room Lights RGB mode
        state.value.mode = 'ALL_RGB'
        state.value.activeDeviceId = null
      }

      if (state.value.mode === 'ALL_RGB') {
        const nextHue = ((state.value.ledHue + dir * 10) % 360 + 360) % 360
        const nextHex = hslToHex(nextHue, 100, 50)
        state.value.ledHue = nextHue
        state.value.ledHex = nextHex

        const rgbLights = Object.values(state.value.devices).filter(
          (d) => d.category === 'light' && d.capabilities.includes('rgb')
        )
        for (const light of rgbLights) {
          light.state.on = true
          light.state.rgb = nextHex
          dispatchCommandThrottled(light.id, { rgb: nextHex })
        }
        resetAutoHideTimer()
        return
      }

      if (state.value.mode === 'ALL_BRIGHTNESS') {
        const nextBrightness = Math.max(0, Math.min(100, state.value.groupBrightness + dir * 5))
        state.value.groupBrightness = nextBrightness
        state.value.ledBrightness = nextBrightness
        state.value.deskBrightness = nextBrightness

        const dimmableLights = Object.values(state.value.devices).filter(
          (d) => d.category === 'light' && d.capabilities.includes('brightness')
        )
        for (const light of dimmableLights) {
          light.state.brightness = nextBrightness
          light.state.on = nextBrightness > 0
          dispatchCommandThrottled(light.id, { brightness: nextBrightness })
        }
        resetAutoHideTimer()
        return
      }

      if (state.value.mode === 'DEVICE_RGB') {
        const targetId = state.value.activeDeviceId || 'room-leds'
        const nextHue = ((state.value.ledHue + dir * 10) % 360 + 360) % 360
        const nextHex = hslToHex(nextHue, 100, 50)
        state.value.ledHue = nextHue
        state.value.ledHex = nextHex
        const dev = state.value.devices[targetId]
        if (dev) {
          dev.state.on = true
          dev.state.rgb = nextHex
        }
        resetAutoHideTimer()
        dispatchCommandThrottled(targetId, { rgb: nextHex })
        return
      }

      if (state.value.mode === 'DEVICE_BRIGHTNESS') {
        const targetId = state.value.activeDeviceId || 'desk-light'
        const currentVal =
          targetId === 'room-leds' ? state.value.ledBrightness : state.value.deskBrightness
        const nextBrightness = Math.max(0, Math.min(100, currentVal + dir * 5))
        if (targetId === 'room-leds') {
          state.value.ledBrightness = nextBrightness
        } else {
          state.value.deskBrightness = nextBrightness
        }
        const dev = state.value.devices[targetId]
        if (dev) {
          dev.state.brightness = nextBrightness
          dev.state.on = nextBrightness > 0
        }
        resetAutoHideTimer()
        dispatchCommandThrottled(targetId, { brightness: nextBrightness })
        return
      }

      if (state.value.mode === 'BLIND_ANGLE') {
        const targetId = state.value.activeDeviceId || 'blinds-all'
        const nextAngle = Math.max(0, Math.min(100, state.value.blindAngle + dir * 5))
        state.value.blindAngle = nextAngle
        const dev = state.value.devices[targetId]
        if (dev) {
          dev.state.slatAngle = nextAngle
          dev.state.lastAction = dir > 0 ? 'stepDown' : 'stepUp'
        }
        resetAutoHideTimer()
        dispatchCommandThrottled(targetId, { slatAngle: nextAngle })
      }
    }
  }

  function resolveActionFromKeyCode(code: string): OsdHardwareAction | null {
    const entries = Object.entries(state.value.keymap) as Array<[OsdHardwareAction, string]>
    for (const [action, boundCode] of entries) {
      if (boundCode === code) return action
    }
    return ALT_DEFAULT_KEY_TO_ACTION[code] ?? null
  }

  function handleKeyDown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable)
    ) {
      return
    }

    if (e.metaKey || e.ctrlKey || e.altKey) return

    if (state.value.learningAction) {
      e.preventDefault()
      e.stopPropagation()
      if (e.code !== 'Escape') {
        setKeyBinding(state.value.learningAction, e.code)
      }
      state.value.learningAction = null
      return
    }

    const action = resolveActionFromKeyCode(e.code)
    if (!action) return

    e.preventDefault()
    triggerAction(action)
  }

  function connectSse() {
    if (!import.meta.client || eventSource) return

    try {
      const url = api.getDevicesEventsUrl()
      eventSource = new EventSource(url, { withCredentials: true })

      eventSource.onopen = () => {
        state.value.sseConnected = true
      }

      eventSource.addEventListener('device-snapshot', (evt: MessageEvent) => {
        try {
          const list = JSON.parse(evt.data) as SmartDeviceDTO[]
          if (Array.isArray(list)) {
            applyDeviceSnapshot(list)
          }
        } catch {
          // Ignore malformed JSON
        }
      })

      eventSource.addEventListener('device-state', (evt: MessageEvent) => {
        try {
          const dev = JSON.parse(evt.data) as SmartDeviceDTO
          if (dev && dev.id) {
            applySingleDeviceState(dev)
          }
        } catch {
          // Ignore malformed JSON
        }
      })

      eventSource.onerror = () => {
        state.value.sseConnected = false
        if (eventSource) {
          eventSource.close()
          eventSource = null
        }
        if (!reconnectTimer) {
          reconnectTimer = setTimeout(() => {
            reconnectTimer = null
            connectSse()
          }, 5000)
        }
      }
    } catch {
      // Ignore SSE errors on unauthenticated / login view
    }
  }

  function initDeviceOsd() {
    if (!import.meta.client) return
    loadKeymapFromStorage()

    if (!listenerAttached) {
      window.addEventListener('keydown', handleKeyDown)
      listenerAttached = true
    }

    api
      .fetchDevices()
      .then((res) => {
        if (res?.devices) {
          applyDeviceSnapshot(res.devices)
        }
      })
      .catch(() => {})

    connectSse()
  }

  function destroyDeviceOsd() {
    if (import.meta.client && listenerAttached) {
      window.removeEventListener('keydown', handleKeyDown)
      listenerAttached = false
    }
    clearSinglePressTimers()
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  const activeDevice = computed(() =>
    state.value.activeDeviceId ? state.value.devices[state.value.activeDeviceId] ?? null : null
  )

  return {
    state,
    activeDevice,
    initDeviceOsd,
    destroyDeviceOsd,
    triggerAction,
    handleKeyDown,
    setKeyBinding,
    resetKeymapToDefaults,
    startLearningKey,
    cancelLearningKey,
    hideOsdImmediately,
  }
}
