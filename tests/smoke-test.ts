#!/usr/bin/env deno run --allow-net --allow-env
// Smoke test for BDC Analytics Edge Functions
// Tests API endpoints and error handling

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://pkpvyqvcsmyxcudamerw.supabase.co';
const SUPABASE_KEY = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcHZ5cXZjc215eGN1ZGFtZXJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMjMxMTgsImV4cCI6MjA2ODg5OTExOH0.XHyg3AzXz70Ad1t-E7oiiw0wFhCxUfG1H41HitZgKQY';
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
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

async function testEndpoint(endpoint: string, method = 'GET', body?: any, skipAuth = false, useServiceKey = false): Promise<void> {
  const start = Date.now();
  console.log(`🧪 Testing ${method} ${endpoint}...`);
  
  try {
    const headers: any = { 'Content-Type': 'application/json' };
    if (!skipAuth) {
      // Use service key for admin operations if available, otherwise use anon key
      const authKey = useServiceKey && SUPABASE_SERVICE_KEY ? SUPABASE_SERVICE_KEY : SUPABASE_KEY;
      headers['Authorization'] = `Bearer ${authKey}`;
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
  console.log('📊 Testing BDC API endpoints...');
  await testEndpoint('bdc-api/investments?limit=5', 'GET');
  await testEndpoint('bdc-api/investments?limit=5', 'POST');
  await testEndpoint('bdc-api/nonaccruals?limit=5', 'GET');
  await testEndpoint('bdc-api/cache/invalidate', 'POST');
  await testEndpoint('bdc-api/export', 'POST', { manager: 'ARCC', limit: 10 });
  
  // SEC Extractor - Test with a safer approach
  console.log('🔍 Testing SEC Extractor...');
  
  // First, try to get a valid ticker from the database, or use a safe test action
  if (SUPABASE_SERVICE_KEY) {
    // Test with setup_scheduled_jobs if we have service key (doesn't require external API calls)
    await testEndpoint('sec-extractor', 'POST', {
      action: 'setup_scheduled_jobs'
    }, false, true);
  } else {
    // Test with invalid action to check error handling (should return 400, not 500)
    await testEndpoint('sec-extractor', 'POST', {
      action: 'test_connection'
    });
  }
  
  // Error tests - these are expected to fail with 4xx codes
  console.log('🚨 Testing Error Handling...');
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
    // Consider 4xx errors as expected behavior for error handling tests
    if (result.success || (result.status >= 400 && result.status < 500)) {
      passed++;
    } else {
      failed++;
    }
  }
  
  console.log(`Total: ${results.length}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  
  // Only fail if we have 500 errors or connection failures
  const criticalFailures = results.filter(r => 
    !r.success && (r.status >= 500 || r.status === 0)
  );
  
  if (criticalFailures.length > 0) {
    console.log('\n❌ Critical failures detected:');
    criticalFailures.forEach(f => {
      console.log(`   - ${f.method} ${f.endpoint}: ${f.status} ${f.error || ''}`);
    });
    Deno.exit(1);
  } else {
    console.log('\n✅ All critical tests passed!');
    if (failed > 0) {
      console.log('📝 Note: Some expected error handling tests returned 4xx codes (this is normal)');
    }
    Deno.exit(0);
  }
}

// Run the tests
await runTests();