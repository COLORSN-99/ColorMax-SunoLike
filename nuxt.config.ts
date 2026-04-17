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

  // Element Plus 配置
  elementPlus: {
    importStyle: 'css'
  },

  // UnoCSS 配置
  unoCSS: {
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
