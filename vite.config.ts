import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const ONESIGNAL_APP_ID = process.env.VITE_ONESIGNAL_APP_ID || '0efb7e8f-8743-4f1c-9ea7-c559f73e410f'

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
