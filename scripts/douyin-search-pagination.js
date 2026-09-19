#!/usr/bin/env node

function firstDefined(values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function extractPagination(body) {
  const config = body?.data?.business_config
    || body?.data?.data?.business_config
    || body?.business_config
    || {};
  const nextPage = config.next_page || config.nextPage || {};
  const cursor = firstDefined([
    nextPage.cursor,
    config.next_cursor,
    config.nextCursor,
    body?.data?.cursor,
    body?.data?.data?.cursor,
    body?.data?.extra?.cursor,
    body?.cursor
  ]) ?? 0;
  const searchId = firstDefined([
    nextPage.search_id,
    nextPage.searchId,
    config.search_id,
    config.searchId,
    body?.data?.log?.search_id,
    body?.data?.log?.searchId,
    body?.search_id,
    body?.searchId
  ]) || '';
  const backtrace = firstDefined([
    nextPage.backtrace,
    config.backtrace,
    body?.data?.backtrace,
    body?.backtrace
  ]) || '';
  const rawHasMore = firstDefined([
    config.has_more,
    config.hasMore,
    nextPage.has_more,
    nextPage.hasMore,
    body?.data?.has_more,
    body?.data?.hasMore,
    body?.has_more,
    body?.hasMore
  ]);
  const hasMore = rawHasMore === undefined
    ? Boolean(cursor)
    : rawHasMore === true || rawHasMore === 1 || rawHasMore === '1';
  return {
    cursor,
    searchId: String(searchId),
    backtrace: String(backtrace),
    hasMore
  };
}

function searchRequestBody(keyword, pagination = {}) {
  return {
    keyword,
    cursor: pagination.cursor ?? 0,
    search_id: pagination.searchId || '',
    backtrace: pagination.backtrace || '',
    sort_type: '0',
    publish_time: '0',
    filter_duration: '0',
    content_type: '1'
  };
}

function shouldRequestNextPage({ pageIndex, pages, requestCursor, pagination }) {
  return pageIndex + 1 < pages
    && pagination.hasMore
    && pagination.cursor !== 0
    && String(pagination.cursor) !== String(requestCursor);
}

module.exports = {
  extractPagination,
  searchRequestBody,
  shouldRequestNextPage
};
