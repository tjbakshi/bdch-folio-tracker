import React, { useState } from 'react';

const AdminPanel = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState('ARCC');

  // Your Supabase configuration
  const SUPABASE_URL = 'https://pkpvyqvcsmyxcudamerw.supabase.co';
  const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrcHZ5cXZjc215eGN1ZGFtZXJ3Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1MzMyMzExOCwiZXhwIjoyMDY4ODk5MTE4fQ.CQH6gkNV3S36ER2dGXUvkNMJWij66YOOlvSBzGq0dvc';

  // List of BDC tickers for dropdown
  const bdcTickers = [
    'ARCC', 'BBDC', 'BCSF', 'BXSL', 'CCAP', 'CGBD', 'CION', 'FDUS', 'FSK', 'GBDC',
    'GSBD', 'HTGC', 'ICMB', 'LIEN', 'MAIN', 'MFIC', 'MRCC', 'MSDL', 'MSIF', 'NCDL',
    'NMFC', 'OBDC', 'OCSL', 'OFS', 'PFLT', 'PNNT', 'PSBD', 'PSEC', 'SAR', 'SCM',
    'SLRC', 'TCPC', 'TSLX', 'WHF'
  ];

  const callSECExtractor = async (action, additionalParams = {}) => {
    setIsLoading(true);
    setError(null);
    setResults(null);

    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/sec-extractor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SERVICE_KEY}`
        },
        body: JSON.stringify({
          action,
          ...additionalParams
        })
      });

      const data = await response.json();
      
      if (response.ok) {
        setResults(data);
      } else {
        setError(data.error || 'Unknown error occurred');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const adminActions = [
    {
      id: 'backfill_all',
      title: 'Full Backfill (All BDCs)',
      description: 'Process all 34 BDCs for the last 9 years of filings',
      buttonText: 'Start Full Backfill',
      color: 'bg-blue-600 hover:bg-blue-700',
      action: () => callSECExtractor('backfill_all'),
      warning: 'This will take 15-30 minutes and process hundreds of filings.',
      category: 'Initial Setup'
    },
    {
      id: 'test_single',
      title: 'Test Single BDC',
      description: 'Test with ARCC for 1 year (quick test)',
      buttonText: 'Test ARCC',
      color: 'bg-green-600 hover:bg-green-700',
      action: () => callSECExtractor('backfill_ticker', { ticker: 'ARCC', yearsBack: 1 }),
      category: 'Testing'
    },
    {
      id: 'setup_jobs',
      title: 'Setup Scheduled Jobs',
      description: 'Configure automatic filing monitoring',
      buttonText: 'Setup Jobs',
      color: 'bg-purple-600 hover:bg-purple-700',
      action: () => callSECExtractor('setup_scheduled_jobs'),
      category: 'Initial Setup'
    }
  ];

  const updateActions = [
    {
      id: 'check_new_10k',
      title: 'Check for New 10-K Filings',
      description: 'Scan all BDCs for new annual filings since last update',
      buttonText: 'Check New 10-Ks',
      color: 'bg-orange-600 hover:bg-orange-700',
      action: () => callSECExtractor('incremental_check', { ticker: 'ALL', filing_type: '10-K' }),
      category: 'Updates'
    },
    {
      id: 'check_new_10q',
      title: 'Check for New 10-Q Filings',
      description: 'Scan all BDCs for new quarterly filings since last update',
      buttonText: 'Check New 10-Qs',
      color: 'bg-indigo-600 hover:bg-indigo-700',
      action: () => callSECExtractor('incremental_check', { ticker: 'ALL', filing_type: '10-Q' }),
      category: 'Updates'
    },
    {
      id: 'update_single_10k',
      title: 'Update Single BDC (10-K)',
      description: 'Check for new annual filings for a specific BDC',
      buttonText: 'Update 10-K',
      color: 'bg-cyan-600 hover:bg-cyan-700',
      action: () => callSECExtractor('incremental_check', { ticker: selectedTicker, filing_type: '10-K' }),
      category: 'Updates'
    },
    {
      id: 'update_single_10q',
      title: 'Update Single BDC (10-Q)',
      description: 'Check for new quarterly filings for a specific BDC',
      buttonText: 'Update 10-Q',
      color: 'bg-teal-600 hover:bg-teal-700',
      action: () => callSECExtractor('incremental_check', { ticker: selectedTicker, filing_type: '10-Q' }),
      category: 'Updates'
    }
  ];

  const allActions = [...adminActions, ...updateActions];

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          🔧 BDC Admin Panel
        </h1>
        <p className="text-gray-600">
          Manage SEC data extraction, backfill processes, and monitor new filings for all BDC companies.
        </p>
      </div>

      {/* Ticker Selection for Single Updates */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">
          📌 Single BDC Selection
        </h3>
        <div className="flex items-center space-x-4">
          <label className="text-blue-800 font-medium">Select BDC for single updates:</label>
          <select
            value={selectedTicker}
            onChange={(e) => setSelectedTicker(e.target.value)}
            className="border border-blue-300 rounded px-3 py-2 bg-white"
          >
            {bdcTickers.map(ticker => (
              <option key={ticker} value={ticker}>{ticker}</option>
            ))}
          </select>
          <span className="text-blue-600 text-sm">
            Currently selected: <strong>{selectedTicker}</strong>
          </span>
        </div>
      </div>

      {/* Initial Setup Actions */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          🚀 Initial Setup & Testing
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {adminActions.map((action) => (
            <div key={action.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {action.title}
              </h3>
              <p className="text-gray-600 text-sm mb-3">
                {action.description}
              </p>
              {action.warning && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-md p-2 mb-3">
                  <p className="text-yellow-800 text-xs">
                    ⚠️ {action.warning}
                  </p>
                </div>
              )}
              <button
                onClick={action.action}
                disabled={isLoading}
                className={`${action.color} text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full text-sm`}
              >
                {isLoading ? '⏳ Processing...' : action.buttonText}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Update & Monitoring Actions */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          🔄 Updates & New Filings
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {updateActions.map((action) => (
            <div key={action.id} className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {action.title}
              </h3>
              <p className="text-gray-600 text-sm mb-3">
                {action.description}
              </p>
              {action.id.includes('single') && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-3">
                  <p className="text-blue-800 text-xs">
                    📌 Will check: <strong>{selectedTicker}</strong>
                  </p>
                </div>
              )}
              <button
                onClick={action.action}
                disabled={isLoading}
                className={`${action.color} text-white px-4 py-2 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full text-sm`}
              >
                {isLoading ? '⏳ Processing...' : action.buttonText}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Loading Indicator */}
      {isLoading && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600 mr-3"></div>
            <div>
              <h3 className="text-lg font-semibold text-blue-900">Processing...</h3>
              <p className="text-blue-700">
                This may take several minutes. Please don't close this page.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-green-900 mb-3">
            ✅ Success!
          </h3>
          <div className="bg-white p-4 rounded border">
            {/* Pretty display for common result types */}
            {results.message && (
              <div className="mb-2">
                <strong>Message:</strong> {results.message}
              </div>
            )}
            {results.processed !== undefined && (
              <div className="mb-2">
                <strong>Processed:</strong> {results.processed} BDCs
              </div>
            )}
            {results.errors !== undefined && (
              <div className="mb-2">
                <strong>Errors:</strong> {results.errors}
              </div>
            )}
            {results.new_filings !== undefined && (
              <div className="mb-2">
                <strong>New Filings Found:</strong> {results.new_filings}
              </div>
            )}
            {results.extracted !== undefined && (
              <div className="mb-2">
                <strong>Extracted:</strong> {results.extracted} filings
              </div>
            )}
            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-gray-600">
                Show full response
              </summary>
              <pre className="mt-2 text-xs overflow-auto bg-gray-50 p-2 rounded">
                {JSON.stringify(results, null, 2)}
              </pre>
            </details>
          </div>
        </div>
      )}

      {/* Errors */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-red-900 mb-3">
            ❌ Error
          </h3>
          <p className="text-red-700 bg-white p-4 rounded border font-mono text-sm">
            {error}
          </p>
        </div>
      )}

      {/* Quick Stats & Usage Guide */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-gray-50 rounded-lg p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-3">
            📊 Quick Info
          </h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-gray-600">Total BDCs</p>
              <p className="font-semibold text-lg">34</p>
            </div>
            <div>
              <p className="text-gray-600">Backfill Range</p>
              <p className="font-semibold text-lg">9 Years</p>
            </div>
            <div>
              <p className="text-gray-600">Filing Types</p>
              <p className="font-semibold text-lg">10-K, 10-Q</p>
            </div>
            <div>
              <p className="text-gray-600">Expected Filings</p>
              <p className="font-semibold text-lg">~1,200+</p>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 rounded-lg p-6 border border-blue-200">
          <h3 className="text-lg font-semibold text-blue-900 mb-3">
            💡 Usage Guide
          </h3>
          <div className="text-sm text-blue-800 space-y-2">
            <p><strong>First time?</strong> Run "Full Backfill" to get all historical data.</p>
            <p><strong>Daily updates:</strong> Use "Check New 10-Qs" for quarterly filings.</p>
            <p><strong>Annual updates:</strong> Use "Check New 10-Ks" around fiscal year-ends.</p>
            <p><strong>Single BDC:</strong> Select ticker above and use single update buttons.</p>
            <p><strong>Monitoring:</strong> Set up scheduled jobs for automatic checks.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
