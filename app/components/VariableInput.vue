<script setup lang="ts">
import type { TemplateVariable } from '~/types'

defineProps<{
  variable: TemplateVariable
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const updateValue = (value: string) => {
  emit('update:modelValue', value)
}
</script>

<template>
  <div class="variable-input">
    <label class="variable-label">
      {{ variable.label }}
      <span v-if="variable.required" class="required">*</span>
    </label>

    <p class="variable-desc">{{ variable.description }}</p>

    <!-- Select 类型 -->
    <el-select
      v-if="variable.type === 'select'"
      :model-value="modelValue"
      placeholder="请选择"
      class="variable-select"
      @update:model-value="updateValue"
    >
      <el-option
        v-for="opt in variable.options"
        :key="opt"
        :label="opt"
        :value="opt"
      />
    </el-select>

    <!-- Number 类型 -->
    <el-input-number
      v-else-if="variable.type === 'number'"
      :model-value="Number(modelValue)"
      :min="0"
      :max="999"
      class="variable-number"
      @update:model-value="(v) => updateValue(String(v))"
    />

    <!-- Textarea 类型 -->
    <el-input
      v-else-if="variable.type === 'textarea'"
      type="textarea"
      :rows="4"
      :model-value="modelValue"
      :placeholder="`请输入${variable.label}`"
      @update:model-value="updateValue"
    />

    <!-- String 类型（默认） -->
    <el-input
      v-else
      :model-value="modelValue"
      :placeholder="`请输入${variable.label}`"
      @update:model-value="updateValue"
    />
  </div>
</template>

<style scoped>
.variable-input {
  margin-bottom: 16px;
}

.variable-label {
  display: block;
  font-weight: 500;
  margin-bottom: 4px;
  color: var(--text-color);
}

.required {
  color: #f56c6c;
  margin-left: 2px;
}

.variable-desc {
  font-size: 12px;
  color: #909399;
  margin: 0 0 8px 0;
}

.variable-select {
  width: 100%;
}

.variable-number {
  width: 100%;
}
</style>
