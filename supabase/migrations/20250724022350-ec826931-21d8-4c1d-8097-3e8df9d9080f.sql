-- Create BDC universe table
CREATE TABLE public.bdc_universe (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL UNIQUE,
  company_name TEXT NOT NULL,
  cik TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create filings metadata table
CREATE TABLE public.filings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cik TEXT NOT NULL,
  ticker TEXT NOT NULL,
  accession_number TEXT NOT NULL UNIQUE,
  filing_date DATE NOT NULL,
  filing_type TEXT NOT NULL CHECK (filing_type IN ('10-K', '10-Q')),
  period_end_date DATE,
  document_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create investments raw data table
CREATE TABLE public.investments_raw (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  filing_id UUID NOT NULL REFERENCES public.filings(id) ON DELETE CASCADE,
  company_name TEXT,
  business_description TEXT,
  investment_tranche TEXT,
  coupon TEXT,
  reference_rate TEXT,
  spread TEXT,
  acquisition_date DATE,
  principal_amount DECIMAL(15,2),
  amortized_cost DECIMAL(15,2),
  fair_value DECIMAL(15,2),
  raw_row_data JSONB, -- Store original extracted data for debugging
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create computed investments table
CREATE TABLE public.investments_computed (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_investment_id UUID NOT NULL REFERENCES public.investments_raw(id) ON DELETE CASCADE,
  filing_id UUID NOT NULL REFERENCES public.filings(id) ON DELETE CASCADE,
  mark DECIMAL(10,6), -- fair_value / principal_amount
  is_non_accrual BOOLEAN NOT NULL DEFAULT false,
  quarter_year TEXT NOT NULL, -- Format: Q1-2024
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create processing logs table
CREATE TABLE public.processing_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  filing_id UUID REFERENCES public.filings(id) ON DELETE CASCADE,
  log_level TEXT NOT NULL CHECK (log_level IN ('info', 'warning', 'error')),
  message TEXT NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.bdc_universe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments_raw ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.investments_computed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_logs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (public read access for internal tool)
CREATE POLICY "Public read access" ON public.bdc_universe FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.filings FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.investments_raw FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.investments_computed FOR SELECT USING (true);
CREATE POLICY "Public read access" ON public.processing_logs FOR SELECT USING (true);

-- Create indexes for performance
CREATE INDEX idx_filings_ticker_date ON public.filings(ticker, filing_date DESC);
CREATE INDEX idx_filings_accession ON public.filings(accession_number);
CREATE INDEX idx_investments_raw_filing ON public.investments_raw(filing_id);
CREATE INDEX idx_investments_computed_filing ON public.investments_computed(filing_id);
CREATE INDEX idx_investments_computed_quarter ON public.investments_computed(quarter_year);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_bdc_universe_updated_at
  BEFORE UPDATE ON public.bdc_universe
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_filings_updated_at
  BEFORE UPDATE ON public.filings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();