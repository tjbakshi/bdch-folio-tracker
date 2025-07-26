# Testing Guide

This document outlines the comprehensive testing infrastructure for the BDC Analytics application.

## Overview

The testing suite includes:
- **Unit Tests**: Component and utility function tests
- **E2E Tests**: Full user journey testing with Playwright
- **Smoke Tests**: Quick health checks for critical functionality
- **API Tests**: Edge function and endpoint validation

## Test Infrastructure Features

### 🔧 Environment Validation
- Automatic validation of required environment variables
- CI/CD integration with proper secret management
- Local development environment checks

### 🔄 Retry Logic
- Intelligent retry mechanisms for flaky operations
- Network-level retries with exponential backoff
- Different retry strategies for different test types

### ⏱️ Timeout Management
- Comprehensive timeout configurations for different operations
- CI vs local environment adaptations
- Operation-specific timeout tuning

### 🐛 Enhanced Debugging
- Automatic screenshot capture on failures
- Video recording for complex test scenarios
- Console log collection and network error tracking
- Page state capture for debugging

### 📊 Test Reporting
- Detailed test result artifacts
- Performance metrics and slow test reporting
- CI/CD integration with GitHub Actions
- Slack notifications for test results

## Running Tests

### Local Development

```bash
# Install dependencies
npm ci
npx playwright install --with-deps

# Run all E2E tests
npm run test:e2e

# Run tests with UI mode
npm run test:ui

# Run tests in headed mode (see browser)
npm run test:headed

# Run specific test file
npx playwright test tests/e2e.spec.ts

# Run tests with debugging
npm run test:debug
```

### CI/CD Environment

Tests run automatically in GitHub Actions with:
- Environment variable validation
- Supabase connectivity checks
- Enhanced error reporting
- Artifact collection

## Test Structure

### E2E Tests (`tests/e2e.spec.ts`)
- Admin backfill flow testing
- Dashboard functionality validation
- Investment data filtering and display
- Export functionality testing
- Responsive design validation

### Helper Functions (`tests/helpers/`)
- `waitForInvestments()`: Robust investment data loading
- `waitForToast()`: Toast notification handling
- `waitForApiResponse()`: API response validation
- `capturePageState()`: Debugging utilities
- `setupErrorTracking()`: Error monitoring

### Test Utilities (`tests/utils/`)
- Environment setup and validation
- Test configuration management
- Cleanup and teardown utilities

## Environment Variables

### Required for CI
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key
- `PLAYWRIGHT_BASE_URL`: Application base URL

### Optional
- `GITHUB_RUN_ID`: CI run identification
- `TEST_START_TIME`: Test timing metrics

## Best Practices

### 1. Test Isolation
- Each test should be independent
- Use proper setup/teardown procedures
- Avoid shared state between tests

### 2. Error Handling
- Use retry mechanisms for flaky operations
- Capture debugging information on failures
- Provide meaningful error messages

### 3. Performance
- Use appropriate timeouts for different operations
- Leverage parallel test execution when possible
- Monitor and optimize slow tests

### 4. Debugging
- Enable screenshot/video capture in CI
- Use console logging for test flow tracking
- Capture network activity for API issues

## Troubleshooting

### Common Issues

1. **Tests timeout in CI**
   - Check environment variable configuration
   - Verify Supabase connectivity
   - Review timeout settings

2. **Flaky test failures**
   - Examine retry logic configuration
   - Check for race conditions
   - Review element selection strategies

3. **Missing test data**
   - Verify API endpoint responses
   - Check database connectivity
   - Review test data seeding

### Debug Commands

```bash
# Run single test with full logging
npx playwright test tests/e2e.spec.ts --headed --debug

# Generate test code
npm run playwright:codegen

# View test results
npx playwright show-report
```

## CI/CD Integration

### GitHub Actions Workflow
The CI/CD pipeline includes:
1. Environment validation
2. Dependency installation
3. Playwright browser setup
4. E2E test execution
5. Artifact collection
6. Result reporting

### Slack Notifications
- Success/failure notifications
- Detailed error logs on failures
- Test artifact links

## Monitoring and Metrics

### Test Performance
- Slow test identification (>30s threshold)
- Execution time tracking
- Retry frequency monitoring

### Success Rates
- Test pass/fail rates over time
- Flaky test identification
- Environment-specific metrics

## Contributing

When adding new tests:
1. Use the established helper functions
2. Include proper error handling
3. Add appropriate timeouts
4. Test both success and failure scenarios
5. Update this documentation as needed

## Links

- [Playwright Documentation](https://playwright.dev/)
- [Testing Best Practices](https://playwright.dev/docs/best-practices)
- [CI/CD Configuration](.github/workflows/ci-cd.yml)