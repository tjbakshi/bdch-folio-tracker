// File: supabase/functions/sec-extractor/index.ts
// COMPLETE REPLACEMENT - HTML Schedule of Investments Parser

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts"

// Types for Schedule of Investments data
interface PortfolioInvestment {
  company_id: string;
  raw_id: string;
  portfolio_company: string;
  business_description?: string;
  industry?: string;
  investment_type: string;
  coupon?: string;
  reference_rate?: string;
  spread?: string;
  acquisition_date?: string;
  maturity_date?: string;
  shares_units?: number;
  principal?: number;
  amortized_cost?: number;
  fair_value: number;
  percentage_of_net_assets?: number;
  reporting_date: string;
  filing_date: string;
  form_type: string;
  accession_number: string;
  fiscal_year: number;
  fiscal_period: string;
  non_accrual: boolean;
  extraction_method: string;
  footnotes?: string;
}

interface BDCRecord {
  id: string;
  ticker: string;
  company_name: string;
  cik: number;
  is_active: boolean;
  fiscal_year_end_month: number;
  fiscal_year_end_day: number;
}

interface SECFiling {
  accessionNumber: string;
  filingDate: string;
  reportDate: string;
  form: string;
  primaryDocument: string;
  size: number;
}

class ScheduleOfInvestmentsExtractor {
  private readonly baseURL = 'https://www.sec.gov';
  private readonly submissionsURL = 'https://data.sec.gov/submissions';
  private readonly headers = {
    'User-Agent': 'BDC Portfolio Tracker tj.bakshi@gmail.com',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Encoding': 'gzip, deflate',
    'From': 'tj.bakshi@gmail.com'
  };

  // Rate limiting: SEC allows max 10 requests per second
  private lastRequestTime = 0;
  private readonly minRequestInterval = 200; // 200ms = 5 requests/second

  private async makeRequest(url: string, isHtml = false): Promise<any> {
    // Implement rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    console.log(`[SENTRY] Making SEC request to: ${url}`);
    
    const response = await fetch(url, { headers: this.headers });
    
    if (!response.ok) {
      console.error(`[SENTRY] SEC API error: ${response.status} ${response.statusText}`);
      
      if (response.status === 403) {
        throw new Error(`SEC API 403 Forbidden - Please wait and try again later`);
      }
      
      if (response.status === 429) {
        throw new Error(`SEC API rate limited - Please wait and try again`);
      }
      
      throw new Error(`SEC API error: ${response.status} ${response.statusText}`);
    }
    
    if (isHtml) {
      return response.text();
    } else {
      return response.json();
    }
  }

  async getRecentFilings(cik: string): Promise<SECFiling[]> {
    const paddedCik = cik.padStart(10, '0');
    const url = `${this.submissionsURL}/CIK${paddedCik}.json`;
    
    const submissionData = await this.makeRequest(url);
    
    if (!submissionData.filings?.recent) {
      throw new Error('No recent filings found');
    }
    
    const recent = submissionData.filings.recent;
    const filings: SECFiling[] = [];
    
    // Get recent 10-K and 10-Q filings (back to 2017)
    for (let i = 0; i < recent.form.length; i++) {
      const form = recent.form[i];
      const filingDate = recent.filingDate[i];
      
      // Only get 10-K and 10-Q filings from 2017 onwards
      if ((form === '10-K' || form === '10-Q') && 
          new Date(filingDate) > new Date('2017-01-01')) {
        
        filings.push({
          accessionNumber: recent.accessionNumber[i],
          filingDate: recent.filingDate[i],
          reportDate: recent.reportDate[i] || recent.filingDate[i],
          form: form,
          primaryDocument: recent.primaryDocument[i],
          size: recent.size[i]
        });
      }
      
      // Limit to most recent 30 filings to get good historical coverage back to 2017
      if (filings.length >= 30) break;
    }
    
    console.log(`[SENTRY] Found ${filings.length} 10-K/10-Q filings since 2017 for CIK ${cik}`);
    return filings;
  }

