-- Fix function search path security warnings
ALTER FUNCTION public.calculate_next_filing_dates(DATE) SET search_path = '';
ALTER FUNCTION public.check_new_filings() SET search_path = '';

-- Grant necessary permissions for the functions
GRANT EXECUTE ON FUNCTION public.calculate_next_filing_dates(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_next_filing_dates(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_new_filings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_new_filings() TO service_role;