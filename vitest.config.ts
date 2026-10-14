import {defineConfig} from "vitest/config";

// Unit tests only; browser tests in e2e/ run with Playwright (npm run test:e2e)
export default defineConfig({
    test: {include: ["test/**/*.test.ts"]},
});
