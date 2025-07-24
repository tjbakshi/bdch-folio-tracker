import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12';
import { Sentry } from "./lib/sentry.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface BDCTicker {
  ticker: string;
  company_name: string;
  cik?: string;
}

interface SECFiling {
  cik: string;
  accessionNumber: string;
  filingDate: string;
  formType: string;
  periodOfReport?: string;
  documentUrl?: string;
}

interface InvestmentData {
  company_name?: string;
  business_description?: string;
  investment_tranche?: string;
  coupon?: string;
  reference_rate?: string;
  spread?: string;
  acquisition_date?: string;
  principal_amount?: number;
  amortized_cost?: number;
  fair_value?: number;
}

Deno.serve(async (req) => {
  return Sentry.withSentry(async () => {
    // Start Sentry transaction for the entire request
    const transaction = Sentry.startTransaction({
      name: `SEC Extractor ${req.method} ${new URL(req.url).pathname}`,
      op: 'http.server',
      tags: {
        'http.method': req.method,
        'function.name': 'sec-extractor',
      }
    });

    console.log('SEC Extractor function called', new Date().toISOString());

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // Add request context to Sentry
      Sentry.setContext('request', {
        url: req.url,
        method: req.method,
        userAgent: req.headers.get('user-agent'),
      });
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

      const { action, ticker, yearsBack, years_back, filing_id, filing_type } = await req.json();

      console.log(`Processing action: ${action} for ticker: ${ticker || 'all'}`);
      
      // Add action context to Sentry
      Sentry.setContext('action', { action, ticker, filing_id, filing_type });
      Sentry.setTag('action', action);
      if (ticker) Sentry.setTag('ticker', ticker);

      let response: Response;

      switch (action) {
        case 'backfill_all':
          response = await Sentry.startSpan(
            { name: 'backfillAllBDCs', op: 'sec.backfill' },
            async () => await backfillAllBDCs(supabase)
          );
          break;
        
        case 'backfill_ticker':
          response = await Sentry.startSpan(
            { name: 'backfillTicker', op: 'sec.backfill' },
            async () => await backfillTicker(supabase, ticker, yearsBack || years_back || 3)
          );
          break;
        
        case 'extract_filing':
          response = await Sentry.startSpan(
            { name: 'extractFiling', op: 'sec.extract' },
            async () => await extractFiling(supabase, filing_id)
          );
          break;
        
        case 'incremental_check':
          response = await Sentry.startSpan(
            { name: 'incrementalFilingCheck', op: 'sec.check' },
            async () => await incrementalFilingCheck(supabase, ticker, filing_type)
          );
          break;
        
        case 'setup_scheduled_jobs':
          response = await Sentry.startSpan(
            { name: 'setupScheduledJobs', op: 'sec.setup' },
            async () => await setupScheduledJobs(supabase)
          );
          break;
        
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      transaction.setStatus('ok');
      transaction.setHttpStatus(response.status);
      return response;

    } catch (error) {
      console.error('Error in SEC extractor:', error);
      
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
      
      return new Response(
        JSON.stringify({ 
          error: error.message,
          timestamp: new Date().toISOString()
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    } finally {
      transaction.finish();
    }
  });
});

async function backfillAllBDCs(supabase: any) {
  console.log('Starting backfill for all BDCs');
  
  // Get all active BDC tickers
  const { data: bdcs, error } = await supabase
    .from('bdc_universe')
    .select('ticker, company_name, cik')
    .eq('is_active', true);

  if (error) {
    throw new Error(`Failed to fetch BDCs: ${error.message}`);
  }

  let processedCount = 0;
  let errorCount = 0;

  for (const bdc of bdcs) {
    try {
      console.log(`Processing BDC: ${bdc.ticker}`);
      await backfillTicker(supabase, bdc.ticker, 9);
      processedCount++;
    } catch (error) {
      console.error(`Failed to process ${bdc.ticker}:`, error);
      errorCount++;
      
      // Log the error
      await supabase.from('processing_logs').insert({
        log_level: 'error',
        message: `Failed to backfill ticker ${bdc.ticker}`,
        details: { error: error.message, ticker: bdc.ticker }
      });
    }
  }

  return new Response(
    JSON.stringify({ 
      message: 'Backfill completed',
      processed: processedCount,
      errors: errorCount
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function backfillTicker(supabase: any, ticker: string, yearsBack: number) {
  console.log(`Backfilling ticker: ${ticker} for ${yearsBack} years`);

  // Get BDC info
  const { data: bdc, error: bdcError } = await supabase
    .from('bdc_universe')
    .select('cik, company_name')
    .eq('ticker', ticker)
    .single();

  if (bdcError || !bdc) {
    throw new Error(`BDC not found: ${ticker}`);
  }

  const cik = bdc.cik;
  if (!cik) {
    throw new Error(`No CIK found for ticker: ${ticker}`);
  }

  // Fetch filings from SEC API
  const filings = await fetchSECFilings(cik, yearsBack);
  
  // Store filings in database
  for (const filing of filings) {
    await storeFiling(supabase, ticker, filing);
  }

  console.log(`Stored ${filings.length} filings for ${ticker}`);
  return filings.length;
}

async function fetchSECFilings(cik: string, yearsBack: number): Promise<SECFiling[]> {
  const paddedCik = cik.padStart(10, '0');
  const fromDate = new Date();
  fromDate.setFullYear(fromDate.getFullYear() - yearsBack);
  
  const searchUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
  
  console.log(`Fetching SEC data from: ${searchUrl}`);

  try {
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'BDC-Tracker research@partnersgroup.com'
      }
    });

    if (!response.ok) {
      throw new Error(`SEC API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const filings: SECFiling[] = [];

    if (data.filings && data.filings.recent) {
      const recent = data.filings.recent;
      
      for (let i = 0; i < recent.form.length; i++) {
        const formType = recent.form[i];
        const filingDate = recent.filingDate[i];
        
        // Only process 10-K and 10-Q filings after our cutoff date
        if ((formType === '10-K' || formType === '10-Q') && 
            new Date(filingDate) >= fromDate) {
          
          filings.push({
            cik: cik,
            accessionNumber: recent.accessionNumber[i],
            filingDate: filingDate,
            formType: formType,
            periodOfReport: recent.reportDate[i],
            documentUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${recent.accessionNumber[i].replace(/-/g, '')}/${recent.primaryDocument[i]}`
          });
        }
      }
    }

    // Sort chronologically (oldest first)
    filings.sort((a, b) => new Date(a.filingDate).getTime() - new Date(b.filingDate).getTime());
    
    console.log(`Found ${filings.length} relevant filings for CIK ${cik}`);
    return filings;

  } catch (error) {
    console.error(`Error fetching SEC data for CIK ${cik}:`, error);
    throw error;
  }
}

async function storeFiling(supabase: any, ticker: string, filing: SECFiling) {
  try {
    const { data, error } = await supabase
      .from('filings')
      .upsert({
        cik: filing.cik,
        ticker: ticker,
        accession_number: filing.accessionNumber,
        filing_date: filing.filingDate,
        filing_type: filing.formType,
        period_end_date: filing.periodOfReport,
        document_url: filing.documentUrl,
        status: 'pending'
      }, {
        onConflict: 'accession_number'
      })
      .select()
      .single();

    if (error) {
      console.error(`Error storing filing ${filing.accessionNumber}:`, error);
      throw error;
    }

    console.log(`Stored filing: ${filing.accessionNumber} for ${ticker}`);
    return data;

  } catch (error) {
    console.error(`Failed to store filing ${filing.accessionNumber}:`, error);
    throw error;
  }
}

async function extractFiling(supabase: any, filingId: string) {
  console.log(`Extracting filing: ${filingId}`);

  // Get filing details
  const { data: filing, error: filingError } = await supabase
    .from('filings')
    .select('*')
    .eq('id', filingId)
    .single();

  if (filingError || !filing) {
    throw new Error(`Filing not found: ${filingId}`);
  }

  try {
    // Update status to processing
    await supabase
      .from('filings')
      .update({ status: 'processing' })
      .eq('id', filingId);

    // Download and parse the document
    const document = await downloadDocument(filing.document_url);
    const investments = await parseScheduleOfInvestments(document);

    // Store raw investment data
    for (const investment of investments) {
      await storeInvestment(supabase, filingId, investment);
    }

    // Update filing status to completed
    await supabase
      .from('filings')
      .update({ status: 'completed' })
      .eq('id', filingId);

    console.log(`Successfully extracted ${investments.length} investments from filing ${filingId}`);
    
    return new Response(
      JSON.stringify({ 
        message: 'Filing extracted successfully',
        investments_count: investments.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`Error extracting filing ${filingId}:`, error);
    
    // Update filing status to failed
    await supabase
      .from('filings')
      .update({ 
        status: 'failed',
        error_message: error.message
      })
      .eq('id', filingId);

    throw error;
  }
}

async function downloadDocument(url: string): Promise<string> {
  console.log(`Downloading document: ${url}`);
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'BDC-Tracker research@partnersgroup.com'
    }
  });

  if (!response.ok) {
    throw new Error(`Failed to download document: ${response.status} ${response.statusText}`);
  }

  return await response.text();
}

