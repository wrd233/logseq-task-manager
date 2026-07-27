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

export type VisibleThemeModeReader = () => HostThemeMode | undefined;

export function configuredThemeMode(value: unknown): HostThemeMode | undefined {
  return value === "light" || value === "dark" ? value : undefined;
}

export interface VisibleThemeDocument {
  documentElement?: {
    className?: unknown;
    getAttribute(name: string): string | null;
  };
  body?: {
    className?: unknown;
    getAttribute(name: string): string | null;
  };
  defaultView?: {
    getComputedStyle(element: unknown): {
      backgroundColor?: string;
      getPropertyValue(name: string): string;
    };
  } | null;
}

export interface ThemeMediaQuery {
  matches: boolean;
}

export type ThemeMediaQueryReader = (query: string) => ThemeMediaQuery;

export function applyHostThemeMode(root: ThemeModeRoot, mode: unknown): boolean {
  if (mode !== "light" && mode !== "dark") return false;
  root.dataset.themeMode = mode;
  root.style.colorScheme = mode;
  return true;
}

function serializedClassName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "baseVal" in value && typeof value.baseVal === "string") return value.baseVal;
  return "";
}

function colorLuminance(value: string): number | undefined {
  const hex = value.trim().match(/^#([\da-f]{3}|[\da-f]{6})$/i)?.[1];
  const channels = hex
    ? (hex.length === 3 ? [...hex].map((channel) => Number.parseInt(`${channel}${channel}`, 16)) : [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)))
    : value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)?.slice(1, 4).map(Number);
  if (!channels || channels.length !== 3 || channels.some((channel) => !Number.isFinite(channel))) return undefined;
  const [red, green, blue] = channels;
  return (red! * 0.2126 + green! * 0.7152 + blue! * 0.0722) / 255;
}

export function detectVisibleThemeMode(document: VisibleThemeDocument | undefined): HostThemeMode | undefined {
  if (!document) return undefined;
  const elements = [document.documentElement, document.body].filter((value): value is NonNullable<typeof value> => Boolean(value));
  for (const element of elements) {
    const tokens = [
      serializedClassName(element.className),
      element.getAttribute("data-theme") ?? "",
      element.getAttribute("data-color-mode") ?? "",
      element.getAttribute("data-mode") ?? "",
    ].join(" ").toLowerCase();
    if (/(^|\W)dark(?:-theme)?($|\W)/.test(tokens)) return "dark";
    if (/(^|\W)light(?:-theme)?($|\W)/.test(tokens)) return "light";
  }
  const styleTarget = document.body ?? document.documentElement;
  if (!styleTarget || !document.defaultView) return undefined;
  const style = document.defaultView.getComputedStyle(styleTarget);
  const background = style.getPropertyValue("--ls-primary-background-color") || style.backgroundColor || "";
  const luminance = colorLuminance(background);
  return luminance === undefined ? undefined : luminance < 0.45 ? "dark" : "light";
}

export function detectSystemThemeMode(matchMedia: ThemeMediaQueryReader | undefined): HostThemeMode | undefined {
  if (!matchMedia) return undefined;
  try {
    if (matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
    if (matchMedia("(prefers-color-scheme: light)").matches) return "light";
  } catch {
    return undefined;
  }
  return undefined;
}

export async function registerHostThemeModeSync(
  host: ThemeModeHost,
  root: ThemeModeRoot,
  onInitialReadError: (error: unknown) => void,
  readVisibleMode?: VisibleThemeModeReader,
): Promise<() => void> {
  const applyCurrentMode = (apiMode: unknown): boolean => {
    try {
      const visibleMode = readVisibleMode?.();
      if (visibleMode) return applyHostThemeMode(root, visibleMode);
    } catch {
      // The Logseq parent document can be isolated. The official API remains
      // the safe fallback and the caller records initial read failures.
    }
    return applyHostThemeMode(root, apiMode);
  };
  const off = host.onThemeModeChanged((event) => {
    applyCurrentMode(event.mode);
  });
  try {
    const config = await host.getUserConfigs();
    applyCurrentMode(config.preferredThemeMode);
  } catch (error) {
    onInitialReadError(error);
  }
  return off;
}
