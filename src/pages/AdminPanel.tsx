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
  cik: number;
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

export default function BDCAdminPage() {
  const [loading, setLoading] = useState(false);
  const [loadingBDCs, setLoadingBDCs] = useState(true);
  const [results, setResults] = useState<ExtractionResult | null>(null);
  const [selectedBDCs, setSelectedBDCs] = useState<string[]>([]);
  const [currentOperation, setCurrentOperation] = useState<string>('');
  const [bdcList, setBdcList] = useState<BDC[]>([]);
  const [bdcError, setBdcError] = useState<string | null>(null);

  // Load BDCs from bdc_universe table
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

      if (error) {
        console.error('❌ Error loading BDCs:', error);
        setBdcError(`Failed to load BDCs: ${error.message}`);
        
        // Fallback to minimal list with corrected PSEC CIK
        setBdcList([
          {
            id: 'fallback-1',
            cik: 1287750,
            ticker: 'ARCC',
            company_name: 'Ares Capital Corporation',
            is_active: true,
            fiscal_year_end_month: 12,
            fiscal_year_end_day: 31,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          },
          {
            id: 'fallback-2',
            cik: 1287032, // Corrected PSEC CIK
            ticker: 'PSEC',
            company_name: 'Prospect Capital Corporation',
            is_active: true,
            fiscal_year_end_month: 6,
            fiscal_year_end_day: 30,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
        ]);
        return;
      }

      if (!data || data.length === 0) {
        setBdcError('No active BDCs found in database');
        return;
      }

      console.log(`✅ Loaded ${data.length} BDCs from database:`, data.map(bdc => bdc.ticker).join(', '));
      setBdcList(data);
      
    } catch (error) {
      console.error('🔥 Error loading BDCs:', error);
      setBdcError(error instanceof Error ? error.message : 'Unknown error occurred');
    } finally {
      setLoadingBDCs(false);
    }
  };

  const callSECExtractor = async (action: string, data?: any) => {
    setLoading(true);
    setCurrentOperation(action);
    
    try {
      console.log(`🚀 Calling SEC extractor with action: ${action}`, data);
      
      const { data: result, error } = await supabase.functions.invoke('sec-extractor', {
        body: {
          action,
          ...data
        }
      });

      if (error) {
        console.error('❌ Supabase function error:', error);
        throw new Error(`SEC extractor failed: ${error.message}`);
      }
      
      console.log('✅ SEC extractor result:', result);
      setResults(result);
      return result;
      
    } catch (error) {
      console.error('🔥 Error calling SEC extractor:', error);
      const errorResult = { 
        error: error instanceof Error ? error.message : 'Unknown error occurred', 
        success: false 
      };
      setResults(errorResult);
      return errorResult;
    } finally {
      setLoading(false);
      setCurrentOperation('');
    }
  };

  const handleExtractAll = () => {
    console.log(`📊 Starting extraction for all ${bdcList.length} BDCs from database`);
    callSECExtractor('backfill_all');
  };

  const handleExtractSelected = () => {
    const selected = bdcList.filter(bdc => selectedBDCs.includes(bdc.ticker));
    console.log(`📊 Starting extraction for ${selected.length} selected BDCs:`, selected.map(bdc => bdc.ticker).join(', '));
    
    // Convert to format expected by SEC extractor
    const bdcListForExtractor = selected.map(bdc => ({
      cik: bdc.cik.toString(),
      ticker: bdc.ticker
    }));
    
    callSECExtractor('backfill_all', { bdcList: bdcListForExtractor });
  };

  const handleExtractSingle = (bdc: BDC) => {
    console.log(`🎯 Starting extraction for single BDC: ${bdc.ticker} (${bdc.cik})`);
    callSECExtractor('extract_filing', { 
      ticker: bdc.ticker, 
      cik: bdc.cik.toString() 
    });
  };

  const handleTestAPI = async () => {
    // Test with ARCC first (reliable, large dataset)
    const testBDC = bdcList.find(bdc => bdc.ticker === 'ARCC') || bdcList[0];
    
    if (!testBDC) {
      setResults({
        success: false,
        error: 'No BDCs available for testing'
      });
      return;
    }

    console.log(`🧪 Testing SEC API with ${testBDC.ticker} (${testBDC.cik})`);
    await callSECExtractor('extract_filing', { 
      ticker: testBDC.ticker, 
      cik: testBDC.cik.toString() 
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

  const getMarketCapCategory = (ticker: string): string => {
    // Categorize BDCs by approximate market cap
    const largeCap = ['ARCC', 'BXSL', 'OBDC', 'OCSL'];
    const midCap = ['PSEC', 'GSBD', 'MAIN', 'HTGC', 'CGBD', 'FSIC'];
    
    if (largeCap.includes(ticker)) return 'Large Cap';
    if (midCap.includes(ticker)) return 'Mid Cap';
    return 'Small Cap';
  };

  const getSectorByTicker = (ticker: string): string => {
    // Basic sector classification
    const sectors: Record<string, string> = {
      'ARCC': 'Diversified',
      'BXSL': 'Secured Lending',
      'PSEC': 'Diversified',
      'HTGC': 'Technology',
      'MAIN': 'Lower Middle Market',
      'GBDC': 'Middle Market',
      'TSLX': 'Specialty Lending',
      'OBDC': 'Direct Lending',
      'OCSL': 'Specialty Lending',
      'GSBD': 'Middle Market'
    };
    
    return sectors[ticker] || 'Middle Market';
  };

  if (loadingBDCs) {
    return (
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-center justify-center min-h-96">
          <div className="text-center space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto text-blue-600" />
            <div>
              <h3 className="text-lg font-medium">Loading BDC Universe</h3>
              <p className="text-sm text-gray-600">Fetching active BDCs from database...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-gray-900">BDC Data Management</h1>
        <div className="flex items-center space-x-2">
          <Badge variant="outline" className="text-sm">
            {bdcList.length} Active BDCs
          </Badge>
          <Button 
            onClick={loadBDCsFromDatabase}
            variant="ghost"
            size="sm"
            className="flex items-center space-x-1"
            disabled={loadingBDCs}
          >
            <RefreshCw className={`h-4 w-4 ${loadingBDCs ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </Button>
        </div>
      </div>
      
      {/* Status Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="pt-6">
          <div className="flex items-center space-x-3">
            <CheckCircle className="h-5 w-5 text-blue-600" />
            <div>
              <p className="text-sm font-medium text-blue-900">
                ✨ BDC Universe Integration Active
              </p>
              <p className="text-xs text-blue-700">
                Pulling {bdcList.length} active BDCs from bdc_universe table. PSEC CIK corrected to 1287032.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Error Display */}
      {bdcError && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium">Database Connection Issue:</div>
              <div className="text-sm">{bdcError}</div>
              <div className="text-sm">Using fallback BDC list with corrected PSEC CIK.</div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Connection Info */}
      <Card className="border-green-200 bg-green-50">
        <CardContent className="pt-4">
          <div className="text-xs text-green-800">
            <strong>Data Source:</strong> BDC Universe Table (Supabase)<br/>
            <strong>SEC API:</strong> data.sec.gov (Official)<br/>
            <strong>Total BDCs:</strong> {bdcList.length} active companies<br/>
            <strong>Last Updated:</strong> {new Date().toLocaleString()}<br/>
            <strong>Status:</strong> ✅ Ready for extraction
          </div>
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
          <p className="text-sm text-gray-600 mb-4">
            Test the SEC API integration with {bdcList.find(bdc => bdc.ticker === 'ARCC')?.company_name || 'a sample BDC'} (reliable dataset)
          </p>
          <Button 
            onClick={handleTestAPI}
            disabled={loading || bdcList.length === 0}
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
                : `Test API with ${bdcList.find(bdc => bdc.ticker === 'ARCC')?.ticker || 'Sample BDC'}`
              }
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
          <div>
            <Button 
              onClick={handleExtractAll}
              disabled={loading || bdcList.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center space-x-2"
            >
              {loading && currentOperation === 'backfill_all' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              <span>
                {loading && currentOperation === 'backfill_all' 
                  ? `Extracting All ${bdcList.length} BDCs...` 
                  : `🚀 Extract All ${bdcList.length} BDCs (Recommended)`
                }
              </span>
            </Button>
            <p className="text-xs text-gray-500 mt-1">
              Processes all active BDCs from your database using official SEC APIs
            </p>
          </div>

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
                  ? 'Extracting Selected...' 
                  : `Extract Selected (${selectedBDCs.length})`
                }
              </span>
            </Button>
            
            <div className="flex space-x-1">
              <Button 
                onClick={selectAll} 
                variant="ghost" 
                size="sm"
                disabled={loading || bdcList.length === 0}
              >
                All
              </Button>
              <Button 
                onClick={clearSelection} 
                variant="ghost" 
                size="sm"
                disabled={loading}
              >
                None
              </Button>
            </div>
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
          {bdcList.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Database className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No active BDCs found in database</p>
              <p className="text-sm">Check your bdc_universe table</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {bdcList.map(bdc => (
                <div key={bdc.ticker} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center space-x-3">
                    <input
                      type="checkbox"
                      checked={selectedBDCs.includes(bdc.ticker)}
                      onChange={() => toggleBDCSelection(bdc.ticker)}
                      disabled={loading}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300"
                    />
                    <div className="flex-1">
                      <div className="flex items-center space-x-3">
                        <span className="font-medium text-lg">{bdc.ticker}</span>
                        <Badge variant="secondary" className="text-xs">
                          {getMarketCapCategory(bdc.ticker)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {getSectorByTicker(bdc.ticker)}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          FYE: {bdc.fiscal_year_end_month}/{bdc.fiscal_year_end_day}
                        </Badge>
                      </div>
                      <div className="text-sm text-gray-600">{bdc.company_name}</div>
                      <div className="text-xs text-gray-400">CIK: {bdc.cik}</div>
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
          )}
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
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  <div className="space-y-2">
                    <div className="font-medium">
                      ✅ Success! {results.message || 'Operation completed successfully'}
                    </div>
                    
                    {results.totalInvestments && (
                      <div className="text-sm">
                        <strong>Total Investments Processed: {results.totalInvestments.toLocaleString()}</strong>
                      </div>
                    )}
                    
                    {results.investmentsFound && (
                      <div className="text-sm">
                        <strong>Investments Found: {results.investmentsFound.toLocaleString()}</strong>
                      </div>
                    )}
                    
                    {results.processed && (
                      <div className="text-sm">
                        <strong>BDCs Processed: {results.processed}</strong>
                      </div>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <div className="font-medium">
                      ❌ Error: {results.error || 'Unknown error occurred'}
                    </div>
                    <div className="text-sm">
                      Check the function logs in Supabase Dashboard for more details.
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
            {results.results && (
              <div className="mt-6">
                <h4 className="font-medium mb-3">Detailed Results by BDC:</h4>
                <div className="space-y-2">
                  {results.results.map((result, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                      <div className="flex items-center space-x-3">
                        {result.success ? (
                          <CheckCircle className="h-4 w-4 text-green-600" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600" />
                        )}
                        <span className="font-medium">{result.ticker}</span>
                        <span className="text-sm text-gray-500">({result.cik})</span>
                      </div>
                      <div className="text-right">
                        {result.success ? (
                          <div className="text-sm text-green-700">
                            {result.investmentsFound.toLocaleString()} investments
                          </div>
                        ) : (
                          <div className="text-sm text-red-700">
                            Failed: {result.error}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON for debugging */}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                Show Raw Response (Debug Info)
              </summary>
              <pre className="bg-gray-100 p-3 rounded text-xs overflow-auto max-h-64 mt-2">
                {JSON.stringify(results, null, 2)}
              </pre>
            </details>
          </CardContent>
        </Card>
      )}

      {/* Information Panel */}
      <Card className="border-gray-200">
        <CardHeader>
          <CardTitle className="text-lg">ℹ️ System Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div>
              <h4 className="font-medium text-green-700 mb-2">✅ What's New:</h4>
              <ul className="space-y-1 text-gray-600">
                <li>• Pulls all BDCs from bdc_universe table dynamically</li>
                <li>• Fixed PSEC CIK from 1403909 to 1287032</li>
                <li>• Processes {bdcList.length} active BDCs instead of 6 hardcoded</li>
                <li>• Uses official SEC APIs for structured data</li>
                <li>• Auto-refreshes BDC list from database</li>
                <li>• Supports individual and batch operations</li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-blue-700 mb-2">🎯 Best Practices:</h4>
              <ul className="space-y-1 text-gray-600">
                <li>• Start with "Test API" button first</li>
                <li>• Use "Extract All" for full {bdcList.length} BDC refresh</li>
                <li>• Check Supabase logs for detailed progress</li>
                <li>• Large BDCs may take 2-3 minutes each</li>
                <li>• SEC API rate-limited to 10 requests/second</li>
                <li>• Add new BDCs to bdc_universe table</li>
              </ul>
            </div>
          </div>
          
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <h4 className="font-medium text-gray-700 mb-2">📊 Current BDC Universe:</h4>
            <div className="text-xs text-gray-600">
              <strong>Total Active BDCs:</strong> {bdcList.length}<br/>
              <strong>Sample Tickers:</strong> {bdcList.slice(0, 10).map(bdc => bdc.ticker).join(', ')}{bdcList.length > 10 ? '...' : ''}<br/>
              <strong>Data Source:</strong> bdc_universe table (Supabase)<br/>
              <strong>Auto-scales:</strong> Add BDCs to table and they're included automatically
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
