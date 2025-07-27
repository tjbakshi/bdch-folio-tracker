import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12';

// Helper functions
function cleanTextValue(value: string): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').replace(/["']/g, '').trim();
}

function parseNumericValue(value: string): number | undefined {
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

function parseDateValue(value: string): string | undefined {
  if (!value || value.trim() === '') {
    return undefined;
  }
  
  try {
    const date = new Date(value.trim());
    if (isNaN(date.getTime())) {
      return undefined;
    }
    return date.toISOString().split('T')[0];
  } catch {
    return undefined;
  }
}

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

function extractColumnMapping($: any, table: any): { [key: string]: number } {
  const mapping: { [key: string]: number } = {};
  
  let headerRow = $(table).find('thead tr').first();
  if (headerRow.length === 0) {
    headerRow = $(table).find('tr').first();
  }
  
  // Debug: Log actual headers found
  console.log("[SENTRY] Found headers:");
  headerRow.find('th, td').each((index: number, cell: any) => {
    const headerText = $(cell).text().trim();
    console.log(`[SENTRY] Column ${index}: "${headerText}"`);
  });
  
  headerRow.find('th, td').each((index: number, cell: any) => {
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

// Enhanced BDC Table Parser
export class BDCTableParser {
  private $: any;
  
  constructor(htmlContent: string) {
    this.$ = cheerio.load(htmlContent);
  }

  parseInvestmentTables(): any[] {
    console.log("[SENTRY] Starting enhanced HTML table parsing...");
    
    const investments: any[] = [];
    const $ = this.$;
    
    // Find tables with investment indicators - limit to first 5 tables for performance
    $('table').each((i: number, table: any) => {
      if (i >= 5) return false; // Only process first 5 tables
      
      const score = getTableHeaderScore($, table);
      console.log(`[SENTRY] Table ${i + 1} score: ${score}`);
      
      if (score >= 3) { // Use lower threshold since we have better logic
        console.log(`[SENTRY] Processing investment table ${i + 1}`);
        
        // Check if this table has "schedule of investments" context
        const tableContext = $(table).prev().text() + $(table).parent().prev().text();
        const hasScheduleContext = /schedule\s+of\s+investments|consolidated\s+schedule/i.test(tableContext);
        
        if (hasScheduleContext || score >= 4) {
          const tableInvestments = this.parseTable(table);
          investments.push(...tableInvestments);
          console.log(`[SENTRY] Extracted ${tableInvestments.length} investments from table ${i + 1}`);
        }
      }
    });
    
    console.log(`[SENTRY] Total investments extracted: ${investments.length}`);
    return investments;
  }

  private parseTable(table: any): any[] {
    const $ = this.$;
    const investments: any[] = [];
    
    // Get column mapping
    const mapping = extractColumnMapping($, table);
    console.log("[SENTRY] Column mapping:", Object.keys(mapping));
    
    // Lowered threshold from 2 to 1
    if (Object.keys(mapping).length < 1) {
      console.log("[SENTRY] Insufficient column mapping, skipping table");
      return [];
    }
    
    // Parse each data row - limit to first 50 rows for performance
    let rowCount = 0;
    $(table).find('tr').each((index: number, row: any) => {
      if (index === 0) return; // Skip header row
      if (rowCount >= 50) return false; // Limit rows processed
      
      const cells = $(row).find('td');
      if (cells.length < 3) return; // Skip rows with too few cells
      
      // Skip total/summary rows
      const rowText = $(row).text().toLowerCase();
      if (/total|subtotal|^[\s\-—$,\d().%]+$/i.test(rowText.trim())) {
        return; // Skip this row
      }
      
      // Extract data
      const investment = this.extractInvestmentFromRow($, cells, mapping);
      
      if (investment && this.isValidInvestment(investment)) {
        investments.push(investment);
        console.log(`[SENTRY] Found investment: ${investment.company}`);
      }
      
      rowCount++;
    });
    
    return investments;
  }

  private extractInvestmentFromRow($: any, cells: any, mapping: any): any {
    const investment: any = {};
    
    // Extract company name
    if (mapping.company_name !== undefined) {
      const companyText = $(cells).eq(mapping.company_name).text();
      investment.company = cleanTextValue(companyText.replace(/\(\d+\)|\*+|†+/g, ''));
    }
    
    // Extract business description
    if (mapping.business_description !== undefined) {
      investment.business_description = cleanTextValue($(cells).eq(mapping.business_description).text());
    }
    
    // Extract investment tranche/type
    if (mapping.investment_tranche !== undefined) {
      investment.investment_type = cleanTextValue($(cells).eq(mapping.investment_tranche).text());
    }
    
    // Extract coupon
    if (mapping.coupon !== undefined) {
      investment.coupon = cleanTextValue($(cells).eq(mapping.coupon).text());
    }
    
    // Extract spread
    if (mapping.spread !== undefined) {
      investment.spread = cleanTextValue($(cells).eq(mapping.spread).text());
    }
    
    // Extract principal amount
    if (mapping.principal_amount !== undefined) {
      investment.principal = parseNumericValue($(cells).eq(mapping.principal_amount).text());
    }
    
    // Extract amortized cost
    if (mapping.amortized_cost !== undefined) {
      investment.amortized_cost = parseNumericValue($(cells).eq(mapping.amortized_cost).text());
    }
    
    // Extract fair value
    if (mapping.fair_value !== undefined) {
      investment.fair_value = parseNumericValue($(cells).eq(mapping.fair_value).text());
    }
    
    // Extract acquisition date
    if (mapping.acquisition_date !== undefined) {
      investment.acquisition_date = parseDateValue($(cells).eq(mapping.acquisition_date).text());
    }
    
    // If no specific mappings found, try to extract from first few columns as fallback
    if (Object.keys(mapping).length === 0 && cells.length >= 3) {
      console.log("[SENTRY] No column mapping, trying fallback extraction");
      
      // Assume first column is company, last few are amounts
      const firstCol = cleanTextValue($(cells).eq(0).text());
      const lastCol = parseNumericValue($(cells).eq(cells.length - 1).text());
      const secondLastCol = parseNumericValue($(cells).eq(cells.length - 2).text());
      
      if (firstCol && firstCol.length > 2 && (lastCol || secondLastCol)) {
        investment.company = firstCol;
        investment.fair_value = lastCol || secondLastCol;
      }
    }
    
    return investment;
  }

  private isValidInvestment(investment: any): boolean {
    return !!(investment.company && 
             investment.company.trim() &&
             investment.company.length > 1 &&
             (investment.fair_value || investment.amortized_cost || investment.principal));
  }
}

// Main export function
export function parseScheduleOfInvestments(htmlContent: string): any[] {
  console.log("[SENTRY] Starting parseScheduleOfInvestments...");
  
  try {
    const parser = new BDCTableParser(htmlContent);
    return parser.parseInvestmentTables();
  } catch (error) {
    console.log("[SENTRY] Error in parseScheduleOfInvestments:", error);
    return [];
  }
}
