// The app color of the user as the CSS variable --app-color. The AppShell keeps a copy in the localStorage, so the
// color is set before the first paint (APP_COLOR_SCRIPT) instead of flashing the default red.

const APP_COLOR_KEY = "appColor";
export const DEFAULT_APP_COLOR = "#FF0000";

export const APP_COLOR_SCRIPT = `try{var c=localStorage.getItem("${APP_COLOR_KEY}");if(c)document.documentElement.style.setProperty("--app-color",c)}catch(e){}`;

export function applyAppColor(color: string) {
  document.documentElement.style.setProperty("--app-color", color);
  try {
    localStorage.setItem(APP_COLOR_KEY, color);
  } catch {
    // Only used to avoid the flash of the default color
  }
}

/** Black or white, whichever is better readable on the color (`UserSettings.appColorForeground`) */
export function appColorForeground(hex: string): "#000000" | "#FFFFFF" {
  const value = Number.parseInt(hex.replace("#", ""), 16);
  if (Number.isNaN(value)) return "#FFFFFF";
  const red = ((value >> 16) & 0xff) / 255;
  const green = ((value >> 8) & 0xff) / 255;
  const blue = (value & 0xff) / 255;
  const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
  return luminance > 0.6 ? "#000000" : "#FFFFFF";
}
