import { describe, expect, it } from 'vitest';
import {
  asNullableNumber,
  asNullableString,
  asTrimmedString,
  roundToOneDecimal,
  sumNullableNumbers,
} from './value';

describe('value utils', () => {
  it('trims string values and normalizes non-strings to empty string', () => {
    expect(asTrimmedString('  yogurt  ')).toBe('yogurt');
    expect(asTrimmedString(null)).toBe('');
    expect(asTrimmedString(42)).toBe('');
  });

  it('returns nullable string only when trimmed text is non-empty', () => {
    expect(asNullableString('  milk ')).toBe('milk');
    expect(asNullableString('   ')).toBeNull();
  });

  it('normalizes finite numbers from numbers and numeric strings', () => {
    expect(asNullableNumber(12.5)).toBe(12.5);
    expect(asNullableNumber(' 42 ')).toBe(42);
    expect(asNullableNumber('x')).toBeNull();
  });

  it('rounds numbers to one decimal place', () => {
    expect(roundToOneDecimal(12)).toBe(12);
    expect(roundToOneDecimal(12.34)).toBe(12.3);
    expect(roundToOneDecimal(12.35)).toBe(12.3);
    expect(roundToOneDecimal(12.36)).toBe(12.4);
  });

  it('sums nullable numbers and rounds to one decimal place', () => {
    expect(sumNullableNumbers([1, 2.34, null, undefined])).toBe(3.3);
    expect(sumNullableNumbers([1.05, 2.05])).toBe(3.1);
    expect(sumNullableNumbers([null, undefined])).toBeNull();
  });
});
