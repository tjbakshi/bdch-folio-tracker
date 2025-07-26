import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12';
import { Sentry } from '../shared/sentry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};

// Helper functions for safe data processing
function safePadCIK(cik) {
  if (!cik) {
    throw new Error('CIK is required but was null or undefined');
  }
  return cik.toString().padStart(10, '0');
}

function safeFormatDate(dateValue) {
  if (!dateValue) {
    return new Date().toISOString().split('T')[0];
  }
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) {
      throw new Error('Invalid date');
    }
    return date.toISOString().split('T')[0];
  } catch (error) {
    console.error('[SENTRY] Date formatting error:', error);
    return new Date().toISOString().split('T')[0];
  }
}

function safeExtractAccession(accessionNumber) {
  if (!accessionNumber) {
    throw new Error('Accession number is required but was null or undefined');
  }
  return accessionNumber.replace(/-/g, '');
}

Deno.serve(async (req) => {
  return Sentry.withSentry(async () => {
    // Start Sentry transaction for the entire request
    const transaction = Sentry.startTransaction({
      name: `SEC Extractor ${req.method} ${new URL(req.url).pathname}`,
      op: 'http.server',
      tags: {
        'http.method': req.method,
        'function.name': 'sec-extractor'
      }
    });

    console.log('SEC Extractor function called', new Date().toISOString());

    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders
      });
    }

    try {
      // Add request context to Sentry
      Sentry.setContext('request', {
        url: req.url,
        method: req.method,
        userAgent: req.headers.get('user-agent')
      });

      const supabase = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );

      const { action, ticker, yearsBack, years_back, filing_id, filing_type } = await req.json();

      console.log(`Processing action: ${action} for ticker: ${ticker || 'all'}`);

      // Add action context to Sentry
      Sentry.setContext('action', {
        action,
        ticker,
        filing_id,
        filing_type
      });
      Sentry.setTag('action', action);
      if (ticker) Sentry.setTag('ticker', ticker);

      let response;

      switch (action) {
        case 'backfill_all':
          response = await Sentry.startSpan({
            name: 'backfillAllBDCs',
            op: 'sec.backfill'
          }, async () => await backfillAllBDCs(supabase));
          break;

        case 'backfill_ticker':
          response = await Sentry.startSpan({
            name: 'backfillTicker',
            op: 'sec.backfill'
          }, async () => await backfillTicker(supabase, ticker, yearsBack || years_back || 3));
          break;

        case 'extract_filing':
          response = await Sentry.startSpan({
            name: 'extractFiling',
            op: 'sec.extract'
          }, async () => await extractFiling(supabase, filing_id));
          break;

        case 'incremental_check':
          response = await Sentry.startSpan({
            name: 'incrementalFilingCheck',
            op: 'sec.check'
          }, async () => await incrementalFilingCheck(supabase, ticker, filing_type));
          break;

        case 'setup_scheduled_jobs':
          response = await Sentry.startSpan({
            name: 'setupScheduledJobs',
            op: 'sec.setup'
          }, async () => await setupScheduledJobs(supabase));
          break;

        case 'extract_investments':
          response = await Sentry.startSpan({
            name: 'extractInvestments',
            op: 'sec.extract'
          }, async () => await extractInvestmentsFromFilings(supabase, ticker));
          break;

        case 'extract_all_investments':
          response = await Sentry.startSpan({
            name: 'extractAllInvestments', 
            op: 'sec.extract'
          }, async () => await extractAllInvestments(supabase));
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      transaction.setStatus('ok');
      transaction.setHttpStatus(response.status);
      return response;

    } catch (error) {
      console.error('Error in SEC extractor:', error);

      Sentry.captureException(error, {
        contexts: {
          request: {
            url: req.url,
            method: req.method
          }
        }
      });

      transaction.setStatus('internal_error');

      return new Response(JSON.stringify({
        error: error.message,
        timestamp: new Date().toISOString()
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    } finally {
      transaction.finish();
    }
  });
});

