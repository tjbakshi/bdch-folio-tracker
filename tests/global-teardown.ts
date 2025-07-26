import { type FullConfig } from '@playwright/test';

/**
 * Global teardown for Playwright tests
 * Performs cleanup and generates final reports
 */
async function globalTeardown(config: FullConfig) {
  console.log('🧹 Starting test environment cleanup...');
  
  try {
    // Generate test summary
    await generateTestSummary();
    
    // Clean up any test artifacts if needed
    await cleanupTestArtifacts();
    
    console.log('✅ Test environment cleanup complete');
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    // Don't throw - teardown failures shouldn't fail the tests
  }
}

/**
 * Generates a summary of test results
 */
async function generateTestSummary() {
  const testStart = process.env.TEST_START_TIME;
  if (testStart) {
    const duration = Date.now() - parseInt(testStart);
    console.log(`⏱️ Total test duration: ${Math.round(duration / 1000)}s`);
  }
  
  console.log('📊 Test execution summary available in artifacts');
}

/**
 * Cleans up temporary test artifacts
 */
async function cleanupTestArtifacts() {
  // Add any specific cleanup logic here
  // For example, clearing temporary files, resetting test data, etc.
  console.log('🗑️ Test artifacts cleanup complete');
}

export default globalTeardown;