# Sentry Monitoring Setup

This application uses Sentry for comprehensive error tracking and performance monitoring across both frontend and backend components.

## Configuration

### Required Environment Variables

**Frontend (Vite):**
- `VITE_SENTRY_DSN` - Your Sentry project DSN for the React app

**Edge Functions (Supabase):**
- `SENTRY_DSN_EDGE` - Your Sentry project DSN for Deno edge functions

**CI/CD (GitHub Actions):**
- `SENTRY_AUTH_TOKEN` - Your Sentry auth token for sourcemap uploads
- `SENTRY_ORG` - Your Sentry organization slug

### Setup Steps

1. **Create Sentry Project**: Go to [Sentry.io](https://sentry.io) and create a new project
2. **Get DSN**: Copy your project DSN from Settings > Client Keys
3. **Add Secrets**: Add the environment variables to your deployment platform and GitHub Secrets
4. **Configure Alerts**: Set up alerts in Sentry for error rates and performance issues

## Monitoring Coverage

### Frontend
- **Error Boundary**: Catches React render errors
- **API Monitoring**: Tracks BDC API call performance and errors
- **User Sessions**: Records user interactions and errors
- **Performance**: Monitors page load times and route changes

### Edge Functions
- **Request Tracing**: Full request lifecycle monitoring
- **Database Operations**: Query performance tracking
- **Error Capture**: Automatic exception reporting with context
- **Custom Context**: Includes CIK, ticker, and operation details

## Alerts to Configure

1. **High Error Rate**: > 5% error rate over 5 minutes
2. **Slow API Responses**: > 2s average response time
3. **Failed Deployments**: Any deployment failures
4. **Database Errors**: Query timeouts or connection issues

## Viewing Data

- **Errors**: [Project URL]/issues/
- **Performance**: [Project URL]/performance/
- **Releases**: [Project URL]/releases/

The CI/CD pipeline automatically uploads sourcemaps for accurate stack traces in production.