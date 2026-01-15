export function dropFrontMatterIfExists(markdownContent: string): string {
    const frontMatterRegex = /^---\s*[\r\n]+([\s\S]*?)[\r\n]+---\s*[\r\n]*/;
    const match = markdownContent.match(frontMatterRegex);
    if (match) {
        return markdownContent.slice(match[0].length);
    }
    return markdownContent;
}