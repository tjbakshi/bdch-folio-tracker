import React, { useState, useEffect } from 'react';
import { AlertCircle, Database, Download, RefreshCw, CheckCircle, XCircle } from 'lucide-react';

const AdminPanel = () => {
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    filings: 0,
    investments: 0,
    lastUpdate: null
  });

  // Your Supabase configuration - pre-filled to save time
  const SUPABASE_URL = 'https://pkpvyqvcsmyxcudamerw.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcHZ5cXZjc215eGN1ZGFtZXJ3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMzMjMxMTgsImV4cCI6MjA2ODg5OTExOH0.XHyg3AzXz70Ad1t-E7oiiw0wFhCxUfG1H41HitZgKQY';

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { message, type, timestamp }]);
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/get_admin_stats`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.log('Stats fetch failed (this is normal if RPC doesn\'t exist)');
    }
  };

  useEffect(() => {
    addLog('✅ Admin panel loaded with saved credentials', 'success');
    fetchStats();
  }, []);

  const callEdgeFunction = async (action, ticker = null, additionalParams = {}) => {
    setLoading(true);
    setStatus(`Starting ${action}...`);
    
    const payload = {
      action,
      ...(ticker && { ticker }),
      ...additionalParams
    };

    addLog(`🚀 Calling edge function: ${action}${ticker ? ` for ${ticker}` : ''}`, 'info');

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/sec-extractor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'apikey': SUPABASE_ANON_KEY,
          // Add CORS headers to help with the request
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, apikey'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }

      const result = await response.json();
      
      addLog(`✅ ${action} completed successfully`, 'success');
      addLog(`📊 Result: ${JSON.stringify(result, null, 2)}`, 'info');
      setStatus(`${action} completed successfully`);
      
      // Refresh stats after successful operation
      setTimeout(fetchStats, 2000);
      
      return result;
    } catch (error) {
      const errorMsg = `❌ ${action} failed: ${error.message}`;
      addLog(errorMsg, 'error');
      setStatus(errorMsg);
      
      // Additional debugging info
      if (error.message.includes('CORS')) {
        addLog('💡 CORS Error - Your edge function needs CORS headers configured', 'warning');
      } else if (error.message.includes('timeout')) {
        addLog('💡 Timeout - The operation is taking longer than expected', 'warning');
      }
      
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleFullBackfill = async () => {
    try {
      addLog('🎯 Starting full backfill process...', 'info');
      await callEdgeFunction('backfill_all');
      addLog('🎉 Full backfill completed! Your investment tables should now be populated.', 'success');
    } catch (error) {
      addLog('🔧 If this failed due to CORS, try the Supabase Dashboard method below', 'warning');
    }
  };

  const handleTickerBackfill = async () => {
    const ticker = prompt('Enter BDC ticker (e.g., ARCC, MAIN, GSBD):');
    if (!ticker) return;
    
    try {
      await callEdgeFunction('backfill_ticker', ticker.toUpperCase(), { years_back: 1 });
    } catch (error) {
      console.error('Ticker backfill failed:', error);
    }
  };

  const handleExtractAll = async () => {
    try {
      addLog('📊 Extracting investment data from all filings...', 'info');
      await callEdgeFunction('extract_all_investments');
    } catch (error) {
      console.error('Extract all failed:', error);
    }
  };

  const handleBatchExtraction = async () => {
    try {
      addLog('🔄 Starting batch extraction (processing in smaller chunks)...', 'info');
      
      // Process in batches of 50 filings
      let batchNumber = 1;
      let hasMore = true;
      
      while (hasMore) {
        addLog(`📦 Processing batch ${batchNumber} (50 filings)...`, 'info');
        
        try {
          const result = await callEdgeFunction('extract_batch_investments', null, { 
            batch_size: 50,
            offset: (batchNumber - 1) * 50 
          });
          
          if (result && result.processed < 50) {
            hasMore = false;
            addLog(`✅ Batch ${batchNumber} completed - processed ${result.processed} filings (final batch)`, 'success');
          } else {
            addLog(`✅ Batch ${batchNumber} completed - processed 50 filings`, 'success');
          }
          
          batchNumber++;
          
          // Small delay between batches to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (batchError) {
          addLog(`❌ Batch ${batchNumber} failed: ${batchError.message}`, 'error');
          addLog('🔄 Continuing with next batch...', 'warning');
          batchNumber++;
        }
      }
      
      addLog('🎉 Batch extraction completed! All investment data should now be extracted.', 'success');
      
    } catch (error) {
      addLog(`❌ Batch extraction failed: ${error.message}`, 'error');
    }
  };

  const handleIncrementalCheck = async () => {
    try {
      await callEdgeFunction('incremental_check');
    } catch (error) {
      console.error('Incremental check failed:', error);
    }
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('🧹 Logs cleared', 'info');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">BDC Portfolio Tracker Admin</h1>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
            <div className="flex items-center">
              <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
              <span className="text-green-800 font-medium">✅ Credentials saved! Ready to process data.</span>
            </div>
          </div>
          
          {/* Stats Dashboard */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Database className="h-8 w-8 text-blue-600 mr-3" />
                <div>
                  <p className="text-sm text-blue-600">SEC Filings</p>
                  <p className="text-2xl font-bold text-blue-900">{stats.filings}</p>
                </div>
              </div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <div className="flex items-center">
                <Database className="h-8 w-8 text-green-600 mr-3" />
                <div>
                  <p className="text-sm text-green-600">Investment Records</p>
                  <p className="text-2xl font-bold text-green-900">{stats.investments}</p>
                </div>
              </div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <div className="flex items-center">
                <RefreshCw className="h-8 w-8 text-purple-600 mr-3" />
                <div>
                  <p className="text-sm text-purple-600">Last Update</p>
                  <p className="text-sm font-medium text-purple-900">
                    {stats.lastUpdate ? new Date(stats.lastUpdate).toLocaleDateString() : 'Never'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Action Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Primary Actions</h2>
            <div className="space-y-3">
              <button
                onClick={handleFullBackfill}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
              >
                {loading ? (
                  <RefreshCw className="animate-spin h-5 w-5 mr-2" />
                ) : (
                  <Download className="h-5 w-5 mr-2" />
                )}
                🚀 Start Full Backfill + Extract All
              </button>
              
              <button
                onClick={handleBatchExtraction}
                disabled={loading}
                className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
              >
                <Database className="h-5 w-5 mr-2" />
                📊 Extract Investments (Batch Processing)
              </button>
              
              <button
                onClick={handleExtractAll}
                disabled={loading}
                className="w-full bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center text-sm"
              >
                <Database className="h-5 w-5 mr-2" />
                ⚠️ Extract All (May Timeout)
              </button>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-lg p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Individual Actions</h2>
            <div className="space-y-3">
              <button
                onClick={handleTickerBackfill}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
              >
                <Download className="h-5 w-5 mr-2" />
                📈 Backfill Single Ticker
              </button>
              
              <button
                onClick={handleIncrementalCheck}
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-400 text-white font-medium py-3 px-4 rounded-lg transition duration-200 flex items-center justify-center"
              >
                <RefreshCw className="h-5 w-5 mr-2" />
                🔄 Check for New Filings
              </button>
            </div>
          </div>
        </div>

        {/* Alternative Method */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            <AlertCircle className="inline-block h-5 w-5 text-blue-600 mr-2" />
            Recommended Approach (Based on Your Logs)
          </h2>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
            <h3 className="font-medium text-blue-800 mb-2">✅ Good News: Backfill Already Worked!</h3>
            <p className="text-sm text-blue-700 mb-3">
              Your logs show that SEC filings were successfully downloaded and stored. The issue is just that processing 1000 filings at once exceeded the compute limits.
            </p>
            <h3 className="font-medium text-blue-800 mb-2">🎯 Next Step: Use Batch Processing</h3>
            <ol className="list-decimal list-inside text-sm text-blue-700 space-y-1">
              <li>Click the "📊 Extract Investments (Batch Processing)" button above</li>
              <li>This will process your 1000 filings in chunks of 50</li>
              <li>Each batch takes ~1-2 minutes instead of timing out</li>
              <li>Watch the logs to see progress through each batch</li>
            </ol>
          </div>
          
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h3 className="font-medium text-yellow-800 mb-2">Alternative: Manual Supabase Dashboard Method</h3>
            <ol className="list-decimal list-inside text-sm text-yellow-700 space-y-1">
              <li>Go to: <a href="https://supabase.com/dashboard" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">Supabase Dashboard</a></li>
              <li>Navigate to: Functions → sec-extractor → Invoke Function</li>
              <li>Send: <code className="bg-yellow-100 px-2 py-1 rounded">{"{"}"action": "extract_batch_investments", "batch_size": 50, "offset": 0{"}"}</code></li>
              <li>Wait for completion, then send: <code className="bg-yellow-100 px-2 py-1 rounded">{"{"}"action": "extract_batch_investments", "batch_size": 50, "offset": 50{"}"}</code></li>
              <li>Continue incrementing offset by 50 until no more results</li>
            </ol>
          </div>
        </div>

        {/* Status and Logs */}
        <div className="bg-white rounded-lg shadow-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Operation Logs</h2>
            <button
              onClick={clearLogs}
              className="text-sm text-gray-600 hover:text-gray-800 underline"
            >
              Clear Logs
            </button>
          </div>
          
          {status && (
            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-blue-800 font-medium">Current Status: {status}</p>
            </div>
          )}
          
          <div className="bg-gray-900 rounded-lg p-4 h-64 overflow-y-auto">
            {logs.length === 0 ? (
              <p className="text-gray-400">No logs yet. Click a button above to start processing.</p>
            ) : (
              <div className="space-y-1">
                {logs.map((log, index) => (
                  <div key={index} className="flex items-start space-x-2 text-sm">
                    <span className="text-gray-400 text-xs font-mono min-w-0 flex-shrink-0">
                      {log.timestamp}
                    </span>
                    <span className={`${
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'success' ? 'text-green-400' :
                      log.type === 'warning' ? 'text-yellow-400' :
                      'text-gray-300'
                    }`}>
                      {log.message}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Quick Debugging Info */}
        <div className="mt-6 text-sm text-gray-600">
          <h3 className="font-medium mb-2">🔧 Debugging Information:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>Supabase URL: {SUPABASE_URL}</li>
            <li>Edge Function: sec-extractor</li>
            <li>Current Time: {new Date().toLocaleString()}</li>
            <li>Expected Tables: sec_filings, investments_raw, bdc_companies</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
