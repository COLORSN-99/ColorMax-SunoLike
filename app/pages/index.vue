<script setup lang="ts">
import { useTemplateStore } from '~/stores/template'
import TemplateSelector from '~/components/TemplateSelector.vue'
import TemplateEditor from '~/components/TemplateEditor.vue'
import OutputFormatter from '~/components/OutputFormatter.vue'

const store = useTemplateStore()

// 初始化：加载默认模板
onMounted(() => {
  store.loadCustomTemplates()
  // 默认选中第一个模板
  if (!store.currentTemplate && store.allTemplates.length > 0) {
    store.selectTemplate(store.allTemplates[0])
  }
})
</script>

<template>
  <div class="home-page">
    <header class="page-header">
      <h1 class="page-title">ColorMax</h1>
      <p class="page-desc">AI 提示词中台 | 将你的创意转化为大模型能理解的上下文</p>
    </header>

    <main class="page-content">
      <div class="main-grid">
        <!-- 左侧：模板编辑 -->
        <section class="editor-section">
          <TemplateSelector />
          <TemplateEditor v-if="store.currentTemplate" />
        </section>

        <!-- 右侧：输出 -->
        <section class="output-section">
          <OutputFormatter v-if="store.currentTemplate" />
        </section>
      </div>
    </main>

    <footer class="page-footer">
      <p>Made with ❤️ for AI Creators</p>
    </footer>
  </div>
</template>

<style scoped>
.home-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.page-header {
  text-align: center;
  padding: 48px 24px 32px;
  background: linear-gradient(135deg, var(--primary-color) 0%, #667eea 100%);
  color: #fff;
}

.page-title {
  font-size: 36px;
  font-weight: 700;
  margin: 0 0 12px 0;
  letter-spacing: 2px;
}

.page-desc {
  font-size: 16px;
  margin: 0;
  opacity: 0.9;
}

.page-content {
  flex: 1;
  padding: 32px 24px;
  max-width: 1400px;
  margin: 0 auto;
  width: 100%;
}

.main-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 32px;
}

@media (max-width: 1024px) {
  .main-grid {
    grid-template-columns: 1fr;
  }
}

.editor-section,
.output-section {
  background: var(--bg-base);
  border-radius: 16px;
  padding: 24px;
  border: 1px solid var(--border-color);
}

.page-footer {
  text-align: center;
  padding: 24px;
  color: #909399;
  font-size: 14px;
}

.page-footer p {
  margin: 0;
}
</style>
