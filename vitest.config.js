import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'jsdom',
        setupFiles: ['./test/setup.js'],
        coverage: {
            provider: 'v8',
            include: ['citation.js'],
            reporter: ['text', 'html', 'lcov']
        }
    }
});
