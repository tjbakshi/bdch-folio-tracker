import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TrendingDown, TrendingUp, DollarSign, AlertTriangle, Download, Search, Calendar } from "lucide-react";

interface Investment {
  id: string;
  company_name: string;
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

interface PortfolioSummary {
  totalAssets: number;
  totalValue: number;
  averageMark: number;
  nonAccrualAssets: number;
}

export default function BDCDashboard() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [summary, setSummary] = useState<PortfolioSummary>({
    totalAssets: 0,
    totalValue: 0,
    averageMark: 0,
    nonAccrualAssets: 0
  });
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedManager, setSelectedManager] = useState("");
  const [selectedTranche, setSelectedTranche] = useState("");
  const [managers, setManagers] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch recent investments
      const { data, error } = await supabase.functions.invoke('bdc-api', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (error) throw error;

      const investmentData = data?.data || [];
      setInvestments(investmentData);

      // Calculate portfolio summary
      const totalAssets = investmentData.reduce((sum: number, inv: Investment) => 
        sum + (inv.principal_amount || 0), 0);
      
      const totalValue = investmentData.reduce((sum: number, inv: Investment) => 
        sum + (inv.fair_value || 0), 0);
      
      const marks = investmentData
        .map((inv: Investment) => inv.investments_computed?.[0]?.mark)
        .filter((mark: number) => mark != null);
      
      const averageMark = marks.length > 0 
        ? marks.reduce((sum: number, mark: number) => sum + mark, 0) / marks.length 
        : 0;

      const nonAccrualAssets = investmentData
        .filter((inv: Investment) => inv.investments_computed?.[0]?.is_non_accrual)
        .reduce((sum: number, inv: Investment) => sum + (inv.principal_amount || 0), 0);

      setSummary({
        totalAssets,
        totalValue,
        averageMark,
        nonAccrualAssets
      });

      // Get unique managers
      const uniqueManagers = [...new Set(investmentData.map((inv: Investment) => inv.filings?.ticker).filter(Boolean))] as string[];
      setManagers(uniqueManagers);

    } catch (error) {
      console.error('Error fetching data:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const filters = {
        company: searchTerm || undefined,
        manager: selectedManager || undefined,
        tranche: selectedTranche || undefined
      };

      const response = await supabase.functions.invoke('bdc-api', {
        method: 'POST',
        body: filters
      });

      if (response.error) throw response.error;

      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bdc-investments-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "Success",
        description: "Export downloaded successfully"
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to export data",
        variant: "destructive"
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatMark = (mark: number) => {
    return `${(mark * 100).toFixed(1)}%`;
  };

  const getMarkColor = (mark: number) => {
    if (mark >= 1.0) return "text-green-600";
    if (mark >= 0.9) return "text-yellow-600";
    return "text-red-600";
  };

  const getMarkIcon = (mark: number) => {
    if (mark >= 1.0) return <TrendingUp className="w-4 h-4 text-green-600" />;
    return <TrendingDown className="w-4 h-4 text-red-600" />;
  };

  const filteredInvestments = investments.filter(investment => {
    const matchesSearch = !searchTerm || 
      investment.company_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      investment.business_description?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesManager = !selectedManager || investment.filings?.ticker === selectedManager;
    const matchesTranche = !selectedTranche || investment.investment_tranche?.includes(selectedTranche);
    
    return matchesSearch && matchesManager && matchesTranche;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
          <p>Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">BDC Investment Dashboard</h1>
          <p className="text-muted-foreground">Portfolio analytics and holdings overview</p>
        </div>
        <div className="flex items-center space-x-2">
          <Button onClick={handleExport} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Data
          </Button>
          <Button variant="outline">
            <Calendar className="w-4 h-4 mr-2" />
            Q4 2024
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Assets</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalAssets)}</div>
            <p className="text-xs text-muted-foreground">
              Principal amount across all positions
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(summary.totalValue)}</div>
            <p className="text-xs text-muted-foreground">
              Fair value of all holdings
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Mark</CardTitle>
            <div className="flex items-center">
              {getMarkIcon(summary.averageMark)}
            </div>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getMarkColor(summary.averageMark)}`}>
              {formatMark(summary.averageMark)}
            </div>
            <p className="text-xs text-muted-foreground">
              Weighted average across portfolio
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Non-Accrual Assets</CardTitle>
            <AlertTriangle className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(summary.nonAccrualAssets)}</div>
            <p className="text-xs text-muted-foreground">
              Assets not accruing interest
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Search & Filter</CardTitle>
          <CardDescription>Filter investments by various criteria</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search companies or descriptions..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <Select value={selectedManager} onValueChange={setSelectedManager}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Manager" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Managers</SelectItem>
                  {managers.map((manager) => (
                    <SelectItem key={manager} value={manager}>
                      {manager}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="w-full md:w-48">
              <Select value={selectedTranche} onValueChange={setSelectedTranche}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Tranche" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Tranches</SelectItem>
                  <SelectItem value="First Lien">First Lien</SelectItem>
                  <SelectItem value="Second Lien">Second Lien</SelectItem>
                  <SelectItem value="Equity">Equity</SelectItem>
                  <SelectItem value="Subordinated">Subordinated</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Holdings Table */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Holdings</CardTitle>
          <CardDescription>
            Latest investment holdings across all BDC managers ({filteredInvestments.length} shown)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Tranche</TableHead>
                <TableHead className="text-right">Principal</TableHead>
                <TableHead className="text-right">Fair Value</TableHead>
                <TableHead className="text-right">Mark</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredInvestments.slice(0, 50).map((investment) => {
                const computed = investment.investments_computed?.[0];
                const mark = computed?.mark || 0;
                const isNonAccrual = computed?.is_non_accrual || false;

                return (
                  <TableRow key={investment.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{investment.company_name}</div>
                        <div className="text-sm text-muted-foreground truncate max-w-xs">
                          {investment.business_description}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{investment.filings?.ticker}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">{investment.investment_tranche}</span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(investment.principal_amount || 0)}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {formatCurrency(investment.fair_value || 0)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className={`flex items-center justify-end space-x-1 ${getMarkColor(mark)}`}>
                        {getMarkIcon(mark)}
                        <span className="font-mono">{formatMark(mark)}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {isNonAccrual ? (
                        <Badge variant="destructive">Non-Accrual</Badge>
                      ) : (
                        <Badge variant="default">Accruing</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {filteredInvestments.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No investments found matching your criteria
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}