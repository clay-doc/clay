const contentCache = new Map<string, string>();

export function useMarkdownCache() {
    return contentCache;
}