async function backfillAllBDCs(supabase) {
  console.log('Starting backfill for all BDCs');

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

      await supabase.from('processing_logs').insert({
        log_level: 'error',
        message: `Failed to backfill ticker ${bdc.ticker}`,
        details: {
          error: error.message,
          ticker: bdc.ticker
        }
      });
    }
  }

  return new Response(JSON.stringify({
    message: 'Backfill completed',
    processed: processedCount,
    errors: errorCount
  }), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json'
    }
  });
}

async function backfillTicker(supabase, ticker, yearsBack) {
  console.log(`Backfilling ticker: ${ticker} for ${yearsBack} years`);

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

  const filings = await fetchSECFilings(cik, yearsBack);

  for (const filing of filings) {
    await storeFiling(supabase, ticker, filing);
  }

  console.log(`Stored ${filings.length} filings for ${ticker}`);
  return filings.length;
}

async function fetchSECFilings(cik, yearsBack) {
  const paddedCik = safePadCIK(cik);
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
    const filings = [];

    if (data.filings && data.filings.recent) {
      const recent = data.filings.recent;

      for (let i = 0; i < recent.form.length; i++) {
        const formType = recent.form[i];
        const filingDate = recent.filingDate[i];

        if ((formType === '10-K' || formType === '10-Q') &&
          new Date(filingDate) >= fromDate) {

          const accessionNumber = recent.accessionNumber[i];
          const primaryDocument = recent.primaryDocument[i];

          if (accessionNumber && primaryDocument) {
            filings.push({
              cik: cik,
              accessionNumber: accessionNumber,
              filingDate: filingDate,
              formType: formType,
              periodOfReport: recent.reportDate[i],
              documentUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${safeExtractAccession(accessionNumber)}/${primaryDocument}`
            });
          }
        }
      }
    }

    filings.sort((a, b) => new Date(a.filingDate).getTime() - new Date(b.filingDate).getTime());

    console.log(`Found ${filings.length} relevant filings for CIK ${cik}`);
    return filings;

  } catch (error) {
    console.error(`Error fetching SEC data for CIK ${cik}:`, error);
    throw error;
  }
}

async function storeFiling(supabase, ticker, filing) {
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

async function extractFiling(supabase, filingId) {
  console.log(`Extracting filing: ${filingId}`);

  const { data: filing, error: filingError } = await supabase
    .from('filings')
    .select('*')
    .eq('id', filingId)
    .single();

  if (filingError || !filing) {
    throw new Error(`Filing not found: ${filingId}`);
  }

  try {
    await supabase
      .from('filings')
      .update({
        status: 'processing'
      })
      .eq('id', filingId);

    const document = await downloadDocument(filing.document_url);
    const investments = await parseScheduleOfInvestments(document);

    for (const investment of investments) {
      await storeInvestment(supabase, filingId, investment);
    }

    await supabase
      .from('filings')
      .update({
        status: 'completed'
      })
      .eq('id', filingId);

    console.log(`Successfully extracted ${investments.length} investments from filing ${filingId}`);

    return new Response(JSON.stringify({
      message: 'Filing extracted successfully',
      investments_count: investments.length
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error(`Error extracting filing ${filingId}:`, error);

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

async function downloadDocument(url) {
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

async function parseScheduleOfInvestments(document) {
  console.log('Parsing Schedule of Investments with enhanced HTML parsing');

  const investments = [];

  try {
    const $ = cheerio.load(document);
    const scheduleTable = findScheduleTable($);

    if (!scheduleTable) {
      console.warn('Schedule of Investments table not found in document');
      return investments;
    }

    console.log('Found Schedule of Investments table');

    const columnMapping = extractColumnMapping($, scheduleTable);

    if (Object.keys(columnMapping).length < 3) {
      console.warn('Insufficient column headers found, skipping table');
      return investments;
    }

    console.log('Column mapping:', columnMapping);

    const rows = extractInvestmentRows($, scheduleTable, columnMapping);

    console.log(`Extracted ${rows.length} investment rows`);

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

function findScheduleTable($) {
  const schedulePatterns = [
    /consolidated\s+schedule\s+of\s+investments/i,
    /schedule\s+of\s+investments/i,
    /investment\s+portfolio/i
  ];

  let targetTable = null;

  $('table').each((i, table) => {
    const tableText = $(table).text();

    for (const pattern of schedulePatterns) {
      if (pattern.test(tableText)) {
        const headerScore = getTableHeaderScore($, table);
        if (headerScore >= 4) {
          targetTable = table;
          return false;
        }
      }
    }
  });

  return targetTable;
}

function getTableHeaderScore($, table) {
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

function extractColumnMapping($, table) {
  const mapping = {};

  let headerRow = $(table).find('thead tr').first();
  if (headerRow.length === 0) {
    headerRow = $(table).find('tr').first();
  }

  headerRow.find('th, td').each((index, cell) => {
    const headerText = $(cell).text().trim().toLowerCase();

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

function extractInvestmentRows($, table, columnMapping) {
  const rows = [];

  $(table).find('tr').each((index, row) => {
    const $row = $(row);

    if ($row.find('th').length > 0 || index === 0) {
      return;
    }

    const rowText = $row.text().toLowerCase();
    if (/total|subtotal|^$/.test(rowText.trim())) {
      return;
    }

    const cells = [];
    $row.find('td').each((cellIndex, cell) => {
      let cellText = $(cell).text().trim();
      cellText = cellText.replace(/\(\d+\)|\*+|†+/g, '').trim();
      cells[cellIndex] = cellText;
    });

    if (cells.length >= Math.max(...Object.values(columnMapping)) + 1) {
      rows.push(cells);
    }
  });

  return rows;
}

function processInvestmentRow(cells, columnMapping) {
  try {
    const investment = {};

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

    if (columnMapping.principal_amount !== undefined) {
      investment.principal_amount = parseNumericValue(cells[columnMapping.principal_amount]);
    }

    if (columnMapping.amortized_cost !== undefined) {
      investment.amortized_cost = parseNumericValue(cells[columnMapping.amortized_cost]);
    }

    if (columnMapping.fair_value !== undefined) {
      investment.fair_value = parseNumericValue(cells[columnMapping.fair_value]);
    }

    if (columnMapping.acquisition_date !== undefined) {
      investment.acquisition_date = parseDateValue(cells[columnMapping.acquisition_date]);
    }

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

function cleanTextValue(value) {
  if (!value) return '';

  return value
    .replace(/\s+/g, ' ')
    .replace(/["']/g, '')
    .trim();
}

function parseNumericValue(value) {
  if (!value || value.trim() === '' || value === '—' || value === '-') {
    return undefined;
  }

  let cleaned = value.replace(/[$,\s]/g, '');

  const isNegative = /^\(.*\)$/.test(cleaned);
  if (isNegative) {
    cleaned = cleaned.replace(/[()]/g, '');
  }

  const num = parseFloat(cleaned);

  if (isNaN(num)) {
    return undefined;
  }

  return isNegative ? -num : num;
}

function parseDateValue(value) {
  if (!value || value.trim() === '') {
    return undefined;
  }

  try {
    const date = new Date(value.trim());

    if (isNaN(date.getTime())) {
      return undefined;
    }

    return date.toISOString().split('T')[0];

  } catch (error) {
    return undefined;
  }
}

async function storeInvestment(supabase, filingId, investment) {
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

  const mark = investment.principal_amount && investment.fair_value
    ? investment.fair_value / investment.principal_amount
    : null;

  const isNonAccrual = investment.business_description?.toLowerCase().includes('non-accrual') || false;

  const { data: filing } = await supabase
    .from('filings')
    .select('filing_date, filing_type')
    .eq('id', filingId)
    .single();

  const quarterYear = getQuarterYear(filing.filing_date, filing.filing_type);

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

async function incrementalFilingCheck(supabase, ticker, filingType) {
  console.log(`Incremental check for ${ticker} - ${filingType}`);

  try {
    const { data: bdc, error: bdcError } = await supabase
      .from('bdc_universe')
      .select('cik, company_name, fiscal_year_end_month, fiscal_year_end_day')
      .eq('ticker', ticker)
      .single();

    if (bdcError || !bdc) {
      throw new Error(`BDC not found: ${ticker}`);
    }

    const { data: lastFiling } = await supabase
      .from('filings')
      .select('filing_date')
      .eq('ticker', ticker)
      .eq('filing_type', filingType)
      .order('filing_date', { ascending: false })
      .limit(1)
      .single();

    const cutoffDate = lastFiling
      ? new Date(lastFiling.filing_date)
      : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);

    const recentFilings = await fetchRecentSECFilings(bdc.cik, filingType, cutoffDate);

    let newFilingsCount = 0;
    let extractedCount = 0;

    for (const filing of recentFilings) {
      const { data: existingFiling } = await supabase
        .from('filings')
        .select('id')
        .eq('accession_number', filing.accessionNumber)
        .single();

      if (!existingFiling) {
        const storedFiling = await storeFiling(supabase, ticker, filing);
        newFilingsCount++;

        await extractFiling(supabase, storedFiling.id);
        extractedCount++;

        console.log(`Processed new filing: ${filing.accessionNumber}`);
      }
    }

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

    return new Response(JSON.stringify({
      message: 'Incremental check completed',
      ticker,
      filing_type: filingType,
      new_filings: newFilingsCount,
      extracted: extractedCount
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error(`Error in incremental check for ${ticker}:`, error);

    await supabase.from('processing_logs').insert({
      log_level: 'error',
      message: `Incremental check failed for ${ticker}`,
      details: {
        ticker,
        filing_type: filingType,
        error: error.message
      }
    });

    throw error;
  }
}

async function fetchRecentSECFilings(cik, filingType, cutoffDate) {
  const paddedCik = safePadCIK(cik);
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
    const filings = [];

    if (data.filings && data.filings.recent) {
      const recent = data.filings.recent;

      for (let i = 0; i < recent.form.length; i++) {
        const formType = recent.form[i];
        const filingDate = recent.filingDate[i];

        if (formType === filingType && new Date(filingDate) > cutoffDate) {
          const accessionNumber = recent.accessionNumber[i];
          const primaryDocument = recent.primaryDocument[i];

          if (accessionNumber && primaryDocument) {
            filings.push({
              cik: cik,
              accessionNumber: accessionNumber,
              filingDate: filingDate,
              formType: formType,
              periodOfReport: recent.reportDate[i],
              documentUrl: `https://www.sec.gov/Archives/edgar/data/${cik}/${safeExtractAccession(accessionNumber)}/${primaryDocument}`
            });
          }
        }
      }
    }

    filings.sort((a, b) => new Date(b.filingDate).getTime() - new Date(a.filingDate).getTime());

    console.log(`Found ${filings.length} recent ${filingType} filings for CIK ${cik}`);
    return filings;

  } catch (error) {
    console.error(`Error fetching recent SEC data for CIK ${cik}:`, error);
    throw error;
  }
}

