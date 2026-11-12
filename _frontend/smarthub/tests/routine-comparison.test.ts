import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ref } from 'vue'
import {
  calculateCommuteComparison,
  createIdleComparison,
  createLoadingComparison,
  formatArrivalTime,
  resolveRoutineCoordinates,
  useRoutineComparison,
  clearComparisonCache,
  type RoutineLike
} from '../app/composables/use-routine-comparison.ts'

describe('useRoutineComparison - Pure Calculation Logic', () => {
  it('identifies car faster scenario with correct duration delta', () => {
    const result = calculateCommuteComparison(20, 35)
    assert.equal(result.state, 'car_faster')
    assert.equal(result.fasterMode, 'car')
    assert.equal(result.differenceMinutes, 15)
    assert.equal(result.carMinutes, 20)
    assert.equal(result.transitMinutes, 35)
    assert.equal(result.displayText, 'Car is 15 min faster (20m vs 35m)')
  })

  it('identifies transit faster scenario with correct duration delta', () => {
    const result = calculateCommuteComparison(30, 22)
    assert.equal(result.state, 'transit_faster')
    assert.equal(result.fasterMode, 'bus')
    assert.equal(result.differenceMinutes, 8)
    assert.equal(result.carMinutes, 30)
    assert.equal(result.transitMinutes, 22)
    assert.equal(result.displayText, 'Public Transport is 8 min faster (22m vs 30m)')
  })

  it('identifies similar travel times when durations are within 1 minute', () => {
    // Exactly equal
    const equalResult = calculateCommuteComparison(25, 25)
    assert.equal(equalResult.state, 'similar')
    assert.equal(equalResult.fasterMode, null)
    assert.equal(equalResult.differenceMinutes, 0)
    assert.equal(equalResult.displayText, 'Similar travel time (~25 min)')

    // 1 minute delta
    const deltaOneResult = calculateCommuteComparison(24, 25)
    assert.equal(deltaOneResult.state, 'similar')
    assert.equal(deltaOneResult.differenceMinutes, 1)
    assert.equal(deltaOneResult.displayText, 'Similar travel time (~24 min)')
  })

  it('handles partial route error tolerance when transit is unavailable', () => {
    const result = calculateCommuteComparison(25, null)
    assert.equal(result.state, 'partial')
    assert.equal(result.carMinutes, 25)
    assert.equal(result.transitMinutes, null)
    assert.equal(result.fasterMode, null)
    assert.equal(result.displayText, 'Car takes 25 min (transit unavailable)')
  })

  it('handles partial route error tolerance when car route is unavailable', () => {
    const result = calculateCommuteComparison(null, 42)
    assert.equal(result.state, 'partial')
    assert.equal(result.carMinutes, null)
    assert.equal(result.transitMinutes, 42)
    assert.equal(result.fasterMode, null)
    assert.equal(result.displayText, 'Public Transport takes 42 min (car unavailable)')
  })

  it('handles scenario when both routes are unavailable', () => {
    const result = calculateCommuteComparison(null, null)
    assert.equal(result.state, 'error')
    assert.equal(result.displayText, 'Route comparison unavailable')
  })
})

