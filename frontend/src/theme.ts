import { element } from "./shared";

type Theme = "light" | "dark";
const key = "mediasite-theme";
const system = matchMedia("(prefers-color-scheme: dark)");
let preference: Theme | null = null;
try {
  const saved = localStorage.getItem(key);
  if (saved === "light" || saved === "dark") preference = saved;
} catch {
  // The toggle still works when browser storage is unavailable.
}
const toggle = element<HTMLButtonElement>("themeToggle");
function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  const label = theme === "dark" ? "Light mode" : "Dark mode";
  element("themeLabel").textContent = label;
  toggle.setAttribute("aria-label", `Switch to ${label.toLowerCase()}`);
  toggle.title = `Switch to ${label.toLowerCase()}`;
}
function followPreference() {
  apply(preference ?? (system.matches ? "dark" : "light"));
}
toggle.addEventListener("click", () => {
  preference =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  try {
    localStorage.setItem(key, preference);
  } catch {}
  followPreference();
});
system.addEventListener("change", followPreference);
window.addEventListener("storage", (event) => {
  if (event.key !== key && event.key !== null) return;
  preference =
    event.newValue === "light" || event.newValue === "dark"
      ? event.newValue
      : null;
  followPreference();
});
followPreference();
