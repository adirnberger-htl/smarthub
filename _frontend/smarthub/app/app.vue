<template>
  <div>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>

    <SettingsButton v-if="$route.path !== '/login'" />
    <ProfileButton v-if="$route.path === '/settings'" />
    <DeviceOsdOverlay v-if="$route.path !== '/login'" />
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
import { useHead } from '#app'
import { useSettings } from './composables/use-settings'
import SettingsButton from './components/settings-button.vue'
import ProfileButton from './components/profile-button.vue'
import DeviceOsdOverlay from './components/device-osd-overlay.vue'

const route = useRoute()
const { getGlobalSettings, resolvedTheme } = useSettings()
useHead({
  htmlAttrs: {
    'data-theme': resolvedTheme
  }
})
</script>

<style scoped>
</style>