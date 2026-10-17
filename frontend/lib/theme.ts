// The colour theme. "system" follows the device; "light" and "dark" are picked in Profile and remembered on this device.
export type Theme = "system" | "light" | "dark";

const KEY = "theme";

/** The browser bar colour of each theme: its surface colour. */
export const THEME_COLORS = { light: "#fcfcfb", dark: "#1a1a19" } as const;

/** Runs in <head> before the first paint, so a picked theme never flashes the other one first. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function storedTheme(): Theme {
  try {
    const theme = localStorage.getItem(KEY);
    return theme === "light" || theme === "dark" ? theme : "system";
  } catch {
    return "system"; // storage blocked (private mode)
  }
}

/** Switches the page to the theme, recolours the browser bar and remembers the choice. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
  // Each theme-color tag answers one device setting; a picked theme gives both the same colour.
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const device = meta.media.includes("dark") ? "dark" : "light";
    meta.content = THEME_COLORS[theme === "system" ? device : theme];
  });
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // storage blocked: the theme still applies until the page is closed
  }
}
