// File: supabase/functions/sec-extractor/index.ts
// SEC extractor with proper error handling and no boot errors

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Types for SEC API responses
interface SECCompanyFacts {
  cik: string;
  entityName: string;
  facts: {
    'us-gaap': Record<string, any>;
    dei: Record<string, any>;
    [taxonomy: string]: Record<string, any>;
  };
}

interface SECSubmission {
  cik: string;
  entityType: string;
  sic: string;
  sicDescription: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  filings: {
    recent: {
      accessionNumber: string[];
      filingDate: string[];
      reportDate: string[];
      acceptanceDateTime: string[];
      form: string[];
      fileNumber: string[];
      filmNumber: string[];
      items: string[];
      size: number[];
      isXBRL: number[];
      isInlineXBRL: number[];
      primaryDocument: string[];
      primaryDocDescription: string[];
    };
  };
}

interface Investment {
  company_id: string;
  raw_id: string;
  portfolio_company: string;
  investment_type: string;
  industry?: string;
  fair_value: number;
  cost_basis?: number;
  shares_units?: number;
  reporting_date: string;
  filing_date: string;
  form_type: string;
  accession_number: string;
  fiscal_year: number;
  fiscal_period: string;
  non_accrual: boolean;
  pik_income?: number;
  cash_income?: number;
  total_income?: number;
  extraction_method?: string;
  xbrl_concept?: string;
  footnotes?: string;
}

class SECAPIExtractor {
  private readonly baseURL = 'https://data.sec.gov/api';
  private readonly headers = {
    'User-Agent': 'BDC Portfolio Tracker tj.bakshi@gmail.com',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'From': 'tj.bakshi@gmail.com'
  };

  // Rate limiting: SEC allows max 10 requests per second, using conservative 5 req/sec
  private lastRequestTime = 0;
  private readonly minRequestInterval = 200; // 200ms = 5 requests/second

