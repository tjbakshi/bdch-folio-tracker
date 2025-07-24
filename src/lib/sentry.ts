import * as Sentry from "@sentry/react";

/**
 * Initialize Sentry for the React frontend
 */
export function initSentry() {
  // Only initialize if DSN is provided
  const dsn = import.meta.env.VITE_SENTRY_DSN || "https://your-sentry-dsn@sentry.io/project-id";
  
  if (!dsn || dsn.includes("your-sentry-dsn")) {
    console.warn("Sentry DSN not configured. Error tracking disabled.");
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    integrations: [
      // Browser tracing for performance monitoring
      Sentry.browserTracingIntegration({
        enableLongTask: true,
      }),
      // Replay integration for session recordings
      Sentry.replayIntegration({
        maskAllText: false,
        blockAllMedia: false,
      }),
    ],
    // Performance monitoring
    tracesSampleRate: import.meta.env.MODE === "production" ? 0.1 : 1.0,
    // Session replay
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
    
    beforeSend(event) {
      // Filter out development errors
      if (import.meta.env.MODE === "development") {
        console.log("Sentry event:", event);
      }
      return event;
    },
    
    // Add initial context
    beforeSendTransaction(transaction) {
      transaction.contexts = {
        ...transaction.contexts,
        app: {
          name: "bdc-analytics",
          component: "frontend"
        }
      };
      return transaction;
    }
  });

  // Set initial tags
  Sentry.setTag("component", "frontend");
  Sentry.setTag("app", "bdc-analytics");
}

/**
 * Add user context to Sentry
 */
export function setSentryUser(user: { id: string; email?: string }) {
  Sentry.setUser({
    id: user.id,
    email: user.email,
  });
}

/**
 * Add custom context to Sentry
 */
export function setSentryContext(key: string, context: Record<string, any>) {
  Sentry.setContext(key, context);
}

/**
 * Manually capture an exception
 */
export function captureException(error: Error, context?: Record<string, any>) {
  Sentry.withScope((scope) => {
    if (context) {
      Object.entries(context).forEach(([key, value]) => {
        scope.setContext(key, value);
      });
    }
    Sentry.captureException(error);
  });
}

/**
 * Start a performance span
 */
export function startSpan(name: string, op?: string) {
  return Sentry.startSpan({
    name,
    op: op || "function",
  }, (span) => span);
}