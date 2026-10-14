import type {DocItem} from "#common/nav";
import {editionPrefix, switchEdition, type Edition, type LanguageInfo, type VersionInfo} from "#common/editions";

// Links of the version and language switchers: switching the version keeps the
// language and the page, and the other way round
export function useEditionLinks() {
    const versions = inject("versions") as Ref<VersionInfo[]>;
    const languages = inject("languages") as Ref<LanguageInfo[]>;
    const edition = inject("edition") as Ref<Edition>;
    const navs = inject("navs") as Ref<Record<string, DocItem>>;
    const route = useRoute();

    const prefixFor = (version: string, language: string) => editionPrefix(version, language, languages.value[0]!.code);
    const to = (prefix: string) => switchEdition(route.path, edition.value.prefix, prefix, navs.value);
    return {
        versions, languages, edition,
        versionLink: (version: VersionInfo) => to(prefixFor(version.name, edition.value.language.code)),
        languageLink: (language: LanguageInfo) => to(prefixFor(edition.value.version.name, language.code)),
        home: computed(() => prefixFor("", edition.value.language.code) || "/"),
    };
}
