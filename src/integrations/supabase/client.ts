// File: src/integrations/supabase/client.ts
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// These must be set as GitHub Actions secrets and in Vercel:
const SUPABASE_URL      = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const FUNCTIONS_URL     = process.env.NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL!;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !FUNCTIONS_URL) {
  throw new Error(
    'Missing one of NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, or NEXT_PUBLIC_SUPABASE_FUNCTIONS_URL'
  );
}

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
    functions: {
      url: FUNCTIONS_URL,
    },
  }
);
