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
  | 'LED_COLOR'
  | 'LED_BRIGHTNESS'
  | 'DESK_BRIGHTNESS'
  | 'BLIND_ANGLE'

export type OsdHardwareAction =
  | 'btn1_main_light'
  | 'btn2_light_mode'
  | 'btn3_room_leds'
  | 'btn4_desk_light'
  | 'btn5_blinds_up'
  | 'btn6_blinds_down'
  | 'btn7_blind_angle'
  | 'knob_cw'
  | 'knob_ccw'

export type OsdKeymap = Record<OsdHardwareAction, string>

export const OSD_KEYMAP_STORAGE_KEY = 'smarthub_osd_keymap'

export const DEFAULT_OSD_KEYMAP: OsdKeymap = {
  btn1_main_light: 'Digit1',
  btn2_light_mode: 'Digit2',
  btn3_room_leds: 'Digit3',
  btn4_desk_light: 'Digit4',
  btn5_blinds_up: 'Digit5',
  btn6_blinds_down: 'Digit6',
  btn7_blind_angle: 'Digit7',
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
    label: 'Button 2 — Light Config Mode',
    description: 'Cycle knob mode: LED Color → LED Brightness → Desk Brightness → Off',
    icon: 'fa-solid fa-sliders',
  },
  {
    action: 'btn3_room_leds',
    label: 'Button 3 — Room LEDs',
    description: 'Toggle RGB LED strip on/off',
    icon: 'fa-solid fa-wand-magic-sparkles',
  },
  {
    action: 'btn4_desk_light',
    label: 'Button 4 — Desk Lamp',
    description: 'Toggle desk lamp (Schreibtischlicht Arthur) on/off',
    icon: 'fa-solid fa-lamp',
  },
  {
    action: 'btn5_blinds_up',
    label: 'Button 5 — Blinds Up',
    description: 'Move all KZ West window blinds up',
    icon: 'fa-solid fa-angles-up',
  },
  {
    action: 'btn6_blinds_down',
    label: 'Button 6 — Blinds Down',
    description: 'Move all KZ West window blinds down',
    icon: 'fa-solid fa-angles-down',
  },
  {
    action: 'btn7_blind_angle',
    label: 'Button 7 — Blind Slat Angle Mode',
    description: 'Configure window blind slat tilt (0°–90°) with the rotary knob',
    icon: 'fa-solid fa-bars-staggered',
  },
  {
    action: 'knob_cw',
    label: 'Rotary Knob — Clockwise (+)',
    description: 'Increase active brightness, RGB hue, or blind slat angle',
    icon: 'fa-solid fa-rotate-right',
  },
  {
    action: 'knob_ccw',
    label: 'Rotary Knob — Counter-Clockwise (−)',
    description: 'Decrease active brightness, RGB hue, or blind slat angle',
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
  F19: 'btn7_blind_angle',
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
  return Math.round(((h * 60) + 360) % 360)
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
  blindAngle: number
  learningAction: OsdHardwareAction | null
  keymap: OsdKeymap
  sseConnected: boolean
}

