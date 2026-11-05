export function subscriptionAppLinks(value: string): { happ: string; incy: string } {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Некорректная ссылка подписки.");
  return { happ: `happ://add/${url.href}`, incy: `incy://import/${url.href}` };
}
