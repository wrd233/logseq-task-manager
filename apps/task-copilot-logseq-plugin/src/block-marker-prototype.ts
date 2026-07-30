import type { V2Anchor, V2ManagedObject } from "@task-copilot/domain";

export type BlockMarkerPrototypeMode = "OFF" | "LINE" | "DOT" | "ICON" | "TINT" | "PHRASE";

export const BLOCK_MARKER_HOST_RELEASE_POLICY = {
  productionMode: "OFF",
  publicSettingVisible: false,
  status: "HOST_SLOT_REJECTED",
  recheckWhen: "STABLE_APPEND_ONLY_BLOCK_SLOT",
} as const;

type MarkerState = "BLOCKED" | "WAITING" | "PAUSED" | "FOCUS" | "OPEN" | "CLOSED";

interface MarkerProjection {
  state: MarkerState;
  label: string;
}

export interface BlockMarkerPrototypeHost {
  registerBlockSlot(blockUuid: string, callback: (event: { slot: string; uuid?: string }) => void): void;
  checkSlotValid(slot: string): Promise<boolean>;
  provideUi(input: { key: string; slot: string; template: string | null }): void;
}

export interface BlockMarkerPrototypeInput {
  mode: BlockMarkerPrototypeMode;
  objects: readonly V2ManagedObject[];
  anchors: readonly V2Anchor[];
  activeFocusObjectIds: readonly string[];
}

export const BLOCK_MARKER_PROTOTYPE_UI_KEY = "task-copilot-block-marker-prototype";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function projection(object: V2ManagedObject, focused: boolean): MarkerProjection {
  if (object.lifecycle !== "OPEN") return { state: "CLOSED", label: "已结束" };
  if (object.condition.kind === "BLOCKED") return { state: "BLOCKED", label: "受阻" };
  if (object.condition.kind === "WAITING") return { state: "WAITING", label: "等待" };
  if (object.condition.kind === "PAUSED") return { state: "PAUSED", label: "暂停" };
  if (focused) return { state: "FOCUS", label: "当前" };
  return { state: "OPEN", label: "事项" };
}

function icon(state: MarkerState): string {
  if (state === "BLOCKED") return "!";
  if (state === "WAITING") return "◷";
  if (state === "PAUSED") return "Ⅱ";
  if (state === "FOCUS") return "→";
  if (state === "CLOSED") return "✓";
  return "•";
}

export function renderBlockMarkerPrototype(mode: Exclude<BlockMarkerPrototypeMode, "OFF">, value: MarkerProjection): string {
  const label = `Task Copilot：${value.label}`;
  const content = mode === "PHRASE" ? value.label : mode === "ICON" ? icon(value.state) : "";
  return `<span class="task-copilot-block-marker mode-${mode.toLowerCase()} state-${value.state.toLowerCase()}" data-task-copilot-block-marker="${value.state}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}"><span aria-hidden="true">${escapeHtml(content)}</span></span>`;
}

export class BlockMarkerPrototypeController {
  private mode: BlockMarkerPrototypeMode = "OFF";
  private readonly registered = new Set<string>();
  private readonly projections = new Map<string, MarkerProjection>();
  private readonly slotsByBlock = new Map<string, Set<string>>();
  private readonly generations = new Map<string, number>();

  constructor(
    private readonly host: BlockMarkerPrototypeHost,
    private readonly options: { registrationCapacity?: number; slotCapacity?: number; onIssue(error: unknown): void },
  ) {}

