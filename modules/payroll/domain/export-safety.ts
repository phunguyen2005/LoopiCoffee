export function sanitizeSpreadsheetText(value: string) {
  if (!value) return "";
  const normalizedLeading = value.trimStart();
  return /^[=+\-@\t\r]/.test(normalizedLeading) ? `'${value}` : value;
}
