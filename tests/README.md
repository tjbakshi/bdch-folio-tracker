# BDC Analytics Test Infrastructure

## Overview

This enhanced test infrastructure provides comprehensive coverage across multiple testing layers:

- **Core E2E Tests** (`e2e.spec.ts`) - Essential user flows and functionality
- **Enhanced E2E Tests** (`e2e-enhanced.spec.ts`) - Error scenarios, edge cases, and stress testing  
- **Smoke Tests** (`smoke-test.ts`) - Quick API validation and basic functionality
- **Test Data Factories** - Dynamic, realistic test data generation
- **Error Scenario Helpers** - Simulated failure conditions for robust testing

## 🚀 Quick Start

```bash
# Run all test suites
npm run test:e2e

# Run specific test suite
npm run test:suites -- --pattern core

# Run with UI for debugging
npm run test:e2e:ui

# Run in headed mode
npm run test:suites -- --headed

# Run on specific browser
npm run test:suites -- --browser firefox
```

## 📁 Test Structure

```
tests/
├── e2e.spec.ts              # Core E2E tests
├── e2e-enhanced.spec.ts     # Enhanced error & edge case tests
├── smoke-test.ts            # API smoke tests
├── factories/
│   └── investment-data.ts   # Test data factories
├── helpers/
│   ├── playwright.ts        # Playwright helpers
│   └── error-scenarios.ts   # Error simulation helpers
└── utils/
    ├── test-setup.ts        # Test environment setup
    └── env-setup.ts         # Environment configuration
```

## 🏭 Test Data Factories

### Investment Data Factory

Creates realistic, dynamic test data instead of hardcoded stubs:

```typescript
// Create single investment
const investment = InvestmentDataFactory.createInvestment({
  manager: 'ARCC',
  investment_tranche: 'First Lien'
});

// Create multiple investments
const investments = InvestmentDataFactory.createMultipleInvestments(10);

// Predefined scenarios
const data = TestScenarios.normalInvestments();
const empty = TestScenarios.emptyDataset();
const large = TestScenarios.largeDataset();
```

### Benefits

- **Realistic Data**: Generates data that mirrors production patterns
- **Variability**: Each test run uses slightly different data
- **Maintainable**: Central location for test data logic
- **Flexible**: Easy to create specific scenarios

## 🚨 Error Scenario Testing

### Network Errors

```typescript
await ErrorScenarios.simulateNetworkFailure(page);
await ErrorScenarios.simulateServerError(page, 500);
await ErrorScenarios.simulateSlowAPI(page, 5000);
```

### Data Edge Cases

```typescript
await ErrorScenarios.simulateEmptyData(page);
await ErrorScenarios.simulateInvalidJSON(page);
await ErrorScenarios.simulateAuthError(page);
```

### Browser Errors

```typescript
await BrowserErrorScenarios.simulateJSError(page);
await BrowserErrorScenarios.simulateMemoryPressure(page);
```

## 🧪 Test Categories

### Core E2E Tests

Essential user flows that must always work:

- Dashboard data display
- Investment filtering and search
- Export functionality
- Admin backfill operations
- API documentation access

### Enhanced E2E Tests

Robustness and edge case testing:

- **Empty States**: No data scenarios
- **Network Failures**: Connection issues, timeouts
- **Server Errors**: 5xx responses, malformed data
- **User Input Edge Cases**: Invalid search, concurrent actions
- **Performance**: Large datasets, slow responses
- **Accessibility**: Keyboard navigation, high contrast

### Responsive Tests

Cross-device compatibility:

- Mobile layout (375px)
- Tablet layout (768px)  
- Desktop layout (1280px+)

## 🔧 Configuration

### Playwright Config

Enhanced with:

- Increased retry logic (3 retries on CI)
- Better error capture (screenshots, videos, traces)
- Environment-specific timeouts
- Multiple browser support

### Environment Variables

```bash
# Required for CI
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
PLAYWRIGHT_BASE_URL=http://localhost:5173

# Optional
GITHUB_RUN_ID=run_identifier
TEST_START_TIME=timestamp
```

## 📊 Test Execution Strategies

### Local Development

```bash
# Quick feedback loop
npm run test:suites -- --pattern core --headed

# Debug specific test
npx playwright test tests/e2e.spec.ts:70 --headed --debug

# UI mode for interactive debugging
npm run test:e2e:ui
```

### CI Pipeline

```bash
# Full test suite with retries
npm run test:e2e

# Fast feedback (core tests only)
npm run test:suites -- --pattern core --fail-fast
```

### Test Data Management

- **Dynamic Generation**: Each test run creates fresh data
- **Consistent Scenarios**: Predefined scenarios for repeatability
- **Isolation**: Tests don't interfere with each other
- **Cleanup**: Automatic route cleanup between tests

## 🛠️ Debugging Features

### Enhanced Error Capture

- Screenshots on failure
- Video recordings of test runs
- Network request/response logging
- Console error tracking
- Page state snapshots

### Helper Functions

```typescript
// Wait for specific conditions
await waitForInvestments(page);
await waitForToast(page, /success/i);

// Capture debug information
await capturePageState(page, 'test-failure');

// Error tracking setup
await setupErrorTracking(page);
```

## 📈 Performance Considerations

### Test Optimization

- Parallel execution where safe
- Smart retry strategies
- Timeout tuning for different operations
- Resource cleanup between tests

### CI Optimization

- Reduced workers on CI for stability
- Enhanced retries for flaky network conditions
- Artifact capture for debugging failures
- Smart test ordering

## 🚀 Future Enhancements

### Planned Additions

1. **Visual Regression Testing**: Screenshot comparisons
2. **API Contract Testing**: Schema validation
3. **Load Testing**: Performance under stress
4. **Security Testing**: OWASP compliance checks
5. **Cross-Browser Matrix**: Automated multi-browser testing

### Monitoring & Metrics

- Test execution time tracking
- Flaky test identification
- Success rate monitoring
- Performance regression detection

## 📚 Best Practices

### Writing Tests

1. **Use Factories**: Always use data factories instead of hardcoded data
2. **Test Real Scenarios**: Focus on actual user workflows
3. **Handle Async**: Proper waiting for async operations
4. **Error Recovery**: Test error conditions and recovery
5. **Isolation**: Tests should be independent

### Debugging Failed Tests

1. **Check Screenshots**: Review failure screenshots first
2. **Examine Network Logs**: Look for failed API calls
3. **Review Console Errors**: Check for JavaScript errors
4. **Use UI Mode**: Interactive debugging with Playwright UI
5. **Isolate Issues**: Run single test with maximum logging

### Maintenance

1. **Regular Updates**: Keep test data factories current
2. **Review Flaky Tests**: Investigate and fix unstable tests
3. **Update Selectors**: Maintain test selectors as UI evolves
4. **Performance Monitoring**: Track and optimize test execution time
5. **Documentation**: Keep test documentation current

## 🎯 Testing Philosophy

This infrastructure follows these principles:

- **Quality Gates**: Tests must pass before deployment
- **Fast Feedback**: Quick identification of issues
- **Comprehensive Coverage**: Multiple testing layers
- **Real-World Scenarios**: Tests mirror actual usage
- **Maintainable**: Easy to update and extend
- **Debuggable**: Rich information for issue resolution

---

*Last Updated: 2024-07-26*