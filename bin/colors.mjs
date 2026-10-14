// Foreground color codes for the CLI. Terminals without 24-bit color (e.g. older
// macOS Terminal) get the nearest of the 256 standard colors instead of a guess.

const truecolor = /truecolor|24bit/i.test(process.env.COLORTERM ?? "");
const LEVELS = [0, 95, 135, 175, 215, 255];
const nearest = value => LEVELS.reduce((best, level, i) => Math.abs(level - value) < Math.abs(LEVELS[best] - value) ? i : best, 0);

export function rgb(r, g, b) {
    return truecolor ? `38;2;${r};${g};${b}` : `38;5;${16 + 36 * nearest(r) + 6 * nearest(g) + nearest(b)}`;
}

export const SAGE = [106, 158, 120];
export const MINT = [212, 234, 217];
// Hints and secondary text: a fixed gray, since themes often turn ANSI "bright black" dark or colored
export const GRAY = [160, 160, 160];
