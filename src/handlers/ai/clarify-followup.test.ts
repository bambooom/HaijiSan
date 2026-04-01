import { describe, expect, it } from 'vitest';

import {
  buildClarificationSourceText,
  looksLikeClarificationFollowup,
} from './clarify-followup';

describe('clarify follow-up heuristics', () => {
  it('treats short quantity replies as clarification follow-ups', () => {
    expect(looksLikeClarificationFollowup('300g')).toBe(true);
    expect(looksLikeClarificationFollowup('23:30 07:30 好')).toBe(true);
    expect(looksLikeClarificationFollowup('第 2 天')).toBe(true);
  });

  it('treats explicit corrections as clarification follow-ups', () => {
    expect(looksLikeClarificationFollowup('不是300g，是250g')).toBe(true);
    expect(looksLikeClarificationFollowup('改成昨晚 23:30 睡')).toBe(true);
  });

  it('does not treat slash commands or new topics as clarification follow-ups', () => {
    expect(looksLikeClarificationFollowup('/cancel')).toBe(false);
    expect(looksLikeClarificationFollowup('今天想聊聊跑步配速')).toBe(false);
  });

  it('appends follow-up text to the original clarification source', () => {
    expect(buildClarificationSourceText('早餐 西兰花', '300g')).toBe(
      '早餐 西兰花\n补充说明：300g',
    );
  });
});