/**
 * Parse Schedule of Investments from SEC filing HTML document
 * Uses cheerio to robustly extract investment data from various table formats
 * 
 * @param document - Raw HTML content of SEC filing
 * @returns Array of parsed investment data
 */
async function parseScheduleOfInvestments(document: string): Promise<InvestmentData[]> {
  console.log('Parsing Schedule of Investments with enhanced HTML parsing');
  
  const investments: InvestmentData[] = [];
  
  try {
    // Load HTML with cheerio
    const $ = cheerio.load(document);
    
    // Find the Schedule of Investments table
    const scheduleTable = findScheduleTable($);
    
    if (!scheduleTable) {
      console.warn('Schedule of Investments table not found in document');
      return investments;
    }
    
    console.log('Found Schedule of Investments table');
    
    // Extract column mapping from header row
    const columnMapping = extractColumnMapping($, scheduleTable);
    
    if (Object.keys(columnMapping).length < 3) {
      console.warn('Insufficient column headers found, skipping table');
      return investments;
    }
    
    console.log('Column mapping:', columnMapping);
    
    // Extract investment rows
    const rows = extractInvestmentRows($, scheduleTable, columnMapping);
    
    console.log(`Extracted ${rows.length} investment rows`);
    
    // Process each row into structured data
    for (const row of rows) {
      const investment = processInvestmentRow(row, columnMapping);
      if (investment && investment.company_name) {
        investments.push(investment);
      }
    }
    
    console.log(`Parsed ${investments.length} valid investments`);
    return investments;
    
  } catch (error) {
    console.error('Error parsing Schedule of Investments:', error);
    return investments;
  }
}

