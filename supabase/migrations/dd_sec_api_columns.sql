-- File: supabase/migrations/add_sec_api_columns.sql
-- Add this as a new migration file in your supabase/migrations folder
-- Name it with current timestamp: YYYYMMDDHHMMSS_add_sec_api_columns.sql

-- Add new columns for SEC API data to investments table
ALTER TABLE investments 
ADD COLUMN IF NOT EXISTS accession_number TEXT,
ADD COLUMN IF NOT EXISTS xbrl_concept TEXT,
ADD COLUMN IF NOT EXISTS filing_form TEXT,
ADD COLUMN IF NOT EXISTS extraction_method TEXT DEFAULT 'SEC_API';

-- Add index for better performance on CIK and accession number queries
CREATE INDEX IF NOT EXISTS idx_investments_cik_accession 
ON investments(cik, accession_number);

-- Add index for extraction method queries
CREATE INDEX IF NOT EXISTS idx_investments_extraction_method 
ON investments(extraction_method);

-- Add index for filing form queries
CREATE INDEX IF NOT EXISTS idx_investments_filing_form 
ON investments(filing_form);

-- Add composite index for common query patterns
CREATE INDEX IF NOT EXISTS idx_investments_ticker_date 
ON investments(ticker, filing_date DESC);

-- Update constraint to prevent duplicates with new fields
-- Drop existing constraint if it exists
ALTER TABLE investments 
DROP CONSTRAINT IF EXISTS unique_investment_per_filing;

-- Add new constraint to prevent duplicates based on key fields
ALTER TABLE investments 
ADD CONSTRAINT unique_investment_per_filing 
UNIQUE(cik, accession_number, issuer, fair_value, xbrl_concept);

-- Create a view for easier querying of SEC API extracted data
CREATE OR REPLACE VIEW investments_sec_api AS
SELECT 
  id,
  ticker,
  cik,
  issuer,
  title,
  fair_value,
  investment_type,
  filing_date,
  report_date,
  accession_number,
  xbrl_concept,
  filing_form,
  extraction_method,
  footnotes,
  created_at,
  updated_at
FROM investments 
WHERE extraction_method = 'SEC_API'
ORDER BY filing_date DESC, ticker, fair_value DESC;

-- Add comment to the table documenting the new columns
COMMENT ON COLUMN investments.accession_number IS 'SEC filing accession number (format: 0000000000-00-000000)';
COMMENT ON COLUMN investments.xbrl_concept IS 'XBRL concept/element name from SEC taxonomy';
COMMENT ON COLUMN investments.filing_form IS 'SEC form type (10-K, 10-Q, N-2, etc.)';
COMMENT ON COLUMN investments.extraction_method IS 'How the data was extracted (SEC_API, HTML_FALLBACK, MANUAL)';

-- Update any existing records to have the extraction method if not set
UPDATE investments 
SET extraction_method = 'LEGACY' 
WHERE extraction_method IS NULL;
