import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Download, TrendingUp, TrendingDown, Filter, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BDCDashboard = () => {
  // Mock data for demonstration
  const portfolioSummary = {
    totalAssets: 247,
    totalValue: 2850000000,
    avgMark: 0.87,
    nonAccrualCount: 12
  };

  const recentHoldings = [
    {
      company: "Acme Industries LLC",
      manager: "Ares Capital Corp",
      tranche: "First Lien",
      principal: 45000000,
      fairValue: 39150000,
      mark: 0.87,
      quarter: "Q3 2024",
      nonAccrual: false
    },
    {
      company: "Beta Corp",
      manager: "Blackstone Secured Lending",
      tranche: "Second Lien",
      principal: 25000000,
      fairValue: 18750000,
      mark: 0.75,
      quarter: "Q3 2024",
      nonAccrual: true
    },
    {
      company: "Gamma Tech Solutions",
      manager: "Blue Owl Capital",
      tranche: "Equity",
      principal: 15000000,
      fairValue: 18000000,
      mark: 1.20,
      quarter: "Q3 2024",
      nonAccrual: false
    }
  ];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatMark = (mark: number) => {
    return (mark * 100).toFixed(1) + '%';
  };

  const getMarkColor = (mark: number) => {
    if (mark >= 1.0) return 'text-success';
    if (mark >= 0.9) return 'text-foreground';
    if (mark >= 0.8) return 'text-warning';
    return 'text-destructive';
  };

  const getMarkIcon = (mark: number) => {
    return mark >= 1.0 ? TrendingUp : TrendingDown;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">BDC Portfolio Analytics</h1>
              <p className="text-muted-foreground">Track and analyze Business Development Company investments</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm">
                <Calendar className="h-4 w-4 mr-2" />
                Q3 2024
              </Button>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-6 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{portfolioSummary.totalAssets}</div>
              <p className="text-xs text-muted-foreground mt-1">Across all BDCs</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(portfolioSummary.totalValue)}</div>
              <p className="text-xs text-muted-foreground mt-1">Fair value across portfolio</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Average Mark</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${getMarkColor(portfolioSummary.avgMark)}`}>
                {formatMark(portfolioSummary.avgMark)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Portfolio-wide average</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">Non-Accrual Assets</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{portfolioSummary.nonAccrualCount}</div>
              <p className="text-xs text-muted-foreground mt-1">Requiring attention</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Search & Filter Portfolio</CardTitle>
            <CardDescription>Find specific investments and apply filters</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search by company name, description, or manager..." 
                    className="pl-10"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Select>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="BDC Manager" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ares">Ares Capital Corp</SelectItem>
                    <SelectItem value="blackstone">Blackstone Secured Lending</SelectItem>
                    <SelectItem value="blueowl">Blue Owl Capital</SelectItem>
                  </SelectContent>
                </Select>
                
                <Select>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="Tranche" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">First Lien</SelectItem>
                    <SelectItem value="second">Second Lien</SelectItem>
                    <SelectItem value="equity">Equity</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button variant="outline" size="icon">
                  <Filter className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Portfolio Holdings Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Holdings</CardTitle>
            <CardDescription>Latest portfolio positions and marks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Company</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Manager</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Tranche</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Principal</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Fair Value</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Mark</th>
                    <th className="text-center py-3 px-4 font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentHoldings.map((holding, index) => {
                    const MarkIcon = getMarkIcon(holding.mark);
                    return (
                      <tr key={index} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="py-4 px-4">
                          <div className="font-medium">{holding.company}</div>
                          <div className="text-xs text-muted-foreground">{holding.quarter}</div>
                        </td>
                        <td className="py-4 px-4 text-sm">{holding.manager}</td>
                        <td className="py-4 px-4">
                          <Badge variant="outline" className="text-xs">{holding.tranche}</Badge>
                        </td>
                        <td className="py-4 px-4 text-right font-mono">
                          {formatCurrency(holding.principal)}
                        </td>
                        <td className="py-4 px-4 text-right font-mono">
                          {formatCurrency(holding.fairValue)}
                        </td>
                        <td className="py-4 px-4 text-right">
                          <div className={`flex items-center justify-end gap-1 ${getMarkColor(holding.mark)}`}>
                            <MarkIcon className="h-3 w-3" />
                            <span className="font-mono">{formatMark(holding.mark)}</span>
                          </div>
                        </td>
                        <td className="py-4 px-4 text-center">
                          {holding.nonAccrual ? (
                            <Badge variant="destructive" className="text-xs">Non-Accrual</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Performing</Badge>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default BDCDashboard;