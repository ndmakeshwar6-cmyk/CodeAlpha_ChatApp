const KEY = "tether-appearance";

export const FONTS = [
  { id: "system", name: "System", css: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: "nunito", name: "Nunito", css: "'Nunito', sans-serif" },
  { id: "quicksand", name: "Quicksand", css: "'Quicksand', sans-serif" },
  { id: "poppins", name: "Poppins", css: "'Poppins', sans-serif" },
  { id: "lora", name: "Lora", css: "'Lora', serif" },
  { id: "patrick", name: "Patrick Hand", css: "'Patrick Hand', cursive" },
];

export const SIZES = [
  { id: "small", name: "Small", px: 14 },
  { id: "default", name: "Default", px: 16 },
  { id: "large", name: "Large", px: 18 },
  { id: "xl", name: "Extra large", px: 20 },
];

function lum(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

export const readable = (hex) => (lum(hex) > 0.6 ? "#222222" : "#ffffff");

let current = {};

export function applyAppearance(p = {}) {
  current = p;
  const root = document.documentElement;
  const theme = p.theme || "light";
  const dark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.setAttribute("data-theme", dark ? "dark" : "light");

  const set = (name, val) =>
    val ? root.style.setProperty(name, val) : root.style.removeProperty(name);
  set("--accent", p.accent);
  set("--on-accent", p.accent ? readable(p.accent) : null);
  set("--out", p.out);
  set("--out-text", p.out ? readable(p.out) : null);
  set("--in", p.inn);
  set("--in-text", p.inn ? readable(p.inn) : null);

  const f = FONTS.find((x) => x.id === p.font) || FONTS[0];
  root.style.setProperty("--font", f.css);
  const s = SIZES.find((x) => x.id === p.size) || SIZES[1];
  root.style.setProperty("--fs", s.px + "px");

  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

try {
  applyAppearance(JSON.parse(localStorage.getItem(KEY) || "{}"));
} catch {
  applyAppearance({});
}
if (window.matchMedia) {
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => applyAppearance(current));
}