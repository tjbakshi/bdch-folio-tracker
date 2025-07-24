-- Fix function search path security warning
ALTER FUNCTION public.update_updated_at_column() SET search_path = '';

-- Grant necessary permissions for the function
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;