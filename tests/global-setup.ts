import { chromium, type FullConfig } from '@playwright/test';

/**
 * Global setup for Playwright tests
 * Performs environment validation, health checks, and test preparation
 */
async function globalSetup(config: FullConfig) {
  console.log('🔧 Setting up Playwright test environment...');
  
  // Environment validation
  await validateEnvironment();
  
  // Health checks (run for both CI and local)
  await performHealthChecks(config);

  console.log('🚀 Playwright test environment setup complete');
}

/**
 * Validates required environment variables
 */
async function validateEnvironment() {
  console.log('🔍 Validating environment variables...');
  
  const requiredEnvVars = [];
  const optionalEnvVars = ['PLAYWRIGHT_BASE_URL', 'GITHUB_RUN_ID'];
  
  // In CI, validate Supabase credentials
  if (process.env.CI) {
    requiredEnvVars.push('SUPABASE_URL', 'SUPABASE_ANON_KEY');
  }
  
  const missingRequired = requiredEnvVars.filter(envVar => !process.env[envVar]);
  
  if (missingRequired.length > 0) {
    console.error('❌ Missing required environment variables:', missingRequired);
    throw new Error(`Missing environment variables: ${missingRequired.join(', ')}`);
  }
  
  console.log('✅ Environment validation passed');
  
  // Log available optional variables for debugging
  const availableOptional = optionalEnvVars.filter(envVar => process.env[envVar]);
  if (availableOptional.length > 0) {
    console.log('ℹ️ Available optional variables:', availableOptional);
  }
}

/**
 * Performs health checks on the application and dependencies
 */
async function performHealthChecks(config: FullConfig) {
  console.log('🏥 Performing health checks...');
  
  const browser = await chromium.launch({ 
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // CI compatibility
  });
  
  const page = await browser.newPage();
  
  // Enhanced error tracking
  const errors: string[] = [];
  page.on('pageerror', (error) => {
    errors.push(`Page error: ${error.message}`);
  });
  
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(`Console error: ${msg.text()}`);
    }
  });

  try {
    const baseURL = config.use?.baseURL || 'http://localhost:5173';
    console.log(`🌐 Checking application health at ${baseURL}...`);
    
    // Enhanced navigation with retries
    let attempt = 0;
    const maxAttempts = 3;
    
    while (attempt < maxAttempts) {
      try {
        await page.goto(baseURL, { 
          waitUntil: 'networkidle',
          timeout: 60000 
        });
        break;
      } catch (error) {
        attempt++;
        if (attempt === maxAttempts) throw error;
        console.log(`⚠️ Attempt ${attempt} failed, retrying in 5 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
    
    // Wait for React app to load with better error context
    try {
      await page.waitForSelector('h1', { timeout: 30000 });
      console.log('✅ React application loaded successfully');
    } catch (error) {
      console.error('❌ React application failed to load:', error);
      const content = await page.content();
      console.log('Page content preview:', content.substring(0, 500));
      throw error;
    }
    
    // Check for critical API endpoints (if in CI)
    if (process.env.CI && process.env.SUPABASE_URL) {
      await checkSupabaseHealth(page);
    }
    
    // Test basic navigation
    await testBasicNavigation(page);
    
    if (errors.length > 0) {
      console.warn('⚠️ Non-critical errors detected:', errors);
    }
    
  } catch (error) {
    console.error('❌ Health check failed:', error);
    
    // Capture debugging information
    try {
      const screenshot = await page.screenshot({ fullPage: true });
      console.log('📸 Screenshot captured for debugging');
      
      const content = await page.content();
      console.log('📄 Page content length:', content.length);
      
      if (errors.length > 0) {
        console.error('🐛 Detected errors:', errors);
      }
    } catch (debugError) {
      console.error('Failed to capture debugging info:', debugError);
    }
    
    throw error;
  } finally {
    await browser.close();
  }
}

/**
 * Checks Supabase API health
 */
async function checkSupabaseHealth(page: any) {
  try {
    console.log('🔗 Checking Supabase connectivity...');
    
    // Make a simple request to test connectivity
    const response = await page.evaluate(async () => {
      try {
        const supabaseUrl = window.location.origin.includes('localhost') 
          ? 'https://pkpvyqvcsmyxcudamerw.supabase.co'
          : 'https://pkpvyqvcsmyxcudamerw.supabase.co';
        
        const res = await fetch(`${supabaseUrl}/rest/v1/`, {
          headers: {
            'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcHZ5cXZjc215eGN1ZGFtZXJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMjMxMTgsImV4cCI6MjA2ODg5OTExOH0.XHyg3AzXz70Ad1t-E7oiiw0wFhCxUfG1H41HitZgKQY'
          }
        });
        return { status: res.status, ok: res.ok };
      } catch (error) {
        return { error: error.message };
      }
    });
    
    if (response.error) {
      console.warn('⚠️ Supabase connectivity issue:', response.error);
    } else if (response.ok) {
      console.log('✅ Supabase connectivity verified');
    } else {
      console.warn('⚠️ Supabase returned status:', response.status);
    }
  } catch (error) {
    console.warn('⚠️ Could not verify Supabase health:', error);
  }
}

/**
 * Tests basic application navigation
 */
async function testBasicNavigation(page: any) {
  try {
    console.log('🧭 Testing basic navigation...');
    
    // Test if the dashboard loads
    const dashboardExists = await page.locator('[data-testid="dashboard"]').count() > 0;
    if (dashboardExists) {
      console.log('✅ Dashboard component detected');
    }
    
    // Test if admin page is accessible
    try {
      await page.goto('/admin', { timeout: 10000 });
      console.log('✅ Admin page accessible');
      await page.goBack();
    } catch (error) {
      console.log('ℹ️ Admin page navigation skipped');
    }
    
  } catch (error) {
    console.warn('⚠️ Basic navigation test failed:', error);
  }
}

export default globalSetup;