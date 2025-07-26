#!/usr/bin/env deno run --allow-net --allow-env

// Smoke test for BDC Analytics Edge Functions
// Tests API endpoints and error handling

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://pkpvyqvcsmyxcudamerw.supabase.co';
const SUPABASE_KEY = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcHZ5cXZjc215eGN1ZGFtZXJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMjMxMTgsImV4cCI6MjA2ODg5OTExOH0.XHyg3AzXz70Ad1t-E7oiiw0wFhCxUfG1H41HitZgKQY';
const BASE_URL = `${SUPABASE_URL}/functions/v1`;

interface TestResult {
  endpoint: string;
  method: string;
  status: number;
  time: number;
  success: boolean;
  error?: string;
}

const results: TestResult[] = [];

async function testEndpoint(endpoint: string, method = 'GET', body?: any, skipAuth = false): Promise<void> {
  const start = Date.now();
  console.log(`\n🧪 Testing ${method} ${endpoint}...`);
  
  try {
    const headers: any = { 'Content-Type': 'application/json' };
    if (!skipAuth) {
      headers['Authorization'] = `Bearer ${SUPABASE_KEY}`;
    }
    
    const response = await fetch(`${BASE_URL}/${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    
    const time = Date.now() - start;
    const success = response.ok || response.status < 500;
    
    results.push({
      endpoint,
      method,
      status: response.status,
      time,
      success,
    });
    
    if (response.ok) {
      console.log(`✅ Success: ${response.status} (${time}ms)`);
    } else {
      const errorText = await response.text();
      console.log(`❌ Failed: ${response.status} - ${errorText}`);
    }
    
  } catch (error) {
    const time = Date.now() - start;
    results.push({
      endpoint,
      method,
      status: 0,
      time,
      success: false,
      error: error.message,
    });
    console.log(`❌ Error: ${error.message}`);
  }
}

async function runTests() {
  console.log('🚀 BDC Analytics Smoke Test');
  console.log(`📡 Testing: ${BASE_URL}`);
  console.log('═'.repeat(50));
  
  // Normal tests
  console.log('\n📊 Testing BDC API endpoints...');
  await testEndpoint('bdc-api/investments?limit=5', 'GET');
  await testEndpoint('bdc-api/investments?limit=5', 'POST');
  await testEndpoint('bdc-api/nonaccruals?limit=5', 'GET');
  await testEndpoint('bdc-api/cache/invalidate', 'POST');
  await testEndpoint('bdc-api/export', 'POST', { manager: 'ARCC', limit: 10 });
  
  // SEC Extractor
  console.log('\n🔍 Testing SEC Extractor...');
  await testEndpoint('sec-extractor', 'POST', {
    action: 'incremental_check',
    ticker: 'ARCC',
    filing_type: '10-Q'
  });
  
  // Error tests
  console.log('\n🚨 Testing Error Handling...');
  await testEndpoint('bdc-api/invalid-endpoint', 'GET');
  await testEndpoint('bdc-api/investments', 'POST', { limit: 'not-a-number' });
  await testEndpoint('bdc-api/investments', 'GET', null, true); // No auth
  
  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📈 TEST SUMMARY');
  console.log('═'.repeat(50));
  
  let passed = 0;
  let failed = 0;
  
  for (const result of results) {
    if (result.success || (result.status >= 400 && result.status < 500)) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed');
    Deno.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    Deno.exit(0);
  }
}

// Run the tests
await runTests();