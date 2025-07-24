import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Play, Database, Calendar, Activity } from "lucide-react";

interface BDC {
  ticker: string;
  company_name: string;
  cik: string | null;
  is_active: boolean;
  fiscal_year_end: string | null;
  created_at: string;
}

interface ProcessingLog {
  id: string;
  log_level: string;
  message: string;
  created_at: string;
  details: any;
}

interface ScheduledJob {
  id: string;
  ticker: string;
  job_type: string;
  status: string;
  next_run_at: string | null;
  last_run_at: string | null;
  error_message: string | null;
}

export default function BDCAdmin() {
  const [bdcs, setBDCs] = useState<BDC[]>([]);
  const [logs, setLogs] = useState<ProcessingLog[]>([]);
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [bdcResult, logsResult, jobsResult] = await Promise.all([
        supabase.from("bdc_universe").select("*").order("ticker"),
        supabase.from("processing_logs").select("*").order("created_at", { ascending: false }).limit(10),
        supabase.from("scheduled_jobs").select("*").order("next_run_at")
      ]);

      if (bdcResult.data) setBDCs(bdcResult.data);
      if (logsResult.data) setLogs(logsResult.data);
      if (jobsResult.data) setJobs(jobsResult.data);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const triggerBackfill = async (ticker?: string) => {
    const action = ticker ? "backfill_ticker" : "backfill_all";
    setProcessing(action);

    try {
      const { data, error } = await supabase.functions.invoke("sec-extractor", {
        body: { 
          action,
          ...(ticker && { ticker, yearsBack: 3 })
        }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: ticker 
          ? `Started backfill for ${ticker}` 
          : "Started backfill for all BDCs"
      });

      setTimeout(fetchData, 2000);
    } catch (error) {
      toast({
        title: "Error", 
        description: `Failed to trigger backfill: ${error}`,
        variant: "destructive"
      });
    } finally {
      setProcessing(null);
    }
  };

  const setupScheduledJobs = async () => {
    setProcessing("setup_jobs");

    try {
      const { error } = await supabase.functions.invoke("sec-extractor", {
        body: { action: "setup_scheduled_jobs" }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Scheduled jobs setup complete"
      });

      setTimeout(fetchData, 2000);
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to setup jobs: ${error}`,
        variant: "destructive"
      });
    } finally {
      setProcessing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">BDC Admin Dashboard</h1>
          <p className="text-muted-foreground">Manage BDC data extraction and processing</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => triggerBackfill()}
            disabled={!!processing}
            variant="default"
          >
            {processing === "backfill_all" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Database className="h-4 w-4 mr-2" />
            )}
            Backfill All BDCs
          </Button>
          <Button 
            onClick={setupScheduledJobs}
            disabled={!!processing}
            variant="outline"
          >
            {processing === "setup_jobs" ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Calendar className="h-4 w-4 mr-2" />
            )}
            Setup Scheduled Jobs
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total BDCs</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{bdcs.length}</div>
            <p className="text-xs text-muted-foreground">
              {bdcs.filter(b => b.is_active).length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Scheduled Jobs</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{jobs.length}</div>
            <p className="text-xs text-muted-foreground">
              {jobs.filter(j => j.status === 'pending').length} pending
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Recent Logs</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{logs.length}</div>
            <p className="text-xs text-muted-foreground">
              {logs.filter(l => l.log_level === 'error').length} errors
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>BDC Universe</CardTitle>
          <CardDescription>Manage Business Development Companies</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Company Name</TableHead>
                <TableHead>CIK</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Fiscal Year End</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {bdcs.map((bdc) => (
                <TableRow key={bdc.ticker}>
                  <TableCell className="font-medium">{bdc.ticker}</TableCell>
                  <TableCell>{bdc.company_name}</TableCell>
                  <TableCell>{bdc.cik || "N/A"}</TableCell>
                  <TableCell>
                    <Badge variant={bdc.is_active ? "default" : "secondary"}>
                      {bdc.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell>{bdc.fiscal_year_end || "N/A"}</TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => triggerBackfill(bdc.ticker)}
                      disabled={!!processing}
                    >
                      {processing === "backfill_ticker" ? (
                        <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                      ) : (
                        <Play className="h-3 w-3 mr-1" />
                      )}
                      Backfill
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scheduled Jobs</CardTitle>
            <CardDescription>Automated filing checks</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ticker</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Run</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.slice(0, 5).map((job) => (
                  <TableRow key={job.id}>
                    <TableCell>{job.ticker}</TableCell>
                    <TableCell>{job.job_type}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          job.status === 'completed' ? 'default' :
                          job.status === 'failed' ? 'destructive' :
                          job.status === 'running' ? 'secondary' : 'outline'
                        }
                      >
                        {job.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {job.next_run_at ? new Date(job.next_run_at).toLocaleDateString() : "N/A"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Processing Logs</CardTitle>
            <CardDescription>Recent system activity</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {logs.slice(0, 5).map((log) => (
                <div key={log.id} className="flex items-start space-x-2 text-sm">
                  <Badge 
                    variant={
                      log.log_level === 'error' ? 'destructive' :
                      log.log_level === 'warning' ? 'secondary' : 'default'
                    }
                    className="mt-0.5"
                  >
                    {log.log_level}
                  </Badge>
                  <div className="flex-1">
                    <p>{log.message}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}