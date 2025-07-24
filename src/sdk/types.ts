// Types generated from OpenAPI 3.0 specification

export interface Investment {
  id: string;
  company_name: string;
  business_description: string;
  investment_tranche: string;
  principal_amount: number;
  fair_value: number;
  filings: Filing;
  investments_computed: ComputedData[];
}

export interface Filing {
  ticker: string;
  filing_date: string;
  filing_type: '10-K' | '10-Q';
}

export interface ComputedData {
  mark: number;
  is_non_accrual: boolean;
  quarter_year: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface MarkHistory {
  quarter_year: string;
  mark: number;
  created_at: string;
}

export interface InvestmentSearchParams {
  manager?: string;
  company?: string;
  tranche?: 'First Lien' | 'Second Lien' | 'Equity' | 'Subordinated';
  description?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  limit?: number;
}

export interface ExportParams {
  company?: string;
  manager?: string;
  tranche?: string;
  description?: string;
  date_from?: string;
  date_to?: string;
}

export interface NonAccrualParams {
  quarter?: number;
  year?: number;
  manager?: string;
}

export interface InvestmentSearchResponse {
  data: Investment[];
  pagination: Pagination;
}

export interface MarkHistoryResponse {
  raw_investment_id: string;
  history: MarkHistory[];
}

export interface NonAccrualResponse {
  data: ComputedData[];
  count: number;
}

export interface CacheInvalidateResponse {
  message: string;
  timestamp: string;
}

export interface ApiError {
  error: string;
}

export class BDCApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: any
  ) {
    super(message);
    this.name = 'BDCApiError';
  }
}