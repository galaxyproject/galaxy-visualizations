export type OrbitThemePreference = "light" | "dark";
export type AppliedOrbitTheme = "light" | "dark";

export const DEFAULT_ORBIT_THEME: OrbitThemePreference = "dark";

export function normalizeOrbitThemePreference(value: unknown): OrbitThemePreference {
  return value === "light" || value === "dark" ? value : DEFAULT_ORBIT_THEME;
}

export function resolveAppliedOrbitTheme(preference: unknown): AppliedOrbitTheme {
  return normalizeOrbitThemePreference(preference);
}

export function applyOrbitTheme(
  preference: unknown,
  target: HTMLElement = document.documentElement,
): () => void {
  const normalized = normalizeOrbitThemePreference(preference);
  const applied = resolveAppliedOrbitTheme(normalized);
  target.dataset.themePreference = normalized;
  target.dataset.theme = applied;
  target.style.colorScheme = applied;
  return () => {
    // Kept as a no-op cleanup so callers can replace themes uniformly.
  };
}
