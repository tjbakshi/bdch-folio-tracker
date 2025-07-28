// File: src/integrations/supabase/client.ts

import { createClient } from '@supabase/supabase-js'
import type { Database } from './types'  // adjust path if needed

// Supabase configuration
const SUPABASE_URL = 'https://pkpvyqvcsmyxcudamerw.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcHZ5cXZjc215eGN1ZGFtZXJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMjMxMTgsImV4cCI6MjA2ODg5OTExOH0.XHyg3AzXz70Ad1t-E7oiiw0wFhCxUfG1H41HitZgKQY'

export const supabase = createClient<Database>(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      storage: typeof window !== 'undefined' ? localStorage : undefined,
      persistSession: true,
      autoRefreshToken: true,
    },
    // functions URL is automatically SUPABASE_URL + '/functions/v1'
  }
)
