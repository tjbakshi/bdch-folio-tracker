/**
 * Enhanced E2E Tests - Error Scenarios & Edge Cases
 */

import { test, expect, type Page } from '@playwright/test';
import { ErrorScenarios, BrowserErrorScenarios } from './helpers/error-scenarios';
import { InvestmentDataFactory, TestScenarios } from './factories/investment-data';
import { waitForInvestments, waitForToast, capturePageState } from './helpers/playwright';

test.describe('Error Handling & Edge Cases', () => {

  test('Empty Investment Data Display', async ({ page }) => {
    // Setup empty data scenario
    await ErrorScenarios.simulateEmptyData(page);
    
    await page.goto('/');
    
    // Verify empty state is handled gracefully
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Check for empty state message or zero values
    const holdingsTable = page.getByTestId('holdings-table');
    await expect(holdingsTable).toBeVisible();
    
    // Verify summary cards show zero values appropriately
    const totalAssetsCard = page.getByTestId('total-assets-card');
    await expect(totalAssetsCard).toContainText('$0');
    
    // Verify no investment rows appear
    const investmentRows = page.locator('[data-testid="investment-row"]');
    await expect(investmentRows).toHaveCount(0);
  });

  test('Network Failure Recovery', async ({ page }) => {
    // Start with network failure
    await ErrorScenarios.simulateNetworkFailure(page);
    
    await page.goto('/');
    
    // Verify app doesn't crash on network failure
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Restore network and setup normal data
    await ErrorScenarios.cleanupRoutes(page);
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(InvestmentDataFactory.createAPIResponse(
          TestScenarios.normalInvestments()
        ))
      });
    });
    
    // Reload page and verify recovery
    await page.reload();
    await waitForInvestments(page);
    
    const investmentRows = page.locator('[data-testid="investment-row"]');
    await expect(investmentRows.first()).toBeVisible();
  });

  test('Server Error Handling', async ({ page }) => {
    await ErrorScenarios.simulateServerError(page);
    
    await page.goto('/');
    
    // Verify dashboard still loads but shows appropriate error state
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Check that error is handled gracefully (no crash)
    const holdingsTable = page.getByTestId('holdings-table');
    await expect(holdingsTable).toBeVisible();
  });

  test('Filter with No Results', async ({ page }) => {
    // Setup data with specific managers
    const testData = TestScenarios.allSameManager(); // All ARCC investments
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(InvestmentDataFactory.createAPIResponse(testData))
      });
    });
    
    await page.goto('/');
    await waitForInvestments(page);
    
    // Try to filter by a manager that doesn't exist in the data
    const managerSelect = page.getByRole('combobox', { name: /Manager/i });
    await managerSelect.click();
    
    // Look for a manager option that's not ARCC
    const nonExistentOption = page.getByRole('option', { name: /MAIN/i });
    if (await nonExistentOption.isVisible()) {
      await nonExistentOption.click();
      
      // Setup empty response for filtered request
      await page.route('**/bdc-api/investments**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(InvestmentDataFactory.createEmptyResponse())
        });
      });
      
      // Verify no results message or empty table
      await expect(page.locator('[data-testid="investment-row"]')).toHaveCount(0);
    }
  });

  test('Invalid Search Input Handling', async ({ page }) => {
    // Setup normal data
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(InvestmentDataFactory.createAPIResponse(
          TestScenarios.normalInvestments()
        ))
      });
    });
    
    await page.goto('/');
    await waitForInvestments(page);
    
    // Test various invalid search inputs
    const searchInput = page.getByRole('textbox', { name: /search/i }).or(page.getByTestId('search-input'));
    
    // Test special characters
    await searchInput.fill('!@#$%^&*()');
    await page.waitForTimeout(1000);
    
    // Test very long string
    await searchInput.fill('a'.repeat(1000));
    await page.waitForTimeout(1000);
    
    // Test SQL injection attempt
    await searchInput.fill("'; DROP TABLE investments; --");
    await page.waitForTimeout(1000);
    
    // Verify app doesn't crash
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
  });

  test('Export Failure Handling', async ({ page }) => {
    // Setup normal investment data
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(InvestmentDataFactory.createAPIResponse(
          TestScenarios.normalInvestments()
        ))
      });
    });
    
    // Setup export failure
    await ErrorScenarios.simulateExportFailure(page);
    
    await page.goto('/');
    await waitForInvestments(page);
    
    // Try to export and expect failure
    const exportButton = page.getByTestId('export-button');
    await expect(exportButton).toBeVisible();
    await exportButton.click();
    
    // Verify error toast appears instead of download
    await expect(page.getByText(/error.*export/i)).toBeVisible({ timeout: 10000 });
  });

  test('Admin Backfill Failure', async ({ page }) => {
    // Setup backfill failure
    await ErrorScenarios.simulateBackfillFailure(page);
    
    await page.goto('/admin');
    
    // Wait for admin page to load
    await expect(page.getByRole('heading', { name: 'BDC Admin Dashboard' })).toBeVisible();
    
    // Try backfill operation
    const backfillButton = page.getByTestId('backfill-all-button');
    await expect(backfillButton).toBeVisible();
    await backfillButton.click();
    
    // Verify error handling
    await expect(page.getByText(/error.*backfill/i)).toBeVisible({ timeout: 10000 });
  });

  test('Malformed API Response Handling', async ({ page }) => {
    await ErrorScenarios.simulateInvalidJSON(page);
    
    await page.goto('/');
    
    // Verify app handles malformed JSON gracefully
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // App should not crash, but may show error state
    const holdingsTable = page.getByTestId('holdings-table');
    await expect(holdingsTable).toBeVisible();
  });

  test('Slow API Response Handling', async ({ page }) => {
    // Simulate slow API (5 second delay)
    await ErrorScenarios.simulateSlowAPI(page, 5000);
    
    await page.goto('/');
    
    // Verify loading state is shown
    await expect(page.getByText(/loading/i)).toBeVisible();
    
    // Wait for data to eventually load
    await waitForInvestments(page, 15000);
    
    // Verify dashboard loads after delay
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
  });

  test('Large Dataset Performance', async ({ page }) => {
    // Setup large dataset
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(InvestmentDataFactory.createAPIResponse(
          TestScenarios.largeDataset()
        ))
      });
    });
    
    await page.goto('/');
    await waitForInvestments(page);
    
    // Verify app handles large dataset
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Check that pagination or virtualization works
    const investmentRows = page.locator('[data-testid="investment-row"]');
    await expect(investmentRows.first()).toBeVisible();
    
    // Test search performance with large dataset
    const searchInput = page.getByRole('textbox', { name: /search/i }).or(page.getByTestId('search-input'));
    await searchInput.fill('Corp');
    await page.waitForTimeout(2000);
    
    // App should still be responsive
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
  });

  test('JavaScript Error Recovery', async ({ page }) => {
    // Inject JavaScript error
    await BrowserErrorScenarios.simulateJSError(page);
    
    await page.goto('/');
    
    // Verify app doesn't completely break
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible({ timeout: 15000 });
  });

  test('Concurrent User Actions', async ({ page }) => {
    // Setup normal data
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(InvestmentDataFactory.createAPIResponse(
          TestScenarios.mixedTranches()
        ))
      });
    });
    
    await page.goto('/');
    await waitForInvestments(page);
    
    // Simulate rapid user interactions
    const searchInput = page.getByRole('textbox', { name: /search/i }).or(page.getByTestId('search-input'));
    const managerSelect = page.getByRole('combobox', { name: /Manager/i });
    const trancheSelect = page.getByRole('combobox', { name: /Tranche/i });
    
    // Rapid fire interactions
    await Promise.all([
      searchInput.fill('Corp'),
      managerSelect.click(),
      page.waitForTimeout(100),
      trancheSelect.click()
    ]);
    
    await page.waitForTimeout(2000);
    
    // Verify app remains stable
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
  });

});

