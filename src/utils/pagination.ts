import type { PageResult } from '@/types/domain'

export interface PageQuery {
  page?: number
  size?: number
  keyword?: string
}

/** Older servers return an unpaged array. Never invent another page for that response. */
export function normalizePageResult<T>(
  data: PageResult<T> | T[],
  requestedPage = 1,
  requestedSize = 20,
): PageResult<T> {
  if (Array.isArray(data))
    return { items: data, total: data.length, page: 1, size: Math.max(data.length, 1) }
  return {
    items: data.items,
    total: data.total,
    page: data.page || requestedPage,
    size: data.size || requestedSize,
  }
}
