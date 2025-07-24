import { test, expect, type Page } from '@playwright/test';
import { waitForInvestments, waitForToast } from './helpers/playwright';

/**
 * BDC Analytics E2E Test Suite
 * Tests critical user flows across admin, dashboard, filtering, and documentation
 */

test.describe('BDC Analytics Application', () => {
  
  test.beforeEach(async ({ page }) => {
    // stub out investments for every dashboard-based test
    await page.route('**/bdc-api/investments**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            id: 'stub-1',
            company_name: 'Tech Corp',
            manager: 'ARCC',
            business_description: 'A tech business',
            investment_tranche: 'First Lien',
            principal_amount: 123_456,
            fair_value: 120_000,
            filings: { ticker: 'TECH', filing_date: '2024-02-02', filing_type: '10-K' },
            investments_computed: [{ mark: 0.97, is_non_accrual: false, quarter_year: 'Q1 2024' }]
          }],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 }
        })
      });
    });

    // stub the backfill endpoint so the success toast actually fires
    await page.route('**/bdc-api/backfill**', route =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    );

    // stub scheduled jobs endpoints
    await page.route('**/bdc-api/scheduled-jobs**', route =>
      route.fulfill({ 
        status: 200, 
        contentType: 'application/json', 
        body: JSON.stringify([
          { id: 'job-1', name: 'Daily Backfill', schedule: '0 2 * * *', status: 'active' }
        ])
      })
    );

    // stub export endpoint
    await page.route('**/bdc-api/export**', route =>
      route.fulfill({ 
        status: 200, 
        contentType: 'text/csv',
        headers: { 'Content-Disposition': 'attachment; filename="bdc-investments-export.csv"' },
        body: 'company_name,manager,principal_amount\nTech Corp,ARCC,123456'
      })
    );

    page.setDefaultTimeout(30000);
  });

  // Clean up routes after each test
  test.afterEach(async ({ page }) => {
    page.unroute('**/bdc-api/investments**');
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
    
    // Robust click strategy for backfill button
    await backfillButton.scrollIntoViewIfNeeded();
    await backfillButton.click({ force: true });
    
    // Wait for success toast using DRY helper
    await waitForToast(page, /Started backfill for all BDCs/i);
    
    // Verify at least one log entry appears in recent logs
    const logsSection = page.getByTestId('processing-logs');
    await expect(logsSection).toBeVisible();
    
    // Check that there's at least one log entry with explicit wait
    await page.waitForSelector('[data-testid="log-entry"]', { timeout: 15000 });
    const logEntries = page.locator('[data-testid="log-entry"]');
    await expect(logEntries.first()).toBeVisible();
  });

  test('Dashboard Data Display', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    
    // Wait for investments data to load
    await waitForInvestments(page);
    
    // Verify main dashboard elements are visible
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Check summary cards show non-zero values
    const totalAssetsCard = page.getByTestId('total-assets-card');
    await expect(totalAssetsCard).toBeVisible();
    
    const averageMarkCard = page.getByTestId('average-mark-card');
    await expect(averageMarkCard).toBeVisible();
    
    // Simplified non-zero assertions using toHaveText negation
    await expect(totalAssetsCard).not.toHaveText(/\$0(?:\.00)?$/);
    await expect(averageMarkCard).not.toHaveText(/^0\.0%$/);
    
    // Verify holdings table is present and has data
    const holdingsTable = page.getByTestId('holdings-table');
    await expect(holdingsTable).toBeVisible();
    
    // Wait for investments data and verify table rows
    await waitForInvestments(page);
    const tableRows = page.locator('[data-testid="investment-row"]');
    await expect(tableRows.first()).toBeVisible();
  });

  test('Filter & Export Flow', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    
    // Wait for investments data to load
    await waitForInvestments(page);
    
    // Open the "Manager" dropdown using accessible combobox role
    const managerSelect = page.getByRole('combobox', { name: /Manager/i });
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
    
    // Wait for data to reload after filter
    await waitForInvestments(page);
    
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
    
    // Use DRY helper for toast checking
    await waitForToast(page, /Export downloaded successfully/i);
  });

  test('Search and Filtering', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    
    // Wait for investments data to load
    await waitForInvestments(page);
    
    // Use accessible role for search input (if possible, otherwise keep test ID)
    const searchInput = page.getByRole('textbox', { name: /search/i }).or(page.getByTestId('search-input'));
    await expect(searchInput).toBeVisible();
    
    // Enter search term
    await searchInput.fill('Tech');
    
    // Verify search results contain the search term
    await page.waitForSelector('[data-testid="investment-row"]', { timeout: 15000 });
    const tableRows = page.locator('[data-testid="investment-row"]');
    if (await tableRows.first().isVisible()) {
      const firstRowText = await tableRows.first().textContent();
      expect(firstRowText?.toLowerCase()).toContain('tech');
    }
    
    // Clear search
    await searchInput.clear();
    
    // Open the "Tranche" dropdown using accessible combobox role
    const trancheSelect = page.getByRole('combobox', { name: /Tranche/i });
    await expect(trancheSelect).toBeVisible();
    await trancheSelect.click();
    
    // Select First Lien
    const firstLienOption = page.getByRole('option', { name: 'First Lien' });
    if (await firstLienOption.isVisible()) {
      await firstLienOption.click();
      
      // Wait for data to reload after filter
      await waitForInvestments(page);
    }
  });

  test('Investment Detail Navigation', async ({ page }) => {
    // Navigate to dashboard
    await page.goto('/');
    
    // Wait for investments data to load
    await waitForInvestments(page);
    
    // wait for at least one investment row to appear
    await page.waitForSelector('[data-testid="investment-row"]', { timeout: 15000 });
    const firstInvestmentRow = page.locator('[data-testid="investment-row"]').first();
    await expect(firstInvestmentRow).toBeVisible();
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
    
    // Target first swagger-ui element to avoid strict mode violation
    await expect(
      page.locator('.swagger-ui').first()
    ).toBeVisible({ timeout: 15000 });
    
    // Verify custom header is present
    await expect(page.getByRole('heading', { name: 'BDC Investment Analytics API' })).toBeVisible();
    
    // Verify API info section - use first() to avoid strict mode
    await expect(page.getByText('Quick Start Guide').first()).toBeVisible();
    
    // Verify endpoints are documented - use first() to avoid strict mode
    await expect(page.getByText('/investments').first()).toBeVisible();
    await expect(page.getByText('/export').first()).toBeVisible();
    
    // Verify at least one API method is expandable
    await expect(page.locator('.opblock').first()).toBeVisible();
  });

  test('Admin Scheduled Jobs Management', async ({ page }) => {
    // Navigate to admin page
    await page.goto('/admin');
    
    // Wait for page to load
    await expect(page.getByRole('heading', { name: 'BDC Admin Dashboard' })).toBeVisible();
    
    // Find and click "Setup Scheduled Jobs" button with robust click strategy
    await page.waitForSelector('[data-testid="setup-jobs-button"]', { state: 'visible' });
    const setupJobsButton = page.getByTestId('setup-jobs-button');
    await expect(setupJobsButton).toBeVisible();
    await setupJobsButton.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500); // Wait for any animations
    await setupJobsButton.click({ force: true });
    
    // Wait for success toast using DRY helper
    await waitForToast(page, /Scheduled jobs setup/i);
    
    // Verify scheduled jobs table shows entries
    const jobsTable = page.getByTestId('scheduled-jobs-table');
    await expect(jobsTable).toBeVisible();
    
    // Wait for jobs table and check for rows with explicit wait
    await page.waitForSelector('[data-testid="job-row"]', { timeout: 10000 });
    const jobRows = page.locator('[data-testid="job-row"]');
    await expect(jobRows.first()).toBeVisible();
  });

  test('Error Handling', async ({ page }) => {
    // Test navigation to non-existent page
    await page.goto('/non-existent-page');
    
    // Verify 404 heading is visible instead of checking URL
    await expect(
      page.getByRole('heading', { name: /404/i })
    ).toBeVisible({ timeout: 5000 });
    
    // Navigate back to dashboard
    await page.goto('/');
    
    // Verify app recovers gracefully
    await expect(
      page.getByRole('heading', { name: 'BDC Investment Dashboard' })
    ).toBeVisible({ timeout: 10000 });
  });

});

