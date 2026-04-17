<script setup lang="ts">
import { useTemplateStore } from '~/stores/template'
import type { OutputFormat } from '~/types'

const store = useTemplateStore()

const formatOptions = [
  { value: 'prompt', label: 'Prompt', desc: '原始 Prompt 文本' },
  { value: 'mcp', label: 'MCP Server', desc: 'Model Context Protocol 服务' },
  { value: 'skill', label: 'Claude Skill', desc: 'Claude AI Skill 格式' }
] as const

const handleFormatChange = (format: OutputFormat) => {
  store.setOutputFormat(format)
}

const copyToClipboard = async () => {
  if (store.generatedResult?.content) {
    await navigator.clipboard.writeText(store.generatedResult.content)
    ElMessage.success('已复制到剪贴板')
  }
}
</script>

<template>
  <div class="output-formatter">
    <!-- 格式选择 -->
    <div class="format-selector">
      <h3 class="section-title">输出格式</h3>
      <div class="format-tabs">
        <button
          v-for="opt in formatOptions"
          :key="opt.value"
          class="format-tab"
          :class="{ active: store.outputFormat === opt.value }"
          @click="handleFormatChange(opt.value)"
        >
          <span class="format-label">{{ opt.label }}</span>
          <span class="format-desc">{{ opt.desc }}</span>
        </button>
      </div>
    </div>

    <!-- 生成按钮 -->
    <div class="generate-section">
      <button
        class="generate-btn"
        :disabled="!store.currentTemplate"
        @click="store.generate()"
      >
        生成 {{ formatOptions.find(o => o.value === store.outputFormat)?.label }}
      </button>
    </div>

    <!-- 结果展示 -->
    <div v-if="store.generatedResult" class="result-section">
      <div class="result-header">
        <h3 class="section-title">生成结果</h3>
        <button class="copy-btn" @click="copyToClipboard">
          复制
        </button>
      </div>
      <div class="result-content">
        <pre class="result-code">{{ store.generatedResult.content }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.output-formatter {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 12px 0;
  color: var(--text-color);
}

.format-tabs {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.format-tab {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  padding: 12px 16px;
  border: 2px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  transition: all 0.2s;
  min-width: 140px;
}

.format-tab:hover {
  border-color: var(--primary-color);
}

.format-tab.active {
  border-color: var(--primary-color);
  background: var(--primary-color-light);
}

.format-label {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
}

.format-desc {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

.generate-section {
  display: flex;
  justify-content: center;
}

.generate-btn {
  padding: 12px 32px;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  background: var(--primary-color);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.generate-btn:hover:not(:disabled) {
  background: var(--primary-color-dark);
  transform: translateY(-1px);
}

.generate-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.result-section {
  border-top: 1px solid var(--border-color);
  padding-top: 20px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.copy-btn {
  padding: 6px 16px;
  font-size: 14px;
  color: var(--primary-color);
  background: transparent;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-btn:hover {
  background: var(--primary-color-light);
}

.result-content {
  background: var(--bg-elevated);
  border-radius: 8px;
  padding: 16px;
  max-height: 400px;
  overflow: auto;
}

.result-code {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Fira Code', monospace;
  font-size: 13px;
  line-height: 1.6;
  color: var(--text-color);
}
</style>
