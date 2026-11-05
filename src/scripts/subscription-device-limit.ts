export function deviceLimitLabel(limit: number): string {
  if (limit === 0) return "Без ограничения устройств";
  const last = limit % 10;
  const teen = limit % 100 >= 11 && limit % 100 <= 14;
  const word = !teen && last === 1 ? "устройства" : "устройств";
  return `До ${limit} ${word}`;
}
