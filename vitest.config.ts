import {defineConfig} from "vitest/config";

// Unit tests only; browser tests in test/e2e/ run with Playwright (npm run test:e2e)
export default defineConfig({
    test: {include: ["test/unit/**/*.test.ts"]},
});
