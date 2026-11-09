<template>
  <div class="wrapper">
    <main class="content" :class="{ 'content--no-scroll': isDashboard }">
      <slot />
    </main>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isDashboard = computed(() => route.path === '/dashboard' || route.path === '/')
</script>

<style scoped>
.wrapper {
  height: 100vh;
  background: var(--bg-app);
  color: var(--text-primary);
  font-family: var(--font-sans);
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  padding: 24px;
  overflow: auto;
  min-height: 0;
}

.content--no-scroll {
  overflow: hidden !important;
}
</style>
