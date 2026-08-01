import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function hexToRgb(value: string): [number, number, number] {
  const hex = value.trim().replace(/^#/, "");
  assert.match(hex, /^[0-9a-fA-F]{6}$/u, `expected a hex color, got ${value}`);
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function channelLuminance(channel: number): number {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(rgb: [number, number, number]): number {
  return 0.2126 * channelLuminance(rgb[0])
    + 0.7152 * channelLuminance(rgb[1])
    + 0.0722 * channelLuminance(rgb[2]);
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(hexToRgb(foreground)), relativeLuminance(hexToRgb(background)));
  const darker = Math.min(relativeLuminance(hexToRgb(foreground)), relativeLuminance(hexToRgb(background)));
  return (lighter + 0.05) / (darker + 0.05);
}

function extractVariables(css: string, block: "light" | "dark"): Record<string, string> {
  const start = block === "light"
    ? css.indexOf("#task-copilot-personal-mvp-root {")
    : css.indexOf('#task-copilot-personal-mvp-root[data-theme-mode="dark"] {');
  assert.ok(start >= 0, `expected ${block} token block in index.css`);
  const end = css.indexOf("}", start);
  const body = css.slice(start, end);
  const variables: Record<string, string> = {};
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/gu)) {
    variables[match[1]!] = match[2]!;
  }
  return variables;
}

test("semantic token pairs meet WCAG AA contrast (>= 4.5) in Light and Dark", async () => {
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  const light = extractVariables(css, "light");
  const dark = extractVariables(css, "dark");
  const pairs: Array<[string, string, string]> = [
    ["text", "surface", "body text on card surface"],
    ["muted", "surface", "aux/muted text on card surface"],
    ["muted", "surface-2", "worksite/muted text on secondary surface"],
    ["warning", "warning-soft", "warning text on warning soft background"],
    ["danger-text", "danger-soft", "danger text on danger soft background"],
    ["primary-text", "accent", "primary button label on accent background"],
  ];
  for (const [foreground, background, purpose] of pairs) {
    for (const [theme, variables] of [["light", light], ["dark", dark]] as const) {
      assert.ok(variables[foreground], `${theme} missing --${foreground}`);
      assert.ok(variables[background], `${theme} missing --${background}`);
      const ratio = contrastRatio(variables[foreground]!, variables[background]!);
      assert.ok(
        ratio >= 4.5,
        `${theme} ${foreground} on ${background} (${purpose}) is ${ratio.toFixed(2)}:1, below WCAG AA 4.5:1`,
      );
    }
  }
});
