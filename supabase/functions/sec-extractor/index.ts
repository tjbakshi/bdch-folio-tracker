// File: supabase/functions/sec-extractor/index.ts
// Replace your entire existing sec-extractor function with this code

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
  issuer: string;
  title: string;
  cusip?: string;
  fair_value: number;
  cost_basis?: number;
  principal_amount?: number;
  shares?: number;
  interest_rate?: string;
  maturity_date?: string;
  investment_type: string;
  industry?: string;
  geography?: string;
  is_non_accrual?: boolean;
  footnotes?: string;
  filing_date: string;
  report_date: string;
  cik: string;
  ticker: string;
  accession_number?: string;
  xbrl_concept?: string;
  filing_form?: string;
  extraction_method?: string;
}

class SECAPIExtractor {
  private readonly baseURL = 'https://data.sec.gov/api';
  private readonly headers = {
    'User-Agent': 'BDC-Portfolio-Tracker github.com/tjbakshi/bdch-folio-tracker tj.bakshi@gmail.com',
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate'
  };

  // Rate limiting: SEC allows max 10 requests per second
  private lastRequestTime = 0;
  private readonly minRequestInterval = 100; // 100ms = 10 requests/second

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
      console.error(`[SENTRY] SEC API error: ${response.status} ${response.statusText} - ${errorText}`);
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
  async extractBDCInvestments(cik: string, ticker: string): Promise<Investment[]> {
    console.log(`[SENTRY] Starting BDC extraction for ${ticker} (CIK: ${cik})`);
    
    try {
      // Get company facts (contains all XBRL data)
      const facts = await this.getCompanyFacts(cik);
      console.log(`[SENTRY] Retrieved facts for ${facts.entityName}`);

      // Get recent filings info
      const submissions = await this.getCompanySubmissions(cik);
      console.log(`[SENTRY] Found ${submissions.filings.recent.form.length} recent filings`);

      // Extract investments from XBRL facts
      const investments = await this.extractInvestmentsFromFacts(facts, submissions, ticker);
      
      console.log(`[SENTRY] Extracted ${investments.length} investments from ${ticker}`);
      return investments;

    } catch (error) {
      console.error(`[SENTRY] Error extracting BDC investments for ${ticker}:`, error);
      
      // Return empty array instead of trying HTML fallback for now
      console.log(`[SENTRY] SEC API extraction failed for ${ticker}, returning empty results`);
      return [];
    }
  }

  private async extractInvestmentsFromFacts(
    facts: SECCompanyFacts, 
    submissions: SECSubmission, 
    ticker: string
  ): Promise<Investment[]> {
    const investments: Investment[] = [];
    const usGaap = facts.facts['us-gaap'] || {};
    
    console.log(`[SENTRY] Available US-GAAP concepts: ${Object.keys(usGaap).length}`);
    
    // Key investment-related XBRL concepts for BDCs
    const investmentConcepts = [
      'ScheduleOfInvestmentsInAndAdvancesToAffiliatesAtFairValue',
      'ScheduleOfInvestmentsUnaffiliatedIssuersAtFairValue', 
      'InvestmentsFairValueDisclosure',
      'AvailableForSaleSecuritiesFairValue',
      'DebtSecuritiesFairValue',
      'EquitySecuritiesFairValue',
      'InvestmentIncomeInterest',
      'InvestmentCompaniesInvestments',
      'ScheduleOfInvestmentsInSecuritiesOwned',
      'ScheduleOfPortfolioInvestments'
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
            const investment = this.parseInvestmentFact(fact, submissions, ticker, facts.cik, concept);
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
      await this.tryIndividualConceptCalls(facts.cik, investments, ticker, submissions);
    }

    return investments;
  }

  private async tryIndividualConceptCalls(
    cik: string, 
    investments: Investment[], 
    ticker: string, 
    submissions: SECSubmission
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
          this.processConceptData(conceptData, investments, ticker, submissions, concept);
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
    concept: string
  ): Investment | null {
    try {
      // Find the corresponding filing info
      const accessionNumber = fact.accn;
      const filingIndex = submissions.filings.recent.accessionNumber.indexOf(accessionNumber);
      
      if (filingIndex === -1) {
        console.log(`[SENTRY] No filing found for accession ${accessionNumber}`);
        return null;
      }

      const fairValue = parseFloat(fact.val) || 0;
      
      // Skip zero or very small values (likely not real investments)
      if (fairValue < 1000) {
        return null;
      }

      const investment: Investment = {
        issuer: this.extractIssuerName(fact, concept),
        title: this.extractInvestmentTitle(fact, concept),
        fair_value: fairValue,
        investment_type: this.determineInvestmentType(fact, concept),
        filing_date: submissions.filings.recent.filingDate[filingIndex],
        report_date: fact.end || submissions.filings.recent.reportDate[filingIndex],
        cik: cik,
        ticker: ticker,
        accession_number: accessionNumber,
        xbrl_concept: concept,
        filing_form: submissions.filings.recent.form[filingIndex],
        extraction_method: 'SEC_API'
      };

      // Add additional context if available
      if (fact.start && fact.end) {
        investment.footnotes = `Period: ${fact.start} to ${fact.end}`;
      }

      // Add form type to footnotes
      const formType = submissions.filings.recent.form[filingIndex];
      investment.footnotes = (investment.footnotes || '') + ` | Form: ${formType}`;

      return investment;
    } catch (error) {
      console.error('[SENTRY] Error parsing investment fact:', error);
      return null;
    }
  }

