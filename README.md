# BDC Investment Analytics Platform

A comprehensive platform for analyzing Business Development Company (BDC) investment data with automated SEC filing extraction, real-time monitoring, and interactive dashboards.

## Features

- **Real-time Dashboard**: Interactive BDC investment data visualization
- **SEC Data Extraction**: Automated parsing of 10-K and 10-Q filings
- **Investment Analytics**: Mark history, non-accrual tracking, and performance metrics
- **API Documentation**: Comprehensive Swagger UI for all endpoints
- **Type-safe SDK**: Full TypeScript client library with error handling
- **Comprehensive Monitoring**: Structured logging and performance tracking
- **Automated Testing**: End-to-end smoke tests with CI/CD integration
- **Slack Notifications**: Real-time alerts for deployments and test results

## Architecture

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Supabase Edge Functions (Deno)
- **Database**: PostgreSQL with Row Level Security
- **API**: RESTful endpoints with OpenAPI 3.0 specification
- **Monitoring**: LocalSentry with structured logging
- **CI/CD**: GitHub Actions with automated testing and deployment

## Monitoring & Notifications

This project includes comprehensive monitoring and alerting to ensure system reliability and rapid issue detection.

### LocalSentry Monitoring

We've implemented a custom monitoring solution that provides Sentry-like functionality without external dependencies:

- **Transaction Tracking**: Full request lifecycle monitoring for all edge functions
- **Performance Spans**: Individual operation timing (database queries, SEC parsing, etc.)
- **Error Capture**: Structured exception logging with context and stack traces
- **Structured Logging**: JSON-formatted logs with `[SENTRY]` prefix for easy filtering

**Monitored Operations:**
- **BDC API**: `/investments`, `/marks/{id}`, `/nonaccruals`, `/export`, `/cache/invalidate`
- **SEC Extractor**: `backfill_all`, `backfill_ticker`, `extract_filing`, `incremental_check`

### Automated Smoke Tests

Our CI/CD pipeline includes comprehensive smoke tests that verify both functionality and monitoring:

```typescript
// Example: tests/smoke-test.ts
- Tests all API endpoints with realistic payloads
- Verifies response times and status codes  
- Checks for [SENTRY] log entries in function outputs
- Validates error handling and context capture
- Generates detailed test reports with performance metrics
```

### Slack Notifications

Real-time notifications keep your team informed of deployment status and issues:

- **✅ Success Notifications**: Deployment completion with test results
- **❌ Failure Alerts**: Immediate notification with error details and logs
- **🧪 Smoke Test Results**: Instant feedback on endpoint health
- **📊 Artifact Links**: Direct access to test results and logs

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- Deno 1.40+ (for edge functions)
- Supabase CLI
- GitHub account (for CI/CD)

### Required GitHub Secrets

Configure these secrets in your GitHub repository settings (`Settings > Secrets and variables > Actions`):

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `SLACK_WEBHOOK_URL` | Slack webhook for notifications | Create in Slack: `Apps > Incoming Webhooks > Add to Slack` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase admin key for deployments | Supabase Dashboard: `Settings > API > service_role key` |
| `SUPABASE_PROJECT_REF` | Your Supabase project reference | Found in Supabase Dashboard URL |
| `SUPABASE_URL` | Your Supabase project URL | `https://[ref].supabase.co` |
| `SUPABASE_ANON_KEY` | Public Supabase key | Supabase Dashboard: `Settings > API > anon public` |
| `SENTRY_DSN_EDGE` | (Optional) Real Sentry DSN for edge functions | Sentry.io project settings |
| `VERCEL_TOKEN` | (Optional) Vercel deployment token | Vercel Dashboard: `Settings > Tokens` |

### GitHub Actions Integration

Here's how to integrate the monitoring system into your own workflow:

