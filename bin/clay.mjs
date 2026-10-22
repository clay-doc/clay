#!/usr/bin/env node
// Clay command line: build, preview and develop a documentation site from the
// docs project in the current directory (clay.yaml, docs/).
import {createJiti} from "jiti";

// The CLI's code is TypeScript in lib/ (lib/cli/main.ts), run without a build step
const jiti = createJiti(import.meta.url);
const {main} = await jiti.import("../lib/cli/main.ts");
await main(process.argv.slice(2));
