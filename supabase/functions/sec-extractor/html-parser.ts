import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12';

// Simplified BDC Table Parser - focus on finding data, not headers
export class BDCTableParser {
  private $: any;
  
  constructor(htmlContent: string) {
    this.$ = cheerio.load(htmlContent);
  }

  parseInvestmentTables(): any[] {
    console.log("[SENTRY] Starting simplified HTML table parsing...");
    
    const investments: any[] = [];
    const $ = this.$;
    
    // Look for tables with investment-like content (limit to first 3 tables)
    $('table').slice(0, 3).each((i: number, table: any) => {
      console.log(`[SENTRY] Processing table ${i + 1}`);
      
      const tableInvestments = this.extractInvestmentsFromTable(table);
      if (tableInvestments.length > 0) {
        investments.push(...tableInvestments);
        console.log(`[SENTRY] Found ${tableInvestments.length} investments in table ${i + 1}`);
      }
    });
    
    console.log(`[SENTRY] Total investments extracted: ${investments.length}`);
    return investments;
  }

  private extractInvestmentsFromTable(table: any): any[] {
    const $ = this.$;
    const investments: any[] = [];
    
    // Look through all rows for investment data
    $(table).find('tr').slice(1, 51).each((index: number, row: any) => { // Skip first row, limit to 50 rows
      try {
        const cells = $(row).find('td');
        if (cells.length < 3) return; // Need at least 3 columns
        
        const rowText = $(row).text().toLowerCase();
        
        // Skip obviously non-investment rows
        if (/total|subtotal|^[\s\-—$,\d().%]+$/i.test(rowText.trim()) || rowText.length < 10) {
          return;
        }
        
        // Try to find company name and dollar amounts
        let companyName = '';
        let fairValue = 0;
        
        // Look through cells for company name (first non-empty text that looks like a company)
        for (let i = 0; i < Math.min(cells.length, 5); i++) {
          const cellText = $(cells).eq(i).text().trim();
          if (cellText && cellText.length > 3 && cellText.length < 100 && /^[A-Z]/.test(cellText)) {
            companyName = cellText.replace(/\(\d+\)|\*+|†+/g, '').trim();
            break;
          }
        }
        
        // Look through cells for dollar amounts (check last few columns)
        for (let i = Math.max(0, cells.length - 5); i < cells.length; i++) {
          const cellText = $(cells).eq(i).text().trim();
          const amount = this.parseNumber(cellText);
          if (amount && amount > 1000) {
            fairValue = amount;
            break;
          }
        }
        
        // If we found both company name and amount, create investment
        if (companyName && fairValue && companyName.length > 2) {
          const investment = {
            company: companyName,
            fair_value: fairValue,
            business_description: '',
            investment_type: 'Investment',
            coupon: '',
            spread: '',
            acquisition_date: '',
            maturity_date: '',
            principal: fairValue,
            amortized_cost: fairValue
          };
          
          investments.push(investment);
          console.log(`[SENTRY] Found: ${companyName} = $${fairValue.toLocaleString()}`);
          
          if (investments.length >= 20) return false; // Limit per table
        }
      } catch (error) {
        console.log(`[SENTRY] Error processing row: ${error}`);
      }
    });
    
    return investments;
  }

  private parseNumber(text: string): number | undefined {
    if (!text) return undefined;
    
    // Remove common formatting
    let cleaned = text.replace(/[$,\s]/g, '');
    
    // Handle negative values in parentheses
    const isNegative = /^\(.*\)$/.test(cleaned);
    if (isNegative) {
      cleaned = cleaned.replace(/[()]/g, '');
    }
    
    const num = parseFloat(cleaned);
    if (isNaN(num)) return undefined;
    
    let result = isNegative ? -num : num;
    
    // If number seems too small, assume it's in thousands
    if (result > 0 && result < 100000) {
      result = result * 1000;
    }
    
    return result;
  }
}

// Main export function
export function parseScheduleOfInvestments(htmlContent: string): any[] {
  console.log("[SENTRY] Starting simplified parseScheduleOfInvestments...");
  
  try {
    const parser = new BDCTableParser(htmlContent);
    return parser.parseInvestmentTables();
  } catch (error) {
    console.log("[SENTRY] Error in parseScheduleOfInvestments:", error);
    return [];
  }
}
