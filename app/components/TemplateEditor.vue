<script setup lang="ts">
import { useTemplateStore } from '~/stores/template'
import VariableInput from './VariableInput.vue'

const store = useTemplateStore()

const variableList = computed(() => store.currentTemplate?.variables ?? [])
</script>

<template>
  <div class="template-editor">
    <!-- 变量输入区 -->
    <div class="variables-section">
      <h3 class="section-title">参数配置</h3>
      <div class="variables-grid">
        <VariableInput
          v-for="variable in variableList"
          :key="variable.key"
          :variable="variable"
          :model-value="store.variableValues[variable.key] ?? ''"
          @update:model-value="(v) => store.updateVariable(variable.key, v)"
        />
      </div>
    </div>

    <!-- 模板预览 -->
    <div class="preview-section">
      <h3 class="section-title">Prompt 预览</h3>
      <div class="preview-content">
        <pre class="prompt-preview">{{ store.filledPrompt }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-editor {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: var(--text-color);
}

.variables-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.preview-section {
  border-top: 1px solid var(--border-color);
  padding-top: 24px;
}

.preview-content {
  background: var(--bg-elevated);
  border-radius: 8px;
  padding: 16px;
  max-height: 300px;
  overflow-y: auto;
}

.prompt-preview {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Fira Code', monospace;
  font-size: 14px;
  line-height: 1.6;
  color: var(--text-color);
}
</style>
