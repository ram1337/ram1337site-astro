interface ConfigAccess {
  server_type?: string | null;
  status?: string | null;
  revoked?: boolean;
  config_status?: string | null;
  config_available?: boolean;
}

export function configAccessActions(access: ConfigAccess, serverType = access.server_type) {
  const supported = ["wireguard", "amneziawg"].includes(serverType?.toLowerCase() ?? "");
  const revoked = access.revoked === true || access.status === "revoked" || access.config_status === "revoked";
  return {
    supported,
    canDownload: supported && !revoked && access.status === "active" && access.config_available === true,
    provisionAction: revoked ? "create" : "reissue",
    downloadHelp: revoked ? "Доступ отозван. Создайте новую конфигурацию."
      : access.status !== "active" ? "Доступ не активен. Пересоздайте конфигурацию."
      : "Нет сохранённых ключей клиента. Пересоздайте конфигурацию, чтобы скачать файл.",
  };
}
