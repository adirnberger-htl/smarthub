import { ref, reactive, watch, getCurrentInstance, onUnmounted, type Ref, type ComputedRef } from 'vue'

export type ComparisonState = 'idle' | 'loading' | 'car_faster' | 'transit_faster' | 'similar' | 'partial' | 'error'

export interface RoutineComparisonResult {
  state: ComparisonState
  carMinutes: number | null
  transitMinutes: number | null
  differenceMinutes: number | null
  fasterMode: 'car' | 'bus' | null
  displayText: string
}

export interface RoutineCoordinates {
  address?: string
  lat: number
  lon: number
  formattedAddress?: string
}

export interface RoutineLike {
  id: string
  startAddress?: string
  destination?: string
  arrivalTime?: string
  startCoords?: RoutineCoordinates
  destCoords?: RoutineCoordinates
  transportMode?: 'bus' | 'car'
  [key: string]: any
}

export interface RoutineComparisonOptions {
  routines?: Ref<RoutineLike[]> | ComputedRef<RoutineLike[]> | (() => RoutineLike[])
  api?: {
    get: <T>(path: string, query: Record<string, string | number>) => Promise<T>
    geocodePlace?: (address: string) => Promise<{
      coordinates: { lat: number; lon: number }
      formattedAddress: string
    }>
  }
  debounceMs?: number
  onRoutineUpdated?: (routine: RoutineLike) => void
}

export function createIdleComparison(): RoutineComparisonResult {
  return {
    state: 'idle',
    carMinutes: null,
    transitMinutes: null,
    differenceMinutes: null,
    fasterMode: null,
    displayText: ''
  }
}

export function createLoadingComparison(): RoutineComparisonResult {
  return {
    state: 'loading',
    carMinutes: null,
    transitMinutes: null,
    differenceMinutes: null,
    fasterMode: null,
    displayText: 'Comparing commute times...'
  }
}

export function calculateCommuteComparison(
  carMinutes: number | null,
  transitMinutes: number | null
): RoutineComparisonResult {
  if (carMinutes == null && transitMinutes == null) {
    return {
      state: 'error',
      carMinutes: null,
      transitMinutes: null,
      differenceMinutes: null,
      fasterMode: null,
      displayText: 'Route comparison unavailable'
    }
  }

  if (carMinutes != null && transitMinutes == null) {
    const c = Math.round(carMinutes)
    return {
      state: 'partial',
      carMinutes: c,
      transitMinutes: null,
      differenceMinutes: null,
      fasterMode: null,
      displayText: `Car takes ${c} min (transit unavailable)`
    }
  }

  if (transitMinutes != null && carMinutes == null) {
    const t = Math.round(transitMinutes)
    return {
      state: 'partial',
      carMinutes: null,
      transitMinutes: t,
      differenceMinutes: null,
      fasterMode: null,
      displayText: `Public Transport takes ${t} min (car unavailable)`
    }
  }

  const c = Math.round(carMinutes!)
  const t = Math.round(transitMinutes!)
  const diff = Math.abs(c - t)

  if (diff <= 1) {
    return {
      state: 'similar',
      carMinutes: c,
      transitMinutes: t,
      differenceMinutes: diff,
      fasterMode: null,
      displayText: `Similar travel time (~${c} min)`
    }
  }

  if (c < t) {
    return {
      state: 'car_faster',
      carMinutes: c,
      transitMinutes: t,
      differenceMinutes: diff,
      fasterMode: 'car',
      displayText: `Car is ${diff} min faster (${c}m vs ${t}m)`
    }
  }

  return {
    state: 'transit_faster',
    carMinutes: c,
    transitMinutes: t,
    differenceMinutes: diff,
    fasterMode: 'bus',
    displayText: `Public Transport is ${diff} min faster (${t}m vs ${c}m)`
  }
}

export function formatArrivalTime(timeStr?: string): string {
  if (!timeStr) return '08:00:00'
  const trimmed = timeStr.trim()
  const parts = trimmed.split(':')
  if (parts.length === 2) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`
  }
  if (parts.length >= 3) {
    return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:${parts[2].padStart(2, '0')}`
  }
  return trimmed
}

