import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    open: false,
    allowedHosts: ['10.100.102.15', '10-100-102-15.sslip.io'],
  },
});


