#!/usr/bin/env deno run --allow-net --allow-env

/**
 * Simple function log checker for Supabase Edge Functions
 * 
 * This script calls both edge functions and then attempts to verify
 * that Sentry monitoring logs are being emitted.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://pkpvyqvcsmyxcudamerw.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcHZ5cXZjc215eGN1ZGFtZXJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMjMxMTgsImV4cCI6MjA2ODg5OTExOH0.XHyg3AzXz70Ad1t-E7oiiw0wFhCxUfG1H41HitZgKQY';

async function callFunction(functionName: string, methodOrBody?: 'GET' | 'POST' | any) {
  // Determine method and body based on parameters
  let method: string;
  let body: any;
  
  if (methodOrBody === 'GET') {
    method = 'GET';
    body = undefined;
  } else if (methodOrBody === 'POST' || typeof methodOrBody === 'object') {
    method = 'POST';
    body = methodOrBody && typeof methodOrBody === 'object' ? methodOrBody : undefined;
  } else {
    method = 'GET';
    body = undefined;
  }
  
  console.log(`📞 Calling ${method} ${functionName}...`);
  
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${functionName}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    console.log(`   Status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`   Error: ${errorText}`);
    }
    
    return response.ok;
  } catch (error) {
    console.log(`   Failed: ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🧪 Quick Smoke Test for BDC Analytics\n');
  
  // Test BDC API with both GET and POST
  console.log('Testing BDC API:');
  await callFunction('bdc-api/investments?limit=1', 'GET');  // GET method
  await callFunction('bdc-api/investments?limit=1', {});     // POST method with empty body
  await callFunction('bdc-api/cache/invalidate', {});
  
  console.log('\nTesting SEC Extractor:');
  await callFunction('sec-extractor', {
    action: 'incremental_check',
    ticker: 'ARCC',
    filing_type: '10-Q'
  });

  console.log('\n✅ Function calls completed!');
  console.log('\n📋 To verify Sentry logs:');
  console.log('1. Check Supabase function logs for [SENTRY] entries');
  console.log('2. Look for transaction/span monitoring data');
  console.log('3. Verify error capture is working');
  
  console.log('\n🔗 Function logs URLs:');
  console.log(`- BDC API: ${SUPABASE_URL.replace('https://', 'https://supabase.com/dashboard/project/')}/functions/bdc-api/logs`);
  console.log(`- SEC Extractor: ${SUPABASE_URL.replace('https://', 'https://supabase.com/dashboard/project/')}/functions/sec-extractor/logs`);
}

if (import.meta.main) {
  await main();
}