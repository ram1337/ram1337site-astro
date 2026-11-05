export type SubscriptionDevice = { id: number; model: string; os: string; os_version: string; app: string; first_seen: number; last_seen: number };
type DeviceState = { issued: boolean; limit: number; registered: number; remaining: number | null; devices: SubscriptionDevice[] };
type Fetcher = (path: string, options?: RequestInit) => Promise<Response>;

export function deviceTitle(device: SubscriptionDevice): string {
  return device.model.trim() || [device.os, device.os_version].filter(Boolean).join(" ") || `Устройство №${device.id}`;
}

export function createDeviceManager(root: HTMLElement, fetcher: Fetcher, path: string, onLimit?: (limit: number) => void) {
  function el<K extends keyof HTMLElementTagNameMap>(tag: K, classes: string, text = ""): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    node.className = classes;
    node.textContent = text;
    return node;
  }
  const header = el("div", "flex flex-wrap items-center justify-between gap-3");
  const summary = el("p", "text-sm text-slate-600 dark:text-slate-300");
  summary.setAttribute("role", "status");
  summary.setAttribute("aria-live", "polite");
  const refresh = el("button", "text-sm font-medium text-violet-700 hover:underline disabled:opacity-50 dark:text-violet-300", "Обновить");
  refresh.type = "button";
  header.append(el("h4", "font-semibold text-slate-900 dark:text-slate-50", "Устройства"), refresh);
  const list = el("ul", "space-y-2");
  const error = el("p", "hidden text-sm text-rose-700 dark:text-rose-300");
  error.setAttribute("role", "alert");
  root.replaceChildren(header, summary, list, error, el("p", "text-xs leading-relaxed text-slate-500 dark:text-slate-400", "Чтобы заменить устройство, удалите на нём подписку и освободите место здесь. Иначе старое приложение может занять место снова. Разные приложения на одном устройстве могут занимать отдельные места."));
  let busy = false;
  let generation = 0;

  function showError(message: string) { error.textContent = message; error.classList.remove("hidden"); }
  function seen(value: number): string {
    const date = new Date(value);
    return value > 0 && !Number.isNaN(date.getTime()) ? date.toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "нет данных";
  }

  function render(state: DeviceState) {
    onLimit?.(state.limit);
    summary.textContent = state.limit > 0 ? `Занято ${state.registered} из ${state.limit} · свободно ${state.remaining ?? 0}` : `Подключено устройств: ${state.registered} · без ограничения`;
    list.replaceChildren();
    if (!state.devices.length) list.append(el("li", "rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400", "Устройства появятся после добавления или обновления подписки в приложении."));
    for (const device of state.devices) {
      const row = el("li", "flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700 dark:bg-slate-950/40");
      const info = el("div", "min-w-0 space-y-1");
      info.append(el("p", "break-words text-sm font-medium text-slate-900 dark:text-slate-100", deviceTitle(device)));
      if (device.app) info.append(el("p", "break-words text-xs text-slate-500 dark:text-slate-400", device.app));
      info.append(el("p", "text-xs text-slate-500 dark:text-slate-400", `Последнее обновление: ${seen(device.last_seen)}`));
      const release = el("button", "shrink-0 self-start rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:border-violet-400 hover:text-violet-700 disabled:opacity-50 dark:border-slate-600 dark:text-slate-200 dark:hover:text-violet-300", "Освободить место");
      release.type = "button";
      release.setAttribute("aria-label", `Освободить место: ${deviceTitle(device)}`);
      release.addEventListener("click", async () => {
        if (busy || !window.confirm(`Освободить место для «${deviceTitle(device)}»? Удалите подписку на старом устройстве, чтобы оно не заняло место снова.`)) return;
        busy = true; release.disabled = true; refresh.disabled = true;
        release.textContent = "Освобождаем…"; error.classList.add("hidden");
        try {
          const response = await fetcher(`${path}/${device.id}`, { method: "DELETE", headers: { Accept: "application/json" } });
          if (!response.ok) {
            const payload = await response.json().catch(() => ({}));
            throw new Error(payload.message || "Не удалось освободить место.");
          }
          await load();
        } catch (e) {
          showError(e instanceof Error ? e.message : "Не удалось освободить место.");
          release.disabled = false; release.textContent = "Освободить место";
        } finally {
          busy = false; refresh.disabled = false;
          release.disabled = false; release.textContent = "Освободить место";
        }
      });
      row.append(info, release); list.append(row);
    }
  }

  async function load() {
    const version = ++generation;
    refresh.disabled = true; error.classList.add("hidden");
    try {
      const response = await fetcher(path, { headers: { Accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Не удалось загрузить устройства.");
      if (version === generation) render(payload.data);
    } catch (e) {
      if (version === generation) showError(e instanceof Error ? e.message : "Не удалось загрузить устройства.");
    } finally { if (version === generation) refresh.disabled = false; }
  }
  refresh.addEventListener("click", () => { if (!busy) void load(); });
  return { load };
}
