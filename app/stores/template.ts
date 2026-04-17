import { defineStore } from 'pinia'
import type { PromptTemplate, OutputFormat, TemplateVariable, GenerationResult } from '~/types'

// 默认音乐模板
const defaultMusicTemplate: PromptTemplate = {
  id: 'music-default',
  name: 'AI 音乐生成',
  description: '适用于 Suno、Udio 等 AI 音乐平台',
  content: `请生成一首{{mood}}的{{genre}}歌曲。

歌词：
{{lyrics}}

音乐风格：{{style}}
 BPM范围：{{bpm}}
 时长：{{duration}}
 乐器：{{instruments}}`,
  variables: [
    {
      key: 'mood',
      label: '情绪',
      description: '歌曲的情绪',
      defaultValue: '欢快',
      type: 'select',
      options: ['欢快', '抒情', '忧伤', '激昂', '平静'],
      required: true
    },
    {
      key: 'genre',
      label: '音乐类型',
      description: '歌曲的类型',
      defaultValue: '流行',
      type: 'select',
      options: ['流行', '摇滚', '民谣', '电子', '古典', '爵士', '说唱'],
      required: true
    },
    {
      key: 'lyrics',
      label: '歌词',
      description: '歌曲歌词',
      defaultValue: '',
      type: 'textarea',
      required: true
    },
    {
      key: 'style',
      label: '音乐风格',
      description: '详细的音乐风格描述',
      defaultValue: '现代流行风格',
      type: 'string',
      required: false
    },
    {
      key: 'bpm',
      label: 'BPM',
      description: '每分钟节拍数',
      defaultValue: '120',
      type: 'number',
      required: false
    },
    {
      key: 'duration',
      label: '时长',
      description: '歌曲时长',
      defaultValue: '3分钟',
      type: 'string',
      required: false
    },
    {
      key: 'instruments',
      label: '乐器',
      description: '使用的乐器',
      defaultValue: '钢琴、吉他、鼓',
      type: 'string',
      required: false
    }
  ],
  category: 'music',
  platform: ['suno', 'udio', 'elevenlabs'],
  createdAt: Date.now(),
  updatedAt: Date.now()
}

export const useTemplateStore = defineStore('template', {
  state: () => ({
    // 当前模板
    currentTemplate: null as PromptTemplate | null,
    // 用户变量输入值
    variableValues: {} as Record<string, string>,
    // 输出格式
    outputFormat: 'prompt' as OutputFormat,
    // 生成结果
    generatedResult: null as GenerationResult | null,
    // 预设模板列表
    presetTemplates: [defaultMusicTemplate] as PromptTemplate[],
    // 用户自定义模板
    customTemplates: [] as PromptTemplate[],
  }),

  getters: {
    // 所有模板
    allTemplates: (state): PromptTemplate[] => [
      ...state.presetTemplates,
      ...state.customTemplates
    ],

    // 当前模板的变量值
    currentVariables: (state): Record<string, string> => {
      if (!state.currentTemplate) return {}
      const values: Record<string, string> = {}
      for (const v of state.currentTemplate.variables) {
        values[v.key] = state.variableValues[v.key] ?? v.defaultValue
      }
      return values
    },

    // 填充后的 Prompt
    filledPrompt: (state): string => {
      if (!state.currentTemplate) return ''
      let content = state.currentTemplate.content
      for (const [key, value] of Object.entries(state.variableValues)) {
        content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '')
      }
      return content
    }
  },

  actions: {
    // 选择模板
    selectTemplate(template: PromptTemplate) {
      this.currentTemplate = template
      this.variableValues = {}
      // 初始化默认值
      for (const v of template.variables) {
        this.variableValues[v.key] = v.defaultValue
      }
      this.generatedResult = null
    },

    // 更新变量值
    updateVariable(key: string, value: string) {
      this.variableValues[key] = value
    },

    // 设置输出格式
    setOutputFormat(format: OutputFormat) {
      this.outputFormat = format
    },

    // 生成结果
    generate() {
      if (!this.currentTemplate) return

      const content = this.filledPrompt

      let outputContent = ''
      switch (this.outputFormat) {
        case 'prompt':
          outputContent = content
          break
        case 'mcp':
          outputContent = this.generateMCP(content)
          break
        case 'skill':
          outputContent = this.generateSkill(content)
          break
      }

      this.generatedResult = {
        format: this.outputFormat,
        content: outputContent,
        raw: content,
        variables: { ...this.variableValues }
      }
    },

    // 生成 MCP Server
    generateMCP(prompt: string): string {
      const templateName = this.currentTemplate?.name || 'AI Prompt'

      return JSON.stringify({
        name: 'colorMax-mcp-' + Date.now(),
        version: '1.0.0',
        description: this.currentTemplate?.description || 'AI Music Prompt Generator',
        tools: [
          {
            name: 'generate_music_prompt',
            description: 'Generate music prompt based on user input',
            inputSchema: {
              type: 'object',
              properties: this.currentTemplate?.variables.reduce((acc, v) => {
                acc[v.key] = {
                  type: v.type,
                  description: v.description
                }
                return acc
              }, {} as Record<string, unknown>)
            }
          }
        ],
        systemPrompt: prompt
      }, null, 2)
    },

    // 生成 Claude Skill
    generateSkill(prompt: string): string {
      const templateName = this.currentTemplate?.name || 'AI Prompt'

      return `# Skill: ${templateName}

## Description

${this.currentTemplate?.description || 'AI Prompt Template for Music Generation'}

## Instructions

You are an expert at crafting AI music prompts. Use the following template to generate high-quality music:

\`\`\`
${prompt}
\`\`\`

## Variables

${this.currentTemplate?.variables.map(v =>
`### ${v.label} (\`{{${v.key}}}\`)

- **Key**: ${v.key}
- **Type**: ${v.type}
- **Description**: ${v.description}
- **Required**: ${v.required ? 'Yes' : 'No'}
${v.options ? `- **Options**: ${v.options.join(', ')}` : ''}`
).join('\n\n')}

## Examples

### Example 1

**Input**: Generate a cheerful pop song about spring

**Output**: ${prompt.replace(/\{\{mood\}\}/g, '欢快').replace(/\{\{genre\}\}/g, '流行').replace(/\{\{lyrics\}\}/g, '关于春天的故事').replace(/\{\{style\}\}/g, '现代流行风格').replace(/\{\{bpm\}\}/g, '120').replace(/\{\{duration\}\}/g, '3分钟').replace(/\{\{instruments\}\}/g, '钢琴、吉他、鼓')}
`
    },

    // 从 LocalStorage 加载用户模板
    loadCustomTemplates() {
      if (import.meta.client) {
        const saved = localStorage.getItem('colormax-templates')
        if (saved) {
          try {
            this.customTemplates = JSON.parse(saved)
          } catch (e) {
            console.error('Failed to load templates:', e)
          }
        }
      }
    },

    // 保存用户模板
    saveCustomTemplates() {
      if (import.meta.client) {
        localStorage.setItem('colormax-templates', JSON.stringify(this.customTemplates))
      }
    },

    // 添加自定义模板
    addCustomTemplate(template: PromptTemplate) {
      template.id = 'custom-' + Date.now()
      template.createdAt = Date.now()
      template.updatedAt = Date.now()
      this.customTemplates.push(template)
      this.saveCustomTemplates()
    },

    // 删除自定义模板
    removeCustomTemplate(id: string) {
      this.customTemplates = this.customTemplates.filter(t => t.id !== id)
      this.saveCustomTemplates()
    }
  }
})
