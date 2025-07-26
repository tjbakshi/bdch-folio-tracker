#!/usr/bin/env tsx
/**
 * Enhanced test suite runner with categorized execution
 */

import { spawn } from 'child_process';
import { existsSync } from 'fs';

interface TestSuite {
  name: string;
  pattern: string;
  description: string;
  timeout?: number;
}

const TEST_SUITES: TestSuite[] = [
  {
    name: 'core',
    pattern: 'tests/e2e.spec.ts',
    description: 'Core E2E tests - Critical user flows'
  },
  {
    name: 'enhanced',
    pattern: 'tests/e2e-enhanced.spec.ts', 
    description: 'Enhanced E2E tests - Error scenarios & edge cases'
  },
  {
    name: 'smoke',
    pattern: 'tests/smoke-test.ts',
    description: 'Smoke tests - Quick API validation'
  },
  {
    name: 'responsive',
    pattern: 'tests/e2e.spec.ts --grep "Responsive Design"',
    description: 'Responsive design tests'
  }
];

async function runTestSuite(suite: TestSuite, options: {
  browser?: string;
  headed?: boolean;
  ui?: boolean;
  retries?: number;
} = {}): Promise<boolean> {
  const { browser = 'chromium', headed = false, ui = false, retries = 1 } = options;
  
  console.log(`\n🧪 Running ${suite.name} test suite`);
  console.log(`📝 ${suite.description}`);
  console.log(`🌐 Browser: ${browser}`);
  
  const args = [
    'npx', 'playwright', 'test',
    suite.pattern,
    '--project', browser,
    '--retries', retries.toString()
  ];
  
  if (headed) args.push('--headed');
  if (ui) args.push('--ui');
  
  return new Promise((resolve) => {
    const child = spawn(args[0], args.slice(1), {
      stdio: 'inherit',
      shell: true
    });
    
    child.on('close', (code) => {
      const success = code === 0;
      console.log(`${success ? '✅' : '❌'} ${suite.name} tests ${success ? 'passed' : 'failed'}`);
      resolve(success);
    });
  });
}

async function runAllTests(options: {
  browser?: string;
  headed?: boolean;
  failFast?: boolean;
  pattern?: string;
} = {}) {
  const { browser = 'chromium', headed = false, failFast = false, pattern } = options;
  
  console.log('🚀 Starting BDC Analytics Test Suite');
  console.log(`⚡ Browser: ${browser}`);
  console.log(`📱 Headed: ${headed ? 'Yes' : 'No'}`);
  console.log(`⚠️  Fail Fast: ${failFast ? 'Yes' : 'No'}`);
  
  const suitesToRun = pattern 
    ? TEST_SUITES.filter(suite => suite.name.includes(pattern))
    : TEST_SUITES;
  
  const results: Array<{ suite: string; success: boolean }> = [];
  
  for (const suite of suitesToRun) {
    // Check if test file exists
    const testFile = suite.pattern.split(' ')[0]; // Remove grep patterns
    if (!existsSync(testFile)) {
      console.log(`⚠️  Skipping ${suite.name} - test file not found: ${testFile}`);
      continue;
    }
    
    const success = await runTestSuite(suite, { browser, headed });
    results.push({ suite: suite.name, success });
    
    if (!success && failFast) {
      console.log('💥 Stopping due to test failure (fail-fast mode)');
      break;
    }
    
    // Brief pause between suites
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary
  console.log('\n📊 Test Results Summary');
  console.log('═'.repeat(50));
  
  results.forEach(({ suite, success }) => {
    console.log(`${success ? '✅' : '❌'} ${suite.padEnd(15)} ${success ? 'PASSED' : 'FAILED'}`);
  });
  
  const totalPassed = results.filter(r => r.success).length;
  const totalTests = results.length;
  
  console.log('═'.repeat(50));
  console.log(`📈 Overall: ${totalPassed}/${totalTests} test suites passed`);
  
  if (totalPassed === totalTests) {
    console.log('🎉 All test suites passed!');
    process.exit(0);
  } else {
    console.log('💔 Some test suites failed');
    process.exit(1);
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  const options: any = {};
  
  // Parse command line arguments
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--browser':
        options.browser = args[++i];
        break;
      case '--headed':
        options.headed = true;
        break;
      case '--ui':
        options.ui = true;
        break;
      case '--fail-fast':
        options.failFast = true;
        break;
      case '--pattern':
        options.pattern = args[++i];
        break;
      case '--help':
        console.log(`
🧪 BDC Analytics Test Suite Runner

Usage: npm run test:suites [options]

Options:
  --browser <browser>    Browser to run tests on (chromium, firefox, webkit)
  --headed              Run tests in headed mode
  --ui                  Run tests in UI mode
  --fail-fast           Stop on first failure
  --pattern <pattern>   Run only suites matching pattern
  --help                Show this help

Examples:
  npm run test:suites                           # Run all test suites
  npm run test:suites -- --browser firefox     # Run on Firefox
  npm run test:suites -- --headed              # Run in headed mode
  npm run test:suites -- --pattern core        # Run only core tests
  npm run test:suites -- --fail-fast           # Stop on first failure

Available Test Suites:
${TEST_SUITES.map(s => `  • ${s.name.padEnd(10)} - ${s.description}`).join('\n')}
        `);
        process.exit(0);
    }
  }
  
  await runAllTests(options);
}

if (require.main === module) {
  main().catch(console.error);
}

export { runTestSuite, runAllTests, TEST_SUITES };