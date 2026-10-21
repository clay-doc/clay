// Colors of light-plus that are too faint on the lighter backgrounds (highlighted
// and diff lines), each darkened just enough for a contrast of 4.5:1 on all of
// them. Code blocks (server/utils/markdown.ts) and request cells (app/utils/shiki.ts) use them.
export const LIGHT_PLUS_CONTRAST: Record<string, string> = {
    "#008000": "#006400", "#098658": "#076240", "#e50000": "#ae0000", "#cd3131": "#a02626", "#795e26": "#695221",
    "#267f99": "#1b5b6e", "#af00db": "#8f00b4", "#0070c1": "#005797", "#d16969": "#844242", "#ee0000": "#ae0000",
};
