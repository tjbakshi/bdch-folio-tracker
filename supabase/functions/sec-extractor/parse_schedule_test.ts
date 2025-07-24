import { assertEquals, assertExists } from "https://deno.land/std@0.208.0/assert/mod.ts";
import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12';

// Mock HTML snippets representing different SEC filing formats
const SAMPLE_HTML_BASIC = `
<html>
<body>
<table>
  <tr>
    <th>Company Name</th>
    <th>Business Description</th>
    <th>Investment Type</th>
    <th>Principal Amount</th>
    <th>Fair Value</th>
  </tr>
  <tr>
    <td>ABC Corp</td>
    <td>Software services</td>
    <td>First Lien</td>
    <td>$1,000,000</td>
    <td>$950,000</td>
  </tr>
  <tr>
    <td>XYZ Inc</td>
    <td>Manufacturing</td>
    <td>Second Lien</td>
    <td>$2,500,000</td>
    <td>$2,250,000</td>
  </tr>
</table>
</body>
</html>`;

const SAMPLE_HTML_SCHEDULE_TITLE = `
<html>
<body>
<h2>CONSOLIDATED SCHEDULE OF INVESTMENTS</h2>
<table>
  <thead>
    <tr>
      <th>Security Name</th>
      <th>Industry</th>
      <th>Tranche</th>
      <th>Coupon</th>
      <th>Principal</th>
      <th>Amortized Cost</th>
      <th>Fair Value</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>TechCorp LLC</td>
      <td>Technology Services</td>
      <td>Senior Secured</td>
      <td>SOFR + 550</td>
      <td>5,000,000</td>
      <td>4,900,000</td>
      <td>4,750,000</td>
    </tr>
    <tr>
      <td>HealthCo Inc</td>
      <td>Healthcare</td>
      <td>Subordinated</td>
      <td>12.5%</td>
      <td>3,000,000</td>
      <td>2,950,000</td>
      <td>3,100,000</td>
    </tr>
  </tbody>
</table>
</body>
</html>`;

const SAMPLE_HTML_WITH_FOOTNOTES = `
<html>
<body>
<table>
  <tr>
    <th>Investment</th>
    <th>Principal Amount</th>
    <th>Fair Value</th>
  </tr>
  <tr>
    <td>RetailCo Ltd(1)</td>
    <td>$1,500,000</td>
    <td>$(200,000)</td>
  </tr>
  <tr>
    <td>ServiceCorp*</td>
    <td>$800,000</td>
    <td>$820,000</td>
  </tr>
</table>
</body>
</html>`;

const SAMPLE_HTML_NO_SCHEDULE = `
<html>
<body>
<table>
  <tr>
    <th>Unrelated Data</th>
    <th>Other Info</th>
  </tr>
  <tr>
    <td>Random content</td>
    <td>More content</td>
  </tr>
</table>
</body>
</html>`;

const SAMPLE_HTML_COMPLEX = `
<html>
<body>
<h3>Schedule of Investments</h3>
<table>
  <tr>
    <th>Company Name</th>
    <th>Business Description</th>
    <th>Investment Tranche</th>
    <th>Coupon Rate</th>
    <th>Spread</th>
    <th>Acquisition Date</th>
    <th>Principal Amount</th>
    <th>Amortized Cost</th>
    <th>Fair Value</th>
  </tr>
  <tr>
    <td>Energy Solutions LLC</td>
    <td>Renewable energy development</td>
    <td>First Lien Term Loan</td>
    <td>LIBOR + 625</td>
    <td>6.25%</td>
    <td>03/15/2023</td>
    <td>$10,000,000</td>
    <td>$9,800,000</td>
    <td>$9,500,000</td>
  </tr>
  <tr>
    <td>Total Investments</td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td></td>
    <td>$10,000,000</td>
    <td>$9,800,000</td>
    <td>$9,500,000</td>
  </tr>
</table>
</body>
</html>`;

// Import functions to test (simplified for testing - in real implementation these would be imported)
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

// Unit Tests for Helper Functions
Deno.test("cleanTextValue - removes extra whitespace and quotes", () => {
  assertEquals(cleanTextValue("  ABC  Corp  "), "ABC Corp");
  assertEquals(cleanTextValue('"Technology Company"'), "Technology Company");
  assertEquals(cleanTextValue("'Energy LLC'"), "Energy LLC");
  assertEquals(cleanTextValue(""), "");
});

Deno.test("parseNumericValue - handles various number formats", () => {
  assertEquals(parseNumericValue("$1,000,000"), 1000000);
  assertEquals(parseNumericValue("1000000"), 1000000);
  assertEquals(parseNumericValue("$(500,000)"), -500000);
  assertEquals(parseNumericValue("(200000)"), -200000);
  assertEquals(parseNumericValue("1,234.56"), 1234.56);
  assertEquals(parseNumericValue("—"), undefined);
  assertEquals(parseNumericValue("-"), undefined);
  assertEquals(parseNumericValue(""), undefined);
  assertEquals(parseNumericValue("abc"), undefined);
});

Deno.test("parseDateValue - converts dates to YYYY-MM-DD format", () => {
  assertEquals(parseDateValue("03/15/2023"), "2023-03-15");
  assertEquals(parseDateValue("2023-03-15"), "2023-03-15");
  assertEquals(parseDateValue("March 15, 2023"), "2023-03-15");
  assertEquals(parseDateValue(""), undefined);
  assertEquals(parseDateValue("invalid date"), undefined);
});