```yaml
# .github/workflows/your-workflow.yml
jobs:
  deploy-and-test:
    runs-on: ubuntu-latest
    steps:
      # ... your deployment steps ...
      
      - name: Run Edge Function Smoke Tests
        id: smoke-tests
        run: |
          mkdir -p test-results
          deno run --allow-net --allow-env tests/smoke-test.ts 2>&1 | tee test-results/smoke-test-output.log
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}

      - name: Upload smoke test results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: smoke-test-results
          path: test-results/
          retention-days: 7

      - name: Notify smoke test results to Slack
        if: always()
        uses: 8398a7/action-slack@v3
        with:
          status: custom
          custom_payload: |
            {
              "channel": "#dev-alerts",
              "attachments": [
                {
                  "color": "${{ job.status == 'success' && 'good' || 'danger' }}",
                  "title": "${{ job.status == 'success' && '✅ Smoke Tests Passed' || '❌ Smoke Tests Failed' }}",
                  "text": "${{ job.status == 'success' && 'All endpoints responding correctly.' || 'Tests failed. Check artifacts.' }}"
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Viewing Test Results

**Smoke Test Artifacts:**
1. Go to your GitHub repository
2. Click `Actions` tab
3. Select the workflow run
4. Scroll down to `Artifacts` section
5. Download `smoke-test-results` to view detailed logs

**Function Logs:**
- **BDC API**: `https://supabase.com/dashboard/project/[ref]/functions/bdc-api/logs`
- **SEC Extractor**: `https://supabase.com/dashboard/project/[ref]/functions/sec-extractor/logs`
- Look for `[SENTRY]` prefixed entries for monitoring data

**Test Commands:**
```bash
# Quick smoke test
deno run --allow-net --allow-env tests/quick-test.ts

# Full comprehensive test suite
deno run --allow-net --allow-env tests/smoke-test.ts

# Import Postman collection
# File: tests/bdc-analytics-postman.json
```

## Development

### Local Setup

```bash
# Clone the repository
git clone <YOUR_GIT_URL>
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start development server
npm run dev

# Run tests
npm run test:e2e
```

### API Documentation

- **Swagger UI**: Available at `/docs` when running locally
- **OpenAPI Spec**: `public/openapi.yaml`
- **TypeScript SDK**: `src/sdk/` directory

### Database

- **Schema**: Defined in `supabase/migrations/`
- **Functions**: `supabase/functions/`
- **Types**: Auto-generated in `src/integrations/supabase/types.ts`

## API Endpoints

### BDC API (`/functions/v1/bdc-api`)

- `GET|POST /investments` - Search and filter investment data (supports both GET and POST methods)
- `GET /marks/{raw_id}` - Get mark history for specific investment
- `GET /nonaccruals` - List investments in non-accrual status
- `POST /export` - Export filtered data as CSV
- `POST /cache/invalidate` - Clear API cache

### SEC Extractor (`/functions/v1/sec-extractor`)

- `POST /` with action: `backfill_all` - Full BDC data backfill
- `POST /` with action: `backfill_ticker` - Individual ticker processing
- `POST /` with action: `extract_filing` - Parse specific SEC filing
- `POST /` with action: `incremental_check` - Check for new filings

## Deployment

### Automatic Deployment (Recommended)

Push to main branch triggers automatic deployment via GitHub Actions:

1. **Tests**: Unit tests, E2E tests, Deno tests
2. **Build**: Frontend build with sourcemaps
3. **Deploy**: Edge functions and frontend
4. **Verify**: Smoke tests and monitoring checks
5. **Notify**: Slack notifications with results

### Manual Deployment

```bash
# Deploy edge functions
supabase functions deploy --project-ref <your-ref>

# Deploy frontend (if using Vercel)
vercel --prod
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Monitoring

- **Function Logs**: Supabase Dashboard > Functions > [function-name] > Logs
- **Error Tracking**: Search for `[SENTRY]` entries in function logs
- **Performance**: Monitor response times and success rates in smoke test results
- **Alerts**: Slack notifications for failures and performance issues

## Troubleshooting

### Common Issues

**Module not found errors in edge functions:**
- Ensure imports use correct relative paths
- Check that shared modules are under `functions/` directory

**Smoke tests failing:**
- Verify all GitHub secrets are configured
- Check Supabase function deployment status
- Review function logs for errors

**Missing [SENTRY] logs:**
- Confirm `SENTRY_DSN_EDGE` is set (optional but recommended)
- Check that LocalSentry is properly initialized
- Verify function deployment includes shared monitoring module

### Getting Help

- **Documentation**: [Lovable Docs](https://docs.lovable.dev/)
- **Issues**: Create a GitHub issue for bugs or feature requests
- **Monitoring**: Check `docs/MONITORING.md` for detailed monitoring setup

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

Built with ❤️ using [Lovable](https://lovable.dev)