// Interface text in the languages Clay ships with. Other languages fall back to
// English; "messages" in clay.yaml overrides single texts per language.
import {en, type Messages} from "./en";
import {de} from "./de";
import {fr} from "./fr";
import {es} from "./es";
import {it} from "./it";
import {pt} from "./pt";
import {nl} from "./nl";
import {pl} from "./pl";
import {ru} from "./ru";
import {ja} from "./ja";
import {zh} from "./zh";
import {ko} from "./ko";

export type {Messages};

// The most widely used languages; others use English unless clay.yaml provides "messages"
const BUILT_IN: Record<string, Messages> = {en, de, fr, es, it, pt, nl, pl, ru, ja, zh, ko};
export const BUILT_IN_LANGUAGES = Object.keys(BUILT_IN);

export function messagesFor(language: string, overrides?: Partial<Messages>): Messages {
    const builtIn = BUILT_IN[language] ?? BUILT_IN[language.split("-")[0]!] ?? en;
    return {...builtIn, ...overrides};
}

// Fills in {placeholders}
export function format(text: string, values: Record<string, string>): string {
    return text.replace(/\{(\w+)\}/g, (match, key: string) => values[key] ?? match);
}

// The name of a language, by default in that language itself and capitalized for
// menus ("Deutsch" for "de"); in another language as used in a sentence ("Englisch")
export function languageName(code: string, inLanguage = code): string {
    try {
        const name = new Intl.DisplayNames([inLanguage], {type: "language"}).of(code) ?? code;
        return inLanguage === code ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : name;
    } catch {
        return code;
    }
}
