/**
 * Local Sentry-like logging utility for Supabase Edge Functions
 * Provides structured logging with transaction and span tracking
 */

interface LogContext {
  [key: string]: any;
}

interface SpanData {
  name: string;
  op: string;
  startTime: number;
  tags?: Record<string, string>;
}

interface TransactionData extends SpanData {
  status?: string;
  httpStatus?: number;
}

class LocalSentry {
  private dsn: string | null;
  private context: LogContext = {};
  private tags: Record<string, string> = {};
  private currentTransaction: TransactionData | null = null;

  constructor(dsn?: string) {
    this.dsn = dsn || null;
  }

  init(config: { dsn: string; environment?: string; tracesSampleRate?: number; beforeSend?: (event: any) => any }) {
    this.dsn = config.dsn;
    this.log('info', 'Sentry initialized', { 
      environment: config.environment,
      dsn: config.dsn ? 'configured' : 'missing'
    });
  }

  setContext(key: string, context: LogContext) {
    this.context[key] = context;
  }

  setTag(key: string, value: string) {
    this.tags[key] = value;
  }

  startTransaction(data: { name: string; op: string; tags?: Record<string, string> }): TransactionData {
    const transaction: TransactionData = {
      name: data.name,
      op: data.op,
      startTime: Date.now(),
      tags: { ...this.tags, ...data.tags }
    };
    
    this.currentTransaction = transaction;
    this.log('info', 'Transaction started', { transaction: data.name, op: data.op });
    
    return {
      ...transaction,
      setStatus: (status: string) => {
        transaction.status = status;
      },
      setHttpStatus: (httpStatus: number) => {
        transaction.httpStatus = httpStatus;
      },
      finish: () => {
        const duration = Date.now() - transaction.startTime;
        this.log('info', 'Transaction completed', {
          transaction: transaction.name,
          duration,
          status: transaction.status,
          httpStatus: transaction.httpStatus
        });
        this.currentTransaction = null;
      }
    };
  }

  async startSpan<T>(
    data: { name: string; op: string },
    callback: () => Promise<T>
  ): Promise<T> {
    const startTime = Date.now();
    this.log('debug', 'Span started', { span: data.name, op: data.op });
    
    try {
      const result = await callback();
      const duration = Date.now() - startTime;
      this.log('debug', 'Span completed', { span: data.name, duration, status: 'ok' });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.log('error', 'Span failed', { 
        span: data.name, 
        duration, 
        status: 'error',
        error: error.message 
      });
      throw error;
    }
  }

  captureException(error: Error, options?: { contexts?: LogContext }) {
    this.log('error', 'Exception captured', {
      error: error.message,
      stack: error.stack,
      transaction: this.currentTransaction?.name,
      contexts: { ...this.context, ...options?.contexts },
      tags: this.tags
    });
  }

  withSentry<T>(callback: () => Promise<T>): Promise<T> {
    // Simply execute the callback with error handling
    return callback().catch((error) => {
      this.captureException(error);
      throw error;
    });
  }

  private log(level: 'info' | 'debug' | 'error', message: string, data?: LogContext) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      function: 'sec-extractor',
      ...data
    };

    // Use structured console logging that Supabase can capture
    if (level === 'error') {
      console.error(`[SENTRY] ${message}`, logEntry);
    } else if (level === 'debug') {
      console.debug(`[SENTRY] ${message}`, logEntry);
    } else {
      console.log(`[SENTRY] ${message}`, logEntry);
    }
  }
}

// Export singleton instance
export const Sentry = new LocalSentry();

// Initialize if DSN is available
const sentryDsn = Deno.env.get('SENTRY_DSN_EDGE');
if (sentryDsn && !sentryDsn.includes('your-sentry-dsn')) {
  Sentry.init({
    dsn: sentryDsn,
    environment: Deno.env.get('ENVIRONMENT') || 'production',
    tracesSampleRate: 1.0,
  });
}