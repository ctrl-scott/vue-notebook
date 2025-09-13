import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// Vue Single File Components require the official plugin.
export default defineConfig({
  plugins: [vue()]
})

