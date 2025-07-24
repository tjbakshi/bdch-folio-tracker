import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { Sentry } from '../shared/sentry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
/**
 * BDC API Edge Function - provides REST endpoints for dashboard and export functionality
 */
serve(async (req) => {
  return Sentry.withSentry(async () => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Start Sentry transaction for the entire request
  const transaction = Sentry.startTransaction({
    name: `BDC API ${req.method} ${new URL(req.url).pathname}`,
    op: 'http.server',
    tags: {
      'http.method': req.method,
      'function.name': 'bdc-api',
    }
  });

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/functions/v1/bdc-api', '');
    
    // Add request context to Sentry
    Sentry.setContext('request', {
      url: req.url,
      method: req.method,
      path,
      userAgent: req.headers.get('user-agent'),
    });
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let response: Response;

    // Route requests with individual Sentry spans
    if ((req.method === 'GET' || req.method === 'POST') && path === '/investments') {
      response = await Sentry.startSpan(
        { name: 'searchInvestments', op: 'db.query' },
        async () => await searchInvestments(supabase, url.searchParams)
      );
    } else if (req.method === 'GET' && path.startsWith('/marks/')) {
      const rawId = path.split('/')[2];
      Sentry.setTag('investment.rawId', rawId);
      response = await Sentry.startSpan(
        { name: 'getMarkHistory', op: 'db.query' },
        async () => await getMarkHistory(supabase, rawId)
      );
    } else if (req.method === 'GET' && path === '/nonaccruals') {
      response = await Sentry.startSpan(
        { name: 'listNonAccruals', op: 'db.query' },
        async () => await listNonAccruals(supabase, url.searchParams)
      );
    } else if (req.method === 'POST' && path === '/export') {
      const body = await req.json();
      Sentry.setContext('export', { filters: body });
      response = await Sentry.startSpan(
        { name: 'exportToExcel', op: 'db.query' },
        async () => await exportToExcel(supabase, body)
      );
    } else if (req.method === 'POST' && path === '/cache/invalidate') {
      response = await Sentry.startSpan(
        { name: 'invalidateCache', op: 'cache.clear' },
        async () => await invalidateCache()
      );
    } else {
      response = new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    transaction.setStatus('ok');
    transaction.setHttpStatus(response.status);
    return response;

  } catch (error) {
    console.error('Error in bdc-api:', error);
    
    // Capture error in Sentry with context
    Sentry.captureException(error, {
      contexts: {
        request: {
          url: req.url,
          method: req.method,
        }
      }
    });

    transaction.setStatus('internal_error');
    
    return new Response(JSON.stringify({ 
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } finally {
    transaction.finish();
  }
  });
});

/**
 * Search investments with filters and pagination
 * GET /investments?manager=&company=&tranche=&description=&date_from=&date_to=&page=&limit=
 */
async function searchInvestments(supabase: any, searchParams: URLSearchParams) {
  try {
    const manager = searchParams.get('manager');
    const company = searchParams.get('company');
    const tranche = searchParams.get('tranche'); 
    const description = searchParams.get('description');
    const dateFrom = searchParams.get('date_from');
    const dateTo = searchParams.get('date_to');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 1000);
    const offset = (page - 1) * limit;

    // Build query with joins
    let query = supabase
      .from('investments_raw')
      .select(`
        *,
        filings!inner(
          id,
          ticker,
          filing_date,
          filing_type,
          accession_number
        ),
        investments_computed!inner(
          mark,
          is_non_accrual,
          quarter_year
        )
      `);

    // Apply filters
    if (company) {
      query = query.ilike('company_name', `%${company}%`);
    }
    
    if (tranche) {
      query = query.ilike('investment_tranche', `%${tranche}%`);
    }
    
    if (description) {
      query = query.ilike('business_description', `%${description}%`);
    }
    
    if (manager) {
      query = query.eq('filings.ticker', manager);
    }
    
    if (dateFrom) {
      query = query.gte('filings.filing_date', dateFrom);
    }
    
    if (dateTo) {
      query = query.lte('filings.filing_date', dateTo);
    }

    // Apply pagination and ordering
    query = query
      .order('filing_date', { foreignTable: 'filings', ascending: false })
      .range(offset, offset + limit - 1);

    const { data: investments, error, count } = await query;

    if (error) throw error;

    // Get total count for pagination
    let countQuery = supabase
      .from('investments_raw')
      .select('*', { count: 'exact', head: true });
    
    if (company) countQuery = countQuery.ilike('company_name', `%${company}%`);
    if (tranche) countQuery = countQuery.ilike('investment_tranche', `%${tranche}%`);
    if (description) countQuery = countQuery.ilike('business_description', `%${description}%`);
    
    const { count: totalCount } = await countQuery;

    return new Response(JSON.stringify({
      data: investments || [],
      pagination: {
        page,
        limit,
        total: totalCount || 0,
        totalPages: Math.ceil((totalCount || 0) / limit)
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    throw new Error(`Search investments failed: ${error.message}`);
  }
}

/**
 * Get mark history for a specific investment
 * GET /marks/[raw_id]
 */
async function getMarkHistory(supabase: any, rawId: string) {
  try {
    if (!rawId) {
      throw new Error('Raw investment ID is required');
    }

    const { data: history, error } = await supabase
      .from('investments_computed')
      .select('quarter_year, mark, created_at')
      .eq('raw_investment_id', rawId)
      .order('quarter_year', { ascending: true });

    if (error) throw error;

    return new Response(JSON.stringify({
      raw_investment_id: rawId,
      history: history || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    throw new Error(`Get mark history failed: ${error.message}`);
  }
}

/**
 * List non-accrual investments
 * GET /nonaccruals?quarter=&year=&manager=
 */
async function listNonAccruals(supabase: any, searchParams: URLSearchParams) {
  try {
    const quarter = searchParams.get('quarter');
    const year = searchParams.get('year');
    const manager = searchParams.get('manager');

    let query = supabase
      .from('investments_computed')
      .select(`
        *,
        investments_raw!inner(
          company_name,
          business_description,
          investment_tranche,
          principal_amount,
          fair_value,
          filings!inner(
            ticker,
            filing_date,
            filing_type
          )
        )
      `)
      .eq('is_non_accrual', true);

    // Apply filters
    if (quarter && year) {
      query = query.eq('quarter_year', `Q${quarter} ${year}`);
    } else if (year) {
      query = query.like('quarter_year', `%${year}`);
    }

    if (manager) {
      query = query.eq('investments_raw.filings.ticker', manager);
    }

    query = query.order('quarter_year', { ascending: false });

    const { data: nonAccruals, error } = await query;

    if (error) throw error;

    return new Response(JSON.stringify({
      data: nonAccruals || [],
      count: nonAccruals?.length || 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    throw new Error(`List non-accruals failed: ${error.message}`);
  }
}

/**
 * Export filtered investments to Excel format
 * POST /export
 */
async function exportToExcel(supabase: any, filters: any) {
  try {
    // Get filtered data (using same logic as search but without pagination)
    let query = supabase
      .from('investments_raw')
      .select(`
        *,
        filings!inner(
          ticker,
          filing_date,
          filing_type,
          accession_number
        ),
        investments_computed!inner(
          mark,
          is_non_accrual,
          quarter_year
        )
      `);

    // Apply same filters as search
    if (filters.company) {
      query = query.ilike('company_name', `%${filters.company}%`);
    }
    
    if (filters.tranche) {
      query = query.ilike('investment_tranche', `%${filters.tranche}%`);
    }
    
    if (filters.description) {
      query = query.ilike('business_description', `%${filters.description}%`);
    }
    
    if (filters.manager) {
      query = query.eq('filings.ticker', filters.manager);
    }
    
    if (filters.date_from) {
      query = query.gte('filings.filing_date', filters.date_from);
    }
    
    if (filters.date_to) {
      query = query.lte('filings.filing_date', filters.date_to);
    }

    query = query.order('filing_date', { foreignTable: 'filings', ascending: false });

    const { data: investments, error } = await query;

    if (error) throw error;

    // Convert to CSV format (simpler than Excel for edge function)
    const csvData = convertToCSV(investments || []);
    
    return new Response(csvData, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="bdc-investments-${new Date().toISOString().split('T')[0]}.csv"`
      },
    });

  } catch (error) {
    throw new Error(`Export failed: ${error.message}`);
  }
}

/**
 * Convert investment data to CSV format
 */
function convertToCSV(data: any[]): string {
  if (!data.length) return '';

  const headers = [
    'Company Name',
    'Manager',
    'Filing Date',
    'Filing Type',
    'Business Description',
    'Investment Tranche',
    'Coupon',
    'Spread',
    'Principal Amount',
    'Amortized Cost', 
    'Fair Value',
    'Mark',
    'Non-Accrual',
    'Quarter Year'
  ];

  const rows = data.map(investment => [
    investment.company_name || '',
    investment.filings?.ticker || '',
    investment.filings?.filing_date || '',
    investment.filings?.filing_type || '',
    investment.business_description || '',
    investment.investment_tranche || '',
    investment.coupon || '',
    investment.spread || '',
    investment.principal_amount || '',
    investment.amortized_cost || '',
    investment.fair_value || '',
    investment.investments_computed?.[0]?.mark || '',
    investment.investments_computed?.[0]?.is_non_accrual ? 'Yes' : 'No',
    investment.investments_computed?.[0]?.quarter_year || ''
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  return csvContent;
}

/**
 * Invalidate cache (placeholder for future caching implementation)
 * POST /cache/invalidate
 */
async function invalidateCache() {
  try {
    // Placeholder - in the future this could clear Redis cache, CDN cache, etc.
    console.log('Cache invalidation requested');
    
    return new Response(JSON.stringify({
      message: 'Cache invalidated successfully',
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    throw new Error(`Cache invalidation failed: ${error.message}`);
  }
}