export async function resolveRoutineCoordinates(
  routine: RoutineLike,
  geocoder?: (address: string) => Promise<{ coordinates: { lat: number; lon: number }; formattedAddress: string } | null>
): Promise<{
  start: { lat: number; lon: number } | null
  dest: { lat: number; lon: number } | null
  updated: boolean
}> {
  if (!routine.startAddress || !routine.destination) {
    return { start: null, dest: null, updated: false }
  }

  let updated = false

  let start = routine.startCoords && routine.startCoords.address === routine.startAddress && typeof routine.startCoords.lat === 'number'
    ? { lat: routine.startCoords.lat, lon: routine.startCoords.lon }
    : null

  let dest = routine.destCoords && routine.destCoords.address === routine.destination && typeof routine.destCoords.lat === 'number'
    ? { lat: routine.destCoords.lat, lon: routine.destCoords.lon }
    : null

  if ((!start || !dest) && geocoder) {
    if (!start && routine.startAddress) {
      try {
        const place = await geocoder(routine.startAddress)
        if (place?.coordinates) {
          start = { lat: place.coordinates.lat, lon: place.coordinates.lon }
          routine.startCoords = {
            address: routine.startAddress,
            lat: place.coordinates.lat,
            lon: place.coordinates.lon,
            formattedAddress: place.formattedAddress
          }
          updated = true
        }
      } catch {
        // geocode failed
      }
    }

    if (!dest && routine.destination) {
      try {
        const place = await geocoder(routine.destination)
        if (place?.coordinates) {
          dest = { lat: place.coordinates.lat, lon: place.coordinates.lon }
          routine.destCoords = {
            address: routine.destination,
            lat: place.coordinates.lat,
            lon: place.coordinates.lon,
            formattedAddress: place.formattedAddress
          }
          updated = true
        }
      } catch {
        // geocode failed
      }
    }
  }

  return { start, dest, updated }
}

interface CachedDurations {
  carMinutes: number | null
  transitMinutes: number | null
  timestamp: number
}

const comparisonCache = new Map<string, CachedDurations>()
export const COMPARISON_CACHE_TTL_MS = 5 * 60 * 1000

export function clearComparisonCache() {
  comparisonCache.clear()
}

