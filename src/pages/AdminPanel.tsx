// File: src/pages/admin/bdc.tsx (or wherever your admin page is located)
// Replace your entire admin page with this code

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Play, Download, Database } from 'lucide-react';

interface BDC {
  cik: string;
  ticker: string;
  name: string;
  marketCap?: string;
  sector?: string;
}

interface ExtractionResult {
  success: boolean;
  ticker?: string;
  cik?: string;
  investmentsFound?: number;
  message?: string;
  error?: string;
  totalInvestments?: number;
  processed?: number;
  results?: Array<{
    ticker: string;
    cik: string;
    investmentsFound: number;
    success: boolean;
    error?: string;
  }>;
}

export default function BDCAdminPage() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ExtractionResult | null>(null);
  const [selectedBDCs, setSelectedBDCs] = useState<string[]>([]);
  const [currentOperation, setCurrentOperation] = useState<string>('');

  // Updated BDC list with CIKs for SEC API
  const bdcList: BDC[] = [
    { cik: '1476765', ticker: 'GBDC', name: 'Golub Capital BDC', marketCap: '$1.1B', sector: 'Middle Market' },
    { cik: '1287750', ticker: 'ARCC', name: 'Ares Capital Corp', marketCap: '$7.4B', sector: 'Diversified' },
    { cik: '1552198', ticker: 'WHF', name: 'Whitehorse Finance', marketCap: '$900M', sector: 'Middle Market' },
    { cik: '1414932', ticker: 'TSLX', name: 'TPG Specialty Lending', marketCap: '$1.4B', sector: 'Specialty' },
    { cik: '1403909', ticker: 'PSEC', name: 'Prospect Capital', marketCap: '$2.5B', sector: 'Diversified' },
    { cik: '1423902', ticker: 'NMFC', name: 'New Mountain Finance', marketCap: '$1.0B', sector: 'Growth' },
    { cik: '1113169', ticker: 'AINV', name: 'Apollo Investment Corp', marketCap: '$1.1B', sector: 'Diversified' },
    { cik: '1398560', ticker: 'FSIC', name: 'FS Investment Corporation', marketCap: '$3.3B', sector: 'Diversified' },
    { cik: '1689029', ticker: 'BXSL', name: 'Blackstone Secured Lending', marketCap: '$5.2B', sector: 'Secured' },
    { cik: '1517342', ticker: 'TCPC', name: 'BlackRock TCP Capital', marketCap: '$825M', sector: 'Middle Market' }
  ];

  const callSECExtractor = async (action: string, data?: any) => {
    setLoading(true);
    setCurrentOperation(action);
    
    try {
      const response = await fetch('/api/supabase/functions/sec-extractor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...data })
      });
      
      const result = await response.json();
      setResults(result);
      return result;
    } catch (error) {
      console.error('Error calling SEC extractor:', error);
      const errorResult = { error: error.message, success: false };
      setResults(errorResult);
      return errorResult;
    } finally {
      setLoading(false);
      setCurrentOperation('');
    }
  };

  const handleExtractAll = () => {
    callSECExtractor('backfill_all');
  };

  const handleExtractSelected = () => {
    const selected = bdcList.filter(bdc => selectedBDCs.includes(bdc.ticker));
    callSECExtractor('backfill_all', { bdcList: selected });
  };

  const handleExtractSingle = (bdc: BDC) => {
    callSECExtractor('extract_filing', { ticker: bdc.ticker, cik: bdc.cik });
  };

  const handleTestAPI = async () => {
    // Test with Golub BDC first (smallest, most reliable)
    await callSECExtractor('extract_filing', { 
      ticker: 'GBDC', 
      cik: '1476765' 
    });
  };

  const toggleBDCSelection = (ticker: string) => {
    if (selectedBDCs.includes(ticker)) {
      setSelectedBDCs(selectedBDCs.filter(t => t !== ticker));
    } else {
      setSelectedBDCs([...selectedBDCs, ticker]);
    }
  };

  const selectAll = () => {
    setSelectedBDCs(bdcList.map(bdc => bdc.ticker));
  };

  const clearSelection = () => {
    setSelectedBDCs([]);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">BDC Data Management</h1>
        <Badge variant="outline" className="text-sm">
          SEC API v2.0 - No More HTML Parsing
        </Badge>
      </div>
      
      {/* Status Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                ✨ New SEC API Integration Active
              </p>
              <p className="text-xs text-blue-700">
                Using official SEC APIs for reliable data extraction. No more HTML parsing issues!
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Test Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Play className="h-5 w-5" />
            <span>🧪 Test SEC API</span>
