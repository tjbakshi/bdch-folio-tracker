import { type Page, type BrowserContext } from '@playwright/test';
import { setupErrorTracking, capturePageState } from '../helpers/playwright';

/**
 * Test setup utilities for consistent test environment
 */

export interface TestContext {
  page: Page;
  context: BrowserContext;
  testName: string;
}

/**
 * Setup standard test environment with error tracking and debugging
 */
export async function setupTestEnvironment(
  page: Page, 
  context: BrowserContext, 
  testName: string
): Promise<TestContext> {
  console.log(`🧪 Setting up test environment for: ${testName}`);
  
  // Setup enhanced error tracking
  await setupErrorTracking(page);
  
  // Setup test-specific configurations
  await page.addInitScript(() => {
    // Add test markers to window for debugging
    (window as any).__testEnvironment = {
      testName: testName,
      startTime: Date.now(),
      userAgent: navigator.userAgent,
    };
    
    // Disable animations for more predictable tests
    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-delay: -0.01ms !important;
        transition-duration: 0.01ms !important;
        transition-delay: -0.01ms !important;
      }
    `;
    document.head.appendChild(style);
  });
  
  return { page, context, testName };
}

/**
 * Navigate to a page with enhanced error handling and retries
 */
export async function navigateToPage(
  page: Page, 
  url: string, 
  maxRetries = 3
): Promise<void> {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      console.log(`🔗 Navigating to: ${url} (attempt ${attempt + 1}/${maxRetries})`);
      
      await page.goto(url, {
        waitUntil: 'networkidle',
        timeout: 45000
      });
      
      // Verify page loaded correctly
      await page.waitForLoadState('domcontentloaded');
      
      console.log(`✅ Successfully navigated to: ${url}`);
      return;
      
    } catch (error) {
      attempt++;
      
      if (attempt === maxRetries) {
        console.error(`❌ Failed to navigate to ${url} after ${maxRetries} attempts`);
        
        // Capture final state for debugging
        await capturePageState(page, `navigation-failed-${url.replace(/[^a-zA-Z0-9]/g, '-')}`);
        throw error;
      }
      
      console.log(`⚠️ Navigation attempt ${attempt} failed, retrying in 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

/**
 * Wait for application to be ready with comprehensive checks
 */
export async function waitForApplicationReady(page: Page): Promise<void> {
  console.log('🕒 Waiting for application to be ready...');
  
  try {
    // Wait for React to load
    await page.waitForFunction(
      () => (window as any).React !== undefined || document.querySelector('[data-reactroot]') !== null,
      { timeout: 30000 }
    );
    
    // Wait for main content to appear
    await page.waitForSelector('main, [role="main"], .main-content', { timeout: 20000 });
    
    // Wait for any loading indicators to disappear
    await page.waitForFunction(
      () => {
        const loadingElements = document.querySelectorAll('[data-testid*="loading"], [data-testid*="spinner"], .loading, .spinner');
        return loadingElements.length === 0;
      },
      { timeout: 15000 }
    ).catch(() => {
      console.log('ℹ️ Loading indicators check timed out (non-blocking)');
    });
    
    console.log('✅ Application is ready');
    
  } catch (error) {
    console.error('❌ Application readiness check failed:', error);
    await capturePageState(page, 'app-not-ready');
    throw error;
  }
}

/**
 * Cleanup test environment
 */
export async function cleanupTestEnvironment(
  page: Page, 
  testName: string, 
  success: boolean
): Promise<void> {
  try {
    console.log(`🧹 Cleaning up test environment for: ${testName} (${success ? 'SUCCESS' : 'FAILED'})`);
    
    if (!success) {
      // Capture failure state for debugging
      await capturePageState(page, `test-failed-${testName.replace(/\s+/g, '-')}`);
    }
    
    // Clear any test data markers
    await page.evaluate(() => {
      delete (window as any).__testEnvironment;
      delete (window as any).__testLogs;
      delete (window as any).__networkErrors;
      delete (window as any).__pageErrors;
    }).catch(() => {
      // Ignore cleanup errors
    });
    
    console.log('✅ Test environment cleanup complete');
    
  } catch (error) {
    console.warn('⚠️ Test cleanup encountered issues:', error);
  }
}