export type HostThemeMode = "light" | "dark";

export interface ThemeModeRoot {
  dataset: Record<string, string | undefined>;
  style: {
    colorScheme: string;
  };
}

export interface ThemeModeHost {
  getUserConfigs(): Promise<{ preferredThemeMode?: unknown }>;
  onThemeModeChanged(callback: (event: { mode?: unknown }) => void): () => void;
}

export function applyHostThemeMode(root: ThemeModeRoot, mode: unknown): boolean {
  if (mode !== "light" && mode !== "dark") return false;
  root.dataset.themeMode = mode;
  root.style.colorScheme = mode;
  return true;
}

export async function registerHostThemeModeSync(
  host: ThemeModeHost,
  root: ThemeModeRoot,
  onInitialReadError: (error: unknown) => void,
): Promise<() => void> {
  const off = host.onThemeModeChanged((event) => {
    applyHostThemeMode(root, event.mode);
  });
  try {
    const config = await host.getUserConfigs();
    applyHostThemeMode(root, config.preferredThemeMode);
  } catch (error) {
    onInitialReadError(error);
  }
  return off;
}
