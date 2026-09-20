#!/usr/bin/env node

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_KEYWORDS,
  DEFAULT_REFRESH_EVERY,
  emptyState,
  validateState,
  planSearch,
  completeSearch
} = require('./douyin-search-state');

test('keeps deep pagination for many scheduled uses before refreshing the head page', () => {
  assert.equal(DEFAULT_REFRESH_EVERY, 30);
  let state = emptyState();
  for (let index = 0; index < DEFAULT_REFRESH_EVERY - 1; index += 1) {
    const plan = planSearch(state, { explicitKeyword: '羊毛毡 猫 制作' });
    assert.equal(plan.startedFromHead, index === 0);
    state = completeSearch(state, plan, { nextCursor: (index + 1) * 8 });
  }
  const refresh = planSearch(state, { explicitKeyword: '羊毛毡 猫 制作' });
  assert.equal(refresh.startedFromHead, true);
  assert.equal(refresh.startCursor, 0);
});

test('rotates keywords and resumes each saved cursor', () => {
  let state = emptyState();
  const first = planSearch(state);
  assert.equal(first.keyword, DEFAULT_KEYWORDS[0]);
  assert.equal(first.startCursor, 0);
  state = completeSearch(state, first, { nextCursor: 12, finishedAt: '2026-09-14T00:00:00Z' });

  const second = planSearch(state);
  assert.equal(second.keyword, DEFAULT_KEYWORDS[1]);
  state = completeSearch(state, second, { nextCursor: 24, finishedAt: '2026-09-14T01:00:00Z' });

  for (let index = 2; index < DEFAULT_KEYWORDS.length; index += 1) {
    const plan = planSearch(state);
    state = completeSearch(state, plan, { nextCursor: (index + 1) * 12, finishedAt: `2026-09-14T0${index}:00:00Z` });
  }

  const resumed = planSearch(state);
  assert.equal(resumed.keyword, DEFAULT_KEYWORDS[0]);
  assert.equal(resumed.startCursor, 12);
  assert.equal(resumed.startedFromHead, false);
});

test('persists and resumes the complete pagination context', () => {
  let state = emptyState();
  let plan = planSearch(state, { explicitKeyword: '羊毛毡 猫 制作' });
  state = completeSearch(state, plan, {
    nextCursor: 8,
    searchId: 'search-123',
    backtrace: 'opaque-token'
  });

  plan = planSearch(state, { explicitKeyword: '羊毛毡 猫 制作' });
  assert.equal(plan.startCursor, 8);
  assert.equal(plan.searchId, 'search-123');
  assert.equal(plan.backtrace, 'opaque-token');
});

test('periodically refreshes the first page for each keyword', () => {
  let state = emptyState();
  let plan = planSearch(state, { explicitKeyword: '羊毛毡 猫 制作', refreshEvery: 3 });
  state = completeSearch(state, plan, { nextCursor: 10 });

  plan = planSearch(state, { explicitKeyword: '羊毛毡 猫 制作', refreshEvery: 3 });
  assert.equal(plan.startCursor, 10);
  state = completeSearch(state, plan, { nextCursor: 20 });

  plan = planSearch(state, { explicitKeyword: '羊毛毡 猫 制作', refreshEvery: 3 });
  assert.equal(plan.startCursor, 0);
  assert.equal(plan.startedFromHead, true);
  assert.equal(plan.searchId, '');
  assert.equal(plan.backtrace, '');
});

test('rejects malformed persisted state', () => {
  assert.throws(() => validateState([]), /must be a JSON object/);
});

test('normalizes numeric string cursors from persisted JSON', () => {
  const state = validateState({
    queries: {
      '羊毛毡 宠物 制作': { cursor: '48' }
    }
  });
  assert.equal(state.queries['羊毛毡 宠物 制作'].cursor, 48);
  assert.equal(state.queries['羊毛毡 宠物 制作'].searchId, '');
  assert.equal(state.queries['羊毛毡 宠物 制作'].backtrace, '');
});
