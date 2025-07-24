import { chromium, type FullConfig } from '@playwright/test';

/**
 * Global setup for Playwright tests
 * Performs any necessary setup before running the test suite
 */
async function globalSetup(config: FullConfig) {
  // Only run setup in local development
  if (process.env.CI) {
    return;
  }

  console.log('🔧 Setting up Playwright test environment...');

  // Launch browser for any pre-test setup
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Check if the development server is running
    const baseURL = config.use?.baseURL || 'http://localhost:5173';
    
    console.log(`🌐 Checking if development server is available at ${baseURL}...`);
    
    await page.goto(baseURL, { 
      waitUntil: 'networkidle',
      timeout: 30000 
    });
    
    // Wait for React app to load
    await page.waitForSelector('h1', { timeout: 10000 });
    
    console.log('✅ Development server is ready');
    
    // Optional: Pre-seed test data or clear any existing state
    // This could involve calling API endpoints to set up test data
    
  } catch (error) {
    console.error('❌ Failed to connect to development server:', error);
    console.log('Make sure to run "npm run dev" before running tests');
    throw error;
  } finally {
    await browser.close();
  }

  console.log('🚀 Playwright test environment setup complete');
}

export default globalSetup;