export type ThemePref = "system" | "light" | "dark";

export const CHAT_COLORS: Record<string, string> = {
  ultramarine: "#2C6BED",
  crimson: "#CF163E",
  vermilion: "#C73F0A",
  burlap: "#6F6A58",
  forest: "#3B7845",
  wintergreen: "#1D8663",
  teal: "#077D92",
  blue: "#336BA3",
  indigo: "#6058CA",
  violet: "#9932C8",
  plum: "#AA377A",
  taupe: "#8F616A",
  steel: "#71717F",
};

let mediaCleanup: (() => void) | null = null;

/** Sets data-theme on <html>; "system" follows prefers-color-scheme live. */
export function applyTheme(pref: ThemePref): void {
  mediaCleanup?.();
  mediaCleanup = null;
  const root = document.documentElement;
  if (pref !== "system") {
    root.dataset.theme = pref;
    return;
  }
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const update = () => (root.dataset.theme = media.matches ? "dark" : "light");
  update();
  media.addEventListener("change", update);
  mediaCleanup = () => media.removeEventListener("change", update);
}

export function applyChatColor(name: string): void {
  document.documentElement.style.setProperty("--chat-color", CHAT_COLORS[name] ?? CHAT_COLORS.ultramarine);
}

/** Inline <head> script: applies the saved theme before first paint to avoid a light flash. */
export const THEME_BOOT_SCRIPT = `(() => {
  try {
    const s = JSON.parse(localStorage.getItem("signal.session") || "null");
    const pref = s && s.state && s.state.me && s.state.me.settings ? s.state.me.settings.theme : "system";
    const dark = pref === "dark" || (pref !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  } catch (e) {}
})();`;
