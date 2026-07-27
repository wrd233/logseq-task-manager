import assert from "node:assert/strict";
import test from "node:test";

import { applyHostThemeMode, configuredThemeMode, detectSystemThemeMode, detectVisibleThemeMode, registerHostThemeModeSync, type ThemeModeRoot, type VisibleThemeDocument } from "../src/theme-mode.ts";

function root(): ThemeModeRoot {
  return { dataset: {}, style: { colorScheme: "" } };
}

test("applies only an explicit Logseq light or dark theme mode", () => {
  const value = root();

  assert.equal(applyHostThemeMode(value, "dark"), true);
  assert.deepEqual(value, { dataset: { themeMode: "dark" }, style: { colorScheme: "dark" } });
  assert.equal(applyHostThemeMode(value, "system"), false);
  assert.equal(value.dataset.themeMode, "dark");
});

test("theme setting is an explicit light or dark override and auto keeps host detection", () => {
  assert.equal(configuredThemeMode("light"), "light");
  assert.equal(configuredThemeMode("dark"), "dark");
  assert.equal(configuredThemeMode("auto"), undefined);
  assert.equal(configuredThemeMode(undefined), undefined);
  assert.equal(configuredThemeMode("system"), undefined);
});

test("subscribes before reading the initial theme and follows later host changes", async () => {
  const value = root();
  let listener: ((event: { mode?: unknown }) => void) | undefined;
  let disposed = false;
  const off = await registerHostThemeModeSync({
    async getUserConfigs() {
      return { preferredThemeMode: "light" };
    },
    onThemeModeChanged(callback) {
      listener = callback;
      return () => {
        disposed = true;
      };
    },
  }, value, (error) => assert.fail(error instanceof Error ? error : new Error("unexpected initial theme read failure")));

  assert.equal(value.dataset.themeMode, "light");
  listener?.({ mode: "dark" });
  assert.equal(value.dataset.themeMode, "dark");
  off();
  assert.equal(disposed, true);
});

test("keeps the visible Logseq surface authoritative over a stale saved preference", async () => {
  const value = root();
  let listener: ((event: { mode?: unknown }) => void) | undefined;
  let visibleMode: "light" | "dark" = "dark";
  await registerHostThemeModeSync({
    async getUserConfigs() {
      return { preferredThemeMode: "light" };
    },
    onThemeModeChanged(callback) {
      listener = callback;
      return () => undefined;
    },
  }, value, (error) => assert.fail(error instanceof Error ? error : new Error("unexpected initial theme read failure")), () => visibleMode);

  assert.equal(value.dataset.themeMode, "dark");
  listener?.({ mode: "light" });
  assert.equal(value.dataset.themeMode, "dark");

  visibleMode = "light";
  listener?.({ mode: "dark" });
  assert.equal(value.dataset.themeMode, "light");
});

test("falls back to the official theme event when the visible host is isolated", async () => {
  const value = root();
  let listener: ((event: { mode?: unknown }) => void) | undefined;
  await registerHostThemeModeSync({
    async getUserConfigs() {
      return { preferredThemeMode: "light" };
    },
    onThemeModeChanged(callback) {
      listener = callback;
      return () => undefined;
    },
  }, value, (error) => assert.fail(error instanceof Error ? error : new Error("unexpected initial theme read failure")), () => {
    throw new Error("cross-origin parent");
  });

  assert.equal(value.dataset.themeMode, "light");
  listener?.({ mode: "dark" });
  assert.equal(value.dataset.themeMode, "dark");
});

test("keeps the CSS fallback when the initial host config cannot be read", async () => {
  const value = root();
  const errors: unknown[] = [];
  const off = await registerHostThemeModeSync({
    async getUserConfigs() {
      throw new Error("host unavailable");
    },
    onThemeModeChanged() {
      return () => undefined;
    },
  }, value, (error) => errors.push(error));

  assert.equal(value.dataset.themeMode, undefined);
  assert.equal(errors.length, 1);
  off();
});

test("prefers the visible Logseq theme over a stale saved preference", () => {
  const element = (className: string, attributes: Record<string, string> = {}) => ({
    className,
    getAttribute: (name: string) => attributes[name] ?? null,
  });

  assert.equal(detectVisibleThemeMode({
    documentElement: element("is-electron dark-theme"),
    body: element(""),
  }), "dark");
  assert.equal(detectVisibleThemeMode({
    documentElement: element("", { "data-theme": "light" }),
    body: element(""),
  }), "light");
});

test("infers the visible theme from Logseq background tokens when no theme marker exists", () => {
  const element = { className: "", getAttribute: () => null };
  const document = (background: string): VisibleThemeDocument => ({
    documentElement: element,
    body: element,
    defaultView: {
      getComputedStyle: () => ({
        backgroundColor: "",
        getPropertyValue: (name: string) => name === "--ls-primary-background-color" ? background : "",
      }),
    },
  });

  assert.equal(detectVisibleThemeMode(document("#10231b")), "dark");
  assert.equal(detectVisibleThemeMode(document("rgb(246, 247, 244)")), "light");
});

test("uses the operating-system color scheme only when the host document is isolated", () => {
  assert.equal(detectSystemThemeMode((query) => ({ matches: query.includes("dark") })), "dark");
  assert.equal(detectSystemThemeMode((query) => ({ matches: query.includes("light") })), "light");
  assert.equal(detectSystemThemeMode(() => ({ matches: false })), undefined);
  assert.equal(detectSystemThemeMode(() => {
    throw new Error("unavailable");
  }), undefined);
});
