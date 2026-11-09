<template>
  <div class="landing-layout">
    <slot />
  </div>
</template>

<style scoped>
.landing-layout {
  min-height: 100vh;
  margin: 0;

  display: flex;
  align-items: center;
  justify-content: center;

  font-family: var(--font-sans);

  background: linear-gradient(135deg, #3b82f6, #6366f1);
}
</style>