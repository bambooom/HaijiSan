export function asTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function roundToOneDecimal(value: number): number {
  return Number(value.toFixed(1));
}

export function asNullableString(value: unknown): string | null {
  const normalized = asTrimmedString(value);

  return normalized ? normalized : null;
}

export function asNullableNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const normalized = Number(value.trim());

    return Number.isFinite(normalized) ? normalized : null;
  }

  return null;
}

export function toNullableNumber(value: unknown): number | null | undefined {
  return typeof value === 'number' ? value : value === null ? null : undefined;
}

export function sumNullableNumbers(
  values: Array<number | null | undefined>,
): number | null {
  const definedValues = values.filter(
    (value): value is number => typeof value === 'number',
  );

  if (definedValues.length === 0) {
    return null;
  }

  return roundToOneDecimal(
    definedValues.reduce((sum, value) => sum + value, 0),
  );
}

export function normalizeText(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/[\s\u3000]+/g, ' ')
    : '';
}

export function uniqueValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

export function formatDateLabel(timestamp: Date): string {
  return [
    timestamp.getFullYear(),
    String(timestamp.getMonth() + 1).padStart(2, '0'),
    String(timestamp.getDate()).padStart(2, '0'),
  ].join('-');
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function normalizeTelegramHtmlReply(value: string): string {
  return value
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/^#{1,3}\s+(.+)$/gm, (_match, text: string) => {
      return `<b>${escapeHtml(text.trim())}</b>`;
    })
    .replace(/^(?:-|\*)\s+/gm, '• ')
    .replace(/\*\*([^*\n]+)\*\*/g, (_match, text: string) => {
      return `<b>${escapeHtml(text)}</b>`;
    })
    .replace(/__([^_\n]+)__/g, (_match, text: string) => {
      return `<b>${escapeHtml(text)}</b>`;
    })
    .replace(/`([^`\n]+)`/g, (_match, text: string) => {
      return `<code>${escapeHtml(text)}</code>`;
    });
}
