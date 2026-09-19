#!/usr/bin/env node

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractPagination,
  searchRequestBody,
  shouldRequestNextPage
} = require('./douyin-search-pagination');

test('extracts TiKHub V2 pagination from business_config', () => {
  const result = extractPagination({
    data: {
      business_config: {
        has_more: 1,
        backtrace: 'opaque-token',
        next_page: {
          cursor: 8,
          search_id: 'search-123'
        }
      }
    }
  });
  assert.deepEqual(result, {
    cursor: 8,
    searchId: 'search-123',
    backtrace: 'opaque-token',
    hasMore: true
  });
});

test('builds follow-up requests with all pagination fields', () => {
  assert.deepEqual(searchRequestBody('羊毛毡 宠物 制作', {
    cursor: 8,
    searchId: 'search-123',
    backtrace: 'opaque-token'
  }), {
    keyword: '羊毛毡 宠物 制作',
    cursor: 8,
    search_id: 'search-123',
    backtrace: 'opaque-token',
    sort_type: '0',
    publish_time: '0',
    filter_duration: '0',
    content_type: '1'
  });
});

test('uses conservative fallbacks for older response shapes', () => {
  assert.deepEqual(extractPagination({ data: { cursor: 16 } }), {
    cursor: 16,
    searchId: '',
    backtrace: '',
    hasMore: true
  });
});

test('continues through every requested page regardless of candidate metadata', () => {
  assert.equal(shouldRequestNextPage({
    pageIndex: 0,
    pages: 3,
    requestCursor: 0,
    pagination: { cursor: 8, hasMore: true }
  }), true);
  assert.equal(shouldRequestNextPage({
    pageIndex: 2,
    pages: 3,
    requestCursor: 16,
    pagination: { cursor: 24, hasMore: true }
  }), false);
});
