// File: src/pages/AdminPanel.tsx
// COMPLETE REPLACEMENT - Replace entire file with this code

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Play, Download, Database, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface BDC {
  id: string;
  cik: string;
  ticker: string;
  company_name: string;
  is_active: boolean;
  fiscal_year_end_month: number;
  fiscal_year_end_day: number;
  created_at: string;
  updated_at: string;
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

export default function AdminPanel() {
  const [loading, setLoading] = useState(false);
  const [loadingBDCs, setLoadingBDCs] = useState(true);
  const [results, setResults] = useState<ExtractionResult | null>(null);
  const [selectedBDCs, setSelectedBDCs] = useState<string[]>([]);
  const [currentOperation, setCurrentOperation] = useState<string>('');
  const [bdcList, setBdcList] = useState<BDC[]>([]);
  const [bdcError, setBdcError] = useState<string | null>(null);

  // Load BDCs from bdc_universe table once
  useEffect(() => {
    loadBDCsFromDatabase();
  }, []);

  const loadBDCsFromDatabase = async () => {
    setLoadingBDCs(true);
    setBdcError(null);

    try {
      console.log('🔍 Loading BDCs from bdc_universe table...');
      const { data, error } = await supabase
        .from('bdc_universe')
        .select('*')
        .eq('is_active', true)
        .order('ticker');

      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('No active BDCs found in database');
      }

      console.log(`✅ Loaded ${data.length} BDCs:`, data.map(b => b.ticker).join(', '));
      setBdcList(data);
    } catch (err) {
      console.error('❌ Error loading BDCs:', err);
      setBdcError((err as Error).message);
      // Fallback list
      setBdcList([
        {
          id: 'fallback-1',
          cik: '1287750',
          ticker: 'ARCC',
          company_name: 'Ares Capital Corporation',
          is_active: true,
          fiscal_year_end_month: 12,
          fiscal_year_end_day: 31,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: 'fallback-2',
          cik: '1287032',
          ticker: 'PSEC',
          company_name: 'Prospect Capital Corporation',
          is_active: true,
          fiscal_year_end_month: 6,
          fiscal_year_end_day: 30,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoadingBDCs(false);
    }
  };

  const callSECExtractor = async (action: string, payload?: any) => {
    setLoading(true);
    setCurrentOperation(action);
    setResults(null);

    try {
      console.log(`🚀 Invoking sec-extractor (${action})`, payload);
      const { data: res, error } = await supabase.functions.invoke('sec-extractor', {
        body: { action, ...payload },
      });
      if (error) throw error;
      console.log('✅ sec-extractor response:', res);
      setResults(res as ExtractionResult);
    } catch (err) {
      console.error('🔥 sec-extractor error:', err);
      setResults({ success: false, error: (err as Error).message });
    } finally {
      setLoading(false);
      setCurrentOperation('');
    }
  };

  const handleTestAPI = () => {
    const testBDC = bdcList.find(b => b.ticker === 'ARCC') || bdcList[0];
    if (!testBDC) {
      setResults({ success: false, error: 'No BDCs available for testing' });
      return;
    }
    callSECExtractor('extract_filing', { ticker: testBDC.ticker, cik: testBDC.cik });
  };

  const handleExtractAll = () => {
    callSECExtractor('backfill_all');
  };

  const handleExtractSelected = () => {
    const selected = bdcList.filter(b => selectedBDCs.includes(b.ticker));
    const bdcListForExtractor = selected.map(b => ({ ticker: b.ticker, cik: b.cik }));
    callSECExtractor('backfill_all', { bdcList: bdcListForExtractor });
  };

  const handleExtractSingle = (bdc: BDC) => {
    callSECExtractor('extract_filing', { ticker: bdc.ticker, cik: bdc.cik });
  };

  const toggleBDCSelection = (ticker: string) =>
    setSelectedBDCs(sel =>
      sel.includes(ticker) ? sel.filter(t => t !== ticker) : [...sel, ticker]
    );

  const selectAll = () => setSelectedBDCs(bdcList.map(b => b.ticker));
  const clearSelection = () => setSelectedBDCs([]);

  const getMarketCapCategory = (t: string) => {
    const large = ['ARCC', 'BXSL', 'OBDC', 'OCSL'];
    const mid = ['PSEC', 'GSBD', 'MAIN', 'HTGC', 'CGBD', 'FSIC'];
    return large.includes(t) ? 'Large Cap' : mid.includes(t) ? 'Mid Cap' : 'Small Cap';
  };

  const getSectorByTicker = (t: string) => {
    const m: Record<string, string> = {
      ARCC: 'Diversified',
      BXSL: 'Secured Lending',
      PSEC: 'Diversified',
      HTGC: 'Technology',
      MAIN: 'Lower Middle Market',
      GBDC: 'Middle Market',
      TSLX: 'Specialty Lending',
      OBDC: 'Direct Lending',
      OCSL: 'Specialty Lending',
      GSBD: 'Middle Market',
    };
    return m[t] || 'Middle Market';
  };

  if (loadingBDCs) {
    return (
      <div className="p-6 max-w-7xl mx-auto flex justify-center items-center h-64">
        <Loader2 className="animate-spin h-8 w-8 text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">BDC Data Management</h1>
        <div className="flex items-center space-x-2">
          <Badge variant="outline">{bdcList.length} Active</Badge>
          <Button
            variant="ghost"
            size="sm"
            onClick={loadBDCsFromDatabase}
            disabled={loadingBDCs}
          >
            <RefreshCw
              className={`h-4 w-4 ${loadingBDCs ? 'animate-spin' : ''}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Status Banner */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="flex items-center space-x-3">
          <CheckCircle className="h-5 w-5 text-blue-600" />
          <div>
            <p className="font-medium text-blue-900">
              ✨ BDC Universe Integration Active
            </p>
            <p className="text-xs text-blue-700">
              Pulling {bdcList.length} BDCs from bdc_universe. PSEC CIK
              corrected to 1287032.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* DB Error */}
      {bdcError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{bdcError}</AlertDescription>
        </Alert>
      )}

      {/* Info Panel */}
      <Card className="bg-green-50 border-green-200">
        <CardContent className="text-xs text-green-800">
          <strong>Data Source:</strong> bdc_universe table<br />
          <strong>SEC API:</strong> data.sec.gov<br />
          <strong>Total BDCs:</strong> {bdcList.length}<br />
          <strong>Last Updated:</strong> {new Date().toLocaleString()}
        </CardContent>
      </Card>

      {/* Test Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Play className="h-5 w-5" />
            <span>🧪 Test SEC API</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleTestAPI}
            disabled={loading}
            variant="outline"
            className="flex items-center space-x-2"
          >
            {loading && currentOperation === 'extract_filing' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            <span>
              {loading && currentOperation === 'extract_filing'
                ? 'Testing...'
                : `Test API with ${bdcList.find(b => b.ticker === 'ARCC')
                    ?.ticker || 'Sample BDC'}`}
            </span>
          </Button>
        </CardContent>
      </Card>

      {/* Batch Operations */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Database className="h-5 w-5" />
            <span>📊 Batch Operations</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button
            onClick={handleExtractAll}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white flex items-center justify-center space-x-2"
          >
            {loading && currentOperation === 'backfill_all' ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            <span>
              {loading && currentOperation === 'backfill_all'
                ? `Extracting All...`
                : `🚀 Extract All ${bdcList.length} BDCs`}
            </span>
          </Button>
          <div className="flex space-x-2">
            <Button
              onClick={handleExtractSelected}
              disabled={loading || selectedBDCs.length === 0}
              variant="outline"
              className="flex-1 flex items-center justify-center space-x-2"
            >
              {loading && currentOperation === 'backfill_all' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4" />
              )}
              <span>
                {loading && currentOperation === 'backfill_all'
                  ? 'Extracting...'
                  : `Extract Selected (${selectedBDCs.length})`}
              </span>
            </Button>
            <Button onClick={selectAll} variant="ghost" size="sm">
              All
            </Button>
            <Button onClick={clearSelection} variant="ghost" size="sm">
              None
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Individual BDC Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CheckCircle className="h-5 w-5" />
            <span>🏢 Individual BDC Management</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3">
            {bdcList.map(bdc => (
              <div
                key={bdc.ticker}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50"
              >
                <div className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={selectedBDCs.includes(bdc.ticker)}
                    onChange={() => toggleBDCSelection(bdc.ticker)}
                    disabled={loading}
                    className="h-4 w-4 rounded border-gray-300"
                  />
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-medium">{bdc.ticker}</span>
                      <Badge variant="secondary" className="text-xs">
                        {getMarketCapCategory(bdc.ticker)}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {getSectorByTicker(bdc.ticker)}
                      </Badge>
                    </div>
                    <div className="text-sm">{bdc.company_name}</div>
                    <div className="text-xs text-gray-500">CIK: {bdc.cik}</div>
                  </div>
                </div>
                <Button
                  size="sm"
                  onClick={() => handleExtractSingle(bdc)}
                  disabled={loading}
                  variant="outline"
                  className="flex items-center space-x-1"
                >
                  {loading && currentOperation === 'extract_filing' ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Download className="h-3 w-3" />
                  )}
                  <span>Extract</span>
                </Button>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Results Display */}
      {results && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              {results.success ? (
                <CheckCircle className="h-5 w-5 text-green-600" />
              ) : (
                <XCircle className="h-5 w-5 text-red-600" />
              )}
              <span>📋 Extraction Results</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results.success ? (
              <Alert className="bg-green-50 border-green-200">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription>
                  ✅ {results.message || 'Operation completed successfully'}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  ❌ {results.error || 'Unknown error'}
                </AlertDescription>
              </Alert>
            )}

            {results.results && (
              <div className="mt-4 space-y-2">
                {results.results.map((r, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-2 bg-gray-50 rounded"
                  >
                    <div className="flex items-center space-x-2">
                      {r.success ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-600" />
                      )}
                      <span>{r.ticker}</span>
                    </div>
                    <span>
                      {r.success
                        ? `${r.investmentsFound} investments`
                        : `Error: ${r.error}`}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gray-500">
                Show Raw JSON
              </summary>
              <pre className="bg-gray-100 p-2 rounded text-xs overflow-auto max-h-48">
                {JSON.stringify(results, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}

      {/* Footer Info */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle>ℹ️ System Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-xs space-y-1">
            • Pulls all BDCs dynamically<br />
            • Corrected PSEC CIK to 1287032<br />
            • Manual‑only buttons (no auto‑run)<br />
            • Supports single & batch extractions<br />
            • SEC API rate‑limit: 10 req/sec
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
