import { ref, computed, onMounted, onUnmounted } from 'vue'

export type AlarmItem = {
  id: string
  time: string
  enabled: boolean
}

export type RoutineCoords = {
  address: string
  lat: number
  lon: number
  formattedAddress?: string
}

export type RoutineItem = {
  id: string
  name: string
  startTime: string
  endTime: string
  arrivalTime: string
  destination: string
  startAddress: string
  startCoords?: RoutineCoords
  destCoords?: RoutineCoords
  transportMode: 'bus' | 'car'
  activeDays: number[] // 0 = Sun, 1 = Mon, ..., 6 = Sat
  alarms: AlarmItem[]
}

export type GlobalSettings = {
  clockType: 'digital' | 'analog'
  displaySpeed: 'very-slow' | 'slow' | 'medium' | 'fast' | 'very-fast'
  weatherLocation: string
  theme: 'light' | 'dark' | 'auto'
  themeSchedule?: { light: string; dark: string }
  devOverlayEnabled: boolean
}

export type Settings = {
  global: GlobalSettings
  routines: RoutineItem[]
}

// Convert API routine response to frontend RoutineItem
function apiToRoutineItem(r: any): RoutineItem {
  const startAddress = r.startAddress || ''
  const destination = r.destination || ''
  const rawStartCoords = r.config?.startCoords
  const rawDestCoords = r.config?.destCoords

  return {
    id: r.id,
    name: r.name || 'Routine',
    startTime: r.startTime || '08:00',
    endTime: r.endTime || '09:00',
    arrivalTime: r.arrivalTime || '08:00',
    destination,
    startAddress,
    startCoords: rawStartCoords && rawStartCoords.address === startAddress ? rawStartCoords : undefined,
    destCoords: rawDestCoords && rawDestCoords.address === destination ? rawDestCoords : undefined,
    transportMode: r.transportMode || 'bus',
    activeDays: r.days || [],
    alarms: r.config?.alarms || []
  }
}

// Convert frontend RoutineItem to API request body
function routineItemToApi(item: RoutineItem): Record<string, unknown> {
  const startCoords = item.startCoords && item.startCoords.address === item.startAddress ? item.startCoords : undefined
  const destCoords = item.destCoords && item.destCoords.address === item.destination ? item.destCoords : undefined

  return {
    name: item.name || 'Routine',
    start_time: item.startTime,
    end_time: item.endTime,
    arrival_time: item.arrivalTime,
    days: item.activeDays || [],
    transport_mode: item.transportMode || 'bus',
    destination: item.destination || '',
    start_address: item.startAddress || '',
    config: {
      alarms: item.alarms || [],
      ...(startCoords ? { startCoords } : {}),
      ...(destCoords ? { destCoords } : {})
    }
  }
}

