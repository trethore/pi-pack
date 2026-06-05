export function formatTemplate(template: string, values: Record<string, string | number>): string {
  let message = template;
  for (const [key, value] of Object.entries(values)) {
    message = message.replaceAll(`{{${key}}}`, String(value));
  }
  return message;
}
