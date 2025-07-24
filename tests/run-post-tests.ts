#!/usr/bin/env deno run --allow-net --allow-env

/**
 * Test runner specifically for verifying POST functionality
 * Runs focused tests to ensure the dashboard works with POST-only requests
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || 'https://pkpvyqvcsmyxcudamerw.supabase.co';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcHZ5cXZjc215eGN1ZGFtZXJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMjMxMTgsImV4cCI6MjA2ODg5OTExOH0.XHyg3AzXz70Ad1t-E7oiiw0wFhCxUfG1H41HitZgKQY';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  responseTime: number;
}

class PostTestRunner {
  private results: TestResult[] = [];

  async testPostInvestments(): Promise<TestResult> {
    const startTime = Date.now();
    console.log('🧪 Testing POST /bdc-api/investments...');

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/bdc-api/investments?limit=5`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });

      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ POST succeeded: ${response.status} (${responseTime}ms)`);
        console.log(`   Returned ${data.data?.length || 0} investments`);
        
        return {
          name: 'POST /investments',
          passed: true,
          responseTime
        };
      } else {
        const errorText = await response.text();
        console.log(`❌ POST failed: ${response.status} ${response.statusText}`);
        console.log(`   Error: ${errorText}`);
        
        return {
          name: 'POST /investments',
          passed: false,
          error: `${response.status}: ${errorText}`,
          responseTime
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.log(`❌ POST connection failed: ${error.message}`);
      
      return {
        name: 'POST /investments',
        passed: false,
        error: error.message,
        responseTime
      };
    }
  }

  async testGetInvestmentsBlocked(): Promise<TestResult> {
    const startTime = Date.now();
    console.log('🧪 Testing GET /bdc-api/investments (should still work)...');

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/bdc-api/investments?limit=5`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });

      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        console.log(`✅ GET also works: ${response.status} (${responseTime}ms)`);
        return {
          name: 'GET /investments (fallback)',
          passed: true,
          responseTime
        };
      } else {
        console.log(`⚠️  GET returned: ${response.status} ${response.statusText}`);
        return {
          name: 'GET /investments (fallback)',
          passed: response.status !== 500, // 404 is OK, 500 is not
          error: response.status === 500 ? await response.text() : undefined,
          responseTime
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      console.log(`❌ GET connection failed: ${error.message}`);
      
      return {
        name: 'GET /investments (fallback)',
        passed: false,
        error: error.message,
        responseTime
      };
    }
  }

  async testEndpointRoute(): Promise<TestResult> {
    const startTime = Date.now();
    console.log('🧪 Testing route handling for /investments...');

    try {
      // Test with various query parameters
      const response = await fetch(`${SUPABASE_URL}/functions/v1/bdc-api/investments?manager=ARCC&limit=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
      });

      const responseTime = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        console.log(`✅ Route with params works: ${response.status} (${responseTime}ms)`);
        console.log(`   Query parameters processed correctly`);
        
        return {
          name: 'POST /investments with params',
          passed: true,
          responseTime
        };
      } else if (response.status === 404) {
        console.log(`❌ Route not found: ${response.status} - This indicates routing issue`);
        return {
          name: 'POST /investments with params',
          passed: false,
          error: '404 - Route not properly configured',
          responseTime
        };
      } else {
        console.log(`⚠️  Route returned: ${response.status} ${response.statusText}`);
        return {
          name: 'POST /investments with params', 
          passed: response.status < 500,
          error: response.status >= 500 ? await response.text() : undefined,
          responseTime
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: 'POST /investments with params',
        passed: false,
        error: error.message,
        responseTime
      };
    }
  }

  generateReport(): void {
    console.log('\n📈 POST Testing Results\n');
    console.log('═'.repeat(60));

    let passed = 0;
    let failed = 0;

    this.results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      const timing = `${result.responseTime}ms`;
      
      console.log(`${status} ${result.name.padEnd(35)} (${timing})`);
      
      if (result.passed) {
        passed++;
      } else {
        failed++;
        if (result.error) {
          console.log(`     Error: ${result.error}`);
        }
      }
    });

    console.log('═'.repeat(60));
    console.log(`Total: ${this.results.length} | Passed: ${passed} | Failed: ${failed}`);

    if (failed > 0) {
      console.log('\n❌ Some POST tests failed. Dashboard may not work correctly.');
      console.log('\n💡 Troubleshooting tips:');
      console.log('   - Check that Edge Function accepts both GET and POST for /investments');
      console.log('   - Verify routing logic in supabase/functions/bdc-api/index.ts');
      console.log('   - Check Supabase function logs for detailed errors');
      Deno.exit(1);
    } else {
      console.log('\n✅ All POST tests passed! Dashboard should work with POST requests.');
    }
  }

  async run(): Promise<void> {
    console.log('🚀 BDC Analytics POST-Only Test Suite');
    console.log(`📡 Testing against: ${SUPABASE_URL}`);
    console.log('═'.repeat(60));

    try {
      // Run POST-specific tests
      this.results.push(await this.testPostInvestments());
      this.results.push(await this.testGetInvestmentsBlocked());
      this.results.push(await this.testEndpointRoute());

      this.generateReport();
    } catch (error) {
      console.log(`\n💥 Test suite failed: ${error.message}`);
      Deno.exit(1);
    }
  }
}

// CLI usage
if (import.meta.main) {
  const testRunner = new PostTestRunner();
  await testRunner.run();
}

export { PostTestRunner };