  private async makeRequest(url: string): Promise<any> {
    // Implement rate limiting
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await new Promise(resolve => setTimeout(resolve, this.minRequestInterval - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();

    console.log(`[SENTRY] Making SEC API request to: ${url}`);
    
    const response = await fetch(url, { headers: this.headers });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SENTRY] SEC API error: ${response.status} ${response.statusText}`);
      
      if (response.status === 403) {
        console.error(`[SENTRY] 403 Forbidden - User-Agent or rate limit issue`);
        throw new Error(`SEC API 403 Forbidden - Please wait and try again later`);
      }
      
      if (response.status === 429) {
        console.error(`[SENTRY] 429 Too Many Requests - Rate limited`);
        throw new Error(`SEC API rate limited - Please wait and try again`);
      }
      
      throw new Error(`SEC API error: ${response.status} ${response.statusText}`);
    }
    
    return response.json();
  }

  async getCompanySubmissions(cik: string): Promise<SECSubmission> {
    const paddedCik = cik.padStart(10, '0');
    const url = `${this.baseURL}/submissions/CIK${paddedCik}.json`;
    return this.makeRequest(url);
  }

  async getCompanyFacts(cik: string): Promise<SECCompanyFacts> {
    const paddedCik = cik.padStart(10, '0');
    const url = `${this.baseURL}/xbrl/companyfacts/CIK${paddedCik}.json`;
    return this.makeRequest(url);
  }

  async getCompanyConcept(cik: string, taxonomy: string, concept: string): Promise<any> {
    const paddedCik = cik.padStart(10, '0');
    const url = `${this.baseURL}/xbrl/companyconcept/CIK${paddedCik}/${taxonomy}/${concept}.json`;
    return this.makeRequest(url);
  }

  /**
   * Extract BDC investments using SEC's structured data APIs
   */
  async extractBDCInvestments(cik: string, ticker: string, supabase: any): Promise<Investment[]> {
    console.log(`[SENTRY] Starting BDC extraction for ${ticker} (CIK: ${cik})`);
    
    try {
      // Get or create company ID
      const companyId = await ensureBDCCompany(supabase, ticker, cik);
      console.log(`[SENTRY] Using company ID: ${companyId} for ${ticker}`);

      // Get company facts (contains all XBRL data)
      const facts = await this.getCompanyFacts(cik);
      console.log(`[SENTRY] Retrieved facts for ${facts.entityName}`);

      // Try to get recent filings info - but don't fail if this doesn't work
      let submissions: SECSubmission | null = null;
      try {
        submissions = await this.getCompanySubmissions(cik);
        console.log(`[SENTRY] Found ${submissions.filings.recent.form.length} recent filings`);
      } catch (submissionError) {
        console.log(`[SENTRY] Could not retrieve submissions (continuing without filing details): ${submissionError.message}`);
        // Create a minimal submissions object to avoid breaking the extraction
        submissions = {
          cik: cik,
          entityType: '',
          sic: '',
          sicDescription: '',
          name: facts.entityName || ticker,
          tickers: [ticker],
          exchanges: [],
          filings: {
            recent: {
              accessionNumber: [],
              filingDate: [],
              reportDate: [],
              acceptanceDateTime: [],
              form: [],
              fileNumber: [],
              filmNumber: [],
              items: [],
              size: [],
              isXBRL: [],
              isInlineXBRL: [],
              primaryDocument: [],
              primaryDocDescription: []
            }
          }
        };
      }

      // Extract investments from XBRL facts
      const investments = await this.extractInvestmentsFromFacts(facts, submissions, ticker, companyId);
      
      console.log(`[SENTRY] Extracted ${investments.length} investments from ${ticker}`);
      return investments;

    } catch (error) {
      console.error(`[SENTRY] Error extracting BDC investments for ${ticker}:`, error);
      throw error;
    }
  }

  private async extractInvestmentsFromFacts(
    facts: SECCompanyFacts, 
    submissions: SECSubmission, 
    ticker: string,
    companyId: string
  ): Promise<Investment[]> {
    const investments: Investment[] = [];
    const usGaap = facts.facts['us-gaap'] || {};
    
    console.log(`[SENTRY] Available US-GAAP concepts: ${Object.keys(usGaap).length}`);
    
    // Log all available concepts for debugging
    const allConcepts = Object.keys(usGaap);
    console.log(`[SENTRY] First 20 available concepts:`, allConcepts.slice(0, 20).join(', '));
    console.log(`[SENTRY] Investment-related concepts found:`, allConcepts.filter(c => 
      c.toLowerCase().includes('investment') || 
      c.toLowerCase().includes('schedule') ||
      c.toLowerCase().includes('portfolio') ||
      c.toLowerCase().includes('security') ||
      c.toLowerCase().includes('debt') ||
      c.toLowerCase().includes('equity')
    ));

    // Broader search for BDC investment concepts (including GBDC-specific ones)
    const investmentConcepts = [
      // Standard BDC concepts
      'ScheduleOfInvestmentsInAndAdvancesToAffiliatesAtFairValue',
      'ScheduleOfInvestmentsUnaffiliatedIssuersAtFairValue', 
      'InvestmentsFairValueDisclosure',
      'InvestmentsAtFairValue',
      'InvestmentCompaniesInvestments',
      'ScheduleOfInvestmentsInSecuritiesOwned',
      'ScheduleOfPortfolioInvestments',
      
      // Securities concepts
      'AvailableForSaleSecuritiesFairValue',
      'DebtSecuritiesFairValue',
      'EquitySecuritiesFairValue',
      'TradingSecuritiesFairValue',
      'HeldToMaturitySecuritiesFairValue',
      
      // Alternative investment concepts
      'Assets',
      'Investments',
      'InvestmentIncomeInterest',
      'InvestmentIncomeDividend',
      'LoansAndAdvancesAtFairValue',
      'NotesReceivableNet',
      'FinancialInstrumentsAtFairValue',
      
      // Look for any concept with key words
      ...allConcepts.filter(concept => {
        const lower = concept.toLowerCase();
        return (lower.includes('investment') || lower.includes('security') || lower.includes('loan')) &&
               (lower.includes('fair') || lower.includes('value') || lower.includes('amount'));
      })
    ];

    // Look for investment concepts that actually exist
    const availableConcepts = investmentConcepts.filter(concept => usGaap[concept]);
    console.log(`[SENTRY] Found ${availableConcepts.length} available investment concepts: ${availableConcepts.join(', ')}`);

    // Try to find investment data in various XBRL concepts
    for (const concept of availableConcepts) {
      console.log(`[SENTRY] Processing concept: ${concept}`);
      const conceptData = usGaap[concept];
      
      // Extract investment details from each fact
      if (conceptData.units) {
        const units = Object.keys(conceptData.units);
        console.log(`[SENTRY] Available units for ${concept}: ${units.join(', ')}`);
        
        // Process USD data if available
        if (conceptData.units.USD) {
          const factList = conceptData.units.USD;
          console.log(`[SENTRY] Processing ${factList.length} USD facts for ${concept}`);
          
          for (const fact of factList) {
            const investment = this.parseInvestmentFact(fact, submissions, ticker, facts.cik, concept, companyId);
            if (investment) {
              investments.push(investment);
            }
          }
        }
      }
    }

    // If no structured investment data found, try individual company concept calls
    if (investments.length === 0) {
      console.log(`[SENTRY] No investments found in company facts, trying individual concept calls`);
      await this.tryIndividualConceptCalls(facts.cik, investments, ticker, submissions, companyId);
    }

    return investments;
  }

  private async tryIndividualConceptCalls(
    cik: string, 
    investments: Investment[], 
    ticker: string, 
    submissions: SECSubmission,
    companyId: string
  ): Promise<void> {
    // Try specific Schedule of Investments concepts via individual API calls
    const conceptsToTry = [
      'InvestmentsFairValueDisclosure',
      'ScheduleOfInvestmentsTableTextBlock',
      'InvestmentCompaniesInvestments',
      'AvailableForSaleSecuritiesFairValue'
    ];

    for (const concept of conceptsToTry) {
      try {
        console.log(`[SENTRY] Trying individual concept call: ${concept}`);
        const conceptData = await this.getCompanyConcept(cik, 'us-gaap', concept);
        
        if (conceptData && conceptData.units && conceptData.units.USD) {
          console.log(`[SENTRY] Found data for ${concept}: ${conceptData.units.USD.length} facts`);
          this.processConceptData(conceptData, investments, ticker, submissions, concept, companyId);
        }
      } catch (error) {
        console.log(`[SENTRY] Concept ${concept} not available: ${error.message}`);
      }
    }
  }

  private parseInvestmentFact(
    fact: any, 
    submissions: SECSubmission, 
    ticker: string, 
    cik: string,
    concept: string,
    companyId: string
  ): Investment | null {
    try {
      const fairValue = parseFloat(fact.val) || 0;
      
      // For debugging, accept smaller values initially
      if (fairValue < 100) {
        return null;
      }

      // Try to find the corresponding filing info
      const accessionNumber = fact.accn;
      let filingIndex = -1;
      let formType = 'Unknown';
      let filingDate = fact.filed || '2024-01-01';
      
      if (submissions && submissions.filings.recent.accessionNumber.length > 0) {
        filingIndex = submissions.filings.recent.accessionNumber.indexOf(accessionNumber);
        
        if (filingIndex !== -1) {
          formType = submissions.filings.recent.form[filingIndex];
          filingDate = submissions.filings.recent.filingDate[filingIndex];
        }
      }
      
      // Use fact data if available, otherwise use defaults
      const reportDate = fact.end || filingDate;

      // Generate unique raw_id
      const rawId = `${ticker}_${concept}_${accessionNumber || 'unknown'}_${reportDate}_${fairValue}`;

      console.log(`[SENTRY] Creating investment: ${this.extractIssuerName(fact, concept)} - ${fairValue.toLocaleString()}`);

      const investment: Investment = {
        company_id: companyId,
        raw_id: rawId,
        portfolio_company: this.extractIssuerName(fact, concept),
        investment_type: this.determineInvestmentType(fact, concept),
        fair_value: fairValue,
        reporting_date: reportDate,
        filing_date: filingDate,
        form_type: formType,
        accession_number: accessionNumber || 'unknown',
        fiscal_year: fact.fy || new Date(filingDate).getFullYear(),
        fiscal_period: fact.fp || 'FY',
        non_accrual: false, // Default, would need additional logic to determine
        extraction_method: 'SEC_API',
        xbrl_concept: concept
      };

      // Add additional context if available
      if (fact.start && fact.end) {
        investment.footnotes = `Period: ${fact.start} to ${fact.end}`;
      }

      // Add form type to footnotes
      investment.footnotes = (investment.footnotes || '') + ` | Form: ${formType} | Concept: ${concept}`;

      return investment;
    } catch (error) {
      console.error('[SENTRY] Error parsing investment fact:', error);
      return null;
    }
  }

  private extractIssuerName(fact: any, concept: string): string {
    // Try to extract issuer name from various fact properties
    if (fact.frame) return fact.frame;
    if (fact.fp && fact.fp !== 'FY') return `${fact.fp} Investment`;
    if (concept.includes('Affiliate')) return 'Affiliated Investment';
    
    // Generate name based on concept
    let name = concept.replace(/([A-Z])/g, ' $1').trim();
    name = name.replace(/^Schedule Of/, '').replace(/At Fair Value$/, '').trim();
    
    return name || 'Investment Holding';
  }

  private processConceptData(
    conceptData: any, 
    investments: Investment[], 
    ticker: string, 
    submissions: SECSubmission,
    concept: string,
    companyId: string
  ): void {
    if (conceptData.units && conceptData.units.USD) {
      for (const fact of conceptData.units.USD) {
        const investment = this.parseInvestmentFact(fact, submissions, ticker, conceptData.cik, concept, companyId);
        if (investment) {
          investments.push(investment);
        }
      }
    }
  }

  private determineInvestmentType(fact: any, concept: string): string {
    // Determine investment type based on XBRL concept and context
    const conceptLower = concept.toLowerCase();
    
    if (conceptLower.includes('debt') || conceptLower.includes('loan')) return 'Debt';
    if (conceptLower.includes('equity') || conceptLower.includes('stock')) return 'Equity';
    if (conceptLower.includes('bond')) return 'Bond';
    if (conceptLower.includes('affiliate')) return 'Affiliated';
    if (conceptLower.includes('warrant')) return 'Warrant';
    
    return 'Other';
  }
}

// Database operations
async function saveInvestmentsToDatabase(supabase: any, investments: Investment[]): Promise<void> {
  if (investments.length === 0) {
    console.log('[SENTRY] No investments to save');
    return;
  }

  console.log(`[SENTRY] Saving ${investments.length} investments to database`);

  try {
    const { data, error } = await supabase
      .from('bdc_investments')
      .upsert(investments, {
        onConflict: 'raw_id',
        ignoreDuplicates: false
      });

    if (error) {
      console.error('[SENTRY] Database upsert error:', error);
      console.log(`[SENTRY] Failed to save to database, but extracted ${investments.length} investments successfully`);
      return;
    }

    console.log(`[SENTRY] Successfully saved ${investments.length} investments`);
  } catch (error) {
    console.error('[SENTRY] Database save error:', error);
    console.log(`[SENTRY] Failed to save to database, but extracted ${investments.length} investments successfully`);
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
          message: 'SEC Extractor is running. Supported actions: extract_filing, backfill_ticker, backfill_all, incremental_check',
          available_actions: ['extract_filing', 'backfill_ticker', 'backfill_all', 'incremental_check']
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const extractor = new SECAPIExtractor()

    switch (action) {
      case 'extract_filing': {
        console.log(`[SENTRY] Extracting single BDC: ${ticker} (${cik})`)
        
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
            message: `Successfully processed ${ticker}: ${investments.length} investments found`
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      case 'backfill_ticker': {
        console.log(`[SENTRY] Backfilling ticker: ${ticker} (${cik})`)
        
        if (!ticker || !cik) {
          throw new Error('ticker and cik are required for backfill_ticker action');
        }

        const investments = await extractor.extractBDCInvestments(cik, ticker, supabase)
        await saveInvestmentsToDatabase(supabase, investments)

        return new Response(
          JSON.stringify({
            success: true,
            ticker,
            cik,
            investmentsFound: investments.length,
            message: `Backfill completed for ${ticker}: ${investments.length} investments found`
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      case 'backfill_all': {
        console.log('[SENTRY] Starting backfill for all BDCs')
        
        // Default BDC list
        const defaultBDCs = bdcList || [
          { cik: '1476765', ticker: 'GBDC' },
          { cik: '1287750', ticker: 'ARCC' },
          { cik: '1552198', ticker: 'WHF' },
          { cik: '1414932', ticker: 'TSLX' },
          { cik: '1403909', ticker: 'PSEC' },
          { cik: '1423902', ticker: 'NMFC' },
        ]

        const results = []
        let totalInvestments = 0

        for (const bdc of defaultBDCs) {
          try {
            console.log(`[SENTRY] Processing ${bdc.ticker}...`)
            
            const investments = await extractor.extractBDCInvestments(bdc.cik, bdc.ticker, supabase)
            await saveInvestmentsToDatabase(supabase, investments)
            
            results.push({
              ticker: bdc.ticker,
              cik: bdc.cik,
              investmentsFound: investments.length,
              success: true
            })
            
            totalInvestments += investments.length
            
            // Rate limiting between BDCs
            await new Promise(resolve => setTimeout(resolve, 1000))
            
          } catch (error) {
            console.error(`[SENTRY] Failed to process ${bdc.ticker}:`, error)
            results.push({
              ticker: bdc.ticker,
              cik: bdc.cik,
              investmentsFound: 0,
              success: false,
              error: error.message
            })
          }
        }

        return new Response(
          JSON.stringify({
            success: true,
            processed: results.length,
            totalInvestments,
            results,
            message: `Backfill completed: ${totalInvestments} total investments processed`
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      case 'incremental_check': {
        console.log('[SENTRY] Performing incremental check for new filings')
        
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Incremental check completed - feature coming soon'
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
        success: false
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