/**
 * Find the Schedule of Investments table in the document
 * Looks for tables containing investment-related headers
 */
function findScheduleTable($: any): any {
  const schedulePatterns = [
    /consolidated\s+schedule\s+of\s+investments/i,
    /schedule\s+of\s+investments/i,
    /investment\s+portfolio/i
  ];
  
  // Search for table headers that match schedule patterns
  let targetTable = null;
  
  $('table').each((i: number, table: any) => {
    const tableText = $(table).text();
    
    for (const pattern of schedulePatterns) {
      if (pattern.test(tableText)) {
        // Verify this table has investment-related columns
        const headerScore = getTableHeaderScore($, table);
        if (headerScore >= 4) {
          targetTable = table;
          return false; // Break out of each loop
        }
      }
    }
  });
  
  return targetTable;
}

/**
 * Score a table based on how many investment-related headers it contains
 */
function getTableHeaderScore($: any, table: any): number {
  const expectedHeaders = [
    /company|security|investment|name/i,
    /principal|notional|cost|commitment/i,
    /fair\s*value|value|market\s*value/i,
    /tranche|type|description/i,
    /coupon|rate|interest/i,
    /maturity|date/i,
    /industry|business|sector/i
  ];
  
  const tableText = $(table).find('th, td').first().parent().parent().text().toLowerCase();
  
  let score = 0;
  for (const pattern of expectedHeaders) {
    if (pattern.test(tableText)) {
      score++;
    }
  }
  
  return score;
}