export function useRoutineComparison(options?: RoutineComparisonOptions) {
  const debounceMs = options?.debounceMs ?? 500
  const comparisons = reactive<Record<string, RoutineComparisonResult>>({})
  const requestTokens = new Map<string, number>()
  const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const lastKnownSignatures = new Map<string, string>()

  function getRoutineRoutingSignature(r: RoutineLike): string {
    return `${r.id}:${r.startAddress || ''}:${r.destination || ''}:${r.arrivalTime || ''}`
  }

  // Resolve API client from options or Nuxt composable
  let api = options?.api
  if (!api) {
    try {
      // In Nuxt runtime, useSmarthubApi is auto-imported or available
      const smarthubApi = useSmarthubApi()
      api = {
        get: smarthubApi.get,
        geocodePlace: smarthubApi.geocodePlace
      }
    } catch {
      // Outside Nuxt (e.g. tests without injected api)
    }
  }

  function getComparison(id: string): RoutineComparisonResult {
    return comparisons[id] ?? createIdleComparison()
  }

  async function executeComparison(routine: RoutineLike) {
    const id = routine.id
    if (!id) return

    if (!routine.startAddress?.trim() || !routine.destination?.trim()) {
      comparisons[id] = createIdleComparison()
      return
    }

    const currentToken = (requestTokens.get(id) || 0) + 1
    requestTokens.set(id, currentToken)
    comparisons[id] = createLoadingComparison()

    try {
      const { start, dest, updated } = await resolveRoutineCoordinates(
        routine,
        api?.geocodePlace ? (addr) => api!.geocodePlace!(addr) : undefined
      )

      if (requestTokens.get(id) !== currentToken) {
        return // superseded
      }

      if (!start || !dest || !api) {
        if (!start || !dest) {
          comparisons[id] = {
            state: 'idle',
            carMinutes: null,
            transitMinutes: null,
            differenceMinutes: null,
            fasterMode: null,
            displayText: 'Address unresolved'
          }
        } else {
          comparisons[id] = {
            state: 'error',
            carMinutes: null,
            transitMinutes: null,
            differenceMinutes: null,
            fasterMode: null,
            displayText: 'API unavailable'
          }
        }
        return
      }

      // Notify caller ONLY if coordinates were newly geocoded and updated on routine
      if (updated && options?.onRoutineUpdated) {
        options.onRoutineUpdated(routine)
      }

      const arrival = formatArrivalTime(routine.arrivalTime)
      const cacheKey = `${start.lat.toFixed(5)},${start.lon.toFixed(5)}->${dest.lat.toFixed(5)},${dest.lon.toFixed(5)}@${arrival}`
      const cached = comparisonCache.get(cacheKey)
      if (cached && Date.now() - cached.timestamp < COMPARISON_CACHE_TTL_MS) {
        comparisons[id] = calculateCommuteComparison(cached.carMinutes, cached.transitMinutes)
        return
      }

      const [carResult, busResult] = await Promise.allSettled([
        api.get<any>('/api/car/route', {
          lat_a: start.lat,
          lon_a: start.lon,
          lat_b: dest.lat,
          lon_b: dest.lon,
          arrival_time: arrival
        }),
        api.get<any[]>('/api/bus/route', {
          lat_a: start.lat,
          lon_a: start.lon,
          lat_b: dest.lat,
          lon_b: dest.lon,
          arrival_time: arrival,
          max_transfers: 2
        })
      ])

      if (requestTokens.get(id) !== currentToken) {
        return // superseded by newer request
      }

      let carMinutes: number | null = null
      if (carResult.status === 'fulfilled' && carResult.value) {
        const val = carResult.value
        const sec = val.durationInTrafficSeconds ?? val.durationSeconds
        if (typeof sec === 'number' && !isNaN(sec)) {
          carMinutes = Math.round(sec / 60)
        }
      }

      let transitMinutes: number | null = null
      if (busResult.status === 'fulfilled' && Array.isArray(busResult.value) && busResult.value.length > 0) {
        const dur = busResult.value[0]?.total_duration_minutes
        if (typeof dur === 'number' && !isNaN(dur)) {
          transitMinutes = Math.round(dur)
        }
      }

      comparisonCache.set(cacheKey, {
        carMinutes,
        transitMinutes,
        timestamp: Date.now()
      })

      comparisons[id] = calculateCommuteComparison(carMinutes, transitMinutes)
    } catch {
      if (requestTokens.get(id) === currentToken) {
        comparisons[id] = {
          state: 'error',
          carMinutes: null,
          transitMinutes: null,
          differenceMinutes: null,
          fasterMode: null,
          displayText: 'Route comparison unavailable'
        }
      }
    }
  }

  function scheduleComparison(routine: RoutineLike, immediate = false) {
    const id = routine.id
    if (!id) return

    const existingTimer = debounceTimers.get(id)
    if (existingTimer) {
      clearTimeout(existingTimer)
      debounceTimers.delete(id)
    }

    if (immediate) {
      executeComparison(routine)
    } else {
      const timer = setTimeout(() => {
        debounceTimers.delete(id)
        executeComparison(routine)
      }, debounceMs)
      debounceTimers.set(id, timer)
    }
  }

  function clearAllTimers() {
    for (const timer of debounceTimers.values()) {
      clearTimeout(timer)
    }
    debounceTimers.clear()
  }

  // Setup reactive watcher if routines input was provided
  if (options?.routines) {
    const source = typeof options.routines === 'function' ? options.routines : () => options.routines!.value
    watch(
      source,
      (newList) => {
        if (!Array.isArray(newList)) return

        const activeIds = new Set(newList.map((r) => r.id).filter(Boolean))

        // Clean up removed routine comparisons
        for (const id of Object.keys(comparisons)) {
          if (!activeIds.has(id)) {
            delete comparisons[id]
            lastKnownSignatures.delete(id)
            const timer = debounceTimers.get(id)
            if (timer) {
              clearTimeout(timer)
              debounceTimers.delete(id)
            }
            requestTokens.delete(id)
          }
        }

        // Only schedule routines whose routing signature changed or wasn't seen yet
        for (const routine of newList) {
          if (!routine?.id) continue
          const newSig = getRoutineRoutingSignature(routine)
          const oldSig = lastKnownSignatures.get(routine.id)
          if (newSig !== oldSig) {
            lastKnownSignatures.set(routine.id, newSig)
            scheduleComparison(routine, false)
          }
        }
      },
      { deep: true, immediate: true }
    )
  }

  if (getCurrentInstance()) {
    onUnmounted(() => {
      clearAllTimers()
    })
  }

  return {
    comparisons,
    getComparison,
    scheduleComparison,
    executeComparison,
    clearAllTimers,
    calculateCommuteComparison
  }
}
