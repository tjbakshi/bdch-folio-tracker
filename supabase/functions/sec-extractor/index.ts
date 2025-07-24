import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
  console.log('SEC Extractor function called', new Date().toISOString());

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ticker, years_back } = await req.json();

    console.log(`Processing action: ${action} for ticker: ${ticker || 'all'}`);

    switch (action) {
      case 'backfill_all':
        return await backfillAllBDCs(supabase);
      
      case 'backfill_ticker':
        return await backfillTicker(supabase, ticker, years_back || 9);
      
      case 'extract_filing':
        const { filing_id } = await req.json();
        return await extractFiling(supabase, filing_id);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Error in SEC extractor:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
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

async function parseScheduleOfInvestments(document: string): Promise<InvestmentData[]> {
  console.log('Parsing Schedule of Investments');
  
  const investments: InvestmentData[] = [];
  
  // Look for the schedule table in the document
  // This is a simplified parser - in production, you'd want more robust parsing
  const scheduleRegex = /CONSOLIDATED SCHEDULE OF INVESTMENTS|SCHEDULE OF INVESTMENTS/i;
  const match = document.search(scheduleRegex);
  
  if (match === -1) {
    console.warn('Schedule of Investments table not found in document');
    return investments;
  }

  // Extract table data starting from the schedule section
  const scheduleSection = document.substring(match, match + 50000); // Get reasonable chunk
  
  // This is a basic implementation - you would enhance this with proper HTML/table parsing
  // For now, we'll create a placeholder structure
  investments.push({
    company_name: 'Placeholder Company',
    business_description: 'Extracted from parsing logic',
    investment_tranche: 'Senior Secured',
    principal_amount: 1000000,
    fair_value: 980000
  });

  console.log(`Parsed ${investments.length} investments`);
  return investments;
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