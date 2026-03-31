import { handleFoodCommand } from './food';
import { handleReferenceCommand } from './reference';
import { handleSleepCommand } from './sleep';
import { handleStatusCommand } from './status';
import { handleStockCommand } from './stock';
import { handleWorkoutCommand } from './workout';

type CommandRoute = {
  note: string;
  matches: (text: string) => boolean;
  execute: (text: string, timestamp: Date) => string | null;
};

export type RoutedCommandResult = {
  reply: string;
  note: string;
};

function matchesAnyPrefix(text: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => text.startsWith(prefix));
}

const COMMAND_ROUTES: CommandRoute[] = [
  // Keep slash command dispatch in one place so direct and AI-triggered flows stay aligned.
  {
    note: 'status-command',
    matches: (text) =>
      matchesAnyPrefix(text, ['/weight', '/poo', '/period', '/symptom']),
    execute: handleStatusCommand,
  },
  {
    note: 'sleep-command',
    matches: (text) => text.startsWith('/sleep'),
    execute: handleSleepCommand,
  },
  {
    note: 'workout-command',
    matches: (text) => text.startsWith('/workout'),
    execute: handleWorkoutCommand,
  },
  {
    note: 'stock-command',
    matches: (text) =>
      matchesAnyPrefix(text, ['/stock', '/setstock', '/check']),
    execute: handleStockCommand,
  },
  {
    note: 'food-command',
    matches: (text) => text.startsWith('/food'),
    execute: handleFoodCommand,
  },
  {
    note: 'reference-command',
    matches: (text) => text.startsWith('/ref'),
    execute: (text) => handleReferenceCommand(text),
  },
];

export function executeCommandRoute(
  text: string,
  timestamp: Date,
): RoutedCommandResult | null {
  const normalizedText = text.trimStart();

  for (const route of COMMAND_ROUTES) {
    if (!route.matches(normalizedText)) {
      continue;
    }

    const reply = route.execute(normalizedText, timestamp);

    return reply === null ? null : { reply, note: route.note };
  }

  return null;
}
