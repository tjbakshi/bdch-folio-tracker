import { test, expect, type Page } from '@playwright/test';

/**
 * BDC Analytics E2E Test Suite
 * Tests critical user flows across admin, dashboard, filtering, and documentation
 */

test.describe('BDC Analytics Application', () => {
  
  test.beforeEach(async ({ page }) => {
    // Set longer timeout for API calls
    page.setDefaultTimeout(30000);
  });

  test('Admin Backfill Flow', async ({ page }) => {
    // Navigate to admin page
    await page.goto('/admin');
    
    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'BDC Admin Dashboard' })).toBeVisible();
    
    // Verify initial state - should see BDCs table
    await expect(page.getByTestId('bdc-universe-table')).toBeVisible();
    
    // Look for the "Backfill All BDCs" button
    const backfillButton = page.getByTestId('backfill-all-button');
    await expect(backfillButton).toBeVisible();
    await expect(backfillButton).not.toBeDisabled();
    
    // Trigger backfill process
    await backfillButton.click();
    
    // Wait for success toast to appear
    await expect(page.getByText(/started backfill/i).first()).toBeVisible({ timeout: 10000 });
    
    // Wait a moment for logs to potentially update
    await page.waitForTimeout(3000);
    
    // Verify at least one log entry appears in recent logs
    const logsSection = page.getByTestId('processing-logs');
    await expect(logsSection).toBeVisible();
    
    // Check that there's at least one log entry
    const logEntries = page.locator('[data-testid="log-entry"]');
    await expect(logEntries.first()).toBeVisible();
  });

  test('Dashboard Data Display', async ({ page }) => {
    // Set up network interception for POST /investments
    await page.route('**/bdc-api/investments**', async route => {
      if (route.request().method() === 'POST') {
        console.log('✅ Intercepted POST request to /bdc-api/investments');
        // Mock successful response
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: "test-123",
                company_name: "Test Corp",
                business_description: "Test business",
                investment_tranche: "First Lien",
                principal_amount: 1000000,
                fair_value: 950000,
                filings: {
                  ticker: "TEST",
                  filing_date: "2024-01-01",
                  filing_type: "10-Q"
                },
                investments_computed: [{
                  mark: 0.95,
                  is_non_accrual: false,
                  quarter_year: "Q1 2024"
                }]
              }
            ],
            pagination: {
              page: 1,
              limit: 100,
              total: 1,
              totalPages: 1
            }
          })
        });
      } else {
        // Continue with actual request for other methods
        await route.continue();
      }
    });

    // Navigate to dashboard
    await page.goto('/');
    
    // Wait for loading to complete
    await expect(page.getByText('Loading dashboard data...')).toBeHidden({ timeout: 15000 });
    
    // Verify main dashboard elements are visible
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Check summary cards show non-zero values
    const totalAssetsCard = page.getByTestId('total-assets-card');
    await expect(totalAssetsCard).toBeVisible();
    
    const averageMarkCard = page.getByTestId('average-mark-card');
    await expect(averageMarkCard).toBeVisible();
    
    // Wait for data to load and verify non-zero values
    await expect(async () => {
      const totalAssetsText = await totalAssetsCard.textContent();
      const averageMarkText = await averageMarkCard.textContent();
      
      // Check that values are not just "$0" or "0%"
      expect(totalAssetsText).not.toMatch(/\$0[^0-9]/);
      expect(averageMarkText).not.toMatch(/^0\.0%/);
    }).toPass({ timeout: 10000 });
    
    // Verify holdings table is present and has data
    const holdingsTable = page.getByTestId('holdings-table');
    await expect(holdingsTable).toBeVisible();
    
    // Check that table has at least one row of data
    const tableRows = page.locator('[data-testid="investment-row"]');
    await expect(tableRows.first()).toBeVisible();
  });

  test('Filter & Export Flow', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    
    // Wait for data to load
    await expect(page.getByText('Loading dashboard data...')).toBeHidden({ timeout: 15000 });
    
    // Apply manager filter
    await page.waitForSelector('[data-testid="manager-filter"]', { state: 'visible' });
    const managerSelect = page.getByTestId('manager-filter');
    await expect(managerSelect).toBeVisible();
    await managerSelect.click();
    
    // Select ARCC (or first available option)
    const arccOption = page.getByRole('option', { name: /ARCC/i }).first();
    if (await arccOption.isVisible()) {
      await arccOption.click();
    } else {
      // Fallback to first available manager option
      await page.getByRole('option').first().click();
    }
    
    // Wait for filter to apply
    await page.waitForTimeout(1000);
    
    // Verify filtered results
    const tableRows = page.locator('[data-testid="investment-row"]');
    const firstRowManager = tableRows.first().getByTestId('manager-badge');
    await expect(firstRowManager).toBeVisible();
    
    // Set up download listener before clicking export
    const downloadPromise = page.waitForEvent('download');
    
    // Click export button
    const exportButton = page.getByTestId('export-button');
    await expect(exportButton).toBeVisible();
    await exportButton.click();
    
    // Wait for download to start
    const download = await downloadPromise;
    
    // Verify download properties
    expect(download.suggestedFilename()).toMatch(/bdc-investments.*\.csv/);
    
    // Verify success toast appears
    await expect(page.getByText(/export downloaded successfully/i).first()).toBeVisible();
  });

  test('Search and Filtering', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    
    // Wait for data to load
    await expect(page.getByText('Loading dashboard data...')).toBeHidden({ timeout: 15000 });
    
    // Test search functionality
    const searchInput = page.getByTestId('search-input');
    await expect(searchInput).toBeVisible();
    
    // Enter search term
    await searchInput.fill('Tech');
    
    // Wait for search to filter results
    await page.waitForTimeout(1000);
    
    // Verify search results contain the search term
    const tableRows = page.locator('[data-testid="investment-row"]');
    if (await tableRows.first().isVisible()) {
      const firstRowText = await tableRows.first().textContent();
      expect(firstRowText?.toLowerCase()).toContain('tech');
    }
    
    // Clear search
    await searchInput.clear();
    await page.waitForTimeout(500);
    
    // Test tranche filter
    await page.waitForSelector('[data-testid="tranche-filter"]', { state: 'visible' });
    const trancheSelect = page.getByTestId('tranche-filter');
    await expect(trancheSelect).toBeVisible();
    await trancheSelect.click();
    
    // Select First Lien
    const firstLienOption = page.getByRole('option', { name: 'First Lien' });
    if (await firstLienOption.isVisible()) {
      await firstLienOption.click();
      
      // Wait for filter to apply
      await page.waitForTimeout(1000);
      
      // Verify filtered results show First Lien
      const firstRowTranche = tableRows.first().getByTestId('tranche-cell');
      if (await firstRowTranche.isVisible()) {
        await expect(firstRowTranche).toContainText('First Lien');
      }
    }
  });

  test('Investment Detail Navigation', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    
    // Wait for data to load
    await expect(page.getByText('Loading dashboard data...')).toBeHidden({ timeout: 15000 });
    
    // Find first investment row
    const firstInvestmentRow = page.locator('[data-testid="investment-row"]').first();
    await expect(firstInvestmentRow).toBeVisible();
    
    // Get investment company name for verification
    const companyName = await firstInvestmentRow.getByTestId('company-name').textContent();
    
    // Click on the investment row to view details
    await firstInvestmentRow.click();
    
    // For now, since we don't have a detail modal implemented,
    // we'll verify that the row is clickable and shows investment data
    await expect(firstInvestmentRow.getByTestId('company-name')).toContainText(companyName || '');
    await expect(firstInvestmentRow.getByTestId('principal-amount')).toBeVisible();
    await expect(firstInvestmentRow.getByTestId('fair-value')).toBeVisible();
    await expect(firstInvestmentRow.getByTestId('mark-value')).toBeVisible();
    
    // Verify mark icon is present
    const markIcon = firstInvestmentRow.getByTestId('mark-icon');
    await expect(markIcon).toBeVisible();
  });

  test('Docs Smoke Test', async ({ page }) => {
    // Navigate to docs page
    await page.goto('/docs');
    
    // Should redirect to /docs.html
    await page.waitForURL('**/docs.html', { timeout: 10000 });
    
    // Verify Swagger UI elements are present
    await expect(page.locator('.swagger-ui').first()).toBeVisible({ timeout: 15000 });
    
    // Verify custom header is present
    await expect(page.getByRole('heading', { name: 'BDC Investment Analytics API' })).toBeVisible();
    
    // Verify API info section
    await expect(page.getByText('Quick Start Guide')).toBeVisible();
    
    // Verify endpoints are documented
    await expect(page.getByText('/investments')).toBeVisible();
    await expect(page.getByText('/export')).toBeVisible();
    
    // Verify at least one API method is expandable
    await expect(page.locator('.opblock')).toBeVisible();
  });

  test('Admin Scheduled Jobs Management', async ({ page }) => {
    // Navigate to admin page
    await page.goto('/admin');
    
    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'BDC Admin Dashboard' })).toBeVisible();
    
    // Find and click "Setup Scheduled Jobs" button
    await page.waitForSelector('[data-testid="setup-jobs-button"]', { state: 'visible' });
    const setupJobsButton = page.getByTestId('setup-jobs-button');
    await expect(setupJobsButton).toBeVisible();
    await setupJobsButton.click();
    
    // Wait for success toast
    await expect(page.getByText(/scheduled jobs setup/i).first()).toBeVisible({ timeout: 10000 });
    
    // Verify scheduled jobs table shows entries
    const jobsTable = page.getByTestId('scheduled-jobs-table');
    await expect(jobsTable).toBeVisible();
    
    // Check that at least one job entry exists
    const jobRows = page.locator('[data-testid="job-row"]');
    await expect(jobRows.first()).toBeVisible();
  });

  test('Error Handling', async ({ page }) => {
    // Test navigation to non-existent page
    await page.goto('/non-existent-page');
    
    // Should show 404 or redirect to a valid page
    await expect(page).toHaveURL(/\/(?:404|not-found|\*|non-existent-page)$/, { timeout: 5000 });
    
    // Navigate back to dashboard
    await page.goto('/');
    
    // Verify app recovers gracefully
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible({ timeout: 10000 });
  });

  test('Responsive Design', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Wait for load
    await expect(page.getByText('Loading dashboard data...')).toBeHidden({ timeout: 15000 });
    
    // Verify mobile layout works
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Check that cards are stacked vertically (should be visible)
    const summaryCards = page.locator('[data-testid$="-card"]');
    await expect(summaryCards.first()).toBeVisible();
    
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(500);
    
    // Verify layout adjusts
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Reset to desktop
    await page.setViewportSize({ width: 1280, height: 720 });
  });
  
  test('Dashboard POST-Only Functionality', async ({ page }) => {
    // Block all GET requests to /investments and ensure dashboard still works via POST
    await page.route('**/bdc-api/investments**', async route => {
      const method = route.request().method();
      
      if (method === 'GET') {
        console.log('❌ Blocking GET request to /bdc-api/investments');
        // Block GET requests with 405 Method Not Allowed
        await route.fulfill({
          status: 405,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'GET method not allowed in this test' })
        });
      } else if (method === 'POST') {
        console.log('✅ Allowing POST request to /bdc-api/investments');
        // Mock successful POST response with test data
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [
              {
                id: "post-test-123",
                company_name: "POST Test Corp",
                business_description: "POST-only test business",
                investment_tranche: "First Lien",
                principal_amount: 2000000,
                fair_value: 1900000,
                filings: {
                  ticker: "POST",
                  filing_date: "2024-01-15",
                  filing_type: "10-K"
                },
                investments_computed: [{
                  mark: 0.95,
                  is_non_accrual: false,
                  quarter_year: "Q1 2024"
                }]
              }
            ],
            pagination: {
              page: 1,
              limit: 100,
              total: 1,
              totalPages: 1
            }
          })
        });
      } else {
        // Allow other methods to continue
        await route.continue();
      }
    });

    // Navigate to dashboard
    await page.goto('/');
    
    // Wait for loading to complete - should work via POST only
    await expect(page.getByText('Loading dashboard data...')).toBeHidden({ timeout: 15000 });
    
    // Verify dashboard loads successfully with POST-only data
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Verify the test data appears (confirming POST was used)
    const holdingsTable = page.getByTestId('holdings-table');
    await expect(holdingsTable).toBeVisible();
    
    // Check that our POST-specific test data is displayed
    await expect(page.getByText('POST Test Corp')).toBeVisible();
    await expect(page.getByText('POST-only test business')).toBeVisible();
    
    // Verify summary cards are populated
    const totalAssetsCard = page.getByTestId('total-assets-card');
    await expect(totalAssetsCard).toBeVisible();
    
    // Test that filtering still works with POST
    await page.waitForSelector('[data-testid="manager-filter"]', { state: 'visible' });
    const managerSelect = page.getByTestId('manager-filter');
    await expect(managerSelect).toBeVisible();
    await managerSelect.click();
    
    // Select "All Managers" to trigger a new POST request
    const allManagersOption = page.getByRole('option', { name: 'All Managers' });
    if (await allManagersOption.isVisible()) {
      await allManagersOption.click();
      // Wait for filter to apply via POST
      await page.waitForTimeout(1000);
    }
    
    console.log('✅ Dashboard successfully loaded using POST-only requests');
  });
  
  test('Network Error Handling for Investments API', async ({ page }) => {
    // Test dashboard behavior when investments API returns various errors
    let requestCount = 0;
    
    await page.route('**/bdc-api/investments**', async route => {
      requestCount++;
      
      if (requestCount === 1) {
        // First request: 404 error
        await route.fulfill({
          status: 404,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Not found' })
        });
      } else if (requestCount === 2) {
        // Second request: 500 error  
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal server error' })
        });
      } else {
        // Subsequent requests: success
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            data: [],
            pagination: { page: 1, limit: 100, total: 0, totalPages: 0 }
          })
        });
      }
    });

    // Navigate to dashboard
    await page.goto('/');
    
    // Should eventually show dashboard even after errors
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible({ timeout: 20000 });
    
    // Check that error states are handled gracefully
    const holdingsTable = page.getByTestId('holdings-table');
    await expect(holdingsTable).toBeVisible();
    
    console.log(`✅ Handled ${requestCount} API requests including errors`);
  });

});

/**
 * Helper function to wait for toast to appear and disappear
 */
async function waitForToast(page: Page, message: string | RegExp) {
  await expect(page.getByText(message)).toBeVisible();
  await expect(page.getByText(message)).toBeHidden({ timeout: 10000 });
}