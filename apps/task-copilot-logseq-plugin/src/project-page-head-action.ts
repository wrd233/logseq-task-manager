import { escapeHtml } from "./ui.ts";

export const PROJECT_PAGE_HEAD_UI_KEY = "task-copilot-project-reentry-head";
export const MODEL_PROJECT_REENTRY = "task-copilot-open-current-project-reentry";

export interface ProjectPageHeadTarget {
  projectText: string;
}

export interface ProjectPageHeadActionHost {
  checkSlotValid(slot: string): Promise<boolean>;
  provideUi(input: { key: string; slot: string; template: string | null }): void;
}

export interface ProjectPageHeadActionDependencies {
  available(): boolean;
  resolveCurrentProject(): Promise<ProjectPageHeadTarget | undefined>;
  onIssue(error: unknown): void;
}

export function renderProjectPageHeadAction(target: ProjectPageHeadTarget): string {
  return `<button type="button" class="task-copilot-project-reentry-head-action" data-on-click="${MODEL_PROJECT_REENTRY}" title="${escapeHtml(`继续项目：${target.projectText}`)}" aria-label="${escapeHtml(`继续项目：${target.projectText}`)}">继续项目</button>`;
}

export class ProjectPageHeadActionController {
  private readonly slots = new Set<string>();
  private readonly generations = new Map<string, number>();
  private sharedResolution: Promise<ProjectPageHeadTarget | undefined> | undefined;

  constructor(
    private readonly host: ProjectPageHeadActionHost,
    private readonly dependencies: ProjectPageHeadActionDependencies,
    private readonly capacity = 32,
  ) {
    if (!Number.isSafeInteger(capacity) || capacity < 1 || capacity > 128) {
      throw new Error("Project Page head slot capacity must be between 1 and 128.");
    }
  }

  observe(slot: string): void {
    if (!slot || slot.length > 256) {
      this.dependencies.onIssue(new Error("Project Page head slot identity is invalid."));
      return;
    }
    this.slots.add(slot);
    while (this.slots.size > this.capacity) {
      const oldest = this.slots.values().next().value as string | undefined;
      if (!oldest) break;
      this.slots.delete(oldest);
      this.generations.delete(oldest);
    }
    void this.refreshSlot(slot);
  }

  async refreshAll(): Promise<void> {
    this.sharedResolution = undefined;
    await Promise.all([...this.slots].map((slot) => this.refreshSlot(slot)));
  }

  clear(): void {
    for (const slot of this.slots) {
      this.clearSlot(slot);
    }
    this.slots.clear();
    this.generations.clear();
    this.sharedResolution = undefined;
  }

  private resolveShared(): Promise<ProjectPageHeadTarget | undefined> {
    if (!this.sharedResolution) {
      const resolution = this.dependencies.resolveCurrentProject();
      this.sharedResolution = resolution;
      const release = () => {
        if (this.sharedResolution === resolution) this.sharedResolution = undefined;
      };
      void resolution.then(release, release);
    }
    return this.sharedResolution;
  }

  private async refreshSlot(slot: string): Promise<void> {
    const generation = (this.generations.get(slot) ?? 0) + 1;
    this.generations.set(slot, generation);
    try {
      if (!await this.host.checkSlotValid(slot)) {
        this.slots.delete(slot);
        this.generations.delete(slot);
        return;
      }
      const target = this.dependencies.available() ? await this.resolveShared() : undefined;
      if (this.generations.get(slot) !== generation || !await this.host.checkSlotValid(slot)) return;
      this.host.provideUi({
        key: PROJECT_PAGE_HEAD_UI_KEY,
        slot,
        template: target ? renderProjectPageHeadAction(target) : null,
      });
    } catch (error) {
      if (this.generations.get(slot) === generation) {
        this.clearSlot(slot);
      }
      this.dependencies.onIssue(error);
    }
  }

  private clearSlot(slot: string): void {
    try {
      this.host.provideUi({ key: PROJECT_PAGE_HEAD_UI_KEY, slot, template: null });
    } catch (error) {
      this.dependencies.onIssue(error);
    }
  }
}
