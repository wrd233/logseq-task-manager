import { createCorrelationId } from "./structured-logger.ts";
import type { StructuredLogger } from "./structured-logger.ts";

export type InboxActionId = "open-source" | "manual-formalize" | "create-manual-proposal" | "link-existing-object" | "defer" | "no-action";
export type ObservableActionStatus = "idle" | "loading" | "success" | "error";
export interface ObservableActionState { status: ObservableActionStatus; correlationId?: string; message?: string; }

export class InboxActionController {
  private readonly states = new Map<string, ObservableActionState>();
  constructor(private readonly logger: StructuredLogger, private readonly refresh: () => Promise<void>) {}
  private key(actionId: InboxActionId, captureId: string): string { return `${actionId}:${captureId}`; }
  state(actionId: InboxActionId, captureId: string): ObservableActionState { return this.states.get(this.key(actionId, captureId)) ?? { status: "idle" }; }
  snapshot(): Record<string, ObservableActionState> { return Object.fromEntries(this.states); }

  async execute(actionId: InboxActionId, captureId: string, command: (correlationId: string) => Promise<string | void>): Promise<boolean> {
    const key = this.key(actionId, captureId);
    if (this.states.get(key)?.status === "loading") return false;
    const correlationId = createCorrelationId();
    const started = performance.now();
    this.logger.log("info", "ui-action", "ui_action_clicked", { correlationId, actionId, captureId });
    this.states.set(key, { status: "loading", correlationId, message: "处理中…" });
    this.logger.log("info", "ui-action", "ui_action_dispatch_started", { correlationId, actionId, captureId });
    let commandStarted = false;
    let commandSucceeded = false;
    try {
      await this.refresh();
      commandStarted = true;
      this.logger.log("info", "application-command", "application_command_started", { correlationId, actionId, captureId, command: actionId });
      const message = await command(correlationId);
      commandSucceeded = true;
      this.logger.log("info", "application-command", "application_command_succeeded", { correlationId, actionId, captureId, command: actionId, durationMs: performance.now() - started, result: "success" });
      this.states.set(key, { status: "success", correlationId, message: message ?? "操作成功" });
      this.logger.log("info", "query-refresh", "query_invalidated", { correlationId, actionId, captureId });
      await this.refresh();
      this.logger.log("info", "ui-action", "ui_action_succeeded", { correlationId, actionId, captureId, durationMs: performance.now() - started, result: "success" });
      return true;
    } catch (error) {
      const event = commandStarted && !commandSucceeded ? "application_command_failed" : "ui_refresh_failed";
      this.logger.log("error", commandStarted && !commandSucceeded ? "application-command" : "query-refresh", event, { correlationId, actionId, captureId, command: actionId, durationMs: performance.now() - started, result: "error" }, error);
      const detail = error instanceof Error ? error.message : String(error);
      this.states.set(key, { status: "error", correlationId, message: commandSucceeded ? `操作已完成，但界面刷新失败：${detail}。请勿重复提交。` : detail });
      try {
        await this.refresh();
      } catch (refreshError) {
        this.logger.log("error", "query-refresh", "ui_refresh_failed", { correlationId, actionId, captureId, result: "error" }, refreshError);
      }
      this.logger.log("error", "ui-action", "ui_action_failed", { correlationId, actionId, captureId, durationMs: performance.now() - started, result: "error" }, error);
      return false;
    }
  }
}

export function createDelegatedActionHandler(dispatch: (action: string, value?: string) => Promise<void>, onUnhandled: (error: unknown) => void): (event: Event) => void {
  return (event: Event) => {
    const element = event.target as { closest?: (selector: string) => { dataset?: { action?: string; value?: string } } | null } | null;
    const target = element?.closest?.("[data-action]");
    if (!target?.dataset?.action) return;
    void dispatch(target.dataset.action, target.dataset.value).catch(onUnhandled);
  };
}
