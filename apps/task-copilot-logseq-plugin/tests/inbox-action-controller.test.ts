import assert from "node:assert/strict";
import test from "node:test";
import { InboxActionController, createDelegatedActionHandler, type InboxActionId } from "../src/inbox-action-controller.ts";
import { StructuredLogger } from "../src/structured-logger.ts";

test("all six Inbox buttons dispatch capture IDs through a real delegated click", async () => {
  const received: string[] = [];
  const handler = createDelegatedActionHandler(async (action, value) => { received.push(`${action}:${value}`); });
  for (const action of ["open-source", "manual-formalize", "create-manual-proposal", "link-existing-object", "defer", "no-action"]) {
    handler({ target: { closest: () => ({ dataset: { action, value: "cap_19" } }) } } as unknown as Event);
  }
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(received.length, 6);
  assert.ok(received.every((item) => item.endsWith(":cap_19")));
});

test("action controller exposes loading/success/error, refreshes and blocks duplicate clicks", async () => {
  const logger = new StructuredLogger(100);
  let refreshes = 0;
  const controller = new InboxActionController(logger, async () => { refreshes += 1; });
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  const first = controller.execute("manual-formalize", "cap_19", async () => pending);
  assert.equal(controller.state("manual-formalize", "cap_19").status, "loading");
  assert.equal(await controller.execute("manual-formalize", "cap_19", async () => {}), false);
  release();
  assert.equal(await first, true);
  assert.equal(controller.state("manual-formalize", "cap_19").status, "success");
  for (const action of ["open-source", "create-manual-proposal", "link-existing-object", "defer", "no-action"] as InboxActionId[]) {
    await controller.execute(action, "cap_19", async () => { throw new Error(`${action} failed`); });
    assert.equal(controller.state(action, "cap_19").status, "error");
    assert.match(controller.state(action, "cap_19").correlationId ?? "", /^TC-/);
  }
  assert.ok(refreshes >= 12);
});