test.describe('Accessibility & Usability Edge Cases', () => {

  test('Keyboard Navigation', async ({ page }) => {
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(InvestmentDataFactory.createAPIResponse(
          TestScenarios.normalInvestments()
        ))
      });
    });
    
    await page.goto('/');
    await waitForInvestments(page);
    
    // Test keyboard navigation through filters
    await page.keyboard.press('Tab'); // Move to first interactive element
    await page.keyboard.press('Tab'); // Move to search
    await page.keyboard.type('Corp');
    
    await page.keyboard.press('Tab'); // Move to manager filter
    await page.keyboard.press('Enter'); // Open dropdown
    await page.keyboard.press('ArrowDown'); // Navigate options
    await page.keyboard.press('Enter'); // Select option
    
    // Verify filters work with keyboard
    await waitForInvestments(page);
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
  });

  test('High Contrast Mode Compatibility', async ({ page }) => {
    // Simulate high contrast mode
    await page.addInitScript(() => {
      document.documentElement.style.filter = 'contrast(200%)';
    });
    
    await page.route('**/bdc-api/investments**', route => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(InvestmentDataFactory.createAPIResponse(
          TestScenarios.normalInvestments()
        ))
      });
    });
    
    await page.goto('/');
    await waitForInvestments(page);
    
    // Verify app is still usable in high contrast
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    const holdingsTable = page.getByTestId('holdings-table');
    await expect(holdingsTable).toBeVisible();
  });

});