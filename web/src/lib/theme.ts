// Port of ios/Gym 2.0/Core/Storage/AppTheme.swift. The theme is the `data-theme` attribute of <html> (none for the
// system appearance), APP_THEME_SCRIPT sets it before the first paint, so a forced theme doesn't flash.

export type AppTheme = "system" | "light" | "dark";

export const APP_THEME_KEY = "appTheme";

/** In the order of `AppTheme.allCases` */
export const APP_THEMES: readonly { value: AppTheme; title: string }[] = [
  { value: "system", title: "System" },
  { value: "light", title: "Light" },
  { value: "dark", title: "Dark" },
];

export function parseAppTheme(value: string | null | undefined): AppTheme {
  return value === "light" || value === "dark" ? value : "system";
}

/** Inline in <head>: applies the stored theme before the first paint */
export const APP_THEME_SCRIPT = `try{var t=localStorage.getItem("${APP_THEME_KEY}");if(t==="light"||t==="dark")document.documentElement.setAttribute("data-theme",t)}catch(e){}`;

/** Sets the theme on the page, also the color of the browser's address/status bar (`UIApplication.apply`) */
export function applyAppTheme(theme: AppTheme): void {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);

  // The theme-color metas of the root layout are one per system appearance (media queries): with a forced theme only
  // the one of that theme applies
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    const scheme = meta.dataset.scheme ?? (meta.media.includes("dark") ? "dark" : "light");
    meta.dataset.scheme = scheme;
    meta.media = theme === "system" ? `(prefers-color-scheme: ${scheme})` : scheme === theme ? "all" : "not all";
  });
}