  refresh(input: BlockMarkerPrototypeInput): void {
    const registrationCapacity = this.options.registrationCapacity ?? 512;
    const slotCapacity = this.options.slotCapacity ?? 2048;
    if (registrationCapacity < 1 || registrationCapacity > 4096 || slotCapacity < 1 || slotCapacity > 8192) {
      throw new Error("Block marker prototype capacity is invalid.");
    }
    this.mode = input.mode;
    this.projections.clear();
    if (input.mode === "OFF") {
      this.clearSlots();
      return;
    }

    const objects = new Map(input.objects.map((object) => [object.objectId, object]));
    const focus = new Set(input.activeFocusObjectIds);
    const candidates = input.anchors
      .filter((anchor) => anchor.role === "primary_text" && anchor.status === "active" && objects.has(anchor.objectId))
      .sort((left, right) => left.externalId.localeCompare(right.externalId));
    const externalIds = new Set(candidates.map((anchor) => anchor.externalId));
    const newRegistrationCount = [...externalIds].filter((externalId) => !this.registered.has(externalId)).length;
    if (externalIds.size !== candidates.length || this.registered.size + newRegistrationCount > registrationCapacity) {
      this.mode = "OFF";
      this.clearSlots();
      throw new Error(externalIds.size !== candidates.length
        ? "Block marker prototype received an ambiguous primary Anchor identity."
        : "Block marker prototype registration capacity would be exceeded.");
    }
    for (const anchor of candidates) {
      const object = objects.get(anchor.objectId)!;
      this.projections.set(anchor.externalId, projection(object, focus.has(object.objectId)));
      if (this.registered.has(anchor.externalId)) continue;
      this.registered.add(anchor.externalId);
      this.host.registerBlockSlot(anchor.externalId, (event) => {
        if (event.uuid && event.uuid !== anchor.externalId) {
          this.clearSlot(event.slot);
          this.options.onIssue(new Error("Block marker prototype slot identity mismatch."));
          return;
        }
        let slots = this.slotsByBlock.get(anchor.externalId);
        if (!slots) {
          slots = new Set();
          this.slotsByBlock.set(anchor.externalId, slots);
        }
        slots.add(event.slot);
        while (this.slotCount() > slotCapacity) this.evictOldestSlot();
        void this.renderSlot(anchor.externalId, event.slot);
      });
    }
    for (const [blockUuid, slots] of this.slotsByBlock) {
      for (const slot of slots) void this.renderSlot(blockUuid, slot);
    }
  }

  clear(): void {
    this.mode = "OFF";
    this.projections.clear();
    this.clearSlots();
  }

  dispose(): void {
    this.clear();
    this.registered.clear();
  }

  private async renderSlot(blockUuid: string, slot: string): Promise<void> {
    const generation = (this.generations.get(slot) ?? 0) + 1;
    this.generations.set(slot, generation);
    try {
      if (!await this.host.checkSlotValid(slot) || this.generations.get(slot) !== generation) {
        this.removeSlot(blockUuid, slot);
        return;
      }
      const value = this.projections.get(blockUuid);
      const mode = this.mode;
      this.host.provideUi({
        key: BLOCK_MARKER_PROTOTYPE_UI_KEY,
        slot,
        template: value && mode !== "OFF" ? renderBlockMarkerPrototype(mode, value) : null,
      });
    } catch (error) {
      this.removeSlot(blockUuid, slot);
      this.options.onIssue(error);
    }
  }

  private clearSlots(): void {
    for (const slots of this.slotsByBlock.values()) {
      for (const slot of slots) this.clearSlot(slot);
    }
    this.slotsByBlock.clear();
    this.generations.clear();
  }

  private clearSlot(slot: string): void {
    try {
      this.host.provideUi({ key: BLOCK_MARKER_PROTOTYPE_UI_KEY, slot, template: null });
    } catch (error) {
      this.options.onIssue(error);
    }
  }

  private removeSlot(blockUuid: string, slot: string): void {
    this.slotsByBlock.get(blockUuid)?.delete(slot);
    if (this.slotsByBlock.get(blockUuid)?.size === 0) this.slotsByBlock.delete(blockUuid);
    this.generations.delete(slot);
  }

  private slotCount(): number {
    return [...this.slotsByBlock.values()].reduce((sum, slots) => sum + slots.size, 0);
  }

  private evictOldestSlot(): void {
    const first = this.slotsByBlock.entries().next().value as [string, Set<string>] | undefined;
    const slot = first?.[1].values().next().value as string | undefined;
    if (!first || !slot) return;
    this.clearSlot(slot);
    this.removeSlot(first[0], slot);
  }
}
