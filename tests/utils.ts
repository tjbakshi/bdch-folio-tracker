/**
 * Test utilities for Playwright E2E tests
 */

import { expect, type Page, type Locator } from '@playwright/test';

/**
 * Wait for loading spinner to disappear
 */
export async function waitForLoading(page: Page, timeout = 15000) {
  await expect(page.getByText('Loading dashboard data...')).toBeHidden({ timeout });
}

/**
 * Wait for toast notification to appear and optionally disappear
 */
export async function waitForToast(
  page: Page, 
  message: string | RegExp, 
  options: { shouldDisappear?: boolean; timeout?: number } = {}
) {
  const { shouldDisappear = false, timeout = 10000 } = options;
  
  await expect(page.getByText(message)).toBeVisible({ timeout });
  
  if (shouldDisappear) {
    await expect(page.getByText(message)).toBeHidden({ timeout });
  }
}

/**
 * Fill form field and wait for changes to apply
 */
export async function fillAndWait(locator: Locator, value: string, waitTime = 500) {
  await locator.fill(value);
  await locator.page().waitForTimeout(waitTime);
}

/**
 * Click and wait for response
 */
export async function clickAndWaitForResponse(
  page: Page,
  locator: Locator,
  urlPattern: string | RegExp
) {
  const responsePromise = page.waitForResponse(urlPattern);
  await locator.click();
  return await responsePromise;
}

/**
 * Verify download was initiated
 */
export async function verifyDownload(
  page: Page,
  triggerAction: () => Promise<void>,
  expectedFilename?: RegExp
) {
  const downloadPromise = page.waitForEvent('download');
  await triggerAction();
  const download = await downloadPromise;
  
  if (expectedFilename) {
    expect(download.suggestedFilename()).toMatch(expectedFilename);
  }
  
  return download;
}

/**
 * Check if element contains non-zero value
 */
export async function expectNonZeroValue(locator: Locator, pattern: RegExp) {
  await expect(async () => {
    const text = await locator.textContent();
    expect(text).not.toMatch(pattern);
  }).toPass({ timeout: 10000 });
}

/**
 * Wait for table to have data
 */
export async function waitForTableData(tableLocator: Locator, rowSelector: string) {
  const firstRow = tableLocator.locator(rowSelector).first();
  await expect(firstRow).toBeVisible({ timeout: 10000 });
}

/**
 * Select option from dropdown
 */
export async function selectDropdownOption(
  selectLocator: Locator,
  optionText: string | RegExp,
  fallbackToFirst = true
) {
  await selectLocator.click();
  
  const option = selectLocator.page().getByRole('option', { name: optionText });
  
  if (await option.isVisible()) {
    await option.click();
  } else if (fallbackToFirst) {
    await selectLocator.page().getByRole('option').first().click();
  } else {
    throw new Error(`Option "${optionText}" not found`);
  }
}

/**
 * Wait for API response with retry
 */
export async function waitForApiResponse(
  page: Page,
  urlPattern: string | RegExp,
  maxRetries = 3
) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await page.waitForResponse(urlPattern, { timeout: 10000 });
    } catch (error) {
      if (i === maxRetries - 1) throw error;
      await page.waitForTimeout(2000);
    }
  }
}

/**
 * Verify responsive layout at different viewport sizes
 */
export async function testResponsiveLayout(
  page: Page,
  tests: Array<{ width: number; height: number; assertions: () => Promise<void> }>
) {
  for (const test of tests) {
    await page.setViewportSize({ width: test.width, height: test.height });
    await page.waitForTimeout(500); // Allow layout to adjust
    await test.assertions();
  }
}