/**
 * Extract column mapping from the table header
 */
function extractColumnMapping($: any, table: any): { [key: string]: number } {
  const mapping: { [key: string]: number } = {};
  
  // Find header row (usually first row with th elements or first row in general)
  let headerRow = $(table).find('thead tr').first();
  if (headerRow.length === 0) {
    headerRow = $(table).find('tr').first();
  }
  
  headerRow.find('th, td').each((index: number, cell: any) => {
    const headerText = $(cell).text().trim().toLowerCase();
    
    // Map common header variations to standardized field names
    if (/company|security|investment|name/i.test(headerText) && !mapping.company_name) {
      mapping.company_name = index;
    }
    if (/business|description|industry|sector/i.test(headerText) && !mapping.business_description) {
      mapping.business_description = index;
    }
    if (/tranche|type|class/i.test(headerText) && !mapping.investment_tranche) {
      mapping.investment_tranche = index;
    }
    if (/coupon|interest\s*rate/i.test(headerText) && !mapping.coupon) {
      mapping.coupon = index;
    }
    if (/spread|margin/i.test(headerText) && !mapping.spread) {
      mapping.spread = index;
    }
    if (/principal|notional|cost|commitment/i.test(headerText) && !mapping.principal_amount) {
      mapping.principal_amount = index;
    }
    if (/amortized\s*cost|cost/i.test(headerText) && !mapping.amortized_cost) {
      mapping.amortized_cost = index;
    }
    if (/fair\s*value|market\s*value|value/i.test(headerText) && !mapping.fair_value) {
      mapping.fair_value = index;
    }
    if (/acquisition|purchase|date/i.test(headerText) && !mapping.acquisition_date) {
      mapping.acquisition_date = index;
    }
  });
  
  return mapping;
}

/**
 * Extract investment data rows from the table
 */
function extractInvestmentRows($: any, table: any, columnMapping: { [key: string]: number }): string[][] {
  const rows: string[][] = [];
  
  // Skip header rows and extract data rows
  $(table).find('tr').each((index: number, row: any) => {
    const $row = $(row);
    
    // Skip header rows (contain th elements or are first few rows)
    if ($row.find('th').length > 0 || index === 0) {
      return; // Continue to next row
    }
    
    // Skip total/summary rows
    const rowText = $row.text().toLowerCase();
    if (/total|subtotal|^$/.test(rowText.trim())) {
      return;
    }
    
    // Extract cell values
    const cells: string[] = [];
    $row.find('td').each((cellIndex: number, cell: any) => {
      let cellText = $(cell).text().trim();
      
      // Remove footnote markers (numbers in parentheses, asterisks, etc.)
      cellText = cellText.replace(/\(\d+\)|\*+|†+/g, '').trim();
      
      cells[cellIndex] = cellText;
    });
    
    // Only include rows with sufficient data
    if (cells.length >= Math.max(...Object.values(columnMapping)) + 1) {
      rows.push(cells);
    }
  });
  
  return rows;
}

/**
 * Process a single investment row into structured data
 */
