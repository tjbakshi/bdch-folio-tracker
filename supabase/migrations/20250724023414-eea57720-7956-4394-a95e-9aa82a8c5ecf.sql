-- Add fiscal year-end tracking to BDC universe
ALTER TABLE public.bdc_universe 
ADD COLUMN fiscal_year_end DATE; -- e.g., '2024-12-31' for calendar year companies

-- Create scheduled jobs tracking table
CREATE TABLE public.scheduled_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  job_type TEXT NOT NULL CHECK (job_type IN ('10-K', '10-Q')),
  scheduled_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
  last_run_at TIMESTAMP WITH TIME ZONE,
  next_run_at TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for scheduled jobs
ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;

-- Create public read policy for scheduled jobs
CREATE POLICY "Public read access" ON public.scheduled_jobs FOR SELECT USING (true);

-- Add indexes for scheduled jobs
CREATE INDEX idx_scheduled_jobs_ticker_type ON public.scheduled_jobs(ticker, job_type);
CREATE INDEX idx_scheduled_jobs_next_run ON public.scheduled_jobs(next_run_at);
CREATE INDEX idx_scheduled_jobs_status ON public.scheduled_jobs(status);

-- Add trigger for scheduled jobs timestamps
CREATE TRIGGER update_scheduled_jobs_updated_at
  BEFORE UPDATE ON public.scheduled_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Function to calculate next filing dates based on fiscal year-end
CREATE OR REPLACE FUNCTION public.calculate_next_filing_dates(fye_date DATE)
RETURNS TABLE(
  filing_type TEXT,
  quarter_end DATE,
  due_date DATE
) 
LANGUAGE plpgsql
AS $$
DECLARE
  current_year INTEGER := EXTRACT(YEAR FROM fye_date);
  q1_end DATE;
  q2_end DATE;
  q3_end DATE;
  q4_end DATE;
BEGIN
  -- Calculate quarter ends based on fiscal year-end
  q1_end := (fye_date + INTERVAL '3 months')::DATE;
  q2_end := (fye_date + INTERVAL '6 months')::DATE;
  q3_end := (fye_date + INTERVAL '9 months')::DATE;
  q4_end := fye_date; -- Q4 ends on fiscal year-end
  
  -- Return 10-K due date (90 days after fiscal year-end)
  RETURN QUERY SELECT 
    '10-K'::TEXT,
    q4_end,
    (q4_end + INTERVAL '90 days')::DATE;
    
  -- Return 10-Q due dates (45 days after each quarter-end)
  RETURN QUERY SELECT 
    '10-Q'::TEXT,
    q1_end,
    (q1_end + INTERVAL '45 days')::DATE;
    
  RETURN QUERY SELECT 
    '10-Q'::TEXT,
    q2_end,
    (q2_end + INTERVAL '45 days')::DATE;
    
  RETURN QUERY SELECT 
    '10-Q'::TEXT,
    q3_end,
    (q3_end + INTERVAL '45 days')::DATE;
END;
$$;

-- Enable pg_cron extension for scheduled jobs
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create function to check for new filings
CREATE OR REPLACE FUNCTION public.check_new_filings()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  job_record RECORD;
  response_data JSONB;
BEGIN
  -- Find jobs that are due to run
  FOR job_record IN 
    SELECT * FROM public.scheduled_jobs 
    WHERE status = 'pending' 
    AND next_run_at <= NOW()
  LOOP
    BEGIN
      -- Update job status to running
      UPDATE public.scheduled_jobs 
      SET status = 'running', last_run_at = NOW()
      WHERE id = job_record.id;
      
      -- Call the SEC extractor function
      SELECT net.http_post(
        url := 'https://pkpvyqvcsmyxcudamerw.supabase.co/functions/v1/sec-extractor',
        headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcHZ5cXZjc215eGN1ZGFtZXJ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzMyMzExOCwiZXhwIjoyMDY4ODk5MTE4fQ.xNB6IKhJvfqT_8r6FdWYFXjKJbDGP5FS4vCbpCkDY6o"}'::JSONB,
        body := json_build_object(
          'action', 'incremental_check',
          'ticker', job_record.ticker,
          'filing_type', job_record.job_type
        )::JSONB
      ) INTO response_data;
      
      -- Update job status to completed and schedule next run
      UPDATE public.scheduled_jobs 
      SET 
        status = 'completed',
        next_run_at = CASE 
          WHEN job_record.job_type = '10-K' THEN job_record.next_run_at + INTERVAL '1 year'
          WHEN job_record.job_type = '10-Q' THEN job_record.next_run_at + INTERVAL '3 months'
        END
      WHERE id = job_record.id;
      
      -- Log success
      INSERT INTO public.processing_logs (
        log_level, 
        message, 
        details
      ) VALUES (
        'info',
        'Scheduled job completed successfully',
        json_build_object(
          'job_id', job_record.id,
          'ticker', job_record.ticker,
          'job_type', job_record.job_type
        )
      );
      
    EXCEPTION WHEN OTHERS THEN
      -- Update job status to failed
      UPDATE public.scheduled_jobs 
      SET 
        status = 'failed',
        error_message = SQLERRM
      WHERE id = job_record.id;
      
      -- Log error
      INSERT INTO public.processing_logs (
        log_level, 
        message, 
        details
      ) VALUES (
        'error',
        'Scheduled job failed',
        json_build_object(
          'job_id', job_record.id,
          'ticker', job_record.ticker,
          'job_type', job_record.job_type,
          'error', SQLERRM
        )
      );
    END;
  END LOOP;
END;
$$;

-- Schedule the cron job to run every hour
SELECT cron.schedule(
  'check-new-filings-hourly',
  '0 * * * *', -- Every hour at minute 0
  $$SELECT public.check_new_filings();$$
);