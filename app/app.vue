<script setup lang="ts">
import { useTemplateStore } from '~/stores/template'

// 全局初始化 Pinia store
const store = useTemplateStore()
</script>

<template>
  <div class="app-container">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style>
/* 全局样式变量 */
:root {
  --primary-color: #6366f1;
  --primary-color-light: #eef2ff;
  --primary-color-dark: #4f46e5;
  --bg-base: #ffffff;
  --bg-elevated: #f5f7fa;
  --text-color: #1f2937;
  --border-color: #e5e7eb;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: var(--bg-elevated);
  color: var(--text-color);
}

.app-container {
  min-height: 100vh;
}

/* 响应式 */
@media (max-width: 768px) {
  .app-container {
    padding: 0;
  }
}
</style>
