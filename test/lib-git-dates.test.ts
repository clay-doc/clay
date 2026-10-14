import {execFileSync} from "node:child_process";
import {mkdirSync, mkdtempSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {describe, expect, it} from "vitest";
import {lastUpdated} from "../lib/git-dates";

const hasGit = (() => {
    try {
        execFileSync("git", ["--version"]);
        return true;
    } catch {
        return false;
    }
})();

function git(dir: string, date: string, ...args: string[]) {
    execFileSync("git", ["-C", dir, ...args], {
        stdio: "ignore",
        env: {
            ...process.env, GIT_CONFIG_GLOBAL: "/dev/null",
            GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@t", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@t",
            GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date,
        },
    });
}

const write = (path: string, content: string) => {
    mkdirSync(dirname(path), {recursive: true});
    writeFileSync(path, content);
};

describe.skipIf(!hasGit)("lastUpdated", () => {
    it("returns the last commit date of each file in the docs", () => {
        const repo = mkdtempSync(join(tmpdir(), "clay-git-"));
        const docs = join(repo, "docs");
        git(repo, "2026-01-01T10:00:00Z", "init", "-q");
        write(join(docs, "a.md"), "a");
        write(join(docs, "guides", "b.md"), "b");
        write(join(docs, "ü ber.md"), "u");
        write(join(repo, "outside.md"), "o");
        git(repo, "2026-01-01T10:00:00Z", "add", ".");
        git(repo, "2026-01-01T10:00:00Z", "commit", "-q", "-m", "one");
        write(join(docs, "guides", "b.md"), "b2");
        git(repo, "2026-02-02T12:00:00Z", "commit", "-q", "-am", "two");

        const {dates, reason} = lastUpdated(docs);
        expect(reason).toBeUndefined();
        expect(Object.fromEntries(dates!)).toEqual({
            "a.md": "2026-01-01T10:00:00Z",
            "guides/b.md": "2026-02-02T12:00:00Z",
            "ü ber.md": "2026-01-01T10:00:00Z",
        });
    });

    it("explains when there is no repository", () => {
        expect(lastUpdated(mkdtempSync(join(tmpdir(), "clay-nogit-")))).toEqual({reason: expect.stringContaining("not in a git repository")});
    });
});
