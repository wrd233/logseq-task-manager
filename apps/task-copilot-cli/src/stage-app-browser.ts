import { mountSharedStageView, type StageSnapshot, type StageUserAction } from "@task-copilot/stage-runtime";

const container = document.querySelector<HTMLElement>("#stage-root")!;
const token = container.dataset.token!;
const instanceId = container.dataset.instance!;
const headers = {
  "content-type": "application/json",
  "authorization": `Bearer ${token}`,
  "x-workspace-instance": instanceId,
};
container.removeAttribute("data-token");
container.removeAttribute("data-instance");

async function api<T>(path: string, input: object): Promise<T> {
  const response = await fetch(path, { method: "POST", headers, body: JSON.stringify(input) });
  const result = await response.json() as { value: T; error?: { message?: string } };
  if (!response.ok) throw new Error(result.error?.message ?? "无法连接 Companion");
  return result.value;
}

let version = -1;
const view = mountSharedStageView(container, {
  source: "standalone",
  showThemeSwitch: true,
  async dispatch(action: StageUserAction) {
    const { snapshot } = await api<{ snapshot: StageSnapshot }>("/stage/action", { action });
    if (snapshot.version < version) return;
    version = snapshot.version;
    return snapshot;
  },
});
const show = (snapshot: StageSnapshot) => {
  if (snapshot.version < version) return;
  version = snapshot.version;
  view.update(snapshot);
};
void api<StageSnapshot>("/stage/state", {}).then(show).catch(() => {
  if (version === -1) container.querySelector<HTMLElement>("[data-tcs-stage]")!.textContent = "日程未连接";
});
const query = new URLSearchParams({ token, instanceId });
const events = new EventSource(`/stage/events?${query}`);
events.addEventListener("stage", (event: MessageEvent<string>) => {
  show(JSON.parse(event.data) as StageSnapshot);
});
window.addEventListener("pagehide", () => { events.close(); view.dispose(); }, { once: true });
