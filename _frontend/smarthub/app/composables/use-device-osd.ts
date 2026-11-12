import { computed } from 'vue'
import { useState } from '#app'
import {
  useSmarthubApi,
  type SmartDeviceDTO,
  type DeviceCommandDTO,
  type KnxEnvironmentDTO,
} from './use-smarthub-api'

export type OsdKnobSlot =
  | 'blind_angle'
  | 'desk_brightness'
  | 'led_rgb'
  | 'led_brightness'

export type OsdMode = 'IDLE' | 'TOAST' | OsdKnobSlot

export type OsdHardwareAction =
  | 'btn1_main_light'
  | 'btn2_blinds_up'
  | 'btn3_blinds_down'
  | 'btn4_desk_light'
  | 'btn5_led_strips'
  | 'btn6_light_memory'
  | 'knob_press'
  | 'knob_cw'
  | 'knob_ccw'

export type OsdKeymap = Record<OsdHardwareAction, string>

export interface SavedLightScene {
  'ceiling-light': { on: boolean }
  'desk-light': { on: boolean; brightness: number }
  'room-leds': { on: boolean; brightness: number; rgb: string }
  savedAt: string
}

export const OSD_KEYMAP_STORAGE_KEY = 'smarthub_osd_keymap_v2'
export const OSD_SLOT_ORDER_STORAGE_KEY = 'smarthub_osd_slot_order'
export const OSD_LIGHT_SCENE_STORAGE_KEY = 'smarthub_osd_light_scene'

export const DEFAULT_OSD_KEYMAP: OsdKeymap = {
  btn1_main_light: 'Digit1',
  btn2_blinds_up: 'Digit2',
  btn3_blinds_down: 'Digit3',
  btn4_desk_light: 'Digit4',
  btn5_led_strips: 'Digit5',
  btn6_light_memory: 'Digit6',
  knob_press: 'Enter',
  knob_cw: 'ArrowRight',
  knob_ccw: 'ArrowLeft',
}

export const DEFAULT_KNOB_SLOT_ORDER: OsdKnobSlot[] = [
  'blind_angle',
  'desk_brightness',
  'led_rgb',
  'led_brightness',
]

export const KNOB_SLOT_METADATA: Record<
  OsdKnobSlot,
  {
    slot: OsdKnobSlot
    shortLabel: string
    label: string
    description: string
    icon: string
    deviceId: string
  }
> = {
  blind_angle: {
    slot: 'blind_angle',
    shortLabel: 'TILT',
    label: 'Blind Slat Angle (3D)',
    description: 'Tilt 3D Venetian blind slats (0°–90°) with live KNX sunlight preview',
    icon: 'fa-solid fa-bars-staggered',
    deviceId: 'blinds-all',
  },
  desk_brightness: {
    slot: 'desk_brightness',
    shortLabel: 'DESK',
    label: 'Desk Light Brightness',
    description: 'Dim Schreibtischlicht Arthur from 0% to 100%',
    icon: 'fa-solid fa-lamp',
    deviceId: 'desk-light',
  },
  led_rgb: {
    slot: 'led_rgb',
    shortLabel: 'RGB',
    label: 'LED Strip Color (RGB)',
    description: 'Rotate through 360° RGB color spectrum for all LED strips',
    icon: 'fa-solid fa-palette',
    deviceId: 'room-leds',
  },
  led_brightness: {
    slot: 'led_brightness',
    shortLabel: 'LED %',
    label: 'LED Strip Brightness',
    description: 'Dim LED Strip KZ West from 0% to 100%',
    icon: 'fa-solid fa-sun',
    deviceId: 'room-leds',
  },
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
    description: 'Instant ON/OFF toggle for ceiling light (Deckenlicht KZ West)',
    icon: 'fa-solid fa-lightbulb',
  },
  {
    action: 'btn2_blinds_up',
    label: 'Button 2 — Blinds Up',
    description: 'Move all KZ West window blinds UP (turn knob while visible to jump to 3D Tilt)',
    icon: 'fa-solid fa-angles-up',
  },
  {
    action: 'btn3_blinds_down',
    label: 'Button 3 — Blinds Down',
    description: 'Move all KZ West window blinds DOWN (turn knob while visible to jump to 3D Tilt)',
    icon: 'fa-solid fa-angles-down',
  },
  {
    action: 'btn4_desk_light',
    label: 'Button 4 — Desk Light',
    description: 'Instant ON/OFF toggle for Schreibtischlicht Arthur (turn knob while ON to dim)',
    icon: 'fa-solid fa-lamp',
  },
  {
    action: 'btn5_led_strips',
    label: 'Button 5 — LED Strips',
    description: 'Instant ON/OFF toggle for LED Strip KZ West (turn knob while ON for RGB/Brightness)',
    icon: 'fa-solid fa-wand-magic-sparkles',
  },
  {
    action: 'btn6_light_memory',
    label: 'Button 6 — Light Scene Memory',
    description: 'If any light is ON: saves all light states & switches all OFF • If all OFF: restores saved scene',
    icon: 'fa-solid fa-bookmark',
  },
  {
    action: 'knob_press',
    label: 'Rotary Knob — Click (Cycle Configs)',
    description: 'Press 1–4 times to step through the 4 ordered knob config slots; 5th press closes HUD',
    icon: 'fa-solid fa-circle-dot',
  },
  {
    action: 'knob_cw',
    label: 'Rotary Knob — Clockwise (+)',
    description: 'Increase active slot parameter (3D blind tilt, desk brightness, LED hue, or LED brightness)',
    icon: 'fa-solid fa-rotate-right',
  },
  {
    action: 'knob_ccw',
    label: 'Rotary Knob — Counter-Clockwise (−)',
    description: 'Decrease active slot parameter (3D blind tilt, desk brightness, LED hue, or LED brightness)',
    icon: 'fa-solid fa-rotate-left',
  },
]

