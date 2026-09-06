import type { PageRequest } from '@/lib/types/actions';

export function normalizePageRequest(
  input: Partial<PageRequest> | undefined,
  defaultPageSize: number
): PageRequest {
  const page = Number.isInteger(input?.page) && Number(input?.page) > 0 ? Number(input?.page) : 1;
  const requestedPageSize = Number.isInteger(input?.pageSize) ? Number(input?.pageSize) : defaultPageSize;
  const pageSize = Math.min(100, Math.max(1, requestedPageSize));
  const query = typeof input?.query === 'string'
    ? input.query.trim().replace(/[%,()_]+/g, ' ').replace(/\s+/g, ' ').trim()
    : undefined;

  return {
    page,
    pageSize,
    query: query || undefined,
    year: input?.year,
    status: input?.status,
  };
}

export function pageRange(page: number, pageSize: number): { from: number; to: number } {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}
