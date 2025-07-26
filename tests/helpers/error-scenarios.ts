/**
 * Error scenario helpers for E2E testing
 */

import { type Page } from '@playwright/test';
import { InvestmentDataFactory } from '../factories/investment-data';

/**
 * Network error simulation helpers
 */
export class ErrorScenarios {
  
  /**
   * Simulate API timeout/slowness
   */
  static async simulateSlowAPI(page: Page, delayMs = 10000) {
    await page.route('**/bdc-api/investments**', async route => {
      await new Promise(resolve => setTimeout(resolve, delayMs));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(InvestmentDataFactory.createAPIResponse([]))
      });
    });
  }

  /**
   * Simulate complete network failure
   */
  static async simulateNetworkFailure(page: Page) {
    await page.route('**/bdc-api/**', route => {
      route.abort('failed');
    });
  }

  /**
   * Simulate server errors (5xx)
   */
  static async simulateServerError(page: Page, statusCode = 500) {
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill(InvestmentDataFactory.createNetworkError());
    });
  }

  /**
   * Simulate authentication errors
   */
  static async simulateAuthError(page: Page) {
    await page.route('**/bdc-api/**', route => {
      route.fulfill(InvestmentDataFactory.createAuthError());
    });
  }

  /**
   * Simulate empty data responses
   */
  static async simulateEmptyData(page: Page) {
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(InvestmentDataFactory.createEmptyResponse())
      });
    });
  }

  /**
   * Simulate invalid JSON responses
   */
  static async simulateInvalidJSON(page: Page) {
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'invalid json content {'
      });
    });
  }

  /**
   * Simulate intermittent failures (random success/failure)
   */
  static async simulateIntermittentFailures(page: Page, failureRate = 0.3) {
    await page.route('**/bdc-api/investments**', async route => {
      if (Math.random() < failureRate) {
        await route.fulfill(InvestmentDataFactory.createNetworkError());
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(InvestmentDataFactory.createAPIResponse(
            InvestmentDataFactory.createMultipleInvestments(3)
          ))
        });
      }
    });
  }

  /**
   * Simulate missing required fields in response
   */
  static async simulateInvalidDataStructure(page: Page) {
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            // Missing required fields like company_name, manager, etc.
            id: 'broken-data',
            incomplete: true
          }],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 }
        })
      });
    });
  }

  /**
   * Simulate export endpoint failures
   */
  static async simulateExportFailure(page: Page) {
    await page.route('**/bdc-api/export**', route => {
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Export service unavailable' })
      });
    });
  }

  /**
   * Simulate backfill endpoint failures
   */
  static async simulateBackfillFailure(page: Page) {
    await page.route('**/bdc-api/backfill**', route => {
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Backfill service temporarily unavailable' })
      });
    });
  }

  /**
   * Clean up all error scenario routes
   */
  static async cleanupRoutes(page: Page) {
    await page.unroute('**/bdc-api/**');
  }
}

/**
 * Browser error simulation
 */
export class BrowserErrorScenarios {
  
  /**
   * Simulate JavaScript errors
   */
  static async simulateJSError(page: Page) {
    await page.addInitScript(() => {
      // Inject a script that throws an error after page load
      setTimeout(() => {
        throw new Error('Simulated JavaScript error for testing');
      }, 1000);
    });
  }

  /**
   * Simulate console errors
   */
  static async simulateConsoleErrors(page: Page) {
    await page.addInitScript(() => {
      console.error('Simulated console error for testing');
    });
  }

  /**
   * Simulate memory pressure
   */
  static async simulateMemoryPressure(page: Page) {
    await page.addInitScript(() => {
      // Create large objects to simulate memory pressure
      const largeArray = new Array(1000000).fill('memory-pressure-test');
      (window as any).testMemoryPressure = largeArray;
    });
  }
}