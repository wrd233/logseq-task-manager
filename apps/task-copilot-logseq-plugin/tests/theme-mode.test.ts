import assert from "node:assert/strict";
import test from "node:test";

import { applyHostThemeMode, registerHostThemeModeSync, type ThemeModeRoot } from "../src/theme-mode.ts";

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