async function setupScheduledJobs(supabase) {
  console.log('Setting up scheduled jobs for all active BDCs');

  try {
    const { data: bdcs, error } = await supabase
      .from('bdc_universe')
      .select('ticker, company_name, fiscal_year_end_month, fiscal_year_end_day')
      .eq('is_active', true);

    if (error) {
      throw new Error(`Failed to fetch BDCs: ${error.message}`);
    }

    let jobsCreated = 0;

    for (const bdc of bdcs) {
      if (!bdc.fiscal_year_end_month || !bdc.fiscal_year_end_day) {
        console.warn(`Skipping ${bdc.ticker} - no fiscal year-end date`);
        continue;
      }

      const { data: filingDates } = await supabase
        .rpc('calculate_next_filing_dates', {
          fye_month: bdc.fiscal_year_end_month,
          fye_day: bdc.fiscal_year_end_day
        });

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

    await supabase.from('processing_logs').insert({
      log_level: 'info',
      message: 'Scheduled jobs setup completed',
      details: {
        jobs_created: jobsCreated,
        bdcs_processed: bdcs.length
      }
    });

    return new Response(JSON.stringify({
      message: 'Scheduled jobs setup completed',
      jobs_created: jobsCreated,
      bdcs_processed: bdcs.length
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    console.error('Error setting up scheduled jobs:', error);

    await supabase.from('processing_logs').insert({
      log_level: 'error',
      message: 'Failed to setup scheduled jobs',
      details: {
        error: error.message
      }
    });

    throw error;
  }
}

function getQuarterYear(filingDate, filingType) {
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

async function extractInvestmentsFromFilings(supabase, ticker) {
  console.log(`[SENTRY] Starting investment extraction for ${ticker || 'all tickers'}`);
  
  try {
    let query = supabase
      .from('filings')
      .select('*')
      .eq('status', 'pending')
      .order('filing_date', { ascending: false });
    
    if (ticker) {
      query = query.eq('ticker', ticker);
    }
    
    const { data: filings, error } = await query;
    
    if (error) throw error;
    
    console.log(`Found ${filings.length} filings to process for investment extraction`);
    
    let totalProcessed = 0;
    let totalInvestments = 0;
    let errorCount = 0;
    
    for (const filing of filings) {
      try {
        console.log(`Processing ${filing.ticker} - ${filing.accession_number}`);
        
        const investments = await extractInvestmentsFromSingleFiling(supabase, filing);
        
        if (investments.length > 0) {
          totalInvestments += investments.length;
          console.log(`✅ Extracted ${investments.length} investments from ${filing.ticker}`);
        } else {
          console.log(`ℹ️ No investments found in ${filing.ticker} filing`);
        }
        
        await supabase
          .from('filings')
          .update({ 
            status: 'processed',
            updated_at: new Date().toISOString()
          })
          .eq('id', filing.id);
        
        totalProcessed++;
        
        await new Promise(resolve => setTimeout(resolve, 1000));
        
      } catch (error) {
        console.error(`Error processing ${filing.ticker}:`, error);
        errorCount++;
        
        await supabase
          .from('filings')
          .update({ 
            status: 'error',
            error_message: error.message,
            updated_at: new Date().toISOString()
          })
          .eq('id', filing.id);
      }
    }
    
    const result = {
      message: 'Investment extraction completed',
      processed: totalProcessed,
      investments_extracted: totalInvestments,
      errors: errorCount
    };
    
    console.log(`[SENTRY] Investment extraction completed:`, result);
    
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
    
  } catch (error) {
    console.error(`[SENTRY] Fatal error in investment extraction:`, error);
    throw error;
  }
}

async function extractAllInvestments(supabase) {
  return await extractInvestmentsFromFilings(supabase, null);
}

async function extractInvestmentsFromSingleFiling(supabase, filing) {
  const investments = [];
  
  try {
    console.log(`Fetching filing document from: ${filing.document_url}`);
    
    const response = await fetch(filing.document_url, {
      headers: {
        'User-Agent': 'BDC-Investment-Tracker/1.0 (research@partnersgroup.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Failed to fetch document`);
    }
    
    const documentText = await response.text();
    console.log(`Downloaded document (${Math.round(documentText.length / 1024)}KB)`);
    
    const parsedInvestments = await parseScheduleOfInvestments(documentText);
    
    for (const investment of parsedInvestments) {
      const investmentRecord = {
        filing_id: filing.id,
        cik: filing.cik,
        ticker: filing.ticker,
        filing_date: filing.filing_date,
        period_end_date: filing.period_end_date,
        accession_number: filing.accession_number,
        company_name: investment.company_name || '',
        business_description: investment.business_description || '',
        investment_tranche: investment.investment_tranche || '',
        industry: '',
        principal_amount: investment.principal_amount,
        cost_basis: investment.amortized_cost,
        fair_value: investment.fair_value,
        shares_units: null,
        percentage_of_net_assets: null,
        coupon_rate: investment.coupon,
        maturity_date: investment.acquisition_date,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      
      investments.push(investmentRecord);
    }
    
    if (investments.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < investments.length; i += batchSize) {
        const batch = investments.slice(i, i + batchSize);
        const { error } = await supabase
          .from('investments_raw')
          .insert(batch);

        if (error) {
          console.error(`Error inserting batch for ${filing.ticker}:`, error);
          throw new Error(`Database insert error: ${error.message}`);
        }
      }
    }
    
    return investments;
    
  } catch (error) {
    console.error(`Error extracting investments from ${filing.ticker}:`, error);
    throw error;
  }
}
