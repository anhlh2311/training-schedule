import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const ONESIGNAL_APP_ID = process.env.VITE_ONESIGNAL_APP_ID ?? ''

export default defineConfig({
  plugins: [
    react({ jsxRuntime: 'automatic' }),
    tailwindcss(),
    {
      name: 'inject-onesignal-app-id',
      transformIndexHtml(html) {
        return html.replace('__VITE_ONESIGNAL_APP_ID__', ONESIGNAL_APP_ID)
      },
    },
  ],
})