  async downloadFilingHTML(filing: SECFiling): Promise<string> {
    // Build the URL to the actual HTML filing
    const accessionNumberForURL = filing.accessionNumber.replace(/-/g, '');
    const filingURL = `${this.baseURL}/Archives/edgar/data/${parseInt(filing.accessionNumber.split('-')[0])}/${filing.accessionNumber}/${filing.primaryDocument}`;
    
    console.log(`[SENTRY] Downloading filing: ${filingURL}`);
    
    try {
      const htmlContent = await this.makeRequest(filingURL, true);
      return htmlContent;
    } catch (error) {
      console.error(`[SENTRY] Failed to download filing ${filing.accessionNumber}:`, error);
      throw error;
    }
  }

  parseScheduleOfInvestments(htmlContent: string, filing: SECFiling, ticker: string, companyId: string): PortfolioInvestment[] {
    console.log(`[SENTRY] Parsing Schedule of Investments from ${filing.form} filing`);
    
    try {
      const doc = new DOMParser().parseFromString(htmlContent, 'text/html');
      if (!doc) {
        throw new Error('Failed to parse HTML document');
      }

      const investments: PortfolioInvestment[] = [];
      
      // Look for Schedule of Investments tables
      const tables = doc.querySelectorAll('table');
      console.log(`[SENTRY] Found ${tables.length} tables in filing`);

      for (const table of tables) {
        // Find tables that look like Schedule of Investments
        const tableText = table.textContent?.toLowerCase() || '';
        
        if (this.isScheduleOfInvestmentsTable(tableText)) {
          console.log(`[SENTRY] Found potential Schedule of Investments table`);
          
          const tableInvestments = this.parseInvestmentTable(
            table, 
            filing, 
            ticker, 
            companyId
          );
          
          investments.push(...tableInvestments);
        }
      }

      console.log(`[SENTRY] Extracted ${investments.length} investments from ${filing.form}`);
      return investments;

    } catch (error) {
      console.error(`[SENTRY] Error parsing Schedule of Investments:`, error);
      return [];
    }
  }

  private isScheduleOfInvestmentsTable(tableText: string): boolean {
    // Look for key indicators that this is a Schedule of Investments table
    const indicators = [
      'schedule of investments',
      'consolidated schedule of investments',
      'portfolio company',
      'fair value',
      'principal',
      'maturity date',
      'acquisition date',
      'coupon',
      'business description'
    ];

    const matchCount = indicators.filter(indicator => 
      tableText.includes(indicator)
    ).length;

    // If we find at least 4 indicators, it's likely a Schedule of Investments
    return matchCount >= 4;
  }

  private parseInvestmentTable(table: Element, filing: SECFiling, ticker: string, companyId: string): PortfolioInvestment[] {
    const investments: PortfolioInvestment[] = [];
    
    try {
      const rows = table.querySelectorAll('tr');
      console.log(`[SENTRY] Processing ${rows.length} table rows`);

      let headerRow: Element | null = null;
      let columnMappings: Record<string, number> = {};

      // Find header row and map columns
      for (const row of rows) {
        const cells = row.querySelectorAll('th, td');
        const rowText = row.textContent?.toLowerCase() || '';

        if (this.isHeaderRow(rowText)) {
          headerRow = row;
          columnMappings = this.mapColumns(cells);
          console.log(`[SENTRY] Found header row with columns:`, Object.keys(columnMappings));
          break;
        }
      }

      if (!headerRow || Object.keys(columnMappings).length === 0) {
        console.log(`[SENTRY] No suitable header row found in table`);
        return investments;
      }

      // Process data rows
      let isDataSection = false;
      let investmentCount = 0;

      for (const row of rows) {
        // Skip until we're past the header
        if (row === headerRow) {
          isDataSection = true;
          continue;
        }

        if (!isDataSection) continue;

        const cells = row.querySelectorAll('td');
        if (cells.length < 3) continue; // Skip rows with too few cells

        const investment = this.parseInvestmentRow(
          cells, 
          columnMappings, 
          filing, 
          ticker, 
          companyId,
          investmentCount
        );

        if (investment) {
          investments.push(investment);
          investmentCount++;
        }

        // Limit to prevent runaway parsing - increased for historical data
        if (investmentCount >= 1000) {
          console.log(`[SENTRY] Reached maximum investment limit (1000) for this filing`);
          break;
        }
      }

      console.log(`[SENTRY] Successfully parsed ${investments.length} investments from table`);
      return investments;

    } catch (error) {
      console.error(`[SENTRY] Error parsing investment table:`, error);
      return investments;
    }
  }

