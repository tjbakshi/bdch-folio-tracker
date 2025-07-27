// index.ts - Full Edge Function handler for sec-extractor

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { parseScheduleOfInvestments } from "./html-parser.ts"; // ✅ corrected filename

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  try {
    const { cik, accession, fileType } = await req.json();
    if (!cik || !accession || !fileType) {
      return new Response(JSON.stringify({ error: "Missing required parameters" }), { status: 400 });
    }

    const formattedCIK = cik.toString().padStart(10, "0");
    const accessionNoHyphens = accession.replace(/-/g, "");
    const baseUrl = `https://www.sec.gov/Archives/edgar/data/${formattedCIK}/${accessionNoHyphens}/${fileType}`;

    console.log(`[SENTRY] Fetching SEC filing from ${baseUrl}`);
    const response = await fetch(baseUrl, {
      headers: { "User-Agent": "sec-extractor-edge/1.0 (tjbakshi@gmail.com)" },
    });

    if (!response.ok) {
      console.log(`[SENTRY] Failed to fetch filing: ${response.status}`);
      return new Response(JSON.stringify({ error: "Failed to fetch SEC filing" }), { status: 500 });
    }

    const html = await response.text();
    const investments = parseScheduleOfInvestments(html);
    console.log(`[SENTRY] Extraction complete. Found ${investments.length} rows.`);

    return new Response(JSON.stringify({ success: true, investments }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[SENTRY] Extraction failed:", error);
    return new Response(JSON.stringify({ error: "SEC extractor failed: " + error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
