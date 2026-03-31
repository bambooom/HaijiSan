import { SLASH_COMMANDS } from '../constants/commands';
import { refCaloriesRepository } from '../repositories';
import type { FoodReference } from '../types/repositories';

const MAX_REFERENCE_RESULTS = 10;

export function handleReferenceCommand(text: string): string | null {
  if (!text.startsWith(SLASH_COMMANDS.REFERENCE)) {
    return null;
  }

  const keyword = text.slice(SLASH_COMMANDS.REFERENCE.length).trim();

  if (!keyword) {
    return buildReferenceListMessage(refCaloriesRepository.listAll());
  }

  return buildReferenceSearchMessage(
    keyword,
    refCaloriesRepository.searchByKeyword(keyword),
  );
}

function formatReferenceAmount(entry: FoodReference): string {
  if (entry.servingSize === null || !entry.unit) {
    return `${entry.calories} kcal`;
  }

  return `${entry.calories} kcal/${entry.servingSize}${entry.unit}`;
}

function formatReferenceEntry(entry: FoodReference): string {
  const brandSuffix = entry.brand ? `（${entry.brand}）` : '';
  return `• ${entry.name}${brandSuffix}: ${formatReferenceAmount(entry)}`;
}

function buildReferenceListMessage(entries: FoodReference[]): string {
  if (entries.length === 0) {
    return '热量参考表还是空的，暂时没有可展示的条目。';
  }

  const shownEntries = entries.slice(0, MAX_REFERENCE_RESULTS);
  const lines = shownEntries.map(formatReferenceEntry);
  const moreSuffix =
    entries.length > MAX_REFERENCE_RESULTS
      ? `\n\n当前仅显示前 ${MAX_REFERENCE_RESULTS} 项，请使用 /ref 关键词 继续筛选。`
      : '';

  return `📖 热量参考表：\n${lines.join('\n')}${moreSuffix}`;
}

function buildReferenceSearchMessage(
  keyword: string,
  entries: FoodReference[],
): string {
  if (entries.length === 0) {
    return `没有找到和“${keyword}”相关的热量参考。`;
  }

  const shownEntries = entries.slice(0, MAX_REFERENCE_RESULTS);
  const lines = shownEntries.map(formatReferenceEntry);
  const moreSuffix =
    entries.length > MAX_REFERENCE_RESULTS
      ? `\n\n共找到 ${entries.length} 项，当前仅显示前 ${MAX_REFERENCE_RESULTS} 项。`
      : '';

  return `📖 “${keyword}” 的热量参考：\n${lines.join('\n')}${moreSuffix}`;
}
