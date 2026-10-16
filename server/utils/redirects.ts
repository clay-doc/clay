import {absoluteUrl, routePath} from "../../common/seo";
import type {Redirect} from "../../lib/site";

const escapeHtml = (text: string) =>
    text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// The page at an old address: it sends browsers on to the page at once, keeping
// the #section, and tells search engines the page's address. Static hosts
// cannot redirect themselves, so the build writes one such page per address.
export function redirectPage(redirect: Redirect, basePath: string, origin: string | undefined): string {
    const target = routePath(basePath, redirect.to);
    const canonical = absoluteUrl(origin, basePath, redirect.to) ?? target;
    return `<!doctype html>
<html lang="${escapeHtml(redirect.language)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(redirect.title)}</title>
<meta name="robots" content="noindex">
<link rel="canonical" href="${escapeHtml(canonical)}">
<meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
<script>location.replace(${JSON.stringify(target)} + location.search + location.hash)</script>
</head>
<body><a href="${escapeHtml(target)}">${escapeHtml(redirect.title)}</a></body>
</html>
`;
}