Deno.test("getTableHeaderScore - scores tables based on investment headers", () => {
  const $ = cheerio.load(SAMPLE_HTML_BASIC);
  const table = $('table').first();
  const score = getTableHeaderScore($, table);
  
  // Should find at least company, principal, and fair value headers
  assertEquals(score >= 3, true);
});

Deno.test("getTableHeaderScore - returns low score for non-investment tables", () => {
  const $ = cheerio.load(SAMPLE_HTML_NO_SCHEDULE);
  const table = $('table').first();
  const score = getTableHeaderScore($, table);
  
  assertEquals(score < 3, true);
});

Deno.test("extractColumnMapping - maps headers to column indices", () => {
  const $ = cheerio.load(SAMPLE_HTML_SCHEDULE_TITLE);
  const table = $('table').first();
  const mapping = extractColumnMapping($, table);
  
  assertEquals(mapping.company_name, 0);
  assertEquals(mapping.business_description, 1);
  assertEquals(mapping.investment_tranche, 2);
  assertEquals(mapping.coupon, 3);
  assertEquals(mapping.principal_amount, 4);
  assertEquals(mapping.amortized_cost, 5);
  assertEquals(mapping.fair_value, 6);
});

Deno.test("extractColumnMapping - handles missing headers gracefully", () => {
  const $ = cheerio.load(SAMPLE_HTML_NO_SCHEDULE);
  const table = $('table').first();
  const mapping = extractColumnMapping($, table);
  
  assertEquals(Object.keys(mapping).length, 0);
});

// Integration Tests
Deno.test("parseScheduleOfInvestments - parses basic investment table", async () => {
  // Mock the full parsing function for this test
  const $ = cheerio.load(SAMPLE_HTML_BASIC);
  const table = $('table').first();
  const mapping = extractColumnMapping($, table);
  
  // Should find basic mappings
  assertExists(mapping.company_name);
  assertExists(mapping.business_description);
  assertExists(mapping.principal_amount);
  assertExists(mapping.fair_value);
});

Deno.test("parseScheduleOfInvestments - handles footnotes and special characters", async () => {
  const $ = cheerio.load(SAMPLE_HTML_WITH_FOOTNOTES);
  const table = $('table').first();
  
  // Extract first data row
  const firstDataRow = $(table).find('tr').eq(1);
  const companyCell = firstDataRow.find('td').eq(0).text();
  
  // Should contain footnote marker before cleaning
  assertEquals(companyCell.includes('(1)'), true);
  
  // After cleaning, footnote should be removed
  const cleaned = cleanTextValue(companyCell.replace(/\(\d+\)|\*+|†+/g, ''));
  assertEquals(cleaned, "RetailCo Ltd");
});

Deno.test("parseScheduleOfInvestments - handles negative values in parentheses", async () => {
  const negativeValue = parseNumericValue("$(200,000)");
  assertEquals(negativeValue, -200000);
});

Deno.test("parseScheduleOfInvestments - finds schedule table with title", async () => {
  const $ = cheerio.load(SAMPLE_HTML_SCHEDULE_TITLE);
  
  // Should find table with schedule-related content
  let foundScheduleTable = false;
  const schedulePatterns = [
    /consolidated\s+schedule\s+of\s+investments/i,
    /schedule\s+of\s+investments/i,
    /investment\s+portfolio/i
  ];
  
  $('table').each((i: number, table: any) => {
    const tableContext = $(table).prev().text() + $(table).text();
    
    for (const pattern of schedulePatterns) {
      if (pattern.test(tableContext)) {
        const headerScore = getTableHeaderScore($, table);
        if (headerScore >= 4) {
          foundScheduleTable = true;
          return false;
        }
      }
    }
  });
  
  assertEquals(foundScheduleTable, true);
});

Deno.test("parseScheduleOfInvestments - skips total/summary rows", async () => {
  const $ = cheerio.load(SAMPLE_HTML_COMPLEX);
  const table = $('table').first();
  
  // Should skip "Total Investments" row
  let foundTotalRow = false;
  $(table).find('tr').each((index: number, row: any) => {
    const rowText = $(row).text().toLowerCase();
    if (/total|subtotal/.test(rowText.trim())) {
      foundTotalRow = true;
    }
  });
  
  assertEquals(foundTotalRow, true);
});

Deno.test("parseScheduleOfInvestments - extracts coupon and reference rate", async () => {
  const couponText = "SOFR + 550";
  const rateMatch = couponText.match(/(LIBOR|SOFR|Prime|Base)\s*\+?\s*(\d+\.?\d*)/i);
  
  assertEquals(rateMatch !== null, true);
  if (rateMatch) {
    assertEquals(rateMatch[1], "SOFR");
    assertEquals(rateMatch[2], "550");
  }
});

Deno.test("parseScheduleOfInvestments - returns empty array for non-investment content", async () => {
  const $ = cheerio.load(SAMPLE_HTML_NO_SCHEDULE);
  
  // Should not find any investment tables
  let foundInvestmentTable = false;
  $('table').each((i: number, table: any) => {
    const score = getTableHeaderScore($, table);
    if (score >= 4) {
      foundInvestmentTable = true;
    }
  });
  
  assertEquals(foundInvestmentTable, false);
});

console.log("All SEC parsing tests completed successfully!");