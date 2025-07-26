/**
 * Test data factories for consistent, realistic test data
 */

export interface MockInvestmentData {
  id: string;
  company_name: string;
  manager: string;
  business_description: string;
  investment_tranche: string;
  principal_amount: number;
  fair_value: number;
  filings: {
    ticker: string;
    filing_date: string;
    filing_type: string;
  };
  investments_computed: Array<{
    mark: number;
    is_non_accrual: boolean;
    quarter_year: string;
  }>;
}

export interface MockAPIResponse {
  data: MockInvestmentData[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Factory for creating realistic investment data
 */
export class InvestmentDataFactory {
  private static managers = ['ARCC', 'MAIN', 'BXSL', 'HTGC', 'PSEC', 'GSBD', 'NEWT'];
  private static tranches = ['First Lien', 'Second Lien', 'Subordinated Debt', 'Equity'];
  private static filingTypes = ['10-K', '10-Q', '8-K', 'DEF 14A'];
  private static businessTypes = [
    'Software Development',
    'Healthcare Services', 
    'Financial Technology',
    'Manufacturing',
    'Retail Operations',
    'Energy Services',
    'Technology Consulting'
  ];

  static createInvestment(overrides: Partial<MockInvestmentData> = {}): MockInvestmentData {
    const baseId = Math.random().toString(36).substr(2, 9);
    const companyName = this.generateCompanyName();
    const manager = this.getRandomItem(this.managers);
    const tranche = this.getRandomItem(this.tranches);
    const principalAmount = this.generateAmount(100000, 5000000);
    const fairValue = principalAmount * (0.85 + Math.random() * 0.3); // 85%-115% of principal
    const mark = fairValue / principalAmount;

    return {
      id: `inv-${baseId}`,
      company_name: companyName,
      manager,
      business_description: `${this.getRandomItem(this.businessTypes)} company providing innovative solutions`,
      investment_tranche: tranche,
      principal_amount: principalAmount,
      fair_value: Math.round(fairValue),
      filings: {
        ticker: this.generateTicker(companyName),
        filing_date: this.generateRecentDate(),
        filing_type: this.getRandomItem(this.filingTypes)
      },
      investments_computed: [{
        mark,
        is_non_accrual: mark < 0.9 && Math.random() < 0.3,
        quarter_year: this.getCurrentQuarter()
      }],
      ...overrides
    };
  }

  static createMultipleInvestments(count: number, overrides: Partial<MockInvestmentData> = {}): MockInvestmentData[] {
    return Array.from({ length: count }, () => this.createInvestment(overrides));
  }

  static createAPIResponse(investments: MockInvestmentData[], page = 1, limit = 100): MockAPIResponse {
    return {
      data: investments,
      pagination: {
        page,
        limit,
        total: investments.length,
        totalPages: Math.ceil(investments.length / limit)
      }
    };
  }

  // Error scenarios
  static createEmptyResponse(): MockAPIResponse {
    return {
      data: [],
      pagination: { page: 1, limit: 100, total: 0, totalPages: 0 }
    };
  }

  static createNetworkError() {
    return {
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }

  static createTimeoutError() {
    return {
      status: 504,
      contentType: 'application/json', 
      body: JSON.stringify({ error: 'Gateway timeout' })
    };
  }

  static createAuthError() {
    return {
      status: 401,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Unauthorized access' })
    };
  }

  // Utility methods
  private static getRandomItem<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private static generateCompanyName(): string {
    const prefixes = ['Tech', 'Global', 'Advanced', 'Digital', 'Premier', 'Strategic'];
    const suffixes = ['Corp', 'Holdings', 'Solutions', 'Enterprises', 'Systems', 'Industries'];
    return `${this.getRandomItem(prefixes)} ${this.getRandomItem(suffixes)}`;
  }

  private static generateTicker(companyName: string): string {
    const words = companyName.split(' ');
    return words.map(word => word.charAt(0)).join('').toUpperCase();
  }

  private static generateAmount(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private static generateRecentDate(): string {
    const now = new Date();
    const daysAgo = Math.floor(Math.random() * 90); // Last 90 days
    const date = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }

  private static getCurrentQuarter(): string {
    const now = new Date();
    const quarter = Math.ceil((now.getMonth() + 1) / 3);
    return `Q${quarter} ${now.getFullYear()}`;
  }
}

/**
 * Predefined test scenarios
 */
export const TestScenarios = {
  // Standard cases
  normalInvestments: () => InvestmentDataFactory.createMultipleInvestments(5),
  singleInvestment: () => [InvestmentDataFactory.createInvestment()],
  
  // Edge cases
  largeDataset: () => InvestmentDataFactory.createMultipleInvestments(100),
  emptyDataset: () => [],
  
  // Specific scenarios
  allSameManager: () => InvestmentDataFactory.createMultipleInvestments(3, { manager: 'ARCC' }),
  highRiskInvestments: () => InvestmentDataFactory.createMultipleInvestments(3, { 
    investments_computed: [{ mark: 0.75, is_non_accrual: true, quarter_year: 'Q1 2024' }]
  }),
  mixedTranches: () => [
    InvestmentDataFactory.createInvestment({ investment_tranche: 'First Lien' }),
    InvestmentDataFactory.createInvestment({ investment_tranche: 'Second Lien' }),
    InvestmentDataFactory.createInvestment({ investment_tranche: 'Equity' })
  ]
};