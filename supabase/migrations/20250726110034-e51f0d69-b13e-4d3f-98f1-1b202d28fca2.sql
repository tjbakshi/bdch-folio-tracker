-- Add new fiscal year-end columns
ALTER TABLE public.bdc_universe 
ADD COLUMN fiscal_year_end_month INTEGER CHECK (fiscal_year_end_month >= 1 AND fiscal_year_end_month <= 12),
ADD COLUMN fiscal_year_end_day INTEGER CHECK (fiscal_year_end_day >= 1 AND fiscal_year_end_day <= 31);

-- Migrate existing fiscal_year_end data to new columns
UPDATE public.bdc_universe 
SET 
  fiscal_year_end_month = EXTRACT(MONTH FROM fiscal_year_end),
  fiscal_year_end_day = EXTRACT(DAY FROM fiscal_year_end)
WHERE fiscal_year_end IS NOT NULL;

-- Update fiscal year-end data for all BDC tickers
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'ARCC';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'BBDC';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'BCSF';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'BXSL';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'CCAP';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'CGBD';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'CION';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'FDUS';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'FSK';
UPDATE public.bdc_universe SET fiscal_year_end_month = 9, fiscal_year_end_day = 30 WHERE ticker = 'GBDC';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'GSBD';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'HTGC';
UPDATE public.bdc_universe SET fiscal_year_end_month = 6, fiscal_year_end_day = 30 WHERE ticker = 'ICMB';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'LIEN';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'MAIN';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'MFIC';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'MRCC';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'MSDL';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'MSIF';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'NCDL';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'NMFC';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'OBDC';
UPDATE public.bdc_universe SET fiscal_year_end_month = 9, fiscal_year_end_day = 30 WHERE ticker = 'OCSL';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'OFS';
UPDATE public.bdc_universe SET fiscal_year_end_month = 9, fiscal_year_end_day = 30 WHERE ticker = 'PFLT';
UPDATE public.bdc_universe SET fiscal_year_end_month = 9, fiscal_year_end_day = 30 WHERE ticker = 'PNNT';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'PSBD';
UPDATE public.bdc_universe SET fiscal_year_end_month = 6, fiscal_year_end_day = 30 WHERE ticker = 'PSEC';
UPDATE public.bdc_universe SET fiscal_year_end_month = 2, fiscal_year_end_day = 28 WHERE ticker = 'SAR';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'SCM';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'SLRC';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'TCPC';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'TSLX';
UPDATE public.bdc_universe SET fiscal_year_end_month = 12, fiscal_year_end_day = 31 WHERE ticker = 'WHF';

-- Update the calculate_next_filing_dates function to work with month/day
CREATE OR REPLACE FUNCTION public.calculate_next_filing_dates(fye_month INTEGER, fye_day INTEGER)
 RETURNS TABLE(filing_type text, quarter_end date, due_date date)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  current_year INTEGER := EXTRACT(YEAR FROM CURRENT_DATE);
  next_year INTEGER := current_year + 1;
  fye_date DATE;
  q1_end DATE;
  q2_end DATE;
  q3_end DATE;
  q4_end DATE;
BEGIN
  -- Determine which fiscal year we're working with
  -- If current date is past this year's fiscal year-end, use next year
  fye_date := MAKE_DATE(current_year, fye_month, fye_day);
  
  IF CURRENT_DATE > fye_date THEN
    fye_date := MAKE_DATE(next_year, fye_month, fye_day);
  END IF;
  
  -- Calculate quarter ends based on fiscal year-end
  q1_end := (fye_date - INTERVAL '9 months')::DATE;
  q2_end := (fye_date - INTERVAL '6 months')::DATE;
  q3_end := (fye_date - INTERVAL '3 months')::DATE;
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
$function$;

-- Add performance index
CREATE INDEX idx_bdc_universe_fiscal_year_end ON bdc_universe(fiscal_year_end_month, fiscal_year_end_day);

-- Add comment for the old column (keeping it for now for backward compatibility)
COMMENT ON COLUMN public.bdc_universe.fiscal_year_end IS 'DEPRECATED: Use fiscal_year_end_month and fiscal_year_end_day instead';