let hideTimer: ReturnType<typeof setTimeout> | null = null
let eventSource: EventSource | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let listenerAttached = false

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
          state.value.keymap = {
            ...DEFAULT_OSD_KEYMAP,
            ...parsed,
          }
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

  function hideOsdImmediately() {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
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

    if (action === 'btn3_room_leds') {
      const dev = state.value.devices['room-leds']
      const nextOn = !(dev?.state.on ?? false)
      if (dev) dev.state.on = nextOn
      state.value.mode = 'TOAST'
      state.value.activeDeviceId = 'room-leds'
      state.value.toastTitle = 'LED Strip KZ West'
      state.value.toastSubtitle = nextOn ? 'Switched ON' : 'Switched OFF'
      state.value.toastIcon = 'fa-solid fa-wand-magic-sparkles'
      resetAutoHideTimer()
      api.sendDeviceCommand('room-leds', { on: nextOn }).then(applySingleDeviceState).catch(() => {})
      return
    }

    if (action === 'btn4_desk_light') {
      const dev = state.value.devices['desk-light']
      const nextOn = !(dev?.state.on ?? false)
      if (dev) dev.state.on = nextOn
      state.value.mode = 'TOAST'
      state.value.activeDeviceId = 'desk-light'
      state.value.toastTitle = 'Schreibtischlicht Arthur'
      state.value.toastSubtitle = nextOn ? 'Switched ON' : 'Switched OFF'
      state.value.toastIcon = 'fa-solid fa-lamp'
      resetAutoHideTimer()
      api.sendDeviceCommand('desk-light', { on: nextOn }).then(applySingleDeviceState).catch(() => {})
      return
    }

    if (action === 'btn5_blinds_up') {
      const dev = state.value.devices['blinds-all']
      if (dev) dev.state.lastAction = 'up'
      state.value.mode = 'TOAST'
      state.value.activeDeviceId = 'blinds-all'
      state.value.toastTitle = 'Alle Jalousien KZ West'
      state.value.toastSubtitle = 'Moving UP ▲'
      state.value.toastIcon = 'fa-solid fa-angles-up'
      resetAutoHideTimer()
      api.sendDeviceCommand('blinds-all', { blindAction: 'up' }).then(applySingleDeviceState).catch(() => {})
      return
    }

    if (action === 'btn6_blinds_down') {
      const dev = state.value.devices['blinds-all']
      if (dev) dev.state.lastAction = 'down'
      state.value.mode = 'TOAST'
      state.value.activeDeviceId = 'blinds-all'
      state.value.toastTitle = 'Alle Jalousien KZ West'
      state.value.toastSubtitle = 'Moving DOWN ▼'
      state.value.toastIcon = 'fa-solid fa-angles-down'
      resetAutoHideTimer()
      api.sendDeviceCommand('blinds-all', { blindAction: 'down' }).then(applySingleDeviceState).catch(() => {})
      return
    }

    if (action === 'btn2_light_mode') {
      if (!state.value.visible || state.value.mode === 'IDLE' || state.value.mode === 'TOAST' || state.value.mode === 'BLIND_ANGLE') {
        state.value.mode = 'LED_COLOR'
        state.value.activeDeviceId = 'room-leds'
        resetAutoHideTimer()
      } else if (state.value.mode === 'LED_COLOR') {
        state.value.mode = 'LED_BRIGHTNESS'
        state.value.activeDeviceId = 'room-leds'
        resetAutoHideTimer()
      } else if (state.value.mode === 'LED_BRIGHTNESS') {
        state.value.mode = 'DESK_BRIGHTNESS'
        state.value.activeDeviceId = 'desk-light'
        resetAutoHideTimer()
      } else if (state.value.mode === 'DESK_BRIGHTNESS') {
        hideOsdImmediately()
      }
      return
    }

    if (action === 'btn7_blind_angle') {
      if (state.value.visible && state.value.mode === 'BLIND_ANGLE') {
        hideOsdImmediately()
      } else {
        state.value.mode = 'BLIND_ANGLE'
        state.value.activeDeviceId = 'blinds-all'
        resetAutoHideTimer()
      }
      return
    }

    if (action === 'knob_cw' || action === 'knob_ccw') {
      const dir = action === 'knob_cw' ? 1 : -1

      // If OSD is idle or in toast mode, default knob turn to LED_BRIGHTNESS or active mode
      if (state.value.mode === 'IDLE' || state.value.mode === 'TOAST') {
        state.value.mode = 'LED_COLOR'
        state.value.activeDeviceId = 'room-leds'
      }

      if (state.value.mode === 'LED_COLOR') {
        const nextHue = ((state.value.ledHue + dir * 10) % 360 + 360) % 360
        const nextHex = hslToHex(nextHue, 100, 50)
        state.value.ledHue = nextHue
        state.value.ledHex = nextHex
        const dev = state.value.devices['room-leds']
        if (dev) {
          dev.state.on = true
          dev.state.rgb = nextHex
        }
        resetAutoHideTimer()
        dispatchCommandThrottled('room-leds', { rgb: nextHex })
        return
      }

      if (state.value.mode === 'LED_BRIGHTNESS') {
        const nextBrightness = Math.max(0, Math.min(100, state.value.ledBrightness + dir * 5))
        state.value.ledBrightness = nextBrightness
        const dev = state.value.devices['room-leds']
        if (dev) {
          dev.state.brightness = nextBrightness
          dev.state.on = nextBrightness > 0
        }
        resetAutoHideTimer()
        dispatchCommandThrottled('room-leds', { brightness: nextBrightness })
        return
      }

      if (state.value.mode === 'DESK_BRIGHTNESS') {
        const nextBrightness = Math.max(0, Math.min(100, state.value.deskBrightness + dir * 5))
        state.value.deskBrightness = nextBrightness
        const dev = state.value.devices['desk-light']
        if (dev) {
          dev.state.brightness = nextBrightness
          dev.state.on = nextBrightness > 0
        }
        resetAutoHideTimer()
        dispatchCommandThrottled('desk-light', { brightness: nextBrightness })
        return
      }

      if (state.value.mode === 'BLIND_ANGLE') {
        const nextAngle = Math.max(0, Math.min(100, state.value.blindAngle + dir * 5))
        state.value.blindAngle = nextAngle
        const dev = state.value.devices['blinds-all']
        if (dev) {
          dev.state.slatAngle = nextAngle
          dev.state.lastAction = dir > 0 ? 'stepDown' : 'stepUp'
        }
        resetAutoHideTimer()
        dispatchCommandThrottled('blinds-all', { slatAngle: nextAngle })
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
