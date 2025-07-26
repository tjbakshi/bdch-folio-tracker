// File: pages/api/supabase/functions/sec-extractor.ts
// Replace your existing API route with this code

import type { NextApiRequest, NextApiResponse } from 'next';

interface ApiResponse {
  success: boolean;
  message?: string;
  error?: string;
  [key: string]: any;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      error: 'Method not allowed. Use POST.' 
    });
  }

  // CORS headers for frontend requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  try {
    // Get Supabase environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase environment variables');
      return res.status(500).json({
        success: false,
        error: 'Server configuration error: Missing Supabase credentials'
      });
    }

    // Validate request body
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Invalid request body. Expected JSON object.'
      });
    }

    const { action } = req.body;
    
    if (!action) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: action'
      });
    }

    // Valid actions for the SEC extractor
    const validActions = ['extract_filing', 'backfill_ticker', 'backfill_all', 'incremental_check'];
    
    if (!validActions.includes(action)) {
      return res.status(400).json({
        success: false,
        error: `Invalid action. Supported actions: ${validActions.join(', ')}`
      });
    }

    console.log(`[API] Proxying request to SEC extractor: ${action}`);

    // Call the Supabase Edge Function
    const functionUrl = `${supabaseUrl}/functions/v1/sec-extractor`;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'User-Agent': 'BDC-Portfolio-Tracker-Frontend'
      },
      body: JSON.stringify(req.body),
    });

    // Get response data
    let data: any;
    const responseText = await response.text();
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error('[API] Failed to parse response:', responseText);
      return res.status(500).json({
        success: false,
        error: 'Invalid response from SEC extractor function'
      });
    }

    // Log the response for monitoring
    console.log(`[API] SEC extractor response:`, {
      status: response.status,
      success: data.success,
      action: action
    });

    // Return the response with appropriate status code
    if (!response.ok) {
      return res.status(response.status).json({
        success: false,
        error: data.error || 'SEC extractor function failed',
        ...data
      });
    }

    // Success response
    res.status(200).json({
      success: true,
      ...data
    });

  } catch (error) {
    console.error('[API] Error calling SEC extractor:', error);
    
    // Determine if it's a network error, timeout, or other issue
    let errorMessage = 'Internal server error';
    
    if (error instanceof TypeError && error.message.includes('fetch')) {
      errorMessage = 'Unable to connect to SEC extractor service';
    } else if (error instanceof Error) {
      errorMessage = error.message;
    }

    res.status(500).json({ 
      success: false,
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Configure API route settings
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '1mb',
    },
    responseLimit: '8mb',
  },
}
