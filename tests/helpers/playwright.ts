import { expect, type Page, type BrowserContext } from '@playwright/test';

/**
 * Enhanced helper function to wait for investments data with retry logic
 */
export async function waitForInvestments(page: Page, maxRetries = 3) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      console.log(`🔄 Waiting for investments data (attempt ${attempt + 1}/${maxRetries})`);
      
      // Wait for API response with timeout
      const responsePromise = page.waitForResponse(
        r => r.url().includes('/bdc-api/investments') && r.status() === 200,
        { timeout: 30000 }
      );
      
      // Wait for DOM elements
      const elementPromise = page.waitForSelector('[data-testid="investment-row"]', { 
        timeout: 20000 
      });
      
      await Promise.all([responsePromise, elementPromise]);
      console.log('✅ Investments data loaded successfully');
      return;
      
    } catch (error) {
      attempt++;
      if (attempt === maxRetries) {
        console.error('❌ Failed to load investments after all retries:', error);
        throw new Error(`Failed to load investments data after ${maxRetries} attempts: ${error}`);
      }
      
      console.log(`⚠️ Attempt ${attempt} failed, retrying in 2 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

/**
 * Enhanced helper function to wait for toast with better error handling
 */
export async function waitForToast(page: Page, message: RegExp, timeoutMs = 15000) {
  try {
    console.log(`🍞 Waiting for toast: ${message}`);
    
    // Wait for toast to appear using accessible role
    await expect(
      page.getByRole('status', { name: message })
    ).toBeVisible({ timeout: timeoutMs });
    
    console.log('✅ Toast appeared successfully');
    
    // Wait for toast to disappear (optional - don't fail if it doesn't)
    try {
      await expect(
        page.getByRole('status', { name: message })
      ).toBeHidden({ timeout: 10000 });
      console.log('✅ Toast dismissed successfully');
    } catch (dismissError) {
      console.log('ℹ️ Toast may still be visible (non-blocking)');
    }
    
  } catch (error) {
    console.error('❌ Toast wait failed:', error);
    
    // Capture additional debugging info
    const toastElements = await page.getByRole('status').count();
    console.log(`🔍 Found ${toastElements} status elements on page`);
    
    if (toastElements > 0) {
      const toastTexts = await page.getByRole('status').allInnerTexts();
      console.log('🔍 Available toast texts:', toastTexts);
    }
    
    throw error;
  }
}

/**
 * Enhanced helper to wait for API responses with retry logic
 */
export async function waitForApiResponse(
  page: Page, 
  urlPattern: string | RegExp, 
  expectedStatus = 200,
  maxRetries = 3
) {
  let attempt = 0;
  
  while (attempt < maxRetries) {
    try {
      console.log(`🌐 Waiting for API response: ${urlPattern} (attempt ${attempt + 1}/${maxRetries})`);
      
      const response = await page.waitForResponse(
        r => {
          const url = r.url();
          const matchesPattern = typeof urlPattern === 'string' 
            ? url.includes(urlPattern)
            : urlPattern.test(url);
          return matchesPattern && r.status() === expectedStatus;
        },
        { timeout: 30000 }
      );
      
      console.log(`✅ API response received: ${response.status()}`);
      return response;
      
    } catch (error) {
      attempt++;
      if (attempt === maxRetries) {
        console.error(`❌ API response failed after ${maxRetries} attempts:`, error);
        
        // Log recent network activity for debugging
        const responses = await page.evaluate(() => {
          return performance.getEntriesByType('navigation').map(entry => ({
            name: entry.name,
            duration: entry.duration
          }));
        });
        console.log('🔍 Recent network activity:', responses);
        
        throw error;
      }
      
      console.log(`⚠️ API attempt ${attempt} failed, retrying in 3 seconds...`);
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

/**
 * Helper to capture page state for debugging
 */
export async function capturePageState(page: Page, context: string) {
  try {
    console.log(`📸 Capturing page state: ${context}`);
    
    // Capture screenshot
    const screenshot = await page.screenshot({ 
      fullPage: true,
      path: `test-results/debug-${context}-${Date.now()}.png`
    });
    
    // Capture page content
    const content = await page.content();
    console.log(`📄 Page content length: ${content.length} characters`);
    
    // Capture console logs
    const logs = await page.evaluate(() => {
      return (window as any).__testLogs || [];
    });
    
    if (logs.length > 0) {
      console.log('🐛 Console logs:', logs);
    }
    
    // Capture network errors
    const networkErrors = await page.evaluate(() => {
      return (window as any).__networkErrors || [];
    });
    
    if (networkErrors.length > 0) {
      console.log('🌐 Network errors:', networkErrors);
    }
    
    return { screenshot, content, logs, networkErrors };
    
  } catch (error) {
    console.error('❌ Failed to capture page state:', error);
    return null;
  }
}

/**
 * Helper to setup enhanced error tracking on page
 */
export async function setupErrorTracking(page: Page) {
  // Track console logs
  page.on('console', (msg) => {
    const type = msg.type();
    const text = msg.text();
    
    // Store logs for later retrieval
    page.evaluate(({ type, text }) => {
      (window as any).__testLogs = (window as any).__testLogs || [];
      (window as any).__testLogs.push({ type, text, timestamp: Date.now() });
    }, { type, text });
    
    if (type === 'error') {
      console.error(`🚨 Console error: ${text}`);
    }
  });
  
  // Track page errors
  page.on('pageerror', (error) => {
    console.error(`🚨 Page error: ${error.message}`);
    page.evaluate((errorMsg) => {
      (window as any).__pageErrors = (window as any).__pageErrors || [];
      (window as any).__pageErrors.push({ message: errorMsg, timestamp: Date.now() });
    }, error.message);
  });
  
  // Track network failures
  page.on('requestfailed', (request) => {
    const error = request.failure()?.errorText;
    console.error(`🌐 Network error: ${request.url()} - ${error}`);
    
    page.evaluate(({ url, error }) => {
      (window as any).__networkErrors = (window as any).__networkErrors || [];
      (window as any).__networkErrors.push({ url, error, timestamp: Date.now() });
    }, { url: request.url(), error });
  });
}