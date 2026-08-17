import type { BlockIdentity } from "./block-context.ts";
import { FORMAL_MARKER_MAX_ACTIVE, formalMarkerTooltip, isFormalIdentity, markerGlyphFor } from "./formal-marker.ts";

/**
 * Compatibility layer for rendering the Formal Identity Marker in Logseq
 * Desktop 0.10.15. `onBlockRendererSlotted` replaces the whole block content
 * body, so the marker is injected as a sibling in `.block-main-container`
 * (between the bullet control and the content wrapper). We never modify the
 * bullet container or Logseq block text.
 */
export interface FormalMarkerHostOptions {
  document(): Document | null;
  lookupFormal(uuid: string): BlockIdentity;
  onOpen(uuid: string): void;
  maxActive?: number;
}

export interface FormalMarkerHost {
  rescan(): number;
  activeCount(): number;
  dispose(): void;
}

export function installFormalMarkerHost(options: FormalMarkerHostOptions): FormalMarkerHost {
  const maxActive = options.maxActive ?? FORMAL_MARKER_MAX_ACTIVE;
  let observer: MutationObserver | null = null;
  let scheduled = 0;

  function markerFor(block: Element): HTMLElement | null {
    return block.querySelector<HTMLElement>(":scope > .block-main-container > [data-tc-formal-marker]");
  }

  function removeMarker(block: Element): void {
    markerFor(block)?.remove();
    block.removeAttribute("data-tc-formal");
  }

  function injectMarker(block: Element): boolean {
    const uuid = block.getAttribute("blockid");
    if (!uuid) return false;
    const identity = options.lookupFormal(uuid);
    if (!isFormalIdentity(identity)) { removeMarker(block); return false; }
    if (markerFor(block)) return true;
    const main = block.querySelector(":scope > .block-main-container");
    if (!main) return false;
    const marker = main.ownerDocument.createElement("button");
    marker.type = "button";
    marker.dataset.tcFormalMarker = "true";
    marker.dataset.tcFormalUuid = uuid;
    marker.dataset.tcFormalConsistency = identity.consistency ?? "OK";
    marker.textContent = markerGlyphFor(identity);
    const tooltip = formalMarkerTooltip(identity);
    marker.title = tooltip;
    marker.setAttribute("aria-label", tooltip);
    marker.style.cssText = "flex:0 0 auto;border:none;background:transparent;padding:0 7px 0 0;margin:0;font-size:11px;line-height:1.45;opacity:.42;cursor:pointer;color:inherit;transition:opacity .12s ease;";
    marker.addEventListener("pointerdown", (event) => { event.stopPropagation(); });
    marker.addEventListener("click", (event) => {
      event.stopPropagation();
      event.preventDefault();
      options.onOpen(uuid);
    });
    const anchor = main.querySelector(":scope > .block-content-wrapper");
    main.insertBefore(marker, anchor ?? main.firstChild);
    block.setAttribute("data-tc-formal", "true");
    return true;
  }

  function rescan(): number {
    const doc = options.document();
    if (!doc) return 0;
    let active = 0;
    const blocks = doc.querySelectorAll(".ls-block[blockid]");
    for (const block of Array.from(blocks)) {
      const existing = markerFor(block);
      const uuid = block.getAttribute("blockid");
      const identity = uuid ? options.lookupFormal(uuid) : { kind: "ORDINARY" } as BlockIdentity;
      if (!isFormalIdentity(identity)) { if (existing) removeMarker(block); continue; }
      if (existing) {
        const consistency = identity.consistency ?? "OK";
        const glyph = markerGlyphFor(identity);
        if (existing.textContent !== glyph || existing.dataset.tcFormalConsistency !== consistency) {
          existing.dataset.tcFormalConsistency = consistency;
          existing.textContent = glyph;
          const tooltip = formalMarkerTooltip(identity);
          existing.title = tooltip;
          existing.setAttribute("aria-label", tooltip);
        }
        active += 1;
        continue;
      }
      if (active >= maxActive) continue;
      if (injectMarker(block)) active += 1;
    }
    return active;
  }

  const doc = options.document();
  if (doc) {
    observer = new MutationObserver(() => {
      if (scheduled) return;
      scheduled = window.requestAnimationFrame(() => {
        scheduled = 0;
        rescan();
      });
    });
    observer.observe(doc.body, { childList: true, subtree: true });
  }

  return {
    rescan,
    activeCount() {
      const current = options.document();
      return current ? current.querySelectorAll("[data-tc-formal-marker]").length : 0;
    },
    dispose() {
      if (scheduled) window.cancelAnimationFrame(scheduled);
      scheduled = 0;
      observer?.disconnect();
      observer = null;
      const current = options.document();
      current?.querySelectorAll("[data-tc-formal-marker]").forEach((marker) => marker.remove());
      current?.querySelectorAll("[data-tc-formal]").forEach((block) => block.removeAttribute("data-tc-formal"));
    },
  };
}
