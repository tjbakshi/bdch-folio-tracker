import { supabase } from '@/integrations/supabase/client';
import type {
  InvestmentSearchParams,
  InvestmentSearchResponse,
  MarkHistoryResponse,
  NonAccrualParams,
  NonAccrualResponse,
  ExportParams,
  CacheInvalidateResponse,
  ApiError
} from './types';
import { BDCApiError } from './types';

/**
 * Configuration for the BDC API client
 */
export interface BDCApiConfig {
  baseUrl?: string;
  apiKey?: string;
}

/**
 * BDC Investment Analytics API Client
 * Provides type-safe access to all BDC API endpoints
 */
export class BDCApiClient {
  private config: BDCApiConfig;

  constructor(config: BDCApiConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'https://pkpvyqvcsmyxcudamerw.supabase.co/functions/v1/bdc-api',
      ...config
    };
  }

  /**
   * Handle API response and error processing
   */
  private async handleResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      
      try {
        const errorData: ApiError = await response.json();
        errorMessage = errorData.error || errorMessage;
      } catch {
        // If we can't parse error JSON, use the status text
      }
      
      throw new BDCApiError(errorMessage, response.status, response);
    }

    // Handle CSV responses (for export endpoint)
    if (response.headers.get('content-type')?.includes('text/csv')) {
      return response.text() as unknown as T;
    }

    return response.json();
  }

  /**
   * Build URL with query parameters
   */
  private buildUrl(endpoint: string, params?: Record<string, any>): string {
    const url = new URL(`${this.config.baseUrl}${endpoint}`);
    
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, value.toString());
        }
      });
    }
    
    return url.toString();
  }

  /**
   * Make API request using Supabase edge function invoke
   */
  private async makeRequest<T>(
    endpoint: string,
    options: {
      method?: 'GET' | 'POST';
      params?: Record<string, any>;
      body?: any;
    } = {}
  ): Promise<T> {
    const { method = 'GET', params, body } = options;
    
    try {
      let functionName: string;
      let functionOptions: any = {};

      // For GET requests with query parameters, append them to the function path
      if (method === 'GET' && params) {
        const searchParams = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            searchParams.append(key, value.toString());
          }
        });
        functionName = `bdc-api${endpoint}?${searchParams.toString()}`;
      } else {
        functionName = `bdc-api${endpoint}`;
      }

      // Set up function options
      if (method === 'POST' && body) {
        functionOptions.body = body;
      }

      const { data, error } = await supabase.functions.invoke(functionName, functionOptions);

      if (error) {
        throw new BDCApiError(error.message || 'API request failed', 500, error);
      }

      return data as T;
    } catch (error) {
      if (error instanceof BDCApiError) {
        throw error;
      }
      throw new BDCApiError(
        error instanceof Error ? error.message : 'Unknown error occurred',
        500,
        error
      );
    }
  }

  /**
   * Search and filter investments with pagination
   * GET /investments
   */
  async getInvestments(params?: InvestmentSearchParams): Promise<InvestmentSearchResponse> {
    return this.makeRequest<InvestmentSearchResponse>('/investments', {
      method: 'GET',
      params
    });
  }

  /**
   * Get mark history for a specific investment
   * GET /marks/{raw_id}
   */
  async getMarkHistory(rawId: string): Promise<MarkHistoryResponse> {
    if (!rawId) {
      throw new BDCApiError('rawId parameter is required', 400);
    }
    
    return this.makeRequest<MarkHistoryResponse>(`/marks/${rawId}`, {
      method: 'GET'
    });
  }

  /**
   * List investments in non-accrual status
   * GET /nonaccruals
   */
  async listNonAccruals(params?: NonAccrualParams): Promise<NonAccrualResponse> {
    return this.makeRequest<NonAccrualResponse>('/nonaccruals', {
      method: 'GET',
      params
    });
  }

  /**
   * Export filtered investment data as CSV
   * POST /export
   */
  async exportData(filters?: ExportParams): Promise<string> {
    return this.makeRequest<string>('/export', {
      method: 'POST',
      body: filters || {}
    });
  }

  /**
   * Invalidate API cache
   * POST /cache/invalidate
   */
  async invalidateCache(): Promise<CacheInvalidateResponse> {
    return this.makeRequest<CacheInvalidateResponse>('/cache/invalidate', {
      method: 'POST'
    });
  }
}

// Create default client instance
export const bdcApi = new BDCApiClient();