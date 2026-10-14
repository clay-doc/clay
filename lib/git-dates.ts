import {execFileSync} from "node:child_process";

const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-C", cwd, ...args], {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024});

// Last commit date of every file below docsDir, keyed by its path relative to
// docsDir. Without usable git history it returns the reason instead.
export function lastUpdated(docsDir: string): { dates?: Map<string, string>, reason?: string } {
    let shallow: string;
    try {
        shallow = git(docsDir, "rev-parse", "--is-shallow-repository").trim();
    } catch (error) {
        const missing = (error as NodeJS.ErrnoException).code === "ENOENT";
        return {reason: missing ? "git is not installed: last-updated dates are skipped" : "the docs are not in a git repository: last-updated dates are skipped"};
    }
    if (shallow === "true") {
        return {reason: "the git clone is shallow, so last-updated dates would be wrong and are skipped (actions/checkout: set fetch-depth: 0)"};
    }

    let log: string;
    try {
        log = git(docsDir, "-c", "core.quotePath=false", "log", "--relative", "--no-renames", "--format=%x00%cI", "--name-only", "--", ".");
    } catch {
        return {reason: "git history could not be read: last-updated dates are skipped"};
    }

    // Commits come newest first: the first date seen for a file is its latest
    const dates = new Map<string, string>();
    let current: string | undefined;
    for (const line of log.split("\n")) {
        if (line.startsWith("\0")) {
            current = new Date(line.slice(1)).toISOString().replace(/\.000Z$/, "Z");
        } else if (line && current && !dates.has(line)) {
            dates.set(line, current);
        }
    }
    return {dates};
}