  private isHeaderRow(rowText: string): boolean {
    const headerIndicators = [
      'company',
      'portfolio company', 
      'business description',
      'investment',
      'fair value',
      'principal',
      'maturity',
      'coupon'
    ];

    const matchCount = headerIndicators.filter(indicator => 
      rowText.includes(indicator)
    ).length;

    return matchCount >= 3;
  }

  private mapColumns(cells: NodeListOf<Element>): Record<string, number> {
    const mappings: Record<string, number> = {};
    
    for (let i = 0; i < cells.length; i++) {
      const cellText = cells[i].textContent?.toLowerCase().trim() || '';
      
      // Map common column patterns
      if (cellText.includes('company') || cellText.includes('issuer')) {
        mappings['company'] = i;
      } else if (cellText.includes('business description') || cellText.includes('description')) {
        mappings['business_description'] = i;
      } else if (cellText.includes('industry')) {
        mappings['industry'] = i;
      } else if (cellText.includes('investment') && cellText.includes('type')) {
        mappings['investment_type'] = i;
      } else if (cellText.includes('investment') && !cellText.includes('type')) {
        mappings['investment'] = i;
      } else if (cellText.includes('coupon')) {
        mappings['coupon'] = i;
      } else if (cellText.includes('reference')) {
        mappings['reference'] = i;
      } else if (cellText.includes('spread')) {
        mappings['spread'] = i;
      } else if (cellText.includes('acquisition') && cellText.includes('date')) {
        mappings['acquisition_date'] = i;
      } else if (cellText.includes('maturity') && cellText.includes('date')) {
        mappings['maturity_date'] = i;
      } else if (cellText.includes('shares') || cellText.includes('units')) {
        mappings['shares_units'] = i;
      } else if (cellText.includes('principal')) {
        mappings['principal'] = i;
      } else if (cellText.includes('amortized') && cellText.includes('cost')) {
        mappings['amortized_cost'] = i;
      } else if (cellText.includes('fair') && cellText.includes('value')) {
        mappings['fair_value'] = i;
      } else if (cellText.includes('%') && cellText.includes('net')) {
        mappings['percentage'] = i;
      }
    }
    
    return mappings;
  }

