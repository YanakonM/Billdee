import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/,
              priority: 30,
            },
            {
              name: 'vendor-data',
              test: /node_modules[\\/](dexie|pocketbase|@supabase)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-scanner',
              test: /node_modules[\\/](html5-qrcode)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-qr',
              test: /node_modules[\\/](qrcode.react)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-icons',
              test: /node_modules[\\/]lucide-react[\\/]/,
              priority: 10,
            },
          ],
        },
      },
    },
  },
});
