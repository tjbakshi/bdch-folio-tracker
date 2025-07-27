import type { NextApiRequest, NextApiResponse } from 'next';
import * as cheerio from 'cheerio';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { html } = req.body;

    if (!html || html.length < 1000) {
      return res.status(400).json({ error: 'Invalid or missing HTML content' });
    }

    const $ = cheerio.load(html);
    const results: any[] = [];

    $('table').slice(0, 3).each((_, table) => {
      $(table).find('tr').each((_, row) => {
        const cols = $(row).find('td');
        if (cols.length >= 3) {
          const investment = {
            company: $(cols[0]).text().trim(),
            description: $(cols[1]).text().trim(),
            value: $(cols[cols.length - 1]).text().trim()
          };
          if (investment.company && investment.value) {
            results.push(investment);
          }
        }
      });
    });

    return res.status(200).json({
      success: true,
      count: results.length,
      investments: results
    });

  } catch (err: any) {
    return res.status(500).json({
      error: 'Failed to parse filing',
      detail: err.message
    });
  }
}
