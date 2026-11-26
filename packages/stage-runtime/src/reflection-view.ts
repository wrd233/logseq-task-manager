import { dateLabel } from "./time-model.ts";
import type { ReflectionAction, ReflectionSnapshot } from "./reflection.ts";
import { escapeStageText as esc, paperButton } from "./schedule-paper.ts";
import type { StageWorkTarget } from "./types.ts";

export const REFLECTION_CSS = `
.tcs-reflection { container-type: inline-size; max-width: 980px; padding: 28px 22px 72px; margin: auto; user-select: text; }
.tcs-reflection-grid { display: grid; grid-template-columns: minmax(0, .76fr) minmax(0, 1.32fr); gap: 56px; align-items: start; }
@container (max-width: 650px) { .tcs-reflection-grid { grid-template-columns: minmax(0, 1fr); gap: 38px; } }
.tcs-reflection-traces { opacity: .76; transition: opacity 220ms ease; }
.tcs-reflection-traces:hover, .tcs-reflection-traces:focus-within { opacity: 1; }
.tcs-reflection-traces ul { padding: 0; margin: 0; list-style: none; }
.tcs-reflection-trace {
  margin: 0 0 12px -10px; padding: 6px 8px 6px 8px; border-left: 2px solid transparent;
  font-size: 13px; line-height: 1.65; overflow-wrap: anywhere; transition: opacity 220ms ease, background-color 180ms ease;
}
.tcs-reflection-trace:focus-within, .tcs-reflection-trace:hover { background: color-mix(in srgb, var(--tcs-paper-ink) 4%, transparent); }
.tcs-reflection-traces.has-follow .tcs-reflection-trace:not(.is-follow):not(:focus-within):not(:hover) { opacity: .38; }
.tcs-reflection-trace.is-follow { border-left-color: var(--tcs-paper-blue); background: var(--tcs-paper-glow); }
.tcs-reflection-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--tcs-paper-muted); }
.tcs-reflection-trace details, .tcs-reflection-more { margin-top: 4px; color: var(--tcs-paper-muted); }
.tcs-reflection details summary { cursor: pointer; list-style: none; }
.tcs-reflection details summary::-webkit-details-marker { display: none; }
.tcs-reflection-original { margin: 6px 0; padding-left: 10px; border-left: 1px solid var(--tcs-paper-hair); white-space: pre-wrap; overflow-wrap: anywhere; }
.tcs-reflection-editor { width: 100%; min-height: 210px; padding: 0; border: 0; outline: 0; background: transparent; resize: vertical; color: inherit; font: inherit; font-size: 16px; line-height: 1.9; }
.tcs-reflection-follow { margin-bottom: 14px; padding-left: 10px; border-left: 2px solid var(--tcs-paper-blue); color: var(--tcs-paper-blue); font-size: 12.5px; }
.tcs-reflection-question { margin: 8px 0 12px; padding: 4px 0 4px 10px; border-left: 1px solid var(--tcs-paper-hair); color: var(--tcs-paper-muted); }
.tcs-reflection-foot { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; padding-top: 10px; border-top: 1px solid var(--tcs-paper-hair); }
.tcs-reflection-ideas { margin-top: 42px; padding-top: 22px; border-top: 1px solid var(--tcs-paper-hair); }
.tcs-reflection-idea + .tcs-reflection-idea { margin-top: 26px; }
.tcs-reflection-idea h4 { font-size: 15px; font-weight: 500; margin: 12px 0; }
.tcs-reflection-idea ol { margin: 0 0 12px; padding-left: 12px; border-left: 1px solid var(--tcs-paper-hair); list-style: none; }
.tcs-reflection-idea li { font-size: 14px; margin: 0 0 10px; white-space: pre-wrap; overflow-wrap: anywhere; }
.tcs-reflection-idea time { color: var(--tcs-paper-muted); margin-right: 9px; font-size: 12px; }
@media (prefers-reduced-motion: reduce) { .tcs-reflection * { transition: none !important; } }
`;

const questions = [
  "今天哪件事和你原先想的不一样？",
  "今天哪件事停在了哪一步？",
  "今天做过的哪一步值得记下来？",
];

type NoteReceipt = { id: string; date: string; graphId: string | undefined };

