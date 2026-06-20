export const businessTimezone = "Europe/Helsinki";

export function formatBusinessDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: businessTimezone,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(value));
}

export function formatBusinessFullDateTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: businessTimezone,
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}