const ALT_DEFAULT_KEY_TO_ACTION: Record<string, OsdHardwareAction> = {
  F13: 'btn1_main_light',
  F14: 'btn2_blinds_up',
  F15: 'btn3_blinds_down',
  F16: 'btn4_desk_light',
  F17: 'btn5_led_strips',
  F18: 'btn6_light_memory',
  F19: 'knob_press',
  Space: 'knob_press',
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

export interface SceneMemoryChip {
  id: string
  label: string
  statusText: string
  active: boolean
  color?: string
}

interface OsdState {
  devices: Record<string, SmartDeviceDTO>
  environment: KnxEnvironmentDTO
  mode: OsdMode
  visible: boolean
  activeDeviceId: string | null
  slotOrder: OsdKnobSlot[]
  activeSlotIndex: number
  toastTitle: string
  toastSubtitle: string
  toastIcon: string
  toastKind: 'device' | 'scene_saved' | 'scene_restored'
  sceneChips: SceneMemoryChip[]
  savedLightScene: SavedLightScene
  ledHue: number
  ledHex: string
  ledBrightness: number
  deskBrightness: number
  blindAngle: number
  timerRevision: number
  isCountingDown: boolean
  isStandalone: boolean
  standaloneStep: number
  learningAction: OsdHardwareAction | null
  keymap: OsdKeymap
  sseConnected: boolean
}

let hideTimer: ReturnType<typeof setTimeout> | null = null
let idleDebounceTimer: ReturnType<typeof setTimeout> | null = null
let eventSource: EventSource | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let listenerAttached = false

const knobDebounceState = new Map<
  string,
  {
    timer: ReturnType<typeof setTimeout> | null
    pendingCmd: DeviceCommandDTO
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
    environment: {
      sunElevation: 28,
      sunAzimuth: 235,
      luxWest: 22400,
      luxSouth: 18500,
      luxMax: 26000,
      outdoorTemp: 16.5,
      raining: false,
      solarRadiation: 380,
      source: 'fallback',
      updatedAt: null,
    },
    mode: 'IDLE',
    visible: false,
    activeDeviceId: null,
    slotOrder: [...DEFAULT_KNOB_SLOT_ORDER],
    activeSlotIndex: 0,
    toastTitle: '',
    toastSubtitle: '',
    toastIcon: 'fa-solid fa-bolt',
    toastKind: 'device',
    sceneChips: [],
    savedLightScene: {
      'ceiling-light': { on: true },
      'desk-light': { on: true, brightness: 75 },
      'room-leds': { on: true, brightness: 100, rgb: '#00ff66' },
      savedAt: '',
    },
    ledHue: 144,
    ledHex: '#00ff66',
    ledBrightness: 100,
    deskBrightness: 75,
    blindAngle: 0,
    timerRevision: 0,
    isCountingDown: false,
    isStandalone: false,
    standaloneStep: 0,
    learningAction: null,
    keymap: { ...DEFAULT_OSD_KEYMAP },
    sseConnected: false,
  }))

  function loadPersistedPreferences() {
    if (!import.meta.client) return
    try {
      const rawKeymap = localStorage.getItem(OSD_KEYMAP_STORAGE_KEY)
      if (rawKeymap) {
        const parsed = JSON.parse(rawKeymap)
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

      const rawSlots = localStorage.getItem(OSD_SLOT_ORDER_STORAGE_KEY)
      if (rawSlots) {
        const parsedSlots = JSON.parse(rawSlots)
        if (
          Array.isArray(parsedSlots) &&
          parsedSlots.length === DEFAULT_KNOB_SLOT_ORDER.length &&
          DEFAULT_KNOB_SLOT_ORDER.every((s) => parsedSlots.includes(s))
        ) {
          state.value.slotOrder = parsedSlots as OsdKnobSlot[]
        }
      }

      const rawScene = localStorage.getItem(OSD_LIGHT_SCENE_STORAGE_KEY)
      if (rawScene) {
        const parsedScene = JSON.parse(rawScene) as SavedLightScene
        if (parsedScene && typeof parsedScene === 'object' && parsedScene['ceiling-light']) {
          state.value.savedLightScene = parsedScene
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

  function saveSlotOrderToStorage() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(OSD_SLOT_ORDER_STORAGE_KEY, JSON.stringify(state.value.slotOrder))
    } catch {
      // Ignore storage errors
    }
  }

  function saveLightSceneToStorage() {
    if (!import.meta.client) return
    try {
      localStorage.setItem(
        OSD_LIGHT_SCENE_STORAGE_KEY,
        JSON.stringify(state.value.savedLightScene)
      )
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
    state.value.slotOrder = [...DEFAULT_KNOB_SLOT_ORDER]
    saveKeymapToStorage()
    saveSlotOrderToStorage()
  }

  function moveKnobSlot(index: number, direction: -1 | 1) {
    const targetIdx = index + direction
    const current = [...state.value.slotOrder]
    if (index < 0 || index >= current.length || targetIdx < 0 || targetIdx >= current.length) {
      return
    }
    const temp = current[index]!
    current[index] = current[targetIdx]!
    current[targetIdx] = temp
    state.value.slotOrder = current
    saveSlotOrderToStorage()
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

  function applyEnvironmentState(env: KnxEnvironmentDTO) {
    if (!env || typeof env !== 'object') return
    state.value.environment = {
      ...state.value.environment,
      ...env,
    }
  }

  function resetAutoHideTimer(idleWaitMs = 650, countdownMs = 2400) {
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    if (idleDebounceTimer) {
      clearTimeout(idleDebounceTimer)
      idleDebounceTimer = null
    }

    state.value.visible = true
    state.value.isCountingDown = false

    // Smooth idle countdown: bar stays full while actively clicking/turning.
    // Countdown only begins after user ceases input for `idleWaitMs`.
    idleDebounceTimer = setTimeout(() => {
      state.value.isCountingDown = true
      state.value.timerRevision += 1
      hideTimer = setTimeout(() => {
        flushPendingKnobCommands()
        state.value.visible = false
        state.value.mode = 'IDLE'
        state.value.activeDeviceId = null
        state.value.isCountingDown = false
        state.value.isStandalone = false
        state.value.standaloneStep = 0
      }, countdownMs)
    }, idleWaitMs)
  }

  function flushPendingKnobCommands() {
    if (knobDebounceState.size === 0) return
    const entries = Array.from(knobDebounceState.entries())
    knobDebounceState.clear()
    for (const [id, entry] of entries) {
      if (entry.timer) {
        clearTimeout(entry.timer)
      }
      api.sendDeviceCommand(id, entry.pendingCmd).then(applySingleDeviceState).catch(() => {})
    }
  }

  function hideOsdImmediately() {
    flushPendingKnobCommands()
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    if (idleDebounceTimer) {
      clearTimeout(idleDebounceTimer)
      idleDebounceTimer = null
    }
    state.value.visible = false
    state.value.mode = 'IDLE'
    state.value.activeDeviceId = null
    state.value.isCountingDown = false
    state.value.isStandalone = false
    state.value.standaloneStep = 0
  }

  function dispatchKnobCommandDebounced(id: string, cmd: DeviceCommandDTO, debounceMs = 700) {
    const existing = knobDebounceState.get(id)
    if (existing?.timer) {
      clearTimeout(existing.timer)
    }

    const mergedCmd: DeviceCommandDTO = {
      ...(existing?.pendingCmd ?? {}),
      ...cmd,
    }

    const timer = setTimeout(() => {
      const current = knobDebounceState.get(id)
      if (!current) return
      knobDebounceState.delete(id)
      api.sendDeviceCommand(id, current.pendingCmd).then(applySingleDeviceState).catch(() => {})
    }, debounceMs)

    knobDebounceState.set(id, {
      timer,
      pendingCmd: mergedCmd,
    })
  }

  function enterSlotByIndex(slotIdx: number) {
    flushPendingKnobCommands()
    if (slotIdx < 0 || slotIdx >= state.value.slotOrder.length) {
      hideOsdImmediately()
      return
    }
    const slot = state.value.slotOrder[slotIdx]!
    state.value.isStandalone = false
    state.value.standaloneStep = 0
    state.value.activeSlotIndex = slotIdx
    state.value.mode = slot
    state.value.activeDeviceId = KNOB_SLOT_METADATA[slot].deviceId
    resetAutoHideTimer()
  }

  function enterStandaloneSlot(slot: OsdKnobSlot) {
    flushPendingKnobCommands()
    state.value.isStandalone = true
    state.value.standaloneStep = 0
    state.value.mode = slot
    state.value.activeDeviceId = KNOB_SLOT_METADATA[slot].deviceId
    const idx = state.value.slotOrder.indexOf(slot)
    state.value.activeSlotIndex = idx >= 0 ? idx : 0
    resetAutoHideTimer()
  }

  function executeLightToggle(
    deviceId: 'ceiling-light' | 'desk-light' | 'room-leds',
    title: string,
    icon: string
  ) {
    const dev = state.value.devices[deviceId]
    const nextOn = !(dev?.state.on ?? false)
    if (dev) dev.state.on = nextOn
    state.value.isStandalone = false
    state.value.standaloneStep = 0
    state.value.mode = 'TOAST'
    state.value.toastKind = 'device'
    state.value.sceneChips = []
    state.value.activeDeviceId = deviceId
    state.value.toastTitle = title
    state.value.toastSubtitle = nextOn ? 'Switched ON' : 'Switched OFF'
    state.value.toastIcon = icon
    resetAutoHideTimer()
    api.sendDeviceCommand(deviceId, { on: nextOn }).then(applySingleDeviceState).catch(() => {})
  }

  function executeBlindMove(direction: 'up' | 'down') {
    const dev = state.value.devices['blinds-all']
    if (dev) dev.state.lastAction = direction
    state.value.isStandalone = false
    state.value.standaloneStep = 0
    state.value.mode = 'TOAST'
    state.value.toastKind = 'device'
    state.value.sceneChips = []
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

  function executeSmartLightMemory() {
    const ceiling = state.value.devices['ceiling-light']
    const desk = state.value.devices['desk-light']
    const leds = state.value.devices['room-leds']

    const anyLightOn = Boolean(ceiling?.state.on || desk?.state.on || leds?.state.on)

    if (anyLightOn) {
      // Save current snapshot of all 3 lights and switch all active lights OFF
      const snapshot: SavedLightScene = {
        'ceiling-light': {
          on: Boolean(ceiling?.state.on),
        },
        'desk-light': {
          on: Boolean(desk?.state.on),
          brightness: desk?.state.brightness ?? state.value.deskBrightness ?? 75,
        },
        'room-leds': {
          on: Boolean(leds?.state.on),
          brightness: leds?.state.brightness ?? state.value.ledBrightness ?? 100,
          rgb: leds?.state.rgb ?? state.value.ledHex ?? '#00ff66',
        },
        savedAt: new Date().toISOString(),
      }
      state.value.savedLightScene = snapshot
      saveLightSceneToStorage()

      state.value.sceneChips = [
        {
          id: 'ceiling-light',
          label: 'Main Light',
          statusText: snapshot['ceiling-light'].on ? 'Saved ON → OFF' : 'OFF',
          active: snapshot['ceiling-light'].on,
        },
        {
          id: 'desk-light',
          label: 'Desk Light',
          statusText: snapshot['desk-light'].on
            ? `Saved ${snapshot['desk-light'].brightness}% → OFF`
            : 'OFF',
          active: snapshot['desk-light'].on,
        },
        {
          id: 'room-leds',
          label: 'LED Strips',
          statusText: snapshot['room-leds'].on
            ? `Saved ${snapshot['room-leds'].brightness}% • ${snapshot['room-leds'].rgb.toUpperCase()}`
            : 'OFF',
          active: snapshot['room-leds'].on,
          color: snapshot['room-leds'].rgb,
        },
      ]

      if (ceiling?.state.on) {
        ceiling.state.on = false
        api.sendDeviceCommand('ceiling-light', { on: false }).then(applySingleDeviceState).catch(() => {})
      }
      if (desk?.state.on) {
        desk.state.on = false
        api.sendDeviceCommand('desk-light', { on: false }).then(applySingleDeviceState).catch(() => {})
      }
      if (leds?.state.on) {
        leds.state.on = false
        api.sendDeviceCommand('room-leds', { on: false }).then(applySingleDeviceState).catch(() => {})
      }

      state.value.isStandalone = false
      state.value.standaloneStep = 0
      state.value.mode = 'TOAST'
      state.value.toastKind = 'scene_saved'
      state.value.activeDeviceId = null
      state.value.toastTitle = 'All Room Lights — Saved & OFF'
      state.value.toastSubtitle = 'Saved & Switched OFF'
      state.value.toastIcon = 'fa-solid fa-moon'
      resetAutoHideTimer()
      return
    }

    // All lights are currently OFF -> Restore saved snapshot
    const saved = state.value.savedLightScene
    const hasAnySavedOn =
      saved['ceiling-light']?.on || saved['desk-light']?.on || saved['room-leds']?.on

    // Fallback if snapshot somehow had all lights off
    const targetCeilingOn = hasAnySavedOn ? Boolean(saved['ceiling-light']?.on) : true
    const targetDeskOn = hasAnySavedOn ? Boolean(saved['desk-light']?.on) : true
    const targetDeskBrightness = saved['desk-light']?.brightness || 75
    const targetLedsOn = hasAnySavedOn ? Boolean(saved['room-leds']?.on) : true
    const targetLedsBrightness = saved['room-leds']?.brightness || 100
    const targetLedsRgb = saved['room-leds']?.rgb || '#00ff66'

    if (ceiling) {
      ceiling.state.on = targetCeilingOn
      if (targetCeilingOn) {
        api.sendDeviceCommand('ceiling-light', { on: true }).then(applySingleDeviceState).catch(() => {})
      }
    }
    if (desk) {
      desk.state.on = targetDeskOn
      desk.state.brightness = targetDeskBrightness
      state.value.deskBrightness = targetDeskBrightness
      if (targetDeskOn) {
        api
          .sendDeviceCommand('desk-light', { on: true, brightness: targetDeskBrightness })
          .then(applySingleDeviceState)
          .catch(() => {})
      }
    }
    if (leds) {
      leds.state.on = targetLedsOn
      leds.state.brightness = targetLedsBrightness
      leds.state.rgb = targetLedsRgb
      state.value.ledBrightness = targetLedsBrightness
      state.value.ledHex = targetLedsRgb
      state.value.ledHue = hexToHue(targetLedsRgb)
      if (targetLedsOn) {
        api
          .sendDeviceCommand('room-leds', {
            on: true,
            brightness: targetLedsBrightness,
            rgb: targetLedsRgb,
          })
          .then(applySingleDeviceState)
          .catch(() => {})
      }
    }

    state.value.sceneChips = [
      {
        id: 'ceiling-light',
        label: 'Main Light',
        statusText: targetCeilingOn ? 'Restored ON' : 'Stayed OFF',
        active: targetCeilingOn,
      },
      {
        id: 'desk-light',
        label: 'Desk Light',
        statusText: targetDeskOn ? `Restored ${targetDeskBrightness}%` : 'Stayed OFF',
        active: targetDeskOn,
      },
      {
        id: 'room-leds',
        label: 'LED Strips',
        statusText: targetLedsOn
          ? `Restored ${targetLedsBrightness}% • ${targetLedsRgb.toUpperCase()}`
          : 'Stayed OFF',
        active: targetLedsOn,
        color: targetLedsRgb,
      },
    ]

    state.value.isStandalone = false
    state.value.standaloneStep = 0
    state.value.mode = 'TOAST'
    state.value.toastKind = 'scene_restored'
    state.value.activeDeviceId = null
    state.value.toastTitle = 'All Room Lights — Scene Restored'
    state.value.toastSubtitle = 'Scene Restored'
    state.value.toastIcon = 'fa-solid fa-sun'
    resetAutoHideTimer()
  }

  function applySlotKnobTurn(slot: OsdKnobSlot, dir: 1 | -1) {
    if (slot === 'blind_angle') {
      const nextAngle = Math.max(0, Math.min(100, state.value.blindAngle + dir * 5))
      state.value.blindAngle = nextAngle
      const dev = state.value.devices['blinds-all']
      if (dev) {
        dev.state.slatAngle = nextAngle
        dev.state.lastAction = dir > 0 ? 'stepDown' : 'stepUp'
      }
      resetAutoHideTimer()
      dispatchKnobCommandDebounced('blinds-all', { slatAngle: nextAngle })
      return
    }

    if (slot === 'desk_brightness') {
      const nextBrightness = Math.max(0, Math.min(100, state.value.deskBrightness + dir * 5))
      state.value.deskBrightness = nextBrightness
      const dev = state.value.devices['desk-light']
      if (dev) {
        dev.state.brightness = nextBrightness
        dev.state.on = nextBrightness > 0
      }
      resetAutoHideTimer()
      dispatchKnobCommandDebounced('desk-light', { brightness: nextBrightness })
      return
    }

    if (slot === 'led_rgb') {
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
      dispatchKnobCommandDebounced('room-leds', { rgb: nextHex })
      return
    }

    if (slot === 'led_brightness') {
      const nextBrightness = Math.max(0, Math.min(100, state.value.ledBrightness + dir * 5))
      state.value.ledBrightness = nextBrightness
      const dev = state.value.devices['room-leds']
      if (dev) {
        dev.state.brightness = nextBrightness
        dev.state.on = nextBrightness > 0
      }
      resetAutoHideTimer()
      dispatchKnobCommandDebounced('room-leds', { brightness: nextBrightness })
    }
  }

  function triggerAction(action: OsdHardwareAction) {
    if (action !== 'knob_cw' && action !== 'knob_ccw') {
      flushPendingKnobCommands()
    }

    if (action === 'btn1_main_light') {
      executeLightToggle('ceiling-light', 'Deckenlicht KZ West', 'fa-solid fa-lightbulb')
      return
    }

    if (action === 'btn2_blinds_up') {
      executeBlindMove('up')
      return
    }

    if (action === 'btn3_blinds_down') {
      executeBlindMove('down')
      return
    }

    if (action === 'btn4_desk_light') {
      executeLightToggle('desk-light', 'Schreibtischlicht Arthur', 'fa-solid fa-lamp')
      return
    }

    if (action === 'btn5_led_strips') {
      executeLightToggle('room-leds', 'LED Strip KZ West', 'fa-solid fa-wand-magic-sparkles')
      return
    }

    if (action === 'btn6_light_memory') {
      executeSmartLightMemory()
      return
    }

    if (action === 'knob_press') {
      // If a toast is currently active, knob click dismisses it immediately to idle
      if (state.value.visible && state.value.mode === 'TOAST') {
        hideOsdImmediately()
        return
      }

      // Standalone mode knob click handling
      if (state.value.visible && state.value.isStandalone) {
        if (state.value.mode === 'blind_angle' || state.value.mode === 'desk_brightness') {
          hideOsdImmediately()
          return
        }
        if (state.value.mode === 'led_rgb' || state.value.mode === 'led_brightness') {
          if (state.value.standaloneStep === 0) {
            flushPendingKnobCommands()
            const counterpart: OsdKnobSlot =
              state.value.mode === 'led_rgb' ? 'led_brightness' : 'led_rgb'
            state.value.mode = counterpart
            state.value.activeDeviceId = KNOB_SLOT_METADATA[counterpart].deviceId
            const idx = state.value.slotOrder.indexOf(counterpart)
            state.value.activeSlotIndex = idx >= 0 ? idx : 0
            state.value.standaloneStep = 1
            resetAutoHideTimer()
            return
          }
          hideOsdImmediately()
          return
        }
        hideOsdImmediately()
        return
      }

      if (!state.value.visible || state.value.mode === 'IDLE') {
        enterSlotByIndex(0)
        return
      }
      const nextIdx = state.value.activeSlotIndex + 1
      if (nextIdx >= state.value.slotOrder.length) {
        hideOsdImmediately()
      } else {
        enterSlotByIndex(nextIdx)
      }
      return
    }

    if (action === 'knob_cw' || action === 'knob_ccw') {
      const dir = action === 'knob_cw' ? 1 : -1

      // Context jump when turning the knob while a device TOAST is visible
      if (state.value.visible && state.value.mode === 'TOAST') {
        const activeId = state.value.activeDeviceId
        const dev = activeId ? state.value.devices[activeId] : null
        if (dev?.id === 'blinds-all') {
          enterStandaloneSlot('blind_angle')
        } else if (dev?.id === 'desk-light' && dev.state.on) {
          enterStandaloneSlot('desk_brightness')
        } else if (dev?.id === 'room-leds' && dev.state.on) {
          const firstLed =
            state.value.slotOrder.find((s) => s === 'led_rgb' || s === 'led_brightness') ??
            'led_rgb'
          enterStandaloneSlot(firstLed)
        } else if (dev?.id === 'ceiling-light') {
          // Ceiling light has no dimmer; keep toast as-is without entering slot
          return
        } else {
          enterSlotByIndex(0)
        }
      } else if (!state.value.visible || state.value.mode === 'IDLE') {
        enterSlotByIndex(0)
      }

      const activeSlot: OsdKnobSlot =
        state.value.mode !== 'IDLE' && state.value.mode !== 'TOAST'
          ? (state.value.mode as OsdKnobSlot)
          : (state.value.slotOrder[state.value.activeSlotIndex] ?? 'blind_angle')
      applySlotKnobTurn(activeSlot, dir)
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

      eventSource.addEventListener('environment-state', (evt: MessageEvent) => {
        try {
          const env = JSON.parse(evt.data) as KnxEnvironmentDTO
          if (env && typeof env.sunElevation === 'number') {
            applyEnvironmentState(env)
          }
        } catch {
          // Ignore malformed JSON
        }
      })

      eventSource.addEventListener('knx-status', (evt: MessageEvent) => {
        try {
          const status = JSON.parse(evt.data)
          if (status && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('smarthub-knx-status', { detail: status }))
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
      // Ignore EventSource init errors
    }
  }

  function initDeviceOsd() {
    if (!import.meta.client) return
    loadPersistedPreferences()

    if (!listenerAttached) {
      window.addEventListener('keydown', handleKeyDown, { passive: false })
      listenerAttached = true
    }

    api
      .fetchDevices()
      .then((res) => {
        if (res?.devices) {
          applyDeviceSnapshot(res.devices)
        }
        if (res?.environment) {
          applyEnvironmentState(res.environment)
        }
      })
      .catch(() => {})

    connectSse()
  }

  function destroyDeviceOsd() {
    flushPendingKnobCommands()
    if (!import.meta.client) return
    if (listenerAttached) {
      window.removeEventListener('keydown', handleKeyDown)
      listenerAttached = false
    }
    if (hideTimer) {
      clearTimeout(hideTimer)
      hideTimer = null
    }
    if (idleDebounceTimer) {
      clearTimeout(idleDebounceTimer)
      idleDebounceTimer = null
    }
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    if (eventSource) {
      eventSource.close()
      eventSource = null
    }
  }

  const activeDevice = computed(() => {
    const id = state.value.activeDeviceId
    return id ? state.value.devices[id] ?? null : null
  })

  return {
    state,
    activeDevice,
    initDeviceOsd,
    destroyDeviceOsd,
    triggerAction,
    enterSlotByIndex,
    enterStandaloneSlot,
    moveKnobSlot,
    setKeyBinding,
    resetKeymapToDefaults,
    startLearningKey,
    cancelLearningKey,
    hideOsdImmediately,
    flushPendingKnobCommands,
  }
}
