// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },

  // 安装模块
  modules: [
    '@pinia/nuxt',
    '@unocss/nuxt',
    '@element-plus/nuxt'
  ],
  vite:{
    // 预构建依赖,提升开发环境冷启动和热更新速度
    optimizeDeps: {
      include: [
        'dayjs', // CJS
        'dayjs/plugin/*.js',
        'lodash-unified',
        '@vue/devtools-core',
        '@vue/devtools-kit',
      ]
    }
  },
  // Element Plus 配置
  elementPlus: {
    importStyle: 'css'
  },

  // UnoCSS 配置
  unocss: {
    shortcuts: {
      'btn': 'px-4 py-2 rounded-lg font-medium transition-all cursor-pointer',
      'btn-primary': 'btn bg-[#6366f1] text-white hover:bg-[#4f46e5]'
    }
  },

  // 全局 CSS
  css: ['~/assets/styles/main.css'],

  // TypeScript
  typescript: {
    strict: true
  }
})