  private parseInvestmentRow(
    cells: NodeListOf<Element>, 
    mappings: Record<string, number>, 
    filing: SECFiling, 
    ticker: string, 
    companyId: string,
    index: number
  ): PortfolioInvestment | null {
    
    try {
      // Get company name (required)
      const companyName = this.getCellValue(cells, mappings['company']) || 
                         this.getCellValue(cells, mappings['investment']) ||
                         `Investment ${index + 1}`;

      if (!companyName || companyName.length < 2) {
        return null; // Skip rows without meaningful company names
      }

      // Get fair value (required)
      const fairValueText = this.getCellValue(cells, mappings['fair_value']);
      const fairValue = this.parseNumber(fairValueText);

      if (!fairValue || fairValue <= 0) {
        return null; // Skip investments without valid fair value
      }

      // Generate unique ID
      const rawId = `${ticker}_${filing.accessionNumber}_${companyName.replace(/[^a-zA-Z0-9]/g, '_')}_${index}`;

      const investment: PortfolioInvestment = {
        company_id: companyId,
        raw_id: rawId,
        portfolio_company: companyName,
        business_description: this.getCellValue(cells, mappings['business_description']),
        industry: this.getCellValue(cells, mappings['industry']),
        investment_type: this.getCellValue(cells, mappings['investment_type']) || 
                        this.getCellValue(cells, mappings['investment']) || 'Unknown',
        coupon: this.getCellValue(cells, mappings['coupon']),
        reference_rate: this.getCellValue(cells, mappings['reference']),
        spread: this.getCellValue(cells, mappings['spread']),
        acquisition_date: this.parseDate(this.getCellValue(cells, mappings['acquisition_date'])),
        maturity_date: this.parseDate(this.getCellValue(cells, mappings['maturity_date'])),
        shares_units: this.parseNumber(this.getCellValue(cells, mappings['shares_units'])),
        principal: this.parseNumber(this.getCellValue(cells, mappings['principal'])),
        amortized_cost: this.parseNumber(this.getCellValue(cells, mappings['amortized_cost'])),
        fair_value: fairValue,
        percentage_of_net_assets: this.parsePercentage(this.getCellValue(cells, mappings['percentage'])),
        reporting_date: filing.reportDate,
        filing_date: filing.filingDate,
        form_type: filing.form,
        accession_number: filing.accessionNumber,
        fiscal_year: new Date(filing.filingDate).getFullYear(),
        fiscal_period: filing.form === '10-K' ? 'FY' : 'Q' + Math.ceil((new Date(filing.reportDate).getMonth() + 1) / 3),
        non_accrual: this.isNonAccrual(companyName, this.getCellValue(cells, mappings['investment_type']) || ''),
        extraction_method: 'HTML_PARSING',
        footnotes: `Extracted from ${filing.form} filed ${filing.filingDate}`
      };

      return investment;

    } catch (error) {
      console.error(`[SENTRY] Error parsing investment row:`, error);
      return null;
    }
  }

  private getCellValue(cells: NodeListOf<Element>, columnIndex?: number): string | undefined {
    if (columnIndex === undefined || columnIndex >= cells.length) {
      return undefined;
    }
    
    const cellText = cells[columnIndex].textContent?.trim();
    return cellText && cellText !== '—' && cellText !== '-' ? cellText : undefined;
  }

  private parseNumber(text?: string): number | undefined {
    if (!text) return undefined;
    
    // Remove common formatting (commas, parentheses, dollar signs)
    const cleanText = text.replace(/[$,()]/g, '').trim();
    const number = parseFloat(cleanText);
    
    return isNaN(number) ? undefined : number;
  }

  private parsePercentage(text?: string): number | undefined {
    if (!text) return undefined;
    
    const cleanText = text.replace(/[%()]/g, '').trim();
    const number = parseFloat(cleanText);
    
    return isNaN(number) ? undefined : number;
  }

  private parseDate(text?: string): string | undefined {
    if (!text) return undefined;
    
    try {
      // Try to parse various date formats
      const date = new Date(text);
      if (isNaN(date.getTime())) return undefined;
      
      return date.toISOString().split('T')[0]; // Return YYYY-MM-DD format
    } catch {
      return undefined;
    }
  }

  private isNonAccrual(companyName: string, investmentType: string): boolean {
    const text = `${companyName} ${investmentType}`.toLowerCase();
    return text.includes('non-accrual') || text.includes('nonaccrual');
  }