export function createReflectionView(doc: Document, port: {
  dispatch(action: ReflectionAction): Promise<boolean>;
  onOpen?(target: StageWorkTarget): void | Promise<void>;
}) {
  const element = doc.createElement("div");
  element.className = "tcs-reflection";
  element.innerHTML = `<header class="tcs-paper-top"><h2 data-rf-date>安静回望室</h2></header>
    <div class="tcs-reflection-grid">
      <aside class="tcs-reflection-traces"><h3 class="tcs-paper-head">今天发生过</h3><div data-rf-traces></div></aside>
      <section>
        <div data-rf-companion class="tcs-reflection-follow" hidden><span></span>${paperButton("取消对照", "data-rf-clear")}</div>
        <form data-rf-note>
          <label for="tcs-reflection-editor" class="tcs-paper-head">今晚我想留下的</label>
          <textarea class="tcs-reflection-editor" id="tcs-reflection-editor" name="note"></textarea>
          <div data-rf-question class="tcs-reflection-question" hidden><span></span>
            ${paperButton("换一句", "data-rf-next")}${paperButton("关掉", "data-rf-hide")}
          </div>
          <div class="tcs-reflection-foot">
            ${paperButton("写不出来时，给 1 句简单提问", "data-rf-ask")}
            <button type="submit" class="tcs-paper-btn is-primary">存进今天日记</button>
          </div>
          <p class="tcs-paper-context" data-rf-receipt role="status"></p>
        </form>
        <section class="tcs-reflection-ideas">
          <h3 class="tcs-paper-head">正在养的想法</h3>
          <div data-rf-ideas></div>
          <form class="tcs-paper-form" data-rf-idea=""><input aria-label="新想法" name="idea" placeholder="记一个想法" maxlength="600">
            <button class="tcs-paper-btn" type="submit">记下</button>
          </form>
        </section>
      </section>
    </div>`;

  const input = element.querySelector<HTMLTextAreaElement>("textarea")!;
  const traces = element.querySelector<HTMLElement>("[data-rf-traces]")!;
  const companion = element.querySelector<HTMLElement>("[data-rf-companion]")!;
  const question = element.querySelector<HTMLElement>("[data-rf-question]")!;
  const ideaList = element.querySelector<HTMLElement>("[data-rf-ideas]")!;
  const receipt = element.querySelector<HTMLElement>("[data-rf-receipt]")!;
  const clock = new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
  let snapshot: ReflectionSnapshot | undefined;
  let followed: string | undefined;
  let questionIndex = 0;
  let composing = false;
  let sendingNote = false;
  let pendingNote: (NoteReceipt & { text: string }) | undefined;
  let lastSent: NoteReceipt | undefined;
  let traceState = "";
  let ideaState = "";
  const ideaDrafts = new Map<string, string>();
  const pendingIdeas = new Map<string, { id: string; text: string }>();
  const savingIdeas = new Set<string>();

  const updateFollow = () => {
    const item = snapshot?.traces.find(trace => trace.id === followed);
    element.querySelector(".tcs-reflection-traces")!.classList.toggle("has-follow", Boolean(item));
    traces.querySelectorAll<HTMLElement>("[data-rf-trace]").forEach(row => row.classList.toggle("is-follow", row.dataset.rfTrace === item?.id));
    companion.hidden = !item;
    companion.querySelector("span")!.textContent = item?.summary ?? "";
  };

  const updateReceipt = () => {
    if (!lastSent || !snapshot || lastSent.graphId !== snapshot.graphId || lastSent.date !== snapshot.date) {
      receipt.textContent = "";
      return;
    }
    receipt.textContent = snapshot.pendingNoteIds.includes(lastSent.id) ? "已暂存，等待 Logseq 写入" : "已存进今天日记";
  };

  function update(next: ReflectionSnapshot): void {
    snapshot = next;
    if (composing) return;
    element.querySelector("[data-rf-date]")!.textContent = `${dateLabel(next.date)} · 晚间手记`;
    const signature = JSON.stringify([next.traces, next.journalAvailable]);
    if (traceState !== signature) {
      traceState = signature;
      const open = new Set(Array.from(traces.querySelectorAll<HTMLElement>("details[open]"), row => row.dataset.rfOriginal));
      const more = traces.querySelector<HTMLDetailsElement>(".tcs-reflection-more")?.open;
      const renderTrace = (item: ReflectionSnapshot["traces"][number]) => `<li class="tcs-reflection-trace" data-rf-trace="${esc(item.id)}">
        <div class="tcs-reflection-meta"><span>${item.at !== undefined ? `${esc(clock.format(item.at))} · ` : ""}${esc(item.label)}</span>
          ${paperButton("顺着写", `data-rf-follow="${esc(item.id)}"`, true)}
        </div>
        <div>${esc(item.summary)}</div>
        <details data-rf-original="${esc(item.id)}" ${open.has(item.id) ? "open" : ""}><summary>原记录</summary>
          <div class="tcs-reflection-original">${esc(item.original)}</div>
          ${item.workRef && port.onOpen ? paperButton("打开原块", `data-rf-open="${esc(item.id)}"`) : ""}
        </details>
      </li>`;
      const visible = next.traces.slice(-5);
      const older = next.traces.slice(0, -5);
      traces.innerHTML = `${visible.length ? `<ul>${visible.map(renderTrace).join("")}</ul>` : '<p class="tcs-paper-context">暂无脚印</p>'}
        ${older.length ? `<details class="tcs-reflection-more" ${more ? "open" : ""}><summary>较早的脚印</summary><ul>${older.map(renderTrace).join("")}</ul></details>` : ""}
        ${!next.journalAvailable ? '<p class="tcs-paper-context">今日日记暂不可读</p>' : ""}`;
      updateFollow();
    }
    const ideasSignature = JSON.stringify(next.ideas);
    if (ideaState !== ideasSignature) {
      ideaState = ideasSignature;
      ideaList.innerHTML = next.ideas.map(idea => `<section class="tcs-reflection-idea">
        <h4>${esc(idea.title)}</h4>
        <ol>${idea.entries.map(entry => `<li><time datetime="${esc(entry.date)}">${esc(entry.date.slice(5))}</time>${esc(entry.text)}</li>`).join("")}</ol>
        <form class="tcs-paper-form" data-rf-idea="${esc(idea.id)}">
          <input aria-label="补充想法" name="idea" placeholder="补一句" maxlength="600" value="${esc(ideaDrafts.get(idea.id) ?? "")}">
          <button class="tcs-paper-btn" type="submit">补充</button>
        </form>
      </section>`).join("");
    }
    updateReceipt();
  }

  element.addEventListener("compositionstart", () => { composing = true; });
  element.addEventListener("compositionend", () => {
    composing = false;
    if (snapshot) update(snapshot);
  });
  element.addEventListener("input", (event) => {
    const field = event.target as HTMLInputElement;
    const id = field.form?.dataset.rfIdea;
    if (id !== undefined) ideaDrafts.set(id, field.value);
  });
  element.addEventListener("click", (event) => {
    if (composing) return;
    const button = (event.target as Element).closest("button");
    if (!button) return;
    if (button.dataset.rfFollow) {
      followed = button.dataset.rfFollow;
      updateFollow();
      input.focus();
    } else if (button.hasAttribute("data-rf-clear")) {
      followed = undefined;
      updateFollow();
    } else if (button.dataset.rfOpen) {
      const item = snapshot?.traces.find(trace => trace.id === button.dataset.rfOpen);
      if (item?.workRef) void port.onOpen?.({ workRef: item.workRef, title: item.summary });
    } else if (button.hasAttribute("data-rf-hide")) {
      question.hidden = true;
    } else if (button.hasAttribute("data-rf-ask") || button.hasAttribute("data-rf-next")) {
      if (button.hasAttribute("data-rf-next")) questionIndex = (questionIndex + 1) % questions.length;
      question.querySelector("span")!.textContent = questions[questionIndex]!;
      question.hidden = false;
    }
  });
  element.addEventListener("keydown", (event) => {
    const field = event.target as HTMLInputElement;
    if (event.key !== "Enter" || event.isComposing || composing || field.form?.dataset.rfIdea === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    field.form.requestSubmit();
  });
  element.addEventListener("submit", (event) => {
    event.preventDefault();
    if (composing || !snapshot) return;
    const form = event.target as HTMLFormElement;
    if (form.hasAttribute("data-rf-note")) {
      const text = input.value;
      if (!text.trim() || sendingNote) return;
      const { date, graphId } = snapshot;
      if (pendingNote?.text !== text || pendingNote.date !== date || pendingNote.graphId !== graphId) {
        pendingNote = { id: crypto.randomUUID(), text, date, graphId };
      }
      const note = pendingNote;
      sendingNote = true;
      void port.dispatch({ type: "save-evening-note", requestId: note.id, date, ...(graphId ? { graphId } : {}), text })
        .then(ok => {
          if (!ok) return;
          lastSent = { id: note.id, date, graphId };
          pendingNote = undefined;
          if (input.value === text) input.value = "";
          updateReceipt();
        }).finally(() => { sendingNote = false; });
      return;
    }
    const ideaId = form.dataset.rfIdea;
    const field = form.querySelector<HTMLInputElement>("input");
    if (ideaId === undefined || !field?.value.trim() || savingIdeas.has(ideaId)) return;
    const text = field.value;
    const prior = pendingIdeas.get(ideaId);
    const entryId = prior?.text === text ? prior.id : crypto.randomUUID();
    pendingIdeas.set(ideaId, { id: entryId, text });
    savingIdeas.add(ideaId);
    void port.dispatch({ type: "append-idea-note", ...(ideaId ? { ideaId } : {}), entryId, text }).then(ok => {
      if (!ok) return;
      pendingIdeas.delete(ideaId);
      if (ideaDrafts.get(ideaId) === text) {
        ideaDrafts.delete(ideaId);
        const live = Array.from(element.querySelectorAll<HTMLFormElement>("[data-rf-idea]")).find(form => form.dataset.rfIdea === ideaId);
        const liveField = live?.querySelector("input");
        if (liveField?.value === text) liveField.value = "";
      }
    }).finally(() => { savingIdeas.delete(ideaId); });
  });

  return { element, update };
}
