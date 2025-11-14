import { defineConfig } from 'vite';

export default defineConfig({
    build: {
        lib: {
            entry: 'src/index.ts',
            name: 'FireDoc',
            fileName: 'index',
            formats: ['es', 'cjs']
        },
        rollupOptions: {
            external: [
                'firebase-admin/firestore'
            ]
        }
    }
});