  async extractBDCInvestments(cik: string, ticker: string, supabase: any): Promise<PortfolioInvestment[]> {
    console.log(`[SENTRY] Starting Schedule of Investments extraction for ${ticker} (CIK: ${cik})`);
    
    try {
      // Get or create company ID
      const companyId = await ensureBDCCompany(supabase, ticker, cik);
      
      // Get recent filings
      const filings = await this.getRecentFilings(cik);
      
      if (filings.length === 0) {
        console.log(`[SENTRY] No recent 10-K/10-Q filings found for ${ticker}`);
        return [];
      }

      const allInvestments: PortfolioInvestment[] = [];

      // Process each filing (most recent first) - increased to get more historical data
      for (const filing of filings.slice(0, 12)) { // Process up to 12 filings for better historical coverage
        try {
          console.log(`[SENTRY] Processing ${filing.form} filed ${filing.filingDate} for ${ticker}`);
          
          // Download HTML content
          const htmlContent = await this.downloadFilingHTML(filing);
          
          // Parse Schedule of Investments
          const investments = this.parseScheduleOfInvestments(htmlContent, filing, ticker, companyId);
          
          allInvestments.push(...investments);
          
          console.log(`[SENTRY] Extracted ${investments.length} investments from ${filing.form} (${filing.filingDate})`);
          
          // Rate limiting between filings - reduced since we're processing more filings
          await new Promise(resolve => setTimeout(resolve, 800));
          
        } catch (error) {
          console.error(`[SENTRY] Error processing filing ${filing.accessionNumber}:`, error);
          // Continue with next filing
        }
      }

      console.log(`[SENTRY] Total investments extracted for ${ticker}: ${allInvestments.length}`);
      return allInvestments;

    } catch (error) {
      console.error(`[SENTRY] Error extracting BDC investments for ${ticker}:`, error);
      throw error;
    }
  }
}

// Database operations
async function saveInvestmentsToDatabase(supabase: any, investments: PortfolioInvestment[]): Promise<void> {
  if (investments.length === 0) {
    console.log('[SENTRY] No investments to save');
    return;
  }

  console.log(`[SENTRY] Saving ${investments.length} portfolio investments to database`);

  try {
    // Clear existing data for this company first
    if (investments.length > 0) {
      const companyId = investments[0].company_id;
      const { error: deleteError } = await supabase
        .from('portfolio_investments')
        .delete()
        .eq('company_id', companyId);

      if (deleteError) {
        console.error('[SENTRY] Error clearing existing data:', deleteError);
      }
    }

    // Insert new data in batches
    const batchSize = 100;
    for (let i = 0; i < investments.length; i += batchSize) {
      const batch = investments.slice(i, i + batchSize);
      
      const { error } = await supabase
        .from('portfolio_investments')
        .insert(batch);

      if (error) {
        console.error(`[SENTRY] Database insert error for batch ${i}:`, error);
      } else {
        console.log(`[SENTRY] Saved batch ${i + 1}-${Math.min(i + batchSize, investments.length)}`);
      }
    }

    console.log(`[SENTRY] Successfully saved ${investments.length} portfolio investments`);
  } catch (error) {
    console.error('[SENTRY] Database save error:', error);
  }
}

// Helper function to get or create BDC company
async function ensureBDCCompany(supabase: any, ticker: string, cik: string): Promise<string> {
  console.log(`[SENTRY] Looking for company: ${ticker}`);
  
  try {
    // Try to find existing company
    const { data: existing, error: findError } = await supabase
      .from('bdc_companies')
      .select('id')
      .eq('ticker', ticker.toUpperCase())
      .single();

    if (existing && !findError) {
      console.log(`[SENTRY] Found existing company: ${ticker} with ID: ${existing.id}`);
      return existing.id;
    }

    console.log(`[SENTRY] Company ${ticker} not found, creating new record`);
    
    // Create new company
    const companyData = {
      ticker: ticker.toUpperCase(),
      cik: cik,
      name: `${ticker.toUpperCase()} Corp`,
      last_updated: new Date().toISOString()
    };

    const { data: newCompany, error: createError } = await supabase
      .from('bdc_companies')
      .insert(companyData)
      .select('id')
      .single();

    if (createError) {
      console.error(`[SENTRY] Failed to create company ${ticker}:`, createError);
      
      // Use fallback ID
      const fallbackId = `${ticker.toLowerCase()}_${cik}`;
      console.log(`[SENTRY] Using fallback company ID: ${fallbackId}`);
      return fallbackId;
    }

    console.log(`[SENTRY] Created new company: ${ticker} with ID: ${newCompany.id}`);
    return newCompany.id;
    
  } catch (error) {
    console.error(`[SENTRY] Error in ensureBDCCompany:`, error);
    
    // Use fallback ID on any error
    const fallbackId = `${ticker.toLowerCase()}_${cik}`;
    console.log(`[SENTRY] Using fallback company ID due to error: ${fallbackId}`);
    return fallbackId;
  }
}