// Group responsive tests in a dedicated describe block
test.describe('Responsive Design', () => {
  test.beforeEach(async ({ page }) => {
    // Same route stubs as main suite
    await page.route('**/bdc-api/investments**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{
            id: 'stub-1',
            company_name: 'Tech Corp',
            manager: 'ARCC',
            business_description: 'A tech business',
            investment_tranche: 'First Lien',
            principal_amount: 123_456,
            fair_value: 120_000,
            filings: { ticker: 'TECH', filing_date: '2024-02-02', filing_type: '10-K' },
            investments_computed: [{ mark: 0.97, is_non_accrual: false, quarter_year: 'Q1 2024' }]
          }],
          pagination: { page: 1, limit: 100, total: 1, totalPages: 1 }
        })
      });
    });
    page.setDefaultTimeout(30000);
  });

  test('Mobile Layout', async ({ page }) => {
    // Test mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Wait for investments data to load
    await waitForInvestments(page);
    
    // Verify mobile layout works
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Check that cards are stacked vertically (should be visible)
    const summaryCards = page.locator('[data-testid$="-card"]');
    await expect(summaryCards.first()).toBeVisible();
  });

  test('Tablet Layout', async ({ page }) => {
    // Test tablet viewport
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    // Wait for investments data to load
    await waitForInvestments(page);
    
    // Verify layout adjusts
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Verify table is responsive
    const holdingsTable = page.getByTestId('holdings-table');
    await expect(holdingsTable).toBeVisible();
  });

  test('Desktop Layout', async ({ page }) => {
    // Test desktop viewport
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    
    // Wait for investments data to load
    await waitForInvestments(page);
    
    // Verify desktop layout works
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Check that all cards are visible
    const summaryCards = page.locator('[data-testid$="-card"]');
    await expect(summaryCards.first()).toBeVisible();
  });
});
test.describe('Advanced API Testing', () => {
  test('Dashboard POST-Only Functionality', async ({ page }) => {
    // Un-route the global stub first
    page.unroute('**/bdc-api/investments**');
    
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
    
    // Wait for investments data to load
    await waitForInvestments(page);
    
    // Verify dashboard loads successfully with POST-only data
    await expect(page.getByRole('heading', { name: 'BDC Investment Dashboard' })).toBeVisible();
    
    // Verify the test data appears (confirming POST was used)
    const holdingsTable = page.getByTestId('holdings-table');
    await expect(holdingsTable).toBeVisible();
    
    // Check that our POST-specific test data is displayed
    await expect(page.getByText('POST Test Corp').first()).toBeVisible();
    await expect(page.getByText('POST-only test business').first()).toBeVisible();
    
    // Verify summary cards are populated
    const totalAssetsCard = page.getByTestId('total-assets-card');
    await expect(totalAssetsCard).toBeVisible();
    
    // Test that filtering still works with POST using role selector
    const managerSelect = page.getByRole('combobox', { name: 'All Managers' });
    await expect(managerSelect).toBeVisible();
    await managerSelect.click();
    
    // Select "All Managers" to trigger a new POST request
    const allManagersOption = page.getByRole('option', { name: 'All Managers' });
    if (await allManagersOption.isVisible()) {
      await allManagersOption.click();
    }
    
    console.log('✅ Dashboard successfully loaded using POST-only requests');
  });
  
  test('Network Error Handling for Investments API', async ({ page }) => {
    // Un-route the global stub first
    page.unroute('**/bdc-api/investments**');
    
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