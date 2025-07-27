import * as cheerio from 'https://esm.sh/cheerio@1.0.0-rc.12';

function cleanText(value: string): string {
  return value?.replace(/\s+/g, ' ').replace(/["']/g, '').trim() || '';
}

function parseAmount(value: string): number | undefined {
  if (!value || /[-—]/.test(value)) return undefined;
  let clean = value.replace(/[$,\s]/g, '');
  if (/^\(.*\)$/.test(clean)) clean = '-' + clean.replace(/[()]/g, '');
  const num = parseFloat(clean);
  return isNaN(num) ? undefined : num;
}

function extractHeaders($: cheerio.CheerioAPI, table: cheerio.Element): Record<string, number> {
  const mapping: Record<string, number> = {};

  let headers = $(table).find('thead tr').first().find('th, td');
  if (headers.length === 0) {
    headers = $(table).find('tr').first().find('th, td');
  }

  headers.each((index, el) => {
    const text = $(el).text().toLowerCase().trim();
    if (/company|security|name/.test(text)) mapping.company = index;
    if (/industry|business/.test(text)) mapping.industry = index;
    if (/description/.test(text)) mapping.business_description = index;
    if (/tranche|type|class/.test(text)) mapping.investment_type = index;
    if (/coupon|rate/.test(text)) mapping.coupon = index;
    if (/reference/.test(text)) mapping.reference = index;
    if (/spread|margin/.test(text)) mapping.spread = index;
    if (/acquisition|purchase/.test(text)) mapping.acquisition_date = index;
    if (/maturity/.test(text)) mapping.maturity_date = index;
    if (/shares|units/.test(text)) mapping.shares_units = index;
    if (/principal|notional/.test(text)) mapping.principal = index;
    if (/amortized/.test(text)) mapping.amortized_cost = index;
    if (/fair value|market/.test(text)) mapping.fair_value = index;
  });

  return mapping;
}

export function parseScheduleOfInvestments(html: string): any[] {
  const $ = cheerio.load(html);
  const tables = $('table');
  const results: any[] = [];

  tables.each((i, table) => {
    const score = $(table).text().match(/investment|security|fair value|principal/gi)?.length || 0;
    if (score < 3) return;

    const headers = extractHeaders($, table);
    if (!headers.company || !headers.fair_value) return;

    $(table).find('tr').slice(1).each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const get = (key: string) => headers[key] !== undefined ? $(cells[headers[key]]).text() : '';

      const investment = {
        company: cleanText(get('company')),
        business_description: cleanText(get('business_description')),
        industry: cleanText(get('industry')),
        investment_type: cleanText(get('investment_type')),
        coupon: cleanText(get('coupon')),
        reference_rate: cleanText(get('reference')),
        spread: cleanText(get('spread')),
        acquisition_date: cleanText(get('acquisition_date')),
        maturity_date: cleanText(get('maturity_date')),
        shares_units: parseAmount(get('shares_units')),
        principal: parseAmount(get('principal')),
        amortized_cost: parseAmount(get('amortized_cost')),
        fair_value: parseAmount(get('fair_value')),
      };

      if (investment.company && investment.fair_value) {
        results.push(investment);
      }
    });
  });

  return results;
}