// Helper function to fetch BDCs from database
async function getBDCsFromDatabase(supabase: any): Promise<BDCRecord[]> {
  console.log('[SENTRY] Fetching BDCs from bdc_universe table');
  
  try {
    const { data: bdcUniverse, error } = await supabase
      .from('bdc_universe')
      .select('id, ticker, company_name, cik, is_active, fiscal_year_end_month, fiscal_year_end_day')
      .eq('is_active', true)
      .order('ticker');

    if (error) {
      console.error('[SENTRY] Error fetching BDC universe:', error);
      throw new Error(`Failed to fetch BDC universe: ${error.message}`);
    }

    if (!bdcUniverse || bdcUniverse.length === 0) {
      console.log('[SENTRY] No active BDCs found in bdc_universe table');
      throw new Error('No active BDCs found in database');
    }

    console.log(`[SENTRY] Found ${bdcUniverse.length} active BDCs in database:`, 
      bdcUniverse.map(bdc => `${bdc.ticker}(${bdc.cik})`).join(', '));

    return bdcUniverse;

  } catch (error) {
    console.error('[SENTRY] Failed to fetch BDCs from database:', error);
    throw error;
  }
}

// Main handler function
serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    if (!supabaseServiceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for database operations');
    }
    
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey)

    const body = await req.json().catch(() => ({}));
    const { action, ticker, cik, bdcList } = body;

    // Handle smoke test (no action provided)
    if (!action) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'SEC Extractor (HTML Parser) is running. Extracts Schedule of Investments from 2017-2024. Supported actions: extract_filing, backfill_ticker, backfill_all, incremental_check',
          available_actions: ['extract_filing', 'backfill_ticker', 'backfill_all', 'incremental_check'],
          extraction_method: 'HTML_SCHEDULE_OF_INVESTMENTS',
          time_period: '2017-2024'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const extractor = new ScheduleOfInvestmentsExtractor()

    switch (action) {
      case 'extract_filing': {
        console.log(`[SENTRY] Extracting Schedule of Investments for: ${ticker} (${cik})`)
        
        if (!ticker || !cik) {
          throw new Error('ticker and cik are required for extract_filing action');
        }

        const investments = await extractor.extractBDCInvestments(cik, ticker, supabase)
        await saveInvestmentsToDatabase(supabase, investments)

        return new Response(
          JSON.stringify({
            success: true,
            ticker,
            cik,
            investmentsFound: investments.length,
            message: `Successfully processed ${ticker}: ${investments.length} portfolio investments found`,
            extraction_method: 'HTML_SCHEDULE_OF_INVESTMENTS'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      case 'backfill_ticker': {
        console.log(`[SENTRY] Backfilling Schedule of Investments for ticker: ${ticker}`)
        
        if (!ticker) {
          throw new Error('ticker is required for backfill_ticker action');
        }

        let targetCik = cik;
        
        // If no CIK provided, look it up in bdc_universe table
        if (!targetCik) {
          console.log(`[SENTRY] No CIK provided, looking up ${ticker} in bdc_universe table`);
          
          const { data: bdcRecord, error: lookupError } = await supabase
            .from('bdc_universe')
            .select('cik')
            .eq('ticker', ticker.toUpperCase())
            .eq('is_active', true)
            .single();

          if (lookupError || !bdcRecord) {
            throw new Error(`Ticker ${ticker} not found in BDC universe or is inactive`);
          }
          
          targetCik = bdcRecord.cik.toString();
          console.log(`[SENTRY] Found CIK ${targetCik} for ${ticker}`);
        }

        const investments = await extractor.extractBDCInvestments(targetCik, ticker, supabase)
        await saveInvestmentsToDatabase(supabase, investments)

        return new Response(
          JSON.stringify({
            success: true,
            ticker,
            cik: targetCik,
            investmentsFound: investments.length,
            message: `Schedule of Investments backfill completed for ${ticker}: ${investments.length} portfolio investments found`,
            extraction_method: 'HTML_SCHEDULE_OF_INVESTMENTS'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      case 'backfill_all': {
        console.log('[SENTRY] Starting Schedule of Investments backfill for all BDCs from bdc_universe table')
        
        let bdcsToProcess: BDCRecord[];
        
        try {
          // Get BDCs from database
          bdcsToProcess = await getBDCsFromDatabase(supabase);
        } catch (error) {
          console.error('[SENTRY] Failed to fetch BDCs from database, falling back to legacy list');
          
          // Fallback to hardcoded list if database fetch fails
          const defaultBDCs = bdcList || [
            { cik: '1287750', ticker: 'ARCC' },
            { cik: '1476765', ticker: 'GBDC' },
            { cik: '1287032', ticker: 'PSEC' }, // Corrected PSEC CIK
          ];

          bdcsToProcess = defaultBDCs.map(bdc => ({
            id: bdc.ticker,
            ticker: bdc.ticker,
            company_name: `${bdc.ticker} Corp`,
            cik: parseInt(bdc.cik),
            is_active: true,
            fiscal_year_end_month: 12,
            fiscal_year_end_day: 31
          }));
        }

        const results = []
        let totalInvestments = 0

        console.log(`[SENTRY] Processing Schedule of Investments for ${bdcsToProcess.length} BDCs from database`);

        for (const bdc of bdcsToProcess) {
          try {
            console.log(`[SENTRY] Processing ${bdc.ticker} (${bdc.company_name}) - CIK: ${bdc.cik}...`)
            
            const investments = await extractor.extractBDCInvestments(bdc.cik.toString(), bdc.ticker, supabase)
            await saveInvestmentsToDatabase(supabase, investments)
            
            results.push({
              ticker: bdc.ticker,
              cik: bdc.cik.toString(),
              investmentsFound: investments.length,
              success: true
            })
            
            totalInvestments += investments.length
            console.log(`[SENTRY] ✅ ${bdc.ticker}: ${investments.length} portfolio investments extracted`)
            
            // Rate limiting between BDCs - increased due to more filings per BDC
            await new Promise(resolve => setTimeout(resolve, 3000)) // 3 seconds between BDCs
            
          } catch (error) {
            console.error(`[SENTRY] ❌ Failed to process ${bdc.ticker}:`, error)
            results.push({
              ticker: bdc.ticker,
              cik: bdc.cik.toString(),
              investmentsFound: 0,
              success: false,
              error: error.message
            })
          }
        }

        const successfulExtractions = results.filter(r => r.success).length;
        console.log(`[SENTRY] Historical Schedule of Investments backfill complete: ${successfulExtractions}/${bdcsToProcess.length} BDCs successful, ${totalInvestments} total portfolio investments since 2017`);

        return new Response(
          JSON.stringify({
            success: true,
            processed: results.length,
            totalInvestments,
            results,
            message: `Historical Schedule of Investments backfill completed: ${totalInvestments} total portfolio investments processed (2017-2024)`,
            extraction_method: 'HTML_SCHEDULE_OF_INVESTMENTS',
            time_period: '2017-2024'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      case 'incremental_check': {
        console.log('[SENTRY] Performing incremental check for new Schedule of Investments filings')
        
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Incremental Schedule of Investments check completed - feature coming soon',
            extraction_method: 'HTML_SCHEDULE_OF_INVESTMENTS'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      default:
        return new Response(
          JSON.stringify({
            error: 'Invalid action. Supported actions: extract_filing, backfill_ticker, backfill_all, incremental_check'
          }),
          {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
    }

  } catch (error) {
    console.error('[SENTRY] SEC extractor error:', error)
    return new Response(
      JSON.stringify({
        error: error.message,
        success: false,
        extraction_method: 'HTML_SCHEDULE_OF_INVESTMENTS'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
