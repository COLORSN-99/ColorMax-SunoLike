// 模板变量类型
export interface TemplateVariable {
  key: string
  label: string
  description: string
  defaultValue: string
  type: 'string' | 'number' | 'select' | 'textarea'
  options?: string[] // for select type
  required: boolean
}

// 模板类型
export interface PromptTemplate {
  id: string
  name: string
  description: string
  content: string
  variables: TemplateVariable[]
  category: 'music' | 'image' | 'text' | 'custom'
  platform: string[]
  createdAt: number
  updatedAt: number
}

// 输出格式类型
export type OutputFormat = 'prompt' | 'mcp' | 'skill'

// MCP Server 配置
export interface MCPConfig {
  name: string
  version: string
  description: string
  tools: MCPTool[]
}

export interface MCPTool {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
  }
}

// Claude Skill 配置
export interface SkillConfig {
  name: string
  description: string
  instructions: string
  examples?: Array<{
    input: string
    output: string
  }>
}

// 生成结果
export interface GenerationResult {
  format: OutputFormat
  content: string
  raw: string
  variables: Record<string, string>
}
