import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react/") || id.includes("node_modules/react-dom/") || id.includes("node_modules/react-router")) {
            return "react-vendor";
          }
          if (id.includes("node_modules/firebase/")) {
            return "firebase";
          }
          if (id.includes("node_modules/react-big-calendar") || id.includes("node_modules/dayjs")) {
            return "calendar";
          }
        },
      },
    },
  },
  plugins: [
    react({ jsxRuntime: 'automatic' }),
    tailwindcss(),
  ],
})