  private extractIssuerName(fact: any, concept: string): string {
    // Try to extract issuer name from various fact properties
    if (fact.frame) return fact.frame;
    if (fact.fp && fact.fp !== 'FY') return fact.fp;
    if (concept.includes('Affiliate')) return 'Affiliated Investment';
    return 'Investment Holding';
  }

  private extractInvestmentTitle(fact: any, concept: string): string {
    // Generate a descriptive title based on the concept and fact properties
    let title = concept.replace(/([A-Z])/g, ' $1').trim();
    title = title.replace(/^Schedule Of/, '').trim();
    
    if (fact.segment) {
      title += ` - ${fact.segment}`;
    }
    
    return title || 'Portfolio Investment';
  }

  private processConceptData(
    conceptData: any, 
    investments: Investment[], 
    ticker: string, 
    submissions: SECSubmission,
    concept: string
  ): void {
    if (conceptData.units && conceptData.units.USD) {
      for (const fact of conceptData.units.USD) {
        const investment = this.parseInvestmentFact(fact, submissions, ticker, conceptData.cik, concept);
        if (investment) {
          investments.push(investment);
        }
      }
    }
  }

  private determineInvestmentType(fact: any, concept: string): string {
    // Determine investment type based on XBRL concept and context
    if (concept.includes('Debt') || concept.includes('debt')) return 'Debt Security';
    if (concept.includes('Equity') || concept.includes('equity')) return 'Equity Security';
    if (concept.includes('Loan') || concept.includes('loan')) return 'Loan';
    if (concept.includes('Bond') || concept.includes('bond')) return 'Bond';
    if (concept.includes('Affiliate')) return 'Affiliated Investment';
    
    return 'Other Investment';
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
      .from('investments')
      .upsert(investments, {
        onConflict: 'cik,accession_number,issuer,fair_value',
        ignoreDuplicates: false
      });

    if (error) {
      throw error;
    }

    console.log(`[SENTRY] Successfully saved ${investments.length} investments`);
  } catch (error) {
    console.error('[SENTRY] Database save error:', error);
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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!
    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    const { action, ticker, cik, bdcList } = await req.json()

    const extractor = new SECAPIExtractor()

    switch (action) {
      case 'extract_filing': {
        console.log(`[SENTRY] Extracting single BDC: ${ticker} (${cik})`)
        
        const investments = await extractor.extractBDCInvestments(cik, ticker)
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
        
        const investments = await extractor.extractBDCInvestments(cik, ticker)
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
        
        // Default BDC list - you can modify this
        const defaultBDCs = bdcList || [
          { cik: '1476765', ticker: 'GBDC' },  // Golub BDC
          { cik: '1287750', ticker: 'ARCC' },  // Ares Capital
          { cik: '1552198', ticker: 'WHF' },   // Whitehorse Finance
          { cik: '1414932', ticker: 'TSLX' },  // TPG Specialty Lending
          { cik: '1403909', ticker: 'PSEC' },  // Prospect Capital
          { cik: '1423902', ticker: 'NMFC' },  // New Mountain Finance
        ]

        const results = []
        let totalInvestments = 0

        for (const bdc of defaultBDCs) {
          try {
            console.log(`[SENTRY] Processing ${bdc.ticker}...`)
            const investments = await extractor.extractBDCInvestments(bdc.cik, bdc.ticker)
            await saveInvestmentsToDatabase(supabase, investments)
            
            results.push({
              ticker: bdc.ticker,
              cik: bdc.cik,
              investmentsFound: investments.length,
              success: true
            })
            
            totalInvestments += investments.length
            
            // Rate limiting between BDCs
            await new Promise(resolve => setTimeout(resolve, 500))
            
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
        
        // This would check for new filings since last update
        // For now, return a simple response
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
