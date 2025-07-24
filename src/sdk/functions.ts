import { bdcApi } from './client';
import type {
  InvestmentSearchParams,
  InvestmentSearchResponse,
  MarkHistoryResponse,
  NonAccrualParams,
  NonAccrualResponse,
  ExportParams,
  CacheInvalidateResponse
} from './types';

/**
 * Search and filter investments with pagination
 * 
 * Note: This function uses POST method internally via Supabase Edge Functions,
 * even though it performs a data retrieval operation. Supabase function invocation
 * always uses POST requests regardless of the operation type.
 * 
 * @param params - Search and filter parameters
 * @returns Promise with investment data and pagination info
 * 
 * @example
 * ```typescript
 * const result = await getInvestments({ 
 *   manager: 'ARCC', 
 *   page: 1, 
 *   limit: 25 
 * });
 * console.log(`Found ${result.data.length} investments`);
 * ```
 */
export async function getInvestments(params?: InvestmentSearchParams): Promise<InvestmentSearchResponse> {
  return bdcApi.getInvestments(params);
}

/**
 * Get mark history for a specific investment over time
 * 
 * @param rawId - Unique identifier for the raw investment record
 * @returns Promise with time-series mark data
 * 
 * @example
 * ```typescript
 * const history = await getMarkHistory('123e4567-e89b-12d3-a456-426614174000');
 * console.log(`Mark changed from ${history.history[0].mark} to ${history.history[history.history.length - 1].mark}`);
 * ```
 */
export async function getMarkHistory(rawId: string): Promise<MarkHistoryResponse> {
  return bdcApi.getMarkHistory(rawId);
}

/**
 * List investments currently in non-accrual status
 * 
 * @param params - Filter parameters for non-accrual investments
 * @returns Promise with non-accrual investment data
 * 
 * @example
 * ```typescript
 * const nonAccruals = await listNonAccruals({ 
 *   quarter: 3, 
 *   year: 2024 
 * });
 * console.log(`Found ${nonAccruals.count} non-accrual investments`);
 * ```
 */
export async function listNonAccruals(params?: NonAccrualParams): Promise<NonAccrualResponse> {
  return bdcApi.listNonAccruals(params);
}

/**
 * Export filtered investment data as CSV
 * 
 * @param filters - Export filter parameters
 * @returns Promise with CSV data as string
 * 
 * @example
 * ```typescript
 * const csvData = await exportData({ 
 *   manager: 'ARCC', 
 *   date_from: '2024-01-01' 
 * });
 * // Create download link for CSV
 * const blob = new Blob([csvData], { type: 'text/csv' });
 * const url = URL.createObjectURL(blob);
 * ```
 */
export async function exportData(filters?: ExportParams): Promise<string> {
  return bdcApi.exportData(filters);
}

/**
 * Invalidate API cache to ensure fresh data
 * 
 * @returns Promise with cache invalidation confirmation
 * 
 * @example
 * ```typescript
 * const result = await invalidateCache();
 * console.log(result.message); // "Cache invalidated successfully"
 * ```
 */
export async function invalidateCache(): Promise<CacheInvalidateResponse> {
  return bdcApi.invalidateCache();
}