export function useSearchOpen() {
    return useState<boolean>("searchOpen", () => false);
}
