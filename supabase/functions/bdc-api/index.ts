import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

/**
 * BDC API Edge Function - provides REST endpoints for dashboard and export functionality
 */
serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const path = url.pathname.replace('/functions/v1/bdc-api', '');

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let response: Response;

    if ((req.method === 'GET' || req.method === 'POST') && path === '/investments') {
      response = await searchInvestments(supabase, url.searchParams);
    } else if (req.method === 'GET' && path.startsWith('/marks/')) {
      const rawId = path.split('/')[2];
      response = await getMarkHistory(supabase, rawId);
    } else if (req.method === 'GET' && path === '/nonaccruals') {
      response = await listNonAccruals(supabase, url.searchParams);
    } else if (req.method === 'POST' && path === '/export') {
      const body = await req.json();
      response = await exportToExcel(supabase, body);
    } else if (req.method === 'POST' && path === '/cache/invalidate') {
      response = await invalidateCache();
    } else {
      response = new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return response;
  } catch (error) {
    console.error('Error in bdc-api:', error);

    return new Response(JSON.stringify({ 
      error: error.message,
      timestamp: new Date().toISOString()
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// The rest of the functions: searchInvestments, getMarkHistory, listNonAccruals, exportToExcel,
// convertToCSV, invalidateCache remain unchanged. You can copy-paste them directly as-is from your current code.
