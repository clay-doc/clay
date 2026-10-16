import {execFileSync} from "node:child_process";

const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", ["-C", cwd, ...args], {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024});

// Last commit date of every file below docsDir, keyed by its path relative to
// docsDir. Files keep their dates when they move: commits that only rename a
// file, like "clay version" moving docs/ into docs/latest/, do not count. root
// is the project, whose docs/ and docs-archive/ the history of moved files is
// looked for in. Without usable git history it returns the reason instead.
export function lastUpdated(docsDir: string, root = docsDir): { dates?: Map<string, string>, reason?: string } {
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
    let prefix: string;
    try {
        // Paths in the log are relative to the top of the repository
        prefix = git(docsDir, "rev-parse", "--show-prefix").trim();
        const scope = root === docsDir ? ["."] : ["docs", "docs-archive"];
        log = git(root, "-c", "core.quotePath=false", "log", "-M", "--format=%x00%cI", "--name-status", "--", ...scope);
    } catch {
        return {reason: "git history could not be read: last-updated dates are skipped"};
    }

    // Commits come newest first: the first date seen for a file is its latest.
    // movedTo maps an older path of a file to the path it has now.
    const dates = new Map<string, string>();
    const movedTo = new Map<string, string>();
    let current: string | undefined;
    for (const line of log.split("\n")) {
        if (line.startsWith("\0")) {
            current = new Date(line.slice(1)).toISOString().replace(/\.000Z$/, "Z");
            continue;
        }
        const [status, ...paths] = line.split("\t");
        if (!status || !current || paths.length === 0) continue;
        const path = paths.at(-1)!;
        const now = movedTo.get(path) ?? path;
        if (status.startsWith("R")) movedTo.set(paths[0]!, now);
        // A file moved without changes keeps the date of its last change
        if (status === "R100" || status === "D" || dates.has(now)) continue;
        dates.set(now, current);
    }

    const inDocs = new Map<string, string>();
    for (const [path, date] of dates) {
        if (path.startsWith(prefix)) inDocs.set(path.slice(prefix.length), date);
    }
    return {dates: inDocs};
}
