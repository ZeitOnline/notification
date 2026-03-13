import { defineConfig } from 'vite';

export default defineConfig({
	css: {
      preprocessorOptions: {
        scss: {
          api: 'modern-compiler',
        },
      },
    },
	build: {
		lib: {
			entry: {
                notify: './index.js',
                styles: './src/scss/notify.scss'  // Add CSS entry
            },
			name: 'notify',
			fileName: 'notify',
			formats: ['es'],
		},
		outDir: 'dist',
		emptyOutDir: true,
		minify: 'esbuild',
		sourcemap: true,
	},
});