export function useSettings() {
  const state = useState<Settings>('app-settings', () => ({
    global: { clockType: 'digital', displaySpeed: 'medium', weatherLocation: 'Linz, Austria', theme: 'light', devOverlayEnabled: false },
    routines: []
  }))
  
  const currentHM = useState<string>('app-time', () => {
    const d = new Date()
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })

  // Start time updates if in browser
  if (import.meta.client) {
    if (!(window as any)._smarthub_theme_timer) {
      (window as any)._smarthub_theme_timer = setInterval(() => {
        const d = new Date()
        currentHM.value = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      }, 60000)
    }
  }

  const resolvedTheme = computed(() => {
    const settings = state.value.global
    if (settings.theme === 'auto') {
      const schedule = settings.themeSchedule || { light: '07:00', dark: '19:00' }
      const now = currentHM.value || '00:00'
      const light = schedule.light
      const dark = schedule.dark
      
      if (light < dark) {
        if (now >= light && now < dark) return 'light'
        return 'dark'
      } else {
        if (now >= dark && now < light) return 'dark'
        return 'light'
      }
    }
    return settings.theme || 'light'
  })

  const loadFromServer = async () => {
    const { fetchSettings, fetchRoutines } = useSmarthubApi()
    try {
      const [settings, routines] = await Promise.all([
        fetchSettings(),
        fetchRoutines()
      ])
      state.value.global = {
        clockType: (settings as any).clockType || 'digital',
        displaySpeed: (settings as any).displaySpeed || (settings as any).scrollSpeed || 'medium',
        weatherLocation: (settings as any).weatherLocation || 'Linz, Austria',
        theme: (settings as any).theme || 'light',
        themeSchedule: (settings as any).themeSchedule,
        devOverlayEnabled: Boolean((settings as any).devOverlayEnabled)
      }
      state.value.routines = routines.map(apiToRoutineItem)
    } catch (e) {
      console.error('Failed to load settings from server', e)
    }
  }

  // Load from API on first use
  useAsyncData('app-settings-load', async () => {
    await loadFromServer()
    return true
  })

  function getGlobalSettings(): GlobalSettings {
    return state.value.global
  }

  // ...

  async function saveGlobalSettings() {
    const { updateSettings } = useSmarthubApi()
    try {
      await updateSettings({ 
        clockType: state.value.global.clockType,
        displaySpeed: state.value.global.displaySpeed,
        weatherLocation: state.value.global.weatherLocation,
        theme: state.value.global.theme,
        themeSchedule: state.value.global.themeSchedule,
        devOverlayEnabled: state.value.global.devOverlayEnabled
      })
    } catch (e) {
      console.error('Failed to save settings', e)
    }
  }

  async function addRoutineItem(): Promise<RoutineItem> {
    const { createRoutine } = useSmarthubApi()
    const now = new Date()
    const hh = String(now.getHours()).padStart(2, '0')
    const mm = String(now.getMinutes()).padStart(2, '0')
    const currentTime = `${hh}:${mm}`

    const newItem: RoutineItem = {
      id: crypto.randomUUID(), // temporary
      name: 'Routine',
      startTime: '06:00',
      endTime: '08:30',
      arrivalTime: '08:00',
      destination: '',
      startAddress: '',
      transportMode: 'bus',
      activeDays: [1, 2, 3, 4, 5],
      alarms: []
    }

    try {
      const created = await createRoutine(routineItemToApi(newItem))
      const item = apiToRoutineItem(created)
      state.value.routines.push(item)
      return item
    } catch (e) {
      console.error('Failed to create routine', e)
      // Add locally as fallback
      state.value.routines.push(newItem)
      return newItem
    }
  }

  async function updateRoutineItem(updated: RoutineItem) {
    const idx = state.value.routines.findIndex(r => r.id === updated.id)
    if (idx !== -1) {
      state.value.routines[idx] = { ...updated }
    }

    // Debounced save to server
    debouncedSaveRoutine(updated)
  }

  // Debounce map for routine saves
  const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

  function debouncedSaveRoutine(item: RoutineItem) {
    const existing = saveTimers.get(item.id)
    if (existing) clearTimeout(existing)

    saveTimers.set(item.id, setTimeout(async () => {
      saveTimers.delete(item.id)
      const { updateRoutine } = useSmarthubApi()
      try {
        await updateRoutine(item.id, routineItemToApi(item))
      } catch (e) {
        console.error('Failed to update routine', e)
      }
    }, 500))
  }

  async function removeRoutineItem(id: string) {
    state.value.routines = state.value.routines.filter(r => r.id !== id)
    const { deleteRoutine } = useSmarthubApi()
    try {
      await deleteRoutine(id)
    } catch (e) {
      console.error('Failed to delete routine', e)
    }
  }

  return {
    state,
    currentHM,
    resolvedTheme,
    getGlobalSettings,
    addRoutineItem,
    updateRoutineItem,
    removeRoutineItem,
    saveGlobalSettings,
    loadFromServer,
  }
}
