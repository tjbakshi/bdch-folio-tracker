/**
 * Environment setup and validation utilities
 */

export interface TestEnvironmentConfig {
  supabaseUrl: string;
  supabaseAnonKey: string;
  baseUrl: string;
  isCI: boolean;
  runId: string;
}

/**
 * Validates and returns test environment configuration
 */
export function getTestEnvironmentConfig(): TestEnvironmentConfig {
  const isCI = !!process.env.CI;
  
  // Base URL configuration
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';
  
  // Supabase configuration
  const supabaseUrl = process.env.SUPABASE_URL || 'https://pkpvyqvcsmyxcudamerw.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcHZ5cXZjc215eGN1ZGFtZXJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMjMxMTgsImV4cCI6MjA2ODg5OTExOH0.XHyg3AzXz70Ad1t-E7oiiw0wFhCxUfG1H41HitZgKQY';
  
  // Test run identification
  const runId = process.env.GITHUB_RUN_ID || process.env.TEST_START_TIME || `local-${Date.now()}`;
  
  return {
    supabaseUrl,
    supabaseAnonKey,
    baseUrl,
    isCI,
    runId
  };
}

/**
 * Validates required environment variables
 */
export function validateTestEnvironment(): void {
  const config = getTestEnvironmentConfig();
  
  console.log('🔍 Validating test environment...');
  console.log(`  Base URL: ${config.baseUrl}`);
  console.log(`  Supabase URL: ${config.supabaseUrl}`);
  console.log(`  CI Environment: ${config.isCI}`);
  console.log(`  Run ID: ${config.runId}`);
  
  if (config.isCI) {
    // In CI, we need all credentials
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('Missing required Supabase credentials in CI environment');
    }
  }
  
  // Validate URL formats
  try {
    new URL(config.baseUrl);
    new URL(config.supabaseUrl);
  } catch (error) {
    throw new Error(`Invalid URL configuration: ${error}`);
  }
  
  console.log('✅ Environment validation passed');
}

/**
 * Setup environment-specific test configurations
 */
export function getTestTimeouts() {
  const isCI = !!process.env.CI;
  
  return {
    // Base timeouts
    short: isCI ? 15000 : 10000,      // Quick DOM operations
    medium: isCI ? 45000 : 30000,     // API calls, navigation
    long: isCI ? 120000 : 60000,      // Complex operations
    
    // Specific operation timeouts
    navigation: isCI ? 60000 : 30000,
    apiResponse: isCI ? 45000 : 20000,
    domContent: isCI ? 30000 : 15000,
    networkIdle: isCI ? 45000 : 20000,
    
    // Retry configurations
    maxRetries: isCI ? 3 : 2,
    retryDelay: isCI ? 5000 : 2000,
  };
}

/**
 * Get environment-specific test settings
 */
export function getTestSettings() {
  const isCI = !!process.env.CI;
  const config = getTestEnvironmentConfig();
  
  return {
    // Browser settings
    headless: isCI,
    slowMo: isCI ? 0 : 100,
    
    // Screenshot/video settings
    screenshot: isCI ? 'only-on-failure' : 'off',
    video: isCI ? 'retain-on-failure' : 'off',
    trace: isCI ? 'on-first-retry' : 'retain-on-failure',
    
    // Network settings
    ignoreHTTPSErrors: !isCI,
    bypassCSP: true,
    
    // Test data
    testDataSeed: config.runId,
    
    // Debugging
    verboseLogging: !isCI,
    captureConsole: true,
    captureNetwork: isCI,
  };
}