import { expect, type Page } from '@playwright/test';

/**
 * Helper function to wait for investments data to load
 */
export async function waitForInvestments(page: Page) {
  await page.waitForResponse(r =>
    r.url().includes('/bdc-api/investments') && r.status() === 200
  );
  await page.waitForSelector('[data-testid="investment-row"]', { timeout: 15000 });
}

/**
 * Helper function to wait for toast to appear and disappear
 */
export async function waitForToast(page: Page, message: RegExp) {
  // Wait for toast to appear using accessible role
  await expect(
    page.getByRole('status', { name: message })
  ).toBeVisible({ timeout: 15000 });
  
  // Wait for toast to disappear
  await expect(
    page.getByRole('status', { name: message })
  ).toBeHidden({ timeout: 10000 });
}