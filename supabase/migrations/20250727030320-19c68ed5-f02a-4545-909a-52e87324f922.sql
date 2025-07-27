-- Enable Row Level Security on portfolio_investments table
ALTER TABLE public.portfolio_investments ENABLE ROW LEVEL SECURITY;

-- Create policies for portfolio_investments table
-- Allow public read access for authenticated users
CREATE POLICY "Allow authenticated read access" 
ON public.portfolio_investments 
FOR SELECT 
TO authenticated 
USING (true);

-- Allow service role full access
CREATE POLICY "Allow service role full access" 
ON public.portfolio_investments 
FOR ALL 
TO service_role 
USING (true);