describe('resolveRoutineCoordinates - Coordinate Caching & Geocoding', () => {
  it('reuses existing matching coordinates without invoking geocoder', async () => {
    let geocodedCount = 0
    const mockGeocoder = async () => {
      geocodedCount++
      return { coordinates: { lat: 10, lon: 20 }, formattedAddress: 'Mock' }
    }

    const routine: RoutineLike = {
      id: 'r1',
      startAddress: 'Home Street 1',
      destination: 'Work Avenue 2',
      startCoords: { address: 'Home Street 1', lat: 48.2, lon: 14.3 },
      destCoords: { address: 'Work Avenue 2', lat: 48.3, lon: 14.4 }
    }

    const { start, dest } = await resolveRoutineCoordinates(routine, mockGeocoder)
    assert.equal(geocodedCount, 0, 'Geocoder must not be called when coordinates match address')
    assert.deepEqual(start, { lat: 48.2, lon: 14.3 })
    assert.deepEqual(dest, { lat: 48.3, lon: 14.4 })
  })

  it('invokes geocoder and stores coords when coords are missing or address changed', async () => {
    let geocodedCalls: string[] = []
    const mockGeocoder = async (address: string) => {
      geocodedCalls.push(address)
      if (address === 'New Destination') {
        return { coordinates: { lat: 48.5, lon: 14.5 }, formattedAddress: 'New Destination, Austria' }
      }
      return { coordinates: { lat: 48.1, lon: 14.1 }, formattedAddress: 'Default Address' }
    }

    const routine: RoutineLike = {
      id: 'r2',
      startAddress: 'Home Street 1',
      destination: 'New Destination',
      startCoords: { address: 'Home Street 1', lat: 48.2, lon: 14.3 },
      destCoords: { address: 'Old Destination', lat: 48.0, lon: 14.0 }
    }

    const { start, dest } = await resolveRoutineCoordinates(routine, mockGeocoder)
    assert.equal(geocodedCalls.length, 1, 'Only mismatched destination should be geocoded')
    assert.equal(geocodedCalls[0], 'New Destination')
    assert.deepEqual(start, { lat: 48.2, lon: 14.3 })
    assert.deepEqual(dest, { lat: 48.5, lon: 14.5 })
    assert.equal(routine.destCoords?.address, 'New Destination')
  })

  it('returns nulls when addresses are missing without calling geocoder', async () => {
    let geocodedCount = 0
    const mockGeocoder = async () => {
      geocodedCount++
      return null
    }

    const routine: RoutineLike = {
      id: 'r3',
      startAddress: '',
      destination: ''
    }

    const { start, dest } = await resolveRoutineCoordinates(routine, mockGeocoder)
    assert.equal(geocodedCount, 0)
    assert.equal(start, null)
    assert.equal(dest, null)
  })
})

