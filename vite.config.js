import { defineConfig } from 'vite';

export default defineConfig({
	css: {
		preprocessorOptions: {
			scss: {
				api: 'modern-compiler',
			},
		},
	},
	test: {
		environment: 'jsdom',
	},
	build: {
		lib: {
			entry: {
				notification: './index.js',
				styles: './src/scss/notification.scss', // Add CSS entry
			},
			name: 'notification',
			fileName: 'notification',
			formats: ['es'],
		},
		outDir: 'dist',
		emptyOutDir: true,
		minify: 'esbuild',
		sourcemap: true,
	},
});