function processInvestmentRow(cells: string[], columnMapping: { [key: string]: number }): InvestmentData | null {
  try {
    const investment: InvestmentData = {};
    
    // Extract string fields
    if (columnMapping.company_name !== undefined) {
      investment.company_name = cleanTextValue(cells[columnMapping.company_name]);
    }
    
    if (columnMapping.business_description !== undefined) {
      investment.business_description = cleanTextValue(cells[columnMapping.business_description]);
    }
    
    if (columnMapping.investment_tranche !== undefined) {
      investment.investment_tranche = cleanTextValue(cells[columnMapping.investment_tranche]);
    }
    
    if (columnMapping.coupon !== undefined) {
      investment.coupon = cleanTextValue(cells[columnMapping.coupon]);
    }
    
    if (columnMapping.spread !== undefined) {
      investment.spread = cleanTextValue(cells[columnMapping.spread]);
    }
    
    // Extract numeric fields
    if (columnMapping.principal_amount !== undefined) {
      investment.principal_amount = parseNumericValue(cells[columnMapping.principal_amount]);
    }
    
    if (columnMapping.amortized_cost !== undefined) {
      investment.amortized_cost = parseNumericValue(cells[columnMapping.amortized_cost]);
    }
    
    if (columnMapping.fair_value !== undefined) {
      investment.fair_value = parseNumericValue(cells[columnMapping.fair_value]);
    }
    
    // Extract dates
    if (columnMapping.acquisition_date !== undefined) {
      investment.acquisition_date = parseDateValue(cells[columnMapping.acquisition_date]);
    }
    
    // Parse reference rate from coupon if present
    if (investment.coupon) {
      const rateMatch = investment.coupon.match(/(LIBOR|SOFR|Prime|Base)\s*\+?\s*(\d+\.?\d*)/i);
      if (rateMatch) {
        investment.reference_rate = rateMatch[1];
        investment.spread = rateMatch[2] + '%';
      }
    }
    
    return investment;
    
  } catch (error) {
    console.error('Error processing investment row:', error);
    return null;
  }
}

/**
 * Clean and normalize text values
 */
