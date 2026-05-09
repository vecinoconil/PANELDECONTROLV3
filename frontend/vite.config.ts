import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
    define: {
        // Timestamp único por build → fuerza hash diferente en el bundle
        __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            selfDestroying: true,
            includeAssets: ['favicon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
            manifest: {
                name: 'Solba Panel V3',
                short_name: 'Panel V3',
                description: 'Panel de gestión interno Solba',
                theme_color: '#2563eb',
                background_color: '#0f172a',
                display: 'standalone',
                orientation: 'portrait',
                scope: '/',
                start_url: '/',
                icons: [
                    {
                        src: '/pwa-192x192.png',
                        sizes: '192x192',
                        type: 'image/png',
                        purpose: 'any',
                    },
                    {
                        src: '/pwa-512x512.png',
                        sizes: '512x512',
                        type: 'image/png',
                        purpose: 'any maskable',
                    },
                ],
            },
            workbox: {
                skipWaiting: true,
                clientsClaim: true,
                // Cache la app shell + assets estáticos (sin JS — se pide siempre a red)
                globPatterns: ['**/*.{css,html,svg,png,ico,woff2}'],
                runtimeCaching: [
                    {
                        urlPattern: /\/assets\/index-.*\.js$/,
                        handler: 'NetworkFirst',
                        options: { cacheName: 'js-bundle', networkTimeoutSeconds: 5 },
                    },
                    {
                        urlPattern: /^\/api\//,
                        handler: 'NetworkOnly',
                    },
                ],
            },
        }),
    ],
    server: {
        host: '0.0.0.0',
        port: 5173,
        watch: {
            usePolling: true,
            interval: 300,
        },
        proxy: {
            '/api': {
                target: process.env.BACKEND_URL || 'http://localhost:4000',
                changeOrigin: true,
            },
        },
    },
})
