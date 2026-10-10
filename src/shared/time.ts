export const FIXTURE_TIME = "2026-10-12T08:00:00.000Z";
export interface Clock {
  now(): string;
}
export const frozenClock = (instant = FIXTURE_TIME): Clock => ({
  now: () => new Date(instant).toISOString(),
});
export function addHours(instant: string, hours: number) {
  return new Date(Date.parse(instant) + hours * 3600000).toISOString();
}
export function addBusinessDays(instant: string, count: number) {
  const date = new Date(Date.parse(instant) + 4 * 3600000);
  while (count > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    if (![0, 6].includes(date.getUTCDay())) count--;
  }
  return new Date(date.getTime() - 4 * 3600000).toISOString();
}
export function deadlineEnd(date: string) {
  return new Date(`${date}T23:59:59.999+04:00`).toISOString();
}
export function bakuDate(instant: string) {
  return new Date(Date.parse(instant) + 4 * 3600000).toISOString().slice(0, 10);
}
export function calendarDays(from: string, to: string) {
  return (
    (Date.parse(`${bakuDate(to)}T00:00Z`) -
      Date.parse(`${bakuDate(from)}T00:00Z`)) /
    86400000
  );
}
