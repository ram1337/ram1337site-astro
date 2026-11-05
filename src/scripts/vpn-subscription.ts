import QRCode from "qrcode";
import { subscriptionAppLinks } from "./subscription-app-links";
import { createDeviceManager } from "./subscription-devices";

type Subscription = {
  available: boolean;
  issued: boolean;
  can_issue: boolean;
  paid_until: string | null;
  subscription_url: string | null;
  device_limit?: number;
};

export function createVpnSubscription(fetcher: (path: string, options?: RequestInit) => Promise<Response>) {
  const section = document.getElementById("vpn-subscription");
  const status = document.getElementById("subscription-status");
  const result = document.getElementById("subscription-result");
  const error = document.getElementById("subscription-error");
  const issue = document.getElementById("subscription-issue") as HTMLButtonElement | null;
  const copy = document.getElementById("subscription-copy") as HTMLButtonElement | null;
  const input = document.getElementById("subscription-url") as HTMLInputElement | null;
  const qr = document.getElementById("subscription-qr") as HTMLImageElement | null;
  const happ = document.getElementById("subscription-happ") as HTMLAnchorElement | null;
  const incy = document.getElementById("subscription-incy") as HTMLAnchorElement | null;
  const deviceLimit = document.getElementById("subscription-device-limit");
  const deviceRoot = document.getElementById("subscription-devices");
  const devices = deviceRoot ? createDeviceManager(deviceRoot, fetcher, "/api/vpn/me/subscription/devices") : null;
  let busy = false;
  let generation = 0;

  function showError(message: string) {
    if (error) {
      error.textContent = message;
      error.classList.remove("hidden");
    }
  }

  async function render(data: Subscription) {
    const version = ++generation;
    section?.classList.toggle("hidden", !data.available);
    if (issue) {
      issue.disabled = !data.can_issue || busy;
      issue.classList.toggle("hidden", Boolean(data.subscription_url));
      issue.textContent = data.issued ? "Повторить выпуск подписки" : "Выпустить подписку";
    }
    if (status) {
      const date = data.paid_until?.split("-").reverse().join(".");
      status.textContent = data.can_issue
        ? `Действует по ${date} включительно.`
        : "Для выпуска и использования подписки нужна активная оплата.";
    }
    result?.classList.toggle("hidden", !data.subscription_url);
    if (deviceLimit) deviceLimit.textContent = data.device_limit === 0 ? "Без ограничения устройств" : `До ${data.device_limit ?? 3} устройств`;
    const links = data.subscription_url ? subscriptionAppLinks(data.subscription_url) : null;
    for (const [anchor, url] of [[happ, links?.happ], [incy, links?.incy]] as const) {
      if (!anchor) continue;
      if (url) {
        anchor.href = url; anchor.removeAttribute("aria-disabled"); anchor.removeAttribute("tabindex");
      } else {
        anchor.removeAttribute("href"); anchor.setAttribute("aria-disabled", "true"); anchor.tabIndex = -1;
      }
    }
    deviceRoot?.classList.toggle("hidden", !data.issued || !data.available);
    if (data.issued && data.available) void devices?.load();
    if (input) input.value = data.subscription_url || "";
    qr?.removeAttribute("src");
    qr?.classList.add("hidden");
    if (data.subscription_url && qr) {
      try {
        // Generate locally: never send subscription secrets to a QR service.
        const image = await QRCode.toDataURL(data.subscription_url, { width: 180, margin: 2 });
        if (version === generation) {
          qr.src = image;
          qr.classList.remove("hidden");
        }
      } catch {
        // The copyable subscription URL stays available if QR rendering fails.
      }
    }
  }

  async function load() {
    try {
      const response = await fetcher("/api/vpn/me/subscription", { headers: { Accept: "application/json" }, cache: "no-store" });
      if (!response.ok) throw new Error("Не удалось загрузить подписку. Обновите страницу.");
      const payload = await response.json();
      await render(payload.data);
    } catch (e) {
      section?.classList.remove("hidden");
      if (issue) issue.disabled = true;
      showError(e instanceof Error ? e.message : "Не удалось загрузить подписку.");
    }
  }

  issue?.addEventListener("click", async () => {
    if (busy) return;
    busy = true;
    issue.disabled = true;
    issue.textContent = "Выпускаем подписку…";
    error?.classList.add("hidden");
    try {
      const response = await fetcher("/api/vpn/me/subscription", { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" }, body: "{}" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || "Не удалось выпустить подписку.");
      busy = false;
      await render(payload.data);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Не удалось выпустить подписку.");
      busy = false;
      await load();
    } finally {
      busy = false;
    }
  });

  copy?.addEventListener("click", async () => {
    if (!input?.value) return;
    try {
      await navigator.clipboard.writeText(input.value);
      copy.textContent = "Скопировано";
      setTimeout(() => { copy.textContent = "Копировать"; }, 1800);
    } catch {
      input.focus();
      input.select();
      showError("Выделили ссылку — скопируйте её вручную.");
    }
  });

  return { load };
}
