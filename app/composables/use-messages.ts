import type {Messages} from "#common/i18n";

// Interface texts in the language of the page shown (provided by the layout)
export function useMessages(): Ref<Messages> {
    return inject("messages") as Ref<Messages>;
}
