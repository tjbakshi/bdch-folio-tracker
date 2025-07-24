// Export all types
export * from './types';

// Export client class and default instance
export { BDCApiClient, bdcApi } from './client';

// Export convenience functions
export {
  getInvestments,
  getMarkHistory,
  listNonAccruals,
  exportData,
  invalidateCache
} from './functions';

// Re-export commonly used types for convenience
export type {
  Investment,
  InvestmentSearchParams,
  InvestmentSearchResponse,
  MarkHistoryResponse,
  NonAccrualParams,
  NonAccrualResponse,
  ExportParams,
  CacheInvalidateResponse
} from './types';