function cleanTextValue(value: string): string {
  if (!value) return '';
  
  return value
    .replace(/\s+/g, ' ')  // Normalize whitespace
    .replace(/["']/g, '')  // Remove quotes
    .trim();
}

/**
 * Parse numeric values from text (handles thousands separators, parentheses for negative)
 */
function parseNumericValue(value: string): number | undefined {
  if (!value || value.trim() === '' || value === '—' || value === '-') {
    return undefined;
  }
  
  // Remove dollar signs, commas, and whitespace
  let cleaned = value.replace(/[$,\s]/g, '');
  
  // Handle negative values in parentheses
  const isNegative = /^\(.*\)$/.test(cleaned);
  if (isNegative) {
    cleaned = cleaned.replace(/[()]/g, '');
  }
  
  // Convert to number
  const num = parseFloat(cleaned);
  
  if (isNaN(num)) {
    return undefined;
  }
  
  return isNegative ? -num : num;
}

/**
 * Parse date values and convert to YYYY-MM-DD format
 */
function parseDateValue(value: string): string | undefined {
  if (!value || value.trim() === '') {
    return undefined;
  }
  
  try {
    // Handle various date formats
    const date = new Date(value.trim());
    
    if (isNaN(date.getTime())) {
      return undefined;
    }
    
    // Return in YYYY-MM-DD format
    return date.toISOString().split('T')[0];
    
  } catch (error) {
    return undefined;
  }
}

async function storeInvestment(supabase: any, filingId: string, investment: InvestmentData) {
  // Store raw investment data
  const { data: rawData, error: rawError } = await supabase
    .from('investments_raw')
    .insert({
      filing_id: filingId,
      company_name: investment.company_name,
      business_description: investment.business_description,
      investment_tranche: investment.investment_tranche,
      coupon: investment.coupon,
      reference_rate: investment.reference_rate,
      spread: investment.spread,
      acquisition_date: investment.acquisition_date,
      principal_amount: investment.principal_amount,
      amortized_cost: investment.amortized_cost,
      fair_value: investment.fair_value,
      raw_row_data: investment
    })
    .select()
    .single();

  if (rawError) {
    throw new Error(`Failed to store raw investment: ${rawError.message}`);
  }

  // Compute derived fields
  const mark = investment.principal_amount && investment.fair_value 
    ? investment.fair_value / investment.principal_amount 
    : null;
    
  const isNonAccrual = investment.business_description?.toLowerCase().includes('non-accrual') || false;
  
  // Get quarter year from filing
  const { data: filing } = await supabase
    .from('filings')
    .select('filing_date, filing_type')
    .eq('id', filingId)
    .single();

  const quarterYear = getQuarterYear(filing.filing_date, filing.filing_type);

  // Store computed data
  await supabase
    .from('investments_computed')
    .insert({
      raw_investment_id: rawData.id,
      filing_id: filingId,
      mark: mark,
      is_non_accrual: isNonAccrual,
      quarter_year: quarterYear
    });
}

async function incrementalFilingCheck(supabase: any, ticker: string, filingType: string) {
  console.log(`Incremental check for ${ticker} - ${filingType}`);
  
  try {
    // Get BDC info
    const { data: bdc, error: bdcError } = await supabase
      .from('bdc_universe')
      .select('cik, company_name, fiscal_year_end')
      .eq('ticker', ticker)
      .single();

    if (bdcError || !bdc) {
      throw new Error(`BDC not found: ${ticker}`);
    }

    // Get last filing date for this type
    const { data: lastFiling } = await supabase
      .from('filings')
      .select('filing_date')
      .eq('ticker', ticker)
      .eq('filing_type', filingType)
      .order('filing_date', { ascending: false })
      .limit(1)
      .single();

    // Calculate cutoff date (only check for filings newer than last one)
    const cutoffDate = lastFiling 
      ? new Date(lastFiling.filing_date)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // Default to 1 year ago

    // Fetch recent filings from SEC
    const recentFilings = await fetchRecentSECFilings(bdc.cik, filingType, cutoffDate);
    
    let newFilingsCount = 0;
    let extractedCount = 0;

    // Process any new filings
    for (const filing of recentFilings) {
      // Check if we already have this filing
      const { data: existingFiling } = await supabase
        .from('filings')
        .select('id')
        .eq('accession_number', filing.accessionNumber)
        .single();

      if (!existingFiling) {
        // Store new filing
        const storedFiling = await storeFiling(supabase, ticker, filing);
        newFilingsCount++;
        
        // Extract investments immediately
        await extractFiling(supabase, storedFiling.id);
        extractedCount++;
        
        console.log(`Processed new filing: ${filing.accessionNumber}`);
      }
    }

    // Log results
    await supabase.from('processing_logs').insert({
      log_level: 'info',
      message: `Incremental check completed for ${ticker}`,
      details: { 
        ticker, 
        filing_type: filingType, 
        new_filings: newFilingsCount,
        extracted: extractedCount
      }
    });

    return new Response(
      JSON.stringify({ 
        message: 'Incremental check completed',
        ticker,
        filing_type: filingType,
        new_filings: newFilingsCount,
        extracted: extractedCount
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(`Error in incremental check for ${ticker}:`, error);
    
    // Log error
    await supabase.from('processing_logs').insert({
      log_level: 'error',
      message: `Incremental check failed for ${ticker}`,
      details: { ticker, filing_type: filingType, error: error.message }
    });

    throw error;
  }
}

async function fetchRecentSECFilings(cik: string, filingType: string, cutoffDate: Date): Promise<SECFiling[]> {
  const paddedCik = cik.padStart(10, '0');
  const searchUrl = `https://data.sec.gov/submissions/CIK${paddedCik}.json`;
  
  console.log(`Fetching recent ${filingType} filings for CIK ${cik} since ${cutoffDate.toISOString()}`);

  try {
    const response = await fetch(searchUrl, {
      headers: {
        'User-Agent': 'BDC-Tracker research@partnersgroup.com'
      }
    });

    if (!response.ok) {
      throw new Error(`SEC API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const filings: SECFiling[] = [];

    if (data.filings && data.filings.recent) {
      const recent = data.filings.recent;
      
      for (let i = 0; i < recent.form.length; i++) {
        const formType = recent.form[i];
        const filingDate = recent.filingDate[i];
        
        // Only process matching filing type after cutoff date
        if (formType === filingType && new Date(filingDate) > cutoffDate) {
          filings.push({
            cik: cik,
            accessionNumber: recent.accessionNumber[i],
            filingDate: filingDate,
            formType: formType,
            periodOfReport: recent.reportDate[i],
            documentUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${recent.accessionNumber[i].replace(/-/g, '')}/${recent.primaryDocument[i]}`
          });
        }
      }
    }

    // Sort by filing date (newest first for incremental)
    filings.sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime());
    
    console.log(`Found ${filings.length} recent ${filingType} filings for CIK ${cik}`);
    return filings;

  } catch (error) {
    console.error(`Error fetching recent SEC data for CIK ${cik}:`, error);
    throw error;
  }
}

async function setupScheduledJobs(supabase: any) {
  console.log('Setting up scheduled jobs for all active BDCs');
  
  try {
    // Get all active BDCs with fiscal year-end data
    const { data: bdcs, error } = await supabase
      .from('bdc_universe')
      .select('ticker, company_name, fiscal_year_end')
      .eq('is_active', true);

    if (error) {
      throw new Error(`Failed to fetch BDCs: ${error.message}`);
    }

    let jobsCreated = 0;

    for (const bdc of bdcs) {
      if (!bdc.fiscal_year_end) {
        console.warn(`Skipping ${bdc.ticker} - no fiscal year-end date`);
        continue;
      }

      // Calculate filing due dates using the database function
      const { data: filingDates } = await supabase
        .rpc('calculate_next_filing_dates', { fye_date: bdc.fiscal_year_end });

      // Create scheduled jobs for each filing type
      for (const filingDate of filingDates) {
        const { error: jobError } = await supabase
          .from('scheduled_jobs')
          .upsert({
            ticker: bdc.ticker,
            job_type: filingDate.filing_type,
            scheduled_date: filingDate.quarter_end,
            next_run_at: filingDate.due_date
          }, {
            onConflict: 'ticker,job_type,scheduled_date'
          });

        if (jobError) {
          console.error(`Failed to create job for ${bdc.ticker} ${filingDate.filing_type}:`, jobError);
        } else {
          jobsCreated++;
          console.log(`Created scheduled job: ${bdc.ticker} ${filingDate.filing_type} due ${filingDate.due_date}`);
        }
      }
    }

    // Log completion
    await supabase.from('processing_logs').insert({
      log_level: 'info',
      message: 'Scheduled jobs setup completed',
      details: { jobs_created: jobsCreated, bdcs_processed: bdcs.length }
    });

    return new Response(
      JSON.stringify({ 
        message: 'Scheduled jobs setup completed',
        jobs_created: jobsCreated,
        bdcs_processed: bdcs.length
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error setting up scheduled jobs:', error);
    
    // Log error
    await supabase.from('processing_logs').insert({
      log_level: 'error',
      message: 'Failed to setup scheduled jobs',
      details: { error: error.message }
    });

    throw error;
  }
}

function getQuarterYear(filingDate: string, filingType: string): string {
  const date = new Date(filingDate);
  const year = date.getFullYear();
  
  if (filingType === '10-K') {
    return `Q4-${year}`;
  } else {
    const month = date.getMonth() + 1;
    if (month <= 3) return `Q1-${year}`;
    if (month <= 6) return `Q2-${year}`;
    if (month <= 9) return `Q3-${year}`;
    return `Q4-${year}`;
  }
}