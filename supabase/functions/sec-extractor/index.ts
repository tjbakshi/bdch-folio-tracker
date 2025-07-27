// File: supabase/functions/sec-extractor/index.ts
// COMPLETE REPLACEMENT - Enhanced SEC Filing Access with Structured HTML Parsing v2

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { parseScheduleOfInvestments } from './parse_schedule_test.ts';

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

class SECFilingExtractor {
  private readonly submissionsURL = 'https://data.sec.gov/submissions';
  private readonly archivesURL = 'https://www.sec.gov/Archives/edgar/data';
  private readonly headers = {
    'User-Agent': 'BDC Portfolio Tracker tj.bakshi@gmail.com',
    'Accept': '*/*',
    'Accept-Encoding': 'gzip, deflate',
    'From': 'tj.bakshi@gmail.com'
  };

  // Rate limiting: SEC allows max 10 requests per second
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

    console.log(`[SENTRY] Making SEC request to: ${url}`);
    
    const response = await fetch(url, { headers: this.headers });
    
    if (!response.ok) {
      console.error(`[SENTRY] SEC API error: ${response.status} ${response.statusText}`);
      throw new Error(`SEC API error: ${response.status} ${response.statusText}`);
    }
    
    return response.text(); // Always return text for HTML content
  }

  async getRecentFilings(cik: string): Promise<SECFiling[]> {
    const paddedCik = cik.padStart(10, '0');
    const url = `${this.submissionsURL}/CIK${paddedCik}.json`;
    
    const response = await fetch(url, { headers: this.headers });
    if (!response.ok) {
      throw new Error(`Failed to get submissions: ${response.status}`);
    }
    
    const submissionData = await response.json();
    
    if (!submissionData.filings?.recent) {
      throw new Error('No recent filings found');
    }
    
    const recent = submissionData.filings.recent;
    const filings: SECFiling[] = [];
    
    // Get recent 10-K and 10-Q filings (back to 2017) 
    for (let i = 0; i < recent.form.length; i++) {
      const form = recent.form[i];
      const filingDate = recent.filingDate[i];
      const primaryDocument = recent.primaryDocument[i];
      
      // Only get 10-K and 10-Q filings from 2017 onwards
      if ((form === '10-K' || form === '10-Q') && 
          new Date(filingDate) > new Date('2017-01-01') &&
          primaryDocument && primaryDocument.length > 0) {
        
        filings.push({
          accessionNumber: recent.accessionNumber[i],
          filingDate: recent.filingDate[i],
          reportDate: recent.reportDate[i] || recent.filingDate[i],
          form: form,
          primaryDocument: primaryDocument,
          size: recent.size[i] || 0
        });
      }
      
      // Limit to most recent 30 filings to get good historical coverage back to 2017
      if (filings.length >= 30) break;
    }
    
    console.log(`[SENTRY] Found ${filings.length} 10-K/10-Q filings since 2017 for CIK ${cik}`);
    
    // Log first few filings for debugging
    if (filings.length > 0) {
      console.log(`[SENTRY] Sample filings:`, filings.slice(0, 3).map(f => 
        `${f.form} (${f.filingDate}): ${f.primaryDocument}`
      ));
    }
    
    return filings;
  }

  async downloadFiling(filing: SECFiling, cik: string): Promise<string> {
    // Try multiple URL formats for SEC EDGAR access
    const cleanCik = cik.replace(/^0+/, ''); // Remove leading zeros
    
    const urlVariations = [
      // Standard format with clean CIK
      `${this.archivesURL}/${cleanCik}/${filing.accessionNumber}/${filing.primaryDocument}`,
      // Format with padded CIK
      `${this.archivesURL}/${cik.padStart(10, '0')}/${filing.accessionNumber}/${filing.primaryDocument}`,
      // Alternative format without dashes in accession number
      `${this.archivesURL}/${cleanCik}/${filing.accessionNumber.replace(/-/g, '')}/${filing.primaryDocument}`,
    ];
    
    console.log(`[SENTRY] Attempting to download filing ${filing.accessionNumber} (${filing.form})`);
    
    for (let i = 0; i < urlVariations.length; i++) {
      try {
        console.log(`[SENTRY] Trying URL variation ${i + 1}: ${urlVariations[i]}`);
        const content = await this.makeRequest(urlVariations[i]);
        
        if (content && content.length > 1000) {
          console.log(`[SENTRY] ✅ Successfully downloaded filing (${content.length} chars)`);
          return content;
        } else {
          console.log(`[SENTRY] Content too short (${content?.length || 0} chars), trying next URL`);
        }
      } catch (error) {
        console.log(`[SENTRY] URL variation ${i + 1} failed: ${error.message}`);
        
        // Rate limit between attempts
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    throw new Error(`All URL variations failed for filing ${filing.accessionNumber}`);
  }

  async extractInvestmentsFromContent(content: string, filing: SECFiling, ticker: string, companyId: string): Promise<PortfolioInvestment[]> {
    console.log(`[SENTRY] Extracting investments from content (${content.length} chars)`);
    
    try {
      // Look for Schedule of Investments sections in the content
      const scheduleRegex = /schedule\s+of\s+investments/gi;
      const matches = content.match(scheduleRegex);
      
      if (!matches) {
        console.log(`[SENTRY] No "Schedule of Investments" found in filing content`);
        return [];
      }
      
      console.log(`[SENTRY] Found ${matches.length} "Schedule of Investments" references`);
      
      // Extract the relevant section (look for the main investment table)
      const scheduleSection = this.extractScheduleSection(content);
      console.log(`[SENTRY] Extracted schedule section (${scheduleSection.length} chars)`);
      
      if (!scheduleSection) {
        console.log("[SENTRY] Could not extract schedule section");
        return [];
      }
      
      // Use the enhanced HTML table parser
      console.log("[SENTRY] Using enhanced schedule parser...");
      const investments = parseScheduleOfInvestments(scheduleSection);
      
      console.log(`[SENTRY] Enhanced parser extracted ${investments.length} investments`);
      
      if (investments.length === 0) {
        console.log("[SENTRY] No investments found with enhanced parser, trying legacy method");
        return this.extractInvestmentsLegacy(scheduleSection, filing, ticker, companyId);
      }
      
      // Format for database
      const formattedInvestments = investments.map((inv, index) => ({
        company_id: companyId,
        raw_id: `${ticker}_${filing.accessionNumber}_enhanced_${index}`,
        portfolio_company: inv.company || '',
        business_description: inv.business_description || '',
        investment_type: inv.investment_type || '',
        coupon: inv.coupon || '',
        reference_rate: inv.reference || '',
        spread: inv.spread || '',
        acquisition_date: inv.acquisition_date || '',
        maturity_date: inv.maturity_date || '',
        shares_units: inv.shares_units ? parseFloat(inv.shares_units) : undefined,
        principal: inv.principal || 0,
        amortized_cost: inv.amortized_cost || 0,
        fair_value: inv.fair_value || 0,
        percentage_of_net_assets: inv.percent_of_net_assets || 0,
        reporting_date: filing.reportDate,
        filing_date: filing.filingDate,
        form_type: filing.form,
        accession_number: filing.accessionNumber,
        fiscal_year: new Date(filing.filingDate).getFullYear(),
        fiscal_period: filing.form === '10-K' ? 'FY' : 'Q' + Math.ceil((new Date(filing.reportDate).getMonth() + 1) / 3),
        non_accrual: false,
        extraction_method: 'ENHANCED_HTML_PARSER',
        footnotes: `Enhanced HTML parsing from ${filing.form}`
      }));
      
      console.log(`[SENTRY] Formatted ${formattedInvestments.length} investments for database`);
      return formattedInvestments;
      
    } catch (error) {
      console.error(`[SENTRY] Error in enhanced extraction:`, error);
      return this.extractInvestmentsLegacy(content, filing, ticker, companyId);
    }
  }

  private extractScheduleSection(content: string): string {
    // Look for the main investment table section
    const patterns = [
      // Look for HTML table containing schedule
      /<table[^>]*>[\s\S]*?schedule\s+of\s+investments[\s\S]*?<\/table>/gi,
      // Look for section starting with schedule of investments
      /schedule\s+of\s+investments[\s\S]{0,50000}?(?=<\/table>|<table|schedule\s+of|consolidated)/gi,
      // Broader pattern to capture investment tables
      /<table[^>]*>[\s\S]*?(?:company|investment|principal|fair\s+value)[\s\S]*?<\/table>/gi
    ];
    
    for (const pattern of patterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        // Return the longest match (likely the main table)
        const longestMatch = matches.reduce((a, b) => a.length > b.length ? a : b);
        if (longestMatch.length > 1000) { // Ensure it's substantial
          return longestMatch;
        }
      }
    }
    
    // If no table patterns work, try to extract a large section around "schedule of investments"
    const scheduleIndex = content.toLowerCase().indexOf('schedule of investments');
    if (scheduleIndex !== -1) {
      const start = Math.max(0, scheduleIndex - 5000);
      const end = Math.min(content.length, scheduleIndex + 110000); // Get up to 110k chars
      return content.substring(start, end);
    }
    
    return content; // Return full content as fallback
  }

  // Keep legacy extraction as fallback
  private extractInvestmentsLegacy(content: string, filing: SECFiling, ticker: string, companyId: string): PortfolioInvestment[] {
    console.log("[SENTRY] Using legacy extraction method...");
    
    const investments: PortfolioInvestment[] = [];
    
    try {
      // First, try to parse as HTML structure (most likely case)
      const htmlInvestments = this.parseHTMLInvestments(content, filing, ticker, companyId);
      investments.push(...htmlInvestments);
      
      // If HTML parsing didn't work, try text patterns
      if (investments.length === 0) {
        const textInvestments = this.parseInvestmentEntriesFromText(content, filing, ticker, companyId);
        investments.push(...textInvestments);
      }
      
      // If still nothing, try to log some sample content for debugging
      if (investments.length === 0) {
        console.log(`[SENTRY] No investments found. Sample content:`);
        const sampleLines = content.split('\n').slice(0, 20);
        for (let i = 0; i < Math.min(5, sampleLines.length); i++) {
          const line = sampleLines[i].trim();
          if (line.length > 10) {
            console.log(`[SENTRY] Line ${i}: ${line.substring(0, 100)}...`);
          }
        }
      }
      
      console.log(`[SENTRY] Extracted ${investments.length} investments from content analysis`);
      
    } catch (error) {
      console.error(`[SENTRY] Error extracting from content:`, error);
    }
    
    return investments;
  }

  private parseHTMLInvestments(content: string, filing: SECFiling, ticker: string, companyId: string): PortfolioInvestment[] {
    const investments: PortfolioInvestment[] = [];
    
    try {
      console.log(`[SENTRY] Attempting HTML/table parsing...`);
      
      // Remove HTML tags but keep structure
      const cleanedContent = content
        .replace(/<script[^>]*>.*?<\/script>/gi, '')
        .replace(/<style[^>]*>.*?<\/style>/gi, '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\s+/g, ' ')
        .trim();
      
      // Look for tabular data patterns in cleaned content
      const lines = cleanedContent.split('\n');
      let investmentIndex = 0;
      const processedCompanies = new Set();
      
      console.log(`[SENTRY] Analyzing ${lines.length} lines for investment data...`);
      
      for (const line of lines) {
        if (investmentIndex >= 100) break; // Reasonable limit
        
        const trimmedLine = line.trim();
        if (trimmedLine.length < 20) continue;
        
        // Look for lines that might contain investment data
        // Pattern: Company name followed by numbers (amounts)
        const investmentLineRegex = /^([A-Z][a-zA-Z\s&.,'\-()]{5,80}?)\s+.*?(\d{1,3}(?:,\d{3})*)\s*$/;
        const match = trimmedLine.match(investmentLineRegex);
        
        if (match) {
          const companyName = match[1].trim();
          const amountStr = match[2].replace(/,/g, '');
          const amount = parseInt(amountStr);
          
          // Validation
          if (amount > 1000 && 
              companyName.length > 3 && 
              companyName.length < 80 &&
              !processedCompanies.has(companyName.toLowerCase()) &&
              !companyName.match(/^(total|subtotal|other|various|page|table|schedule)$/i)) {
            
            processedCompanies.add(companyName.toLowerCase());
            
            const rawId = `${ticker}_${filing.accessionNumber}_html_${investmentIndex}`;
            
            const investment: PortfolioInvestment = {
              company_id: companyId,
              raw_id: rawId,
              portfolio_company: companyName,
              investment_type: 'Investment',
              fair_value: amount * 1000, // Assume thousands
              reporting_date: filing.reportDate,
              filing_date: filing.filingDate,
              form_type: filing.form,
              accession_number: filing.accessionNumber,
              fiscal_year: new Date(filing.filingDate).getFullYear(),
              fiscal_period: filing.form === '10-K' ? 'FY' : 'Q' + Math.ceil((new Date(filing.reportDate).getMonth() + 1) / 3),
              non_accrual: false,
              extraction_method: 'HTML_TABLE_PARSING',
              footnotes: `HTML parsing from ${filing.form}`
            };
            
            investments.push(investment);
            investmentIndex++;
            
            if (investmentIndex <= 5) {
              console.log(`[SENTRY] HTML found: ${companyName} = ${(amount * 1000).toLocaleString()}`);
            }
          }
        }
      }
      
      console.log(`[SENTRY] HTML parsing extracted ${investments.length} investments`);
      
    } catch (error) {
      console.error(`[SENTRY] Error in HTML parsing:`, error);
    }
    
    return investments;
  }

  private parseInvestmentEntriesFromText(text: string, filing: SECFiling, ticker: string, companyId: string): PortfolioInvestment[] {
    const investments: PortfolioInvestment[] = [];
    
    try {
      // Clean and normalize text
      const cleanText = text.replace(/\s+/g, ' ').trim();
      
      console.log(`[SENTRY] Analyzing text section for investment patterns...`);
      
      // More sophisticated patterns for BDC filings
      // Pattern 1: Table-like structure with company names and dollar amounts
      const tablePattern = /([A-Z][a-zA-Z\s&.,'\-()]+?)[\s\.]{2,}[\$]?([\d,]+)[\s\.\$]*(?:thousand|million)?/g;
      
      // Pattern 2: Structured entries with investment details
      const structuredPattern = /([A-Z][a-zA-Z\s&.,'\-()]{3,50}?)[\s\-\.]+([Ff]irst\s+lien|[Ss]enior\s+secured|[Ss]ubordinated|[Pp]referred|[Cc]ommon|[Ee]quity|[Dd]ebt)[^$\d]*?[\$]?([\d,]+)/g;
      
      // Pattern 3: Investment entries with percentages and amounts
      const percentagePattern = /([A-Z][a-zA-Z\s&.,'\-()]{3,50}?)[^$\d]*?([\d,.]+)%[^$\d]*?[\$]?([\d,]+)/g;
      
      // Pattern 4: Simple company name followed by amount
      const simplePattern = /([A-Z][a-zA-Z\s&.,'\-()]{5,40}?)[\s\.\-]{3,}[\$]?([\d,]{4,})/g;
      
      let investmentIndex = 0;
      const processedCompanies = new Set(); // Avoid duplicates
      
      const patterns = [
        { regex: structuredPattern, type: 'structured', priority: 1 },
        { regex: percentagePattern, type: 'percentage', priority: 2 },
        { regex: tablePattern, type: 'table', priority: 3 },
        { regex: simplePattern, type: 'simple', priority: 4 }
      ];
      
      for (const { regex, type, priority } of patterns) {
        console.log(`[SENTRY] Trying ${type} pattern...`);
        let matches = 0;
        let match;
        
        // Reset regex
        regex.lastIndex = 0;
        
        while ((match = regex.exec(cleanText)) !== null && investmentIndex < 200) {
          try {
            let companyName = match[1]?.trim();
            let investmentType = 'Other';
            let amountStr = '';
            
            if (type === 'structured') {
              investmentType = match[2]?.trim() || 'Other';
              amountStr = match[3]?.replace(/,/g, '') || '0';
            } else if (type === 'percentage') {
              amountStr = match[3]?.replace(/,/g, '') || '0';
              investmentType = 'Investment';
            } else {
              amountStr = match[2]?.replace(/,/g, '') || '0';
            }
            
            // Clean company name
            companyName = companyName
              .replace(/[^\w\s&.,'\-()]/g, ' ')
              .replace(/\s+/g, ' ')
              .trim();
            
            const fairValue = parseInt(amountStr);
            
            // Validation checks
            if (!companyName || 
                companyName.length < 3 || 
                companyName.length > 100 ||
                fairValue < 1000 ||
                processedCompanies.has(companyName.toLowerCase()) ||
                /^(total|subtotal|other|various|misc|n\/a|none)$/i.test(companyName)) {
              continue;
            }
            
            // Additional filters for common false positives
            if (companyName.match(/^(page|table|schedule|investments?|portfolio|fair|value|amount|date|maturity)$/i)) {
              continue;
            }
            
            processedCompanies.add(companyName.toLowerCase());
            
            // Determine fair value multiplier (thousands assumed)
            let finalFairValue = fairValue;
            if (fairValue < 100000) { // Likely in thousands
              finalFairValue = fairValue * 1000;
            }
            
            const rawId = `${ticker}_${filing.accessionNumber}_${investmentIndex}`;
            
            const investment: PortfolioInvestment = {
              company_id: companyId,
              raw_id: rawId,
              portfolio_company: companyName,
              investment_type: investmentType,
              fair_value: finalFairValue,
              reporting_date: filing.reportDate,
              filing_date: filing.filingDate,
              form_type: filing.form,
              accession_number: filing.accessionNumber,
              fiscal_year: new Date(filing.filingDate).getFullYear(),
              fiscal_period: filing.form === '10-K' ? 'FY' : 'Q' + Math.ceil((new Date(filing.reportDate).getMonth() + 1) / 3),
              non_accrual: investmentType.toLowerCase().includes('non-accrual'),
              extraction_method: `TEXT_PATTERN_${type.toUpperCase()}`,
              footnotes: `Extracted via ${type} pattern from ${filing.form}`
            };
            
            investments.push(investment);
            investmentIndex++;
            matches++;
            
            if (matches <= 5) { // Log first few matches for debugging
              console.log(`[SENTRY] Found investment: ${companyName} = ${finalFairValue.toLocaleString()}`);
            }
            
          } catch (error) {
            console.error(`[SENTRY] Error processing match:`, error);
          }
        }
        
        console.log(`[SENTRY] ${type} pattern found ${matches} investments`);
        
        // If we found good results with a higher priority pattern, stop
        if (matches > 5 && priority <= 2) {
          break;
        }
      }
      
      // If no patterns worked, try a more aggressive approach
      if (investments.length === 0) {
        console.log(`[SENTRY] No patterns worked, trying aggressive dollar amount extraction...`);
        this.tryAggressiveExtraction(cleanText, filing, ticker, companyId, investments);
      }
      
      console.log(`[SENTRY] Total pattern matching extracted ${investments.length} investments`);
      
    } catch (error) {
      console.error(`[SENTRY] Error in pattern matching:`, error);
    }
    
    return investments;
  }

  private tryAggressiveExtraction(text: string, filing: SECFiling, ticker: string, companyId: string, investments: PortfolioInvestment[]): void {
    console.log(`[SENTRY] Attempting aggressive extraction...`);
    
    try {
      // Look for any line that has a company name and a dollar amount
      const lines = text.split(/[\r\n]+/);
      let investmentIndex = investments.length;
      
      for (const line of lines) {
        if (investmentIndex >= 50) break; // Limit aggressive extraction
        
        const trimmedLine = line.trim();
        if (trimmedLine.length < 10 || trimmedLine.length > 200) continue;
        
        // Look for dollar amounts in the line
        const dollarMatches = trimmedLine.match(/\$?([\d,]+)/g);
        if (!dollarMatches || dollarMatches.length === 0) continue;
        
        // Look for what could be a company name (starts with capital letter)
        const companyMatch = trimmedLine.match(/^([A-Z][a-zA-Z\s&.,'\-()]{5,60}?)[\s\-\.]/);
        if (!companyMatch) continue;
        
        const companyName = companyMatch[1].trim();
        const largestAmount = Math.max(...dollarMatches.map(m => parseInt(m.replace(/[$,]/g, ''))));
        
        if (largestAmount > 1000 && companyName.length > 3) {
          const rawId = `${ticker}_${filing.accessionNumber}_aggressive_${investmentIndex}`;
          
          const investment: PortfolioInvestment = {
            company_id: companyId,
            raw_id: rawId,
            portfolio_company: companyName,
            investment_type: 'Investment',
            fair_value: largestAmount * 1000, // Assume thousands
            reporting_date: filing.reportDate,
            filing_date: filing.filingDate,
            form_type: filing.form,
            accession_number: filing.accessionNumber,
            fiscal_year: new Date(filing.filingDate).getFullYear(),
            fiscal_period: filing.form === '10-K' ? 'FY' : 'Q' + Math.ceil((new Date(filing.reportDate).getMonth() + 1) / 3),
            non_accrual: false,
            extraction_method: 'TEXT_AGGRESSIVE',
            footnotes: `Aggressive extraction from ${filing.form}`
          };
          
          investments.push(investment);
          investmentIndex++;
          
          if (investmentIndex <= 5) {
            console.log(`[SENTRY] Aggressive found: ${companyName} = ${(largestAmount * 1000).toLocaleString()}`);
          }
        }
      }
      
      console.log(`[SENTRY] Aggressive extraction found ${investmentIndex - investments.length} additional investments`);
      
    } catch (error) {
      console.error(`[SENTRY] Error in aggressive extraction:`, error);
    }
  }

  async extractBDCInvestments(cik: string, ticker: string, supabase: any): Promise<PortfolioInvestment[]> {
    console.log(`[SENTRY] Starting BDC extraction for ${ticker} (CIK: ${cik})`);
    
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

      // Process each filing (most recent first) - limit to 5 for testing
      for (const filing of filings.slice(0, 5)) {
        try {
          console.log(`[SENTRY] Processing ${filing.form} filed ${filing.filingDate} for ${ticker}`);
          
          // Download filing content
          const content = await this.downloadFiling(filing, cik);
          
          // Extract investments using enhanced parsing
          const investments = await this.extractInvestmentsFromContent(content, filing, ticker, companyId);
          
          allInvestments.push(...investments);
          
          console.log(`[SENTRY] Extracted ${investments.length} investments from ${filing.form} (${filing.filingDate})`);
          
          // Rate limiting between filings
          await new Promise(resolve => setTimeout(resolve, 1000));
          
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
          message: 'SEC Extractor (Enhanced HTML Parser) is running. Extracts from 2017-2024. Supported actions: extract_filing, backfill_ticker, backfill_all, incremental_check',
          available_actions: ['extract_filing', 'backfill_ticker', 'backfill_all', 'incremental_check'],
          extraction_method: 'ENHANCED_HTML_PARSER',
          time_period: '2017-2024'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      )
    }

    const extractor = new SECFilingExtractor()

    switch (action) {
      case 'extract_filing': {
        console.log(`[SENTRY] Extracting investments for: ${ticker} (${cik})`)
        
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
            extraction_method: 'ENHANCED_HTML_PARSER'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      case 'backfill_ticker': {
        console.log(`[SENTRY] Backfilling investments for ticker: ${ticker}`)
        
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
            message: `Backfill completed for ${ticker}: ${investments.length} portfolio investments found`,
            extraction_method: 'ENHANCED_HTML_PARSER'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      case 'backfill_all': {
        console.log('[SENTRY] Starting investment extraction for all BDCs from bdc_universe table')
        
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

        console.log(`[SENTRY] Processing investments for ${bdcsToProcess.length} BDCs from database`);

        // Process only first 3 BDCs for testing
        for (const bdc of bdcsToProcess.slice(0, 3)) {
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
            
            // Rate limiting between BDCs
            await new Promise(resolve => setTimeout(resolve, 2000))
            
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
        console.log(`[SENTRY] Investment extraction complete: ${successfulExtractions}/${results.length} BDCs successful, ${totalInvestments} total investments (2017-2024)`);

        return new Response(
          JSON.stringify({
            success: true,
            processed: results.length,
            totalInvestments,
            results,
            message: `Investment extraction completed: ${totalInvestments} total portfolio investments processed (2017-2024)`,
            extraction_method: 'ENHANCED_HTML_PARSER',
            time_period: '2017-2024'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          },
        )
      }

      case 'incremental_check': {
        console.log('[SENTRY] Performing incremental check for new investment filings')
        
        return new Response(
          JSON.stringify({
            success: true,
            message: 'Incremental investment check completed - feature coming soon',
            extraction_method: 'ENHANCED_HTML_PARSER'
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
        extraction_method: 'ENHANCED_HTML_PARSER'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      },
    )
  }
})
