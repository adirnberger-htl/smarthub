// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  ssr: false,
  css: ['~/assets/css/theme.css'],
  modules: ['@tailwindcss/vite'],
  app: {
    head: {
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap',
        },
      ],
      script: [
        { src: 'https://kit.fontawesome.com/e7cf439639.js', crossorigin: 'anonymous' }
      ]
    }
  },
  runtimeConfig: {
    public: {
      apiBaseUrl: '',
      cartoKey: '',
    },
  },
  vite: {
    optimizeDeps: {
      include: ['three', 'leaflet'],
    },
    server: {
      proxy: {
        '/api': {
          target: 'http://backend:3000',
          changeOrigin: true,
        }
      }
    }
  }
})
