import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for BDC Analytics E2E tests
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry logic with different strategies for different test types */
  retries: process.env.CI ? 3 : 1,
  /* Opt out of parallel tests on CI for stability */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['junit', { outputFile: 'test-results/junit.xml' }],
    ...(process.env.CI ? [['github']] : [])
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',

    /* Enhanced tracing and debugging */
    trace: process.env.CI ? 'on-first-retry' : 'retain-on-failure',
    
    /* Enhanced screenshot capture */
    screenshot: 'only-on-failure',
    
    /* Enhanced video recording */
    video: process.env.CI ? 'retain-on-failure' : 'on-first-retry',
    
    /* Timeout configurations for different operation types */
    actionTimeout: 30000,
    navigationTimeout: 45000,
    
    /* Extra HTTP headers for better debugging */
    extraHTTPHeaders: {
      'X-Test-Run-ID': process.env.GITHUB_RUN_ID || 'local-test',
    },
    
    /* Ignore HTTPS errors in development */
    ignoreHTTPSErrors: true,
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    /* Test against mobile viewports. */
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },

    /* Test against branded browsers. */
    {
      name: 'Microsoft Edge',
      use: { ...devices['Desktop Edge'], channel: 'msedge' },
    },
    {
      name: 'Google Chrome',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.CI ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 300000, // 5 minutes for server startup
    stdout: 'pipe',
    stderr: 'pipe',
  },

  /* Global setup and teardown */
  globalSetup: require.resolve('./tests/global-setup.ts'),
  globalTeardown: require.resolve('./tests/global-teardown.ts'),
  
  /* Enhanced timeout configurations */
  timeout: process.env.CI ? 120000 : 60000, // 2 minutes on CI, 1 minute locally
  
  /* Expect timeout configurations */
  expect: {
    timeout: 15000, // Longer expects for network operations
    toHaveScreenshot: { timeout: 30000 },
    toMatchSnapshot: { timeout: 30000 },
  },
  
  /* Test output settings */
  outputDir: 'test-results/',
  
  /* Report configuration with enhanced artifacts */
  reportSlowTests: { max: 10, threshold: 30000 },
});