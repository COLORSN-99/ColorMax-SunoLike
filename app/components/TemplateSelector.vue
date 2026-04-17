<script setup lang="ts">
import { useTemplateStore } from '~/stores/template'
import type { PromptTemplate } from '~/types'

const store = useTemplateStore()

const handleSelect = (template: PromptTemplate) => {
  store.selectTemplate(template)
}
</script>

<template>
  <div class="template-selector">
    <h3 class="section-title">选择模板</h3>
    <div class="template-list">
      <div
        v-for="template in store.allTemplates"
        :key="template.id"
        class="template-card"
        :class="{ active: store.currentTemplate?.id === template.id }"
        @click="handleSelect(template)"
      >
        <div class="template-header">
          <span class="template-name">{{ template.name }}</span>
          <span class="template-category">{{ template.category }}</span>
        </div>
        <p class="template-desc">{{ template.description }}</p>
        <div class="template-platforms">
          <span
            v-for="p in template.platform"
            :key="p"
            class="platform-tag"
          >
            {{ p }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-selector {
  margin-bottom: 24px;
}

.section-title {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 16px 0;
  color: var(--text-color);
}

.template-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
}

.template-card {
  padding: 16px;
  border: 2px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-base);
}

.template-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
}

.template-card.active {
  border-color: var(--primary-color);
  background: var(--primary-color-light);
}

.template-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.template-name {
  font-weight: 600;
  font-size: 15px;
  color: var(--text-color);
}

.template-category {
  font-size: 12px;
  padding: 2px 8px;
  background: var(--bg-elevated);
  border-radius: 4px;
  color: #909399;
  text-transform: uppercase;
}

.template-desc {
  font-size: 13px;
  color: #606266;
  margin: 0 0 12px 0;
  line-height: 1.5;
}

.template-platforms {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.platform-tag {
  font-size: 11px;
  padding: 2px 6px;
  background: var(--primary-color);
  color: #fff;
  border-radius: 3px;
  text-transform: lowercase;
}
</style>
