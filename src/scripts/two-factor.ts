import QRCode from "qrcode";
import type { AuthUser } from "./auth";

type Fetcher = (path: string, init?: RequestInit) => Promise<Response>;

export function createTwoFactorPanel(fetcher: Fetcher, refreshUser: () => Promise<AuthUser>) {
  const form = document.getElementById("two-factor-form") as HTMLFormElement;
  const password = document.getElementById("two-factor-password") as HTMLInputElement;
  const code = document.getElementById("two-factor-confirm-code") as HTMLInputElement;
  const secret = document.getElementById("two-factor-secret") as HTMLInputElement;
  const qr = document.getElementById("two-factor-qr") as HTMLImageElement;
  const submit = document.getElementById("two-factor-submit") as HTMLButtonElement;
  const message = document.getElementById("two-factor-message")!;
  const recovery = document.getElementById("two-factor-recovery")!;
  const recoveryText = document.getElementById("two-factor-recovery-codes")!;
  let enabled = false;
  let pending = false;
  let busy = false;
  let recoveryCodes: string[] = [];

  function render() {
    document.getElementById("two-factor-status")!.textContent = enabled ? "Включена" : "Не включена";
    document.getElementById("two-factor-setup")!.classList.toggle("hidden", !pending);
    document.getElementById("two-factor-password-wrap")!.classList.toggle("hidden", pending);
    password.required = !pending;
    document.getElementById("two-factor-code-wrap")!.classList.toggle("hidden", !enabled && !pending);
    code.required = enabled || pending;
    document.getElementById("two-factor-code-help")!.textContent = enabled
      ? "Введите код из приложения или неиспользованный резервный код. Если код только что использован для входа, дождитесь следующего."
      : "Введите 6 цифр из подключённого приложения.";
    document.getElementById("two-factor-cancel")!.classList.toggle("hidden", !pending);
    submit.textContent = pending ? "Подтвердить подключение" : enabled ? "Отключить" : "Подключить";
    form.classList.toggle("hidden", recoveryCodes.length > 0);
  }

  function showMessage(text: string) {
    message.textContent = text;
    message.classList.toggle("hidden", !text);
  }

  function clearSetup() {
    pending = false;
    password.value = "";
    code.value = "";
    secret.value = "";
    qr.removeAttribute("src");
  }

  document.getElementById("two-factor-cancel")!.addEventListener("click", () => {
    if (busy) return;
    clearSetup();
    showMessage("");
    render();
  });

  document.getElementById("two-factor-download")!.addEventListener("click", () => {
    const blob = new Blob(["Резервные коды ram1337. Каждый код действует один раз.\n\n" + recoveryCodes.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ram1337-recovery-codes.txt";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  document.getElementById("two-factor-saved")!.addEventListener("click", () => {
    recoveryCodes = [];
    recoveryText.textContent = "";
    recovery.classList.add("hidden");
    render();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (busy) return;
    busy = true;
    submit.disabled = true;
    showMessage("");
    const action = pending ? "confirm" : enabled ? "disable" : "setup";
    try {
      const response = await fetcher(action === "disable" ? "/api/auth/two-factor" : `/api/auth/two-factor/${action}`, {
        method: action === "disable" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "confirm"
          ? { code: code.value.trim() }
          : { current_password: password.value, ...(enabled ? { code: code.value.trim() } : {}) }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 409 && pending) { clearSetup(); render(); }
        const detail = Object.values(data.errors ?? {}).flat()[0];
        throw new Error(typeof detail === "string" ? detail : data.message || "Не удалось изменить настройки.");
      }
      if (action === "setup") {
        secret.value = data.secret;
        // Generate locally: the secret never goes to a third-party QR service.
        qr.src = await QRCode.toDataURL(data.otpauth_uri, { width: 240, margin: 2 });
        pending = true;
        password.value = "";
        render();
        code.focus();
      } else {
        enabled = action === "confirm";
        if (action === "confirm") {
          recoveryCodes = data.recovery_codes;
          recoveryText.textContent = recoveryCodes.join("\n");
          recovery.classList.remove("hidden");
        }
        clearSetup();
        render();
        showMessage(enabled ? "Двухфакторная аутентификация включена. Другие сеансы входа завершены." : "Двухфакторная аутентификация отключена.");
        await refreshUser();
      }
    } catch (error) {
      showMessage(error instanceof Error ? error.message : "Не удалось изменить настройки.");
    } finally {
      busy = false;
      submit.disabled = false;
    }
  });

  return (user: AuthUser) => {
    enabled = user.two_factor_enabled === true;
    render();
  };
}
