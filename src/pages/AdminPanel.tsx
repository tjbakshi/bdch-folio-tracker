import React, { useState } from 'react';

const AdminPanel = () => {
  const [status, setStatus] = useState('');
  const [statusType, setStatusType] = useState('info');
  const [loading, setLoading] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState('ARCC');

  // Helper function to update status
  const updateStatus = (message, type = 'info') => {
    setStatus(message);
    setStatusType(type);
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  // Helper function to make API calls with better error handling
  const callSECExtractor = async (payload) => {
    try {
      console.log('Making API call with payload:', payload);
      
      // Use direct Supabase URL since frontend routing is causing 405
      const apiUrl = 'https://pkpvyqvcsmyxcudamerw.supabase.co/functions/v1/sec-extractor';
      console.log('API URL:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      
      console.log('Response status:', response.status);
      console.log('Response headers:', Object.fromEntries(response.headers.entries()));
      
      // Get the raw response text first
      const responseText = await response.text();
      console.log('Raw response:', responseText);
      
      // Check if response is empty
      if (!responseText) {
        throw new Error(`Empty response from server (status: ${response.status})`);
      }
      
      // Try to parse as JSON
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (jsonError) {
        console.error('JSON parsing failed:', jsonError);
        throw new Error(`Invalid JSON response: ${responseText.substring(0, 200)}...`);
      }
      
      if (!response.ok) {
        throw new Error(result.error || `API call failed: ${response.status} - ${response.statusText}`);
      }
      
      return result;
      
    } catch (error) {
      console.error('API call error:', error);
      throw error;
    }
  };

  // 1. FULL BACKFILL + INVESTMENT EXTRACTION
  const handleFullBackfill = async () => {
    setLoading(true);
    try {
      updateStatus('🔄 Starting full backfill for all BDCs...', 'info');
      
      // Step 1: Download all SEC filings
      const filingResult = await callSECExtractor({ action: 'backfill_all' });
      console.log('Filing backfill result:', filingResult);
      
      updateStatus(`✅ Filing backfill completed! Processed ${filingResult.processed} BDCs. Now extracting investments...`, 'success');
      
      // Step 2: Extract investment data from all filings
      const extractResult = await callSECExtractor({ action: 'extract_all_investments' });
      console.log('Investment extraction result:', extractResult);
      
      updateStatus(`🎉 Complete! Processed ${extractResult.processed} filings and extracted ${extractResult.investments_extracted} investments!`, 'success');
      
    } catch (error) {
      console.error('Full backfill error:', error);
      updateStatus(`❌ Error: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 2. TEST SINGLE TICKER + INVESTMENT EXTRACTION (with better error handling)
  const handleTestARCC = async () => {
    setLoading(true);
    try {
      updateStatus(`🔄 Testing ARCC - downloading filings...`, 'info');
      
      // Step 1: Backfill filings for ARCC (1 year)
      console.log('Step 1: Starting ARCC backfill...');
      const filingResult = await callSECExtractor({ 
        action: 'backfill_ticker', 
        ticker: 'ARCC',
        years_back: 1
      });
      
      console.log('Filing result:', filingResult);
      updateStatus(`✅ Filing backfill for ARCC completed. Now extracting investments...`, 'info');
      
      // Step 2: Extract investments for ARCC
      console.log('Step 2: Starting ARCC investment extraction...');
      const extractResult = await callSECExtractor({ 
        action: 'extract_investments', 
        ticker: 'ARCC' 
      });
      
      console.log('Extract result:', extractResult);
      updateStatus(`🎉 ARCC test completed! Processed ${extractResult.processed} filings and extracted ${extractResult.investments_extracted} investments!`, 'success');
      
    } catch (error) {
      console.error('Test ARCC error:', error);
      
      // More detailed error messages
      if (error.message.includes('fetch')) {
        updateStatus(`❌ Network error: Could not connect to API. Check if your edge function is deployed.`, 'error');
      } else if (error.message.includes('JSON')) {
        updateStatus(`❌ API response error: ${error.message}`, 'error');
      } else if (error.message.includes('500')) {
        updateStatus(`❌ Server error: Check the function logs in Supabase dashboard.`, 'error');
      } else {
        updateStatus(`❌ ARCC test failed: ${error.message}`, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  // 3. CHECK NEW 10-K FILINGS + EXTRACT INVESTMENTS
  const handleCheck10K = async () => {
    setLoading(true);
    try {
      updateStatus(`🔄 Checking for new 10-K filings and extracting investments...`, 'info');
      
      const bdcTickers = ['ARCC', 'BXSL', 'MAIN', 'NEWT', 'ORCC', 'PSEC', 'TSLX', 'CGBD', 'TCPC', 'GBDC', 'HTGC', 'GAIN', 'MFIC', 'OCSL'];
      let totalNewFilings = 0;
      let totalInvestments = 0;
      
      for (const ticker of bdcTickers) {
        try {
          // Step 1: Check for new 10-K filings
          const filingResult = await callSECExtractor({ 
            action: 'incremental_check',
            ticker: ticker,
            filing_type: '10-K'
          });
          
          if (filingResult.new_filings > 0) {
            totalNewFilings += filingResult.new_filings;
            
            // Step 2: Extract investments from new filings
            const extractResult = await callSECExtractor({ 
              action: 'extract_investments',
              ticker: ticker
            });
            
            totalInvestments += extractResult.investments_extracted || 0;
          }
          
          // Small delay between tickers
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`Error processing ${ticker}:`, error);
        }
      }
      
      updateStatus(`✅ 10-K check completed! Found ${totalNewFilings} new filings and extracted ${totalInvestments} investments.`, 'success');
      
    } catch (error) {
      console.error('Check new 10-K error:', error);
      updateStatus(`❌ Error checking 10-K filings: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 4. CHECK NEW 10-Q FILINGS + EXTRACT INVESTMENTS
  const handleCheck10Q = async () => {
    setLoading(true);
    try {
      updateStatus(`🔄 Checking for new 10-Q filings and extracting investments...`, 'info');
      
      const bdcTickers = ['ARCC', 'BXSL', 'MAIN', 'NEWT', 'ORCC', 'PSEC', 'TSLX', 'CGBD', 'TCPC', 'GBDC', 'HTGC', 'GAIN', 'MFIC', 'OCSL'];
      let totalNewFilings = 0;
      let totalInvestments = 0;
      
      for (const ticker of bdcTickers) {
        try {
          // Step 1: Check for new 10-Q filings
          const filingResult = await callSECExtractor({ 
            action: 'incremental_check',
            ticker: ticker,
            filing_type: '10-Q'
          });
          
          if (filingResult.new_filings > 0) {
            totalNewFilings += filingResult.new_filings;
            
            // Step 2: Extract investments from new filings
            const extractResult = await callSECExtractor({ 
              action: 'extract_investments',
              ticker: ticker
            });
            
            totalInvestments += extractResult.investments_extracted || 0;
          }
          
          // Small delay between tickers
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error) {
          console.error(`Error processing ${ticker}:`, error);
        }
      }
      
      updateStatus(`✅ 10-Q check completed! Found ${totalNewFilings} new filings and extracted ${totalInvestments} investments.`, 'success');
      
    } catch (error) {
      console.error('Check new 10-Q error:', error);
      updateStatus(`❌ Error checking 10-Q filings: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 5. UPDATE SINGLE BDC (10-K) + EXTRACT INVESTMENTS
  const handleUpdate10K = async () => {
    setLoading(true);
    try {
      updateStatus(`🔄 Updating ${selectedTicker} 10-K filings and extracting investments...`, 'info');
      
      // Step 1: Check for new 10-K filings for this specific BDC
      const filingResult = await callSECExtractor({ 
        action: 'incremental_check',
        ticker: selectedTicker,
        filing_type: '10-K'
      });
      
      if (filingResult.new_filings > 0) {
        updateStatus(`✅ Found ${filingResult.new_filings} new 10-K filings for ${selectedTicker}. Extracting investments...`, 'info');
        
        // Step 2: Extract investments from new filings
        const extractResult = await callSECExtractor({ 
          action: 'extract_investments',
          ticker: selectedTicker
        });
        
        updateStatus(`🎉 ${selectedTicker} update completed! Processed ${extractResult.processed} filings and extracted ${extractResult.investments_extracted} investments!`, 'success');
      } else {
        updateStatus(`ℹ️ No new 10-K filings found for ${selectedTicker}.`, 'info');
      }
      
    } catch (error) {
      console.error(`Update ${selectedTicker} error:`, error);
      updateStatus(`❌ Error updating ${selectedTicker}: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 6. UPDATE SINGLE BDC (10-Q) + EXTRACT INVESTMENTS
  const handleUpdate10Q = async () => {
    setLoading(true);
    try {
      updateStatus(`🔄 Updating ${selectedTicker} 10-Q filings and extracting investments...`, 'info');
      
      // Step 1: Check for new 10-Q filings for this specific BDC
      const filingResult = await callSECExtractor({ 
        action: 'incremental_check',
        ticker: selectedTicker,
        filing_type: '10-Q'
      });
      
      if (filingResult.new_filings > 0) {
        updateStatus(`✅ Found ${filingResult.new_filings} new 10-Q filings for ${selectedTicker}. Extracting investments...`, 'info');
        
        // Step 2: Extract investments from new filings
        const extractResult = await callSECExtractor({ 
          action: 'extract_investments',
          ticker: selectedTicker
        });
        
        updateStatus(`🎉 ${selectedTicker} update completed! Processed ${extractResult.processed} filings and extracted ${extractResult.investments_extracted} investments!`, 'success');
      } else {
        updateStatus(`ℹ️ No new 10-Q filings found for ${selectedTicker}.`, 'info');
      }
      
    } catch (error) {
      console.error(`Update ${selectedTicker} error:`, error);
      updateStatus(`❌ Error updating ${selectedTicker}: ${error.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">🏦 BDC Admin Panel</h1>
        <p className="text-gray-600">Manage SEC data extraction, backfill processes, and monitor new filings for all BDC companies.</p>
      </div>

      {/* Single BDC Selection */}
      <div className="bg-red-50 p-4 rounded-lg mb-6">
        <h3 className="text-lg font-semibold text-red-800 mb-3">📌 Single BDC Selection</h3>
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Select BDC for single updates:</label>
          <select 
            value={selectedTicker} 
            onChange={(e) => setSelectedTicker(e.target.value)}
            className="px-3 py-1 border border-gray-300 rounded-md text-sm"
          >
            <option value="ARCC">ARCC</option>
            <option value="BXSL">BXSL</option>
            <option value="MAIN">MAIN</option>
            <option value="NEWT">NEWT</option>
            <option value="ORCC">ORCC</option>
            <option value="PSEC">PSEC</option>
            <option value="TSLX">TSLX</option>
            <option value="CGBD">CGBD</option>
            <option value="TCPC">TCPC</option>
            <option value="GBDC">GBDC</option>
            <option value="HTGC">HTGC</option>
            <option value="GAIN">GAIN</option>
            <option value="MFIC">MFIC</option>
            <option value="OCSL">OCSL</option>
          </select>
          <span className="text-xs text-gray-500">Currently selected: {selectedTicker}</span>
        </div>
      </div>

      {/* Initial Setup & Testing */}
      <div className="bg-blue-50 p-6 rounded-lg mb-6">
        <h3 className="text-xl font-semibold text-blue-800 mb-4">🚀 Initial Setup & Testing</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Full Backfill */}
          <div className="bg-white p-4 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-700 mb-2">Full Backfill (All BDCs)</h4>
            <p className="text-sm text-gray-600 mb-3">Process all 34 BDCs for the last 9 years of filings + extract ALL investments</p>
            <div className="mb-3 p-2 bg-yellow-50 rounded text-xs text-yellow-800">
              ⚠️ This will take 15-30 minutes and process hundreds of filings.
            </div>
            <button 
              onClick={handleFullBackfill}
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? '🔄 Processing...' : '🚀 Start Full Backfill + Extract All'}
            </button>
          </div>

          {/* Test Single BDC */}
          <div className="bg-white p-4 rounded-lg border border-green-200">
            <h4 className="font-semibold text-green-700 mb-2">Test Single BDC</h4>
            <p className="text-sm text-gray-600 mb-3">Test with ARCC for 1 year (quick test) + extract investments</p>
            <button 
              onClick={handleTestARCC}
              disabled={loading}
              className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed mb-2"
            >
              {loading ? '🔄 Testing...' : '🧪 Test ARCC + Extract'}
            </button>
            
            {/* Simple API Test Button */}
            <button 
              onClick={async () => {
                try {
                  updateStatus('🔄 Testing direct Supabase API connection...', 'info');
                  
                  // Use direct Supabase URL
                  const apiUrl = 'https://pkpvyqvcsmyxcudamerw.supabase.co/functions/v1/sec-extractor';
                  
                  console.log('Testing with URL:', apiUrl);
                  
                  const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 
                      'Content-Type': 'application/json',
                      'Accept': 'application/json'
                    },
                    body: JSON.stringify({ action: 'backfill_ticker', ticker: 'ARCC', years_back: 1 })
                  });
                  
                  console.log('Response status:', response.status);
                  const responseText = await response.text();
                  console.log('Response text:', responseText);
                  
                  if (response.ok) {
                    const result = JSON.parse(responseText);
                    updateStatus(`✅ API test successful! Response: ${JSON.stringify(result)}`, 'success');
                  } else {
                    updateStatus(`❌ API returned ${response.status}: ${responseText}`, 'error');
                  }
                } catch (error) {
                  updateStatus(`❌ API test failed: ${error.message}`, 'error');
                  console.error('API test error:', error);
                }
              }}
              disabled={loading}
              className="w-full bg-gray-500 text-white px-2 py-1 rounded text-xs hover:bg-gray-600 disabled:bg-gray-400"
            >
              🔧 Test Direct API
            </button>
          </div>

          {/* Setup Scheduled Jobs */}
          <div className="bg-white p-4 rounded-lg border border-purple-200">
            <h4 className="font-semibold text-purple-700 mb-2">Setup Scheduled Jobs</h4>
            <p className="text-sm text-gray-600 mb-3">Configure automatic filing monitoring</p>
            <button 
              onClick={() => callSECExtractor({ action: 'setup_scheduled_jobs' })}
              disabled={loading}
              className="w-full bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? '⚙️ Setting up...' : '⚙️ Setup Jobs'}
            </button>
          </div>
        </div>
      </div>

      {/* Updates & New Filings */}
      <div className="bg-green-50 p-6 rounded-lg mb-6">
        <h3 className="text-xl font-semibold text-green-800 mb-4">📈 Updates & New Filings</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          {/* Check for New 10-K Filings */}
          <div className="bg-white p-4 rounded-lg border border-orange-200">
            <h4 className="font-semibold text-orange-700 mb-2">Check for New 10-K Filings</h4>
            <p className="text-sm text-gray-600 mb-3">Scan all BDCs for new annual filings since last update + extract investments</p>
            <button 
              onClick={handleCheck10K}
              disabled={loading}
              className="w-full bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? '🔍 Checking...' : '📊 Check New 10-Ks + Extract'}
            </button>
          </div>

          {/* Check for New 10-Q Filings */}
          <div className="bg-white p-4 rounded-lg border border-blue-200">
            <h4 className="font-semibold text-blue-700 mb-2">Check for New 10-Q Filings</h4>
            <p className="text-sm text-gray-600 mb-3">Scan all BDCs for new quarterly filings since last update + extract investments</p>
            <button 
              onClick={handleCheck10Q}
              disabled={loading}
              className="w-full bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? '🔍 Checking...' : '📈 Check New 10-Qs + Extract'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Update Single BDC (10-K) */}
          <div className="bg-white p-4 rounded-lg border border-teal-200">
            <h4 className="font-semibold text-teal-700 mb-2">Update Single BDC (10-K)</h4>
            <p className="text-sm text-gray-600 mb-3">Check for new annual filings for a specific BDC + extract investments</p>
            <div className="text-xs text-gray-500 mb-2">📌 Will check: {selectedTicker}</div>
            <button 
              onClick={handleUpdate10K}
              disabled={loading}
              className="w-full bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? '🔄 Updating...' : '🔄 Update 10-K + Extract'}
            </button>
          </div>

          {/* Update Single BDC (10-Q) */}
          <div className="bg-white p-4 rounded-lg border border-teal-200">
            <h4 className="font-semibold text-teal-700 mb-2">Update Single BDC (10-Q)</h4>
            <p className="text-sm text-gray-600 mb-3">Check for new quarterly filings for a specific BDC + extract investments</p>
            <div className="text-xs text-gray-500 mb-2">📌 Will check: {selectedTicker}</div>
            <button 
              onClick={handleUpdate10Q}
              disabled={loading}
              className="w-full bg-teal-600 text-white px-4 py-2 rounded-md hover:bg-teal-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {loading ? '🔄 Updating...' : '🔄 Update 10-Q + Extract'}
            </button>
          </div>
        </div>
      </div>

      {/* Status Display */}
      {status && (
        <div className={`p-4 rounded-lg mb-6 ${
          statusType === 'success' ? 'bg-green-100 border border-green-300 text-green-800' :
          statusType === 'error' ? 'bg-red-100 border border-red-300 text-red-800' :
          statusType === 'warning' ? 'bg-yellow-100 border border-yellow-300 text-yellow-800' :
          'bg-blue-100 border border-blue-300 text-blue-800'
        }`}>
          <div className="font-medium">{status}</div>
        </div>
      )}

      {/* Quick Info */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="font-semibold text-gray-700 mb-2">📊 Quick Info</h4>
          <div className="space-y-1 text-sm text-gray-600">
            <div><strong>Total BDCs:</strong> 34</div>
            <div><strong>Backfill Range:</strong> 9 Years</div>
            <div><strong>Filing Types:</strong> 10-K, 10-Q</div>
            <div><strong>Expected Filings:</strong> ~1,200+</div>
          </div>
        </div>

        <div className="bg-yellow-50 p-4 rounded-lg">
          <h4 className="font-semibold text-yellow-800 mb-2">💡 Usage Guide</h4>
          <div className="space-y-1 text-sm text-yellow-700">
            <div><strong>First time?</strong> Run "Full Backfill" to get all historical data</div>
            <div><strong>Daily updates:</strong> Use "Check New" buttons for quarterly filings</div>
            <div><strong>Single BDC:</strong> Use dropdown + single update buttons</div>
            <div><strong>Monitoring:</strong> Set up scheduled jobs for automation</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminPanel;
