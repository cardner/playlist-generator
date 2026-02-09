export function usePathname() {
  return "/";
}

export function useRouter() {
  return {
    push: () => {},
    replace: () => {},
    reload: () => {},
    back: () => {},
    forward: () => {},
    prefetch: () => {},
  };
}
