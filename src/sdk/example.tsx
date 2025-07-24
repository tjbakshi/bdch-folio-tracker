import React, { useState, useEffect } from 'react';
import { getInvestments, exportData, invalidateCache } from '@/sdk';
import type { Investment, InvestmentSearchParams } from '@/sdk';

/**
 * Example React component demonstrating BDC SDK usage
 */
export const InvestmentExample: React.FC = () => {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Example: Load investments on component mount
  useEffect(() => {
    loadInvestments();
  }, []);

  /**
   * Example: Basic investment search
   */
  const loadInvestments = async () => {
    try {
      setLoading(true);
      setError(null);

      const result = await getInvestments({
        page: 1,
        limit: 50
      });

      setInvestments(result.data);
      console.log(`Loaded ${result.data.length} investments out of ${result.pagination.total} total`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load investments');
      console.error('Investment loading error:', err);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Example: Filtered search
   */
  const searchInvestments = async (filters: InvestmentSearchParams) => {
    try {
      setLoading(true);
      setError(null);

      const result = await getInvestments({
        manager: 'ARCC',
        tranche: 'First Lien',
        date_from: '2024-01-01',
        page: 1,
        limit: 25,
        ...filters
      });

      setInvestments(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Example: Export data
   */
  const handleExport = async () => {
    try {
      const csvData = await exportData({
        manager: 'ARCC',
        date_from: '2024-01-01'
      });

      // Create download
      const blob = new Blob([csvData], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bdc-investments-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Export failed:', err);
    }
  };

  /**
   * Example: Cache invalidation
   */
  const handleRefresh = async () => {
    try {
      await invalidateCache();
      console.log('Cache invalidated');
      await loadInvestments(); // Reload with fresh data
    } catch (err) {
      console.error('Cache invalidation failed:', err);
    }
  };

  if (loading) {
    return <div>Loading investments...</div>;
  }

  if (error) {
    return <div>Error: {error}</div>;
  }

  return (
    <div>
      <h2>BDC Investments ({investments.length})</h2>
      
      <div>
        <button onClick={loadInvestments}>Reload</button>
        <button onClick={() => searchInvestments({ manager: 'ARCC' })}>
          Filter by ARCC
        </button>
        <button onClick={handleExport}>Export CSV</button>
        <button onClick={handleRefresh}>Refresh Cache</button>
      </div>

      <div>
        {investments.map((investment) => (
          <div key={investment.id} style={{ border: '1px solid #ccc', margin: '10px', padding: '10px' }}>
            <h3>{investment.company_name}</h3>
            <p><strong>Manager:</strong> {investment.filings.ticker}</p>
            <p><strong>Tranche:</strong> {investment.investment_tranche}</p>
            <p><strong>Principal:</strong> ${investment.principal_amount?.toLocaleString()}</p>
            <p><strong>Fair Value:</strong> ${investment.fair_value?.toLocaleString()}</p>
            {investment.investments_computed[0] && (
              <p><strong>Mark:</strong> {(investment.investments_computed[0].mark * 100).toFixed(1)}%</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * Simple usage examples:
 */

// 1. Basic search
// const investments = await getInvestments();

// 2. Filtered search with pagination
// const results = await getInvestments({
//   manager: 'ARCC',
//   tranche: 'First Lien',
//   page: 1,
//   limit: 25
// });

// 3. Get mark history for specific investment
// const markHistory = await getMarkHistory('investment-uuid-here');

// 4. List non-accrual investments
// const nonAccruals = await listNonAccruals({
//   quarter: 3,
//   year: 2024,
//   manager: 'ARCC'
// });

// 5. Export data
// const csvData = await exportData({
//   manager: 'ARCC',
//   date_from: '2024-01-01'
// });

// 6. Invalidate cache
// await invalidateCache();