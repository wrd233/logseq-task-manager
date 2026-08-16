export const SIDEBAR_MIN_WIDTH = 300;
export const SIDEBAR_MAX_WIDTH = 520;
export const SIDEBAR_DEFAULT_WIDTH = 384;
export const DOCKED_MAIN_MIN_WIDTH = 560;

export type SidebarLayoutMode = "DOCKED" | "COMPACT";

export interface SidebarLayoutInput {
  viewportWidth: number;
  sidebarWidth: number;
  leftReserved?: number;
  rightReserved?: number;
  mainMinWidth?: number;
}

export interface SidebarLayoutSpec {
  mode: SidebarLayoutMode;
  sidebarWidth: number;
  leftReserved: number;
  rightReserved: number;
  availableMain: number;
  panelLeft: number;
  panelRight: number;
  panelWidth: number;
}

export function clampSidebarWidth(value: number): number {
  if (!Number.isFinite(value)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

export function parseSidebarWidth(value: unknown): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return clampSidebarWidth(Number.isFinite(parsed) ? parsed : SIDEBAR_DEFAULT_WIDTH);
}

export function layoutModeFor(input: SidebarLayoutInput): SidebarLayoutMode {
  const sidebarWidth = clampSidebarWidth(input.sidebarWidth);
  const leftReserved = Math.max(0, input.leftReserved ?? 0);
  const rightReserved = Math.max(0, input.rightReserved ?? 0);
  const viewportWidth = Math.max(0, input.viewportWidth);
  const mainMinWidth = Math.max(0, input.mainMinWidth ?? DOCKED_MAIN_MIN_WIDTH);
  const availableMain = Math.max(0, viewportWidth - leftReserved - rightReserved);
  return availableMain >= sidebarWidth + mainMinWidth ? "DOCKED" : "COMPACT";
}

export function sidebarLayoutSpec(input: SidebarLayoutInput): SidebarLayoutSpec {
  const sidebarWidth = clampSidebarWidth(input.sidebarWidth);
  const leftReserved = Math.max(0, input.leftReserved ?? 0);
  const rightReserved = Math.max(0, input.rightReserved ?? 0);
  const viewportWidth = Math.max(0, input.viewportWidth);
  const mainMinWidth = Math.max(0, input.mainMinWidth ?? DOCKED_MAIN_MIN_WIDTH);
  const availableMain = Math.max(0, viewportWidth - leftReserved - rightReserved);
  const mode = availableMain >= sidebarWidth + mainMinWidth ? "DOCKED" : "COMPACT";
  const panelWidth = mode === "DOCKED" ? sidebarWidth : Math.max(0, availableMain);
  const panelLeft = mode === "DOCKED" ? Math.max(0, viewportWidth - rightReserved - sidebarWidth) : leftReserved;
  const panelRight = mode === "DOCKED" ? 0 : rightReserved;
  return { mode, sidebarWidth, leftReserved, rightReserved, availableMain, panelLeft, panelRight, panelWidth };
}
