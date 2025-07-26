/**
 * Simple logging utilities to replace Sentry
 */

/**
 * Initialize logging (no-op replacement for Sentry)
 */
export function initSentry() {
  console.log("Application logging initialized");
}

/**
 * Add user context to logs
 */
export function setSentryUser(user: { id: string; email?: string }) {
  console.log("User context set:", { id: user.id, email: user.email });
}

/**
 * Add custom context to logs
 */
export function setSentryContext(key: string, context: Record<string, any>) {
  console.log(`Context [${key}]:`, context);
}

/**
 * Log an exception
 */
export function captureException(error: Error, context?: Record<string, any>) {
  console.error("Exception captured:", {
    message: error.message,
    stack: error.stack,
    context
  });
}

/**
 * Simple performance timing utility
 */
export function startSpan(name: string, op?: string) {
  const startTime = Date.now();
  console.log(`Starting span: ${name} (${op || "function"})`);
  
  return {
    finish: () => {
      const duration = Date.now() - startTime;
      console.log(`Completed span: ${name} in ${duration}ms`);
    }
  };
}