describe('useRoutineComparison - Composable Execution & State Management', () => {
  it('manages debounced comparison and computes comparison state for a routine', async () => {
    const mockApi = {
      get: async (path: string) => {
        if (path === '/api/car/route') {
          return { durationInTrafficSeconds: 1200 } // 20m
        }
        if (path === '/api/bus/route') {
          return [{ total_duration_minutes: 32 }] // 32m
        }
        throw new Error('Unknown path')
      }
    }

    const { comparisons, executeComparison, getComparison } = useRoutineComparison({
      api: mockApi,
      debounceMs: 50
    })

    const routine: RoutineLike = {
      id: 'routine-101',
      startAddress: 'Leonding',
      destination: 'Linz',
      arrivalTime: '08:00',
      startCoords: { address: 'Leonding', lat: 48.26, lon: 14.25 },
      destCoords: { address: 'Linz', lat: 48.30, lon: 14.28 }
    }

    await executeComparison(routine)

    const comp = getComparison('routine-101')
    assert.equal(comp.state, 'car_faster')
    assert.equal(comp.fasterMode, 'car')
    assert.equal(comp.differenceMinutes, 12)
    assert.equal(comp.carMinutes, 20)
    assert.equal(comp.transitMinutes, 32)
    assert.equal(comp.displayText, 'Car is 12 min faster (20m vs 32m)')
    assert.equal(comparisons['routine-101']?.displayText, comp.displayText)
  })

  it('handles missing addresses by remaining in idle state', async () => {
    const { comparisons, executeComparison, getComparison } = useRoutineComparison({
      debounceMs: 10
    })

    const routine: RoutineLike = {
      id: 'routine-empty',
      startAddress: '',
      destination: ''
    }

    await executeComparison(routine)
    const comp = getComparison('routine-empty')
    assert.equal(comp.state, 'idle')
    assert.equal(comp.displayText, '')
  })

  it('handles partial route error tolerance during API execution', async () => {
    const mockApi = {
      get: async (path: string) => {
        if (path === '/api/car/route') {
          return { durationInTrafficSeconds: 1500 } // 25m
        }
        if (path === '/api/bus/route') {
          return [] // No transit route found
        }
        throw new Error('404')
      }
    }

    const { executeComparison, getComparison } = useRoutineComparison({
      api: mockApi,
      debounceMs: 10
    })

    const routine: RoutineLike = {
      id: 'routine-partial',
      startAddress: 'Hargelsberg',
      destination: 'Remote Area',
      arrivalTime: '19:00',
      startCoords: { address: 'Hargelsberg', lat: 48.14, lon: 14.42 },
      destCoords: { address: 'Remote Area', lat: 48.01, lon: 14.10 }
    }

    await executeComparison(routine)
    const comp = getComparison('routine-partial')
    assert.equal(comp.state, 'partial')
    assert.equal(comp.carMinutes, 25)
    assert.equal(comp.transitMinutes, null)
    assert.equal(comp.displayText, 'Car takes 25 min (transit unavailable)')
  })

  it('does not trigger onRoutineUpdated callback when coordinates already match', async () => {
    let updateCalls = 0
    const mockApi = {
      get: async (path: string) => {
        if (path === '/api/car/route') return { durationInTrafficSeconds: 1200 }
        if (path === '/api/bus/route') return [{ total_duration_minutes: 30 }]
        throw new Error('404')
      }
    }

    const { executeComparison } = useRoutineComparison({
      api: mockApi,
      onRoutineUpdated: () => {
        updateCalls++
      }
    })

    const routine: RoutineLike = {
      id: 'routine-matched-coords',
      startAddress: 'Linz',
      destination: 'Wels',
      arrivalTime: '08:00',
      startCoords: { address: 'Linz', lat: 48.3, lon: 14.28 },
      destCoords: { address: 'Wels', lat: 48.16, lon: 14.02 }
    }

    await executeComparison(routine)
    assert.equal(updateCalls, 0, 'onRoutineUpdated must not be called when coordinates already matched')
  })

  it('triggers onRoutineUpdated callback only when geocoder resolves new coordinates', async () => {
    let updatedRoutine: RoutineLike | null = null
    const mockApi = {
      get: async (path: string) => {
        if (path === '/api/car/route') return { durationInTrafficSeconds: 600 }
        if (path === '/api/bus/route') return [{ total_duration_minutes: 15 }]
        throw new Error('404')
      },
      geocodePlace: async (address: string) => ({
        coordinates: { lat: 48.25, lon: 14.25 },
        formattedAddress: `${address}, Austria`
      })
    }

    const { executeComparison } = useRoutineComparison({
      api: mockApi,
      onRoutineUpdated: (r) => {
        updatedRoutine = r
      }
    })

    const routine: RoutineLike = {
      id: 'routine-needs-geocoding',
      startAddress: 'Leonding',
      destination: 'Linz',
      arrivalTime: '08:00'
      // missing startCoords and destCoords
    }

    await executeComparison(routine)
    assert.ok(updatedRoutine, 'onRoutineUpdated must be called when new coordinates are resolved')
    assert.deepEqual((updatedRoutine as RoutineLike).startCoords?.lat, 48.25)
    assert.deepEqual((updatedRoutine as RoutineLike).destCoords?.lat, 48.25)
  })

  it('executes debounced comparisons for multiple routines concurrently without starving sibling routines', async () => {
    const fetchedRoutines = new Set<string>()
    const mockApi = {
      get: async (path: string, query: any) => {
        if (path === '/api/car/route') {
          fetchedRoutines.add(`car:${query.lat_a}`)
          return { durationInTrafficSeconds: 900 }
        }
        if (path === '/api/bus/route') {
          fetchedRoutines.add(`bus:${query.lat_a}`)
          return [{ total_duration_minutes: 20 }]
        }
        throw new Error('404')
      }
    }

    const routinesRef = ref<RoutineLike[]>([
      {
        id: 'r1',
        startAddress: 'A',
        destination: 'B',
        arrivalTime: '08:00',
        startCoords: { address: 'A', lat: 48.1, lon: 14.1 },
        destCoords: { address: 'B', lat: 48.2, lon: 14.2 }
      },
      {
        id: 'r2',
        startAddress: 'C',
        destination: 'D',
        arrivalTime: '09:00',
        startCoords: { address: 'C', lat: 48.3, lon: 14.3 },
        destCoords: { address: 'D', lat: 48.4, lon: 14.4 }
      }
    ])

    const { getComparison } = useRoutineComparison({
      routines: routinesRef,
      api: mockApi,
      debounceMs: 25
    })

    // Wait for debounce timer to fire for both routines
    await new Promise((r) => setTimeout(r, 80))

    const comp1 = getComparison('r1')
    const comp2 = getComparison('r2')

    assert.notEqual(comp1.state, 'idle', 'Routine 1 comparison must execute')
    assert.notEqual(comp2.state, 'idle', 'Routine 2 comparison must execute and not be starved by Routine 1')
    assert.equal(comp1.state, 'car_faster')
    assert.equal(comp2.state, 'car_faster')
  })

  it('ignores non-routing property mutations (alarms, name, activeDays) without refetching', async () => {
    let fetchCount = 0
    const mockApi = {
      get: async (path: string) => {
        fetchCount++
        if (path === '/api/car/route') return { durationInTrafficSeconds: 600 }
        if (path === '/api/bus/route') return [{ total_duration_minutes: 10 }]
        throw new Error('404')
      }
    }

    const routinesRef = ref<RoutineLike[]>([
      {
        id: 'r-mutation',
        name: 'Initial Name',
        startAddress: 'Start Place',
        destination: 'End Place',
        arrivalTime: '07:30',
        activeDays: [1, 2],
        alarms: [],
        startCoords: { address: 'Start Place', lat: 48.11, lon: 14.11 },
        destCoords: { address: 'End Place', lat: 48.22, lon: 14.22 }
      }
    ])

    useRoutineComparison({
      routines: routinesRef,
      api: mockApi,
      debounceMs: 20
    })

    await new Promise((r) => setTimeout(r, 60))
    const initialFetches = fetchCount
    assert.ok(initialFetches > 0, 'Initial routing comparison should fetch')

    // Mutate non-routing fields
    routinesRef.value[0].name = 'New Name'
    routinesRef.value[0].activeDays = [1, 2, 3, 4, 5]
    routinesRef.value[0].alarms = [{ id: 'a1', time: '06:00', enabled: true }]
    routinesRef.value = [...routinesRef.value]

    await new Promise((r) => setTimeout(r, 60))
    assert.equal(fetchCount, initialFetches, 'Mutating non-routing fields must not trigger new fetches')
  })

  it('uses in-memory duration cache for identical coordinates and arrival time', async () => {
    clearComparisonCache()
    let apiCallCount = 0
    const mockApi = {
      get: async (path: string) => {
        apiCallCount++
        if (path === '/api/car/route') return { durationInTrafficSeconds: 1200 }
        if (path === '/api/bus/route') return [{ total_duration_minutes: 25 }]
        throw new Error('404')
      }
    }

    const { executeComparison, getComparison } = useRoutineComparison({
      api: mockApi,
      debounceMs: 10
    })

    const routineA: RoutineLike = {
      id: 'routine-cache-1',
      startAddress: 'Same Start',
      destination: 'Same Dest',
      arrivalTime: '08:00',
      startCoords: { address: 'Same Start', lat: 48.5, lon: 14.5 },
      destCoords: { address: 'Same Dest', lat: 48.6, lon: 14.6 }
    }

    const routineB: RoutineLike = {
      id: 'routine-cache-2',
      startAddress: 'Same Start',
      destination: 'Same Dest',
      arrivalTime: '08:00',
      startCoords: { address: 'Same Start', lat: 48.5, lon: 14.5 },
      destCoords: { address: 'Same Dest', lat: 48.6, lon: 14.6 }
    }

    await executeComparison(routineA)
    const initialCalls = apiCallCount
    assert.equal(initialCalls, 2) // 1 car + 1 bus

    await executeComparison(routineB)
    assert.equal(apiCallCount, initialCalls, 'Second routine with matching route parameters should use cached duration')
    assert.equal(getComparison('routine-cache-2').state, 'car_faster')
  })
})
