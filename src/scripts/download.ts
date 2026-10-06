export function downloadFilename(disposition: string | null, fallback: string, extension = ".conf"): string {
  const encoded = disposition?.match(/(?:^|;)\s*filename\*\s*=\s*(?:UTF-8'[^']*')?"?([^";]+)/i)?.[1];
  const plain = disposition?.match(/(?:^|;)\s*filename\s*=\s*(?:"((?:\\.|[^"])*)"|([^;]*))/i);
  let name = plain?.[1]?.replace(/\\([\\"])/g, "$1") || plain?.[2] || fallback;
  if (encoded) {
    try { name = decodeURIComponent(encoded.trim()); } catch { /* Use the plain filename. */ }
  }
  name = name.replace(/[\\/<>:"|?*\u0000-\u001f\u007f]/g, "-").replace(/^\.+/, "").trim() || fallback;
  if (!name.toLowerCase().endsWith(extension)) {
    name = name.replace(/\.(?:txt|text|html?)$/i, "") + extension;
  }
  return name;
}

export async function saveDownload(response: Response, fallback: string, extension = ".conf"): Promise<void> {
  const source = await response.blob();
  // Binary MIME prevents browsers that ignore download attributes from rendering text.
  const blob = new Blob([source], { type: "application/octet-stream" });
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = downloadFilename(response.headers.get("Content-Disposition"), fallback, extension);
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Give Safari and mobile browsers time to start reading the object URL.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
