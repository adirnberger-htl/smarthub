import { ref, onMounted, onUnmounted, watch } from 'vue'
import { useState } from '#app'
import { useSmarthubApi, type DevStatusResponse } from './use-smarthub-api'
import { useSettings } from './use-settings'

const POLL_INTERVAL_MS = 15000

export function useDevStatus() {
  const { fetchDevStatus } = useSmarthubApi()
  const { getGlobalSettings } = useSettings()
  const globalSettings = getGlobalSettings()

  const devStatus = useState<DevStatusResponse | null>('smarthub-dev-status', () => null)
  const loading = useState<boolean>('smarthub-dev-status-loading', () => false)
  const error = useState<string | null>('smarthub-dev-status-error', () => null)
  const latencyMs = useState<number>('smarthub-dev-status-latency', () => 0)
  const isLeftCollapsed = useState<boolean>('smarthub-dev-left-collapsed', () => false)
  const isRightCollapsed = useState<boolean>('smarthub-dev-right-collapsed', () => false)

  let pollTimer: ReturnType<typeof setInterval> | null = null

  const refresh = async () => {
    if (!import.meta.client) return
    const start = performance.now()
    loading.value = true
    try {
      const data = await fetchDevStatus()
      latencyMs.value = Math.round(performance.now() - start)
      devStatus.value = data
      error.value = null
    } catch (err: any) {
      error.value = err?.message || 'Failed to fetch dev status'
    } finally {
      loading.value = false
    }
  }

  const startPolling = () => {
    if (!import.meta.client) return
    stopPolling()
    refresh()
    pollTimer = setInterval(() => {
      if (document.visibilityState === 'visible') {
        refresh()
      }
    }, POLL_INTERVAL_MS)
  }

  const stopPolling = () => {
    if (pollTimer) {
      clearInterval(pollTimer)
      pollTimer = null
    }
  }

  const handleVisibilityChange = () => {
    if (!import.meta.client) return
    if (document.visibilityState === 'visible' && globalSettings.devOverlayEnabled) {
      refresh()
      startPolling()
    } else {
      stopPolling()
    }
  }

  const handleKnxStatusEvent = (e: Event) => {
    const custom = e as CustomEvent
    if (custom.detail && devStatus.value) {
      devStatus.value.knx = {
        ...devStatus.value.knx,
        ...custom.detail,
      }
    }
  }

  const toggleLeftCollapse = () => {
    isLeftCollapsed.value = !isLeftCollapsed.value
  }

  const toggleRightCollapse = () => {
    isRightCollapsed.value = !isRightCollapsed.value
  }

  if (import.meta.client) {
    onMounted(() => {
      window.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('smarthub-knx-status', handleKnxStatusEvent)
      if (globalSettings.devOverlayEnabled) {
        startPolling()
      }
    })

    onUnmounted(() => {
      stopPolling()
      window.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('smarthub-knx-status', handleKnxStatusEvent)
    })
  }

  return {
    devStatus,
    loading,
    error,
    latencyMs,
    isLeftCollapsed,
    isRightCollapsed,
    refresh,
    startPolling,
    stopPolling,
    toggleLeftCollapse,
    toggleRightCollapse,
  }
}
