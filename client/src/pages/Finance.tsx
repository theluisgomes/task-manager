import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useMemo, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  DollarSign,
  Minus,
  Percent,
  Plus,
  TrendingDown,
  TrendingUp,
  Trash2,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { getProjectAreaLabel } from "@shared/projectAreas";
import { fmtBrl } from "@shared/billing";

const CHART_COLORS = [
  "oklch(0.46 0.18 264)",
  "oklch(0.60 0.15 230)",
  "oklch(0.60 0.15 145)",
  "oklch(0.72 0.15 75)",
  "oklch(0.65 0.18 35)",
];

const PIE_COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6"];

function formatCurrency(value: number | string | null | undefined) {
  if (value == null) return "—";
  const num = typeof value === "string" ? parseFloat(value) : value;
  if (isNaN(num)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(num);
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function KpiStatCard({
  label,
  value,
  prev,
  icon: Icon,
  color,
  format = "currency",
}: {
  label: string;
  value: number | null;
  prev?: number | null;
  icon: React.ElementType;
  color: string;
  format?: "currency" | "percent" | "number";
}) {
  const change = value != null && prev != null && prev !== 0
    ? ((value - prev) / Math.abs(prev)) * 100
    : null;
  const isPositive = change != null && change >= 0;

  const displayValue =
    format === "currency" ? formatCurrency(value) :
    format === "percent" ? `${(value ?? 0).toFixed(1)}%` :
    (value ?? 0).toLocaleString();

  return (
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200 bento-card">
      <CardContent className="p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-xl font-semibold mt-1 tracking-tight">{displayValue}</p>
            {change != null && (
              <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${isPositive ? "text-emerald-600" : "text-red-600"}`}>
                {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                {formatPercent(change)} vs prior period
              </div>
            )}
          </div>
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AddEntryModal({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: Array<{ id: number; name: string; type: string }>;
}) {
  const utils = trpc.useUtils();
  const [categoryId, setCategoryId] = useState<string>("");
  const [period, setPeriod] = useState("");
  const [periodType, setPeriodType] = useState<"monthly" | "quarterly" | "annual">("monthly");
  const [actual, setActual] = useState("");
  const [projected, setProjected] = useState("");
  const [budget, setBudget] = useState("");
  const [label, setLabel] = useState("");

  const create = trpc.kpi.createEntry.useMutation({
    onSuccess: () => {
      utils.kpi.entries.invalidate();
      toast.success("KPI entry added");
      setCategoryId(""); setPeriod(""); setActual(""); setProjected(""); setBudget(""); setLabel("");
      onClose();
    },
    onError: () => toast.error("Failed to add entry"),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add KPI Entry</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Category *</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Period Type</Label>
              <Select value={periodType} onValueChange={(v) => setPeriodType(v as any)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="quarterly">Quarterly</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Period *</Label>
              <Input
                placeholder={periodType === "monthly" ? "2024-01" : periodType === "quarterly" ? "2024-Q1" : "2024"}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Label</Label>
              <Input placeholder="e.g. Jan 2024" value={label} onChange={(e) => setLabel(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Actual ($)</Label>
              <Input type="number" placeholder="0" value={actual} onChange={(e) => setActual(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Projected ($)</Label>
              <Input type="number" placeholder="0" value={projected} onChange={(e) => setProjected(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Budget ($)</Label>
              <Input type="number" placeholder="0" value={budget} onChange={(e) => setBudget(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate({
              categoryId: parseInt(categoryId),
              period,
              periodType,
              actual: actual ? parseFloat(actual) : undefined,
              projected: projected ? parseFloat(projected) : undefined,
              budget: budget ? parseFloat(budget) : undefined,
              label: label || undefined,
            })}
            disabled={!categoryId || !period || create.isPending}
          >
            {create.isPending ? "Adding..." : "Add Entry"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddCategoryModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [type, setType] = useState<"revenue" | "budget" | "variance" | "profitability">("revenue");
  const [description, setDescription] = useState("");

  const create = trpc.kpi.createCategory.useMutation({
    onSuccess: () => {
      utils.kpi.categories.invalidate();
      toast.success("Category created");
      setName(""); setDescription("");
      onClose();
    },
    onError: () => toast.error("Failed to create category"),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New KPI Category</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input placeholder="e.g. Product Revenue" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as any)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="revenue">Revenue</SelectItem>
                <SelectItem value="budget">Budget</SelectItem>
                <SelectItem value="variance">Variance</SelectItem>
                <SelectItem value="profitability">Profitability</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Description</Label>
            <Input placeholder="Optional description" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => create.mutate({ name, type, description: description || undefined })}
            disabled={!name.trim() || create.isPending}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Revenue Tab ──────────────────────────────────────────────────────────────
function RevenueTab({ entries, categories }: { entries: any[]; categories: any[] }) {
  const revenueCategories = categories.filter((c) => c.type === "revenue");
  const revenueEntries = entries.filter((e) =>
    revenueCategories.some((c) => c.id === e.categoryId)
  );

  const chartData = useMemo(() => {
    const byPeriod: Record<string, { period: string; actual: number; projected: number; budget: number }> = {};
    revenueEntries.forEach((e) => {
      if (!byPeriod[e.period]) {
        byPeriod[e.period] = { period: e.label ?? e.period, actual: 0, projected: 0, budget: 0 };
      }
      byPeriod[e.period].actual += parseFloat(String(e.actual ?? 0));
      byPeriod[e.period].projected += parseFloat(String(e.projected ?? 0));
      byPeriod[e.period].budget += parseFloat(String(e.budget ?? 0));
    });
    return Object.values(byPeriod).sort((a, b) => a.period.localeCompare(b.period));
  }, [revenueEntries]);

    const totalActual = revenueEntries.reduce((a, e) => a + parseFloat(String(e.actual ?? 0)), 0);
    const totalProjected = revenueEntries.reduce((a, e) => a + parseFloat(String(e.projected ?? 0)), 0);
    const totalBudget = revenueEntries.reduce((a, e) => a + parseFloat(String(e.budget ?? 0)), 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <KpiStatCard label="Actual Revenue" value={totalActual} icon={DollarSign} color="bg-primary/10 text-primary" />
        <KpiStatCard label="Projected Revenue" value={totalProjected} icon={TrendingUp} color="bg-blue-50 text-blue-600" />
        <KpiStatCard label="Budget" value={totalBudget} icon={BarChart3} color="bg-amber-50 text-amber-600" />
      </div>

      {chartData.length > 0 ? (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Revenue Projection vs Actual</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="projGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 240)" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: "8px", border: "1px solid oklch(0.91 0.005 240)", fontSize: "12px" }} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Area type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2} fill="url(#actualGrad)" name="Actual" />
                <Area type="monotone" dataKey="projected" stroke="#3b82f6" strokeWidth={2} strokeDasharray="5 5" fill="url(#projGrad)" name="Projected" />
                <Line type="monotone" dataKey="budget" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="3 3" dot={false} name="Budget" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <EmptyChartState message="Add revenue entries to see projections" />
      )}
    </div>
  );
}

// ─── Budget Tab ───────────────────────────────────────────────────────────────
function BudgetTab({ entries, categories }: { entries: any[]; categories: any[] }) {
  const budgetCategories = categories.filter((c) => c.type === "budget");
  const budgetEntries = entries.filter((e) =>
    budgetCategories.some((c) => c.id === e.categoryId)
  );

  const chartData = useMemo(() => {
    const byCat: Record<string, { name: string; actual: number; budget: number }> = {};
    budgetEntries.forEach((e) => {
      const cat = categories.find((c) => c.id === e.categoryId);
      const key = cat?.name ?? "Unknown";
      if (!byCat[key]) byCat[key] = { name: key, actual: 0, budget: 0 };
      byCat[key].actual += parseFloat(String(e.actual ?? 0));
      byCat[key].budget += parseFloat(String(e.budget ?? 0));
    });
    return Object.values(byCat);
  }, [budgetEntries, categories]);

    const totalActual = budgetEntries.reduce((a, e) => a + parseFloat(String(e.actual ?? 0)), 0);
    const totalBudget = budgetEntries.reduce((a, e) => a + parseFloat(String(e.budget ?? 0)), 0);
  const utilization = totalBudget > 0 ? (totalActual / totalBudget) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <KpiStatCard label="Actual Spend" value={totalActual} icon={DollarSign} color="bg-primary/10 text-primary" />
        <KpiStatCard label="Total Budget" value={totalBudget} icon={BarChart3} color="bg-blue-50 text-blue-600" />
        <KpiStatCard label="Utilization" value={utilization} icon={Percent} color="bg-amber-50 text-amber-600" format="percent" />
      </div>

      {chartData.length > 0 ? (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Budget vs Actual Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 240)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: "8px", border: "1px solid oklch(0.91 0.005 240)", fontSize: "12px" }} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="budget" fill="#e0e7ff" name="Budget" radius={[4, 4, 0, 0]} />
                <Bar dataKey="actual" fill="#6366f1" name="Actual" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <EmptyChartState message="Add budget entries to see spending analysis" />
      )}
    </div>
  );
}

// ─── Variance Tab ─────────────────────────────────────────────────────────────
function VarianceTab({ entries, categories }: { entries: any[]; categories: any[] }) {
  const varianceData = useMemo(() => {
    return entries
      .filter((e) => e.actual != null && e.budget != null)
      .map((e) => {
        const cat = categories.find((c) => c.id === e.categoryId);
        const actualNum = parseFloat(String(e.actual ?? 0));
        const budgetNum = parseFloat(String(e.budget ?? 0));
        const variance = actualNum - budgetNum;
        const variancePct = budgetNum !== 0 ? (variance / Math.abs(budgetNum)) * 100 : 0;
        return {
          period: e.label ?? e.period,
          category: cat?.name ?? "Unknown",
          actual: actualNum,
          budget: budgetNum,
          variance,
          variancePct,
        };
      })
      .sort((a, b) => a.period.localeCompare(b.period));
  }, [entries, categories]);

  const chartData = varianceData.slice(-12);

  return (
    <div className="space-y-6">
      {chartData.length > 0 ? (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Variance Analysis (Actual vs Budget)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 240)" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: "8px", border: "1px solid oklch(0.91 0.005 240)", fontSize: "12px" }} />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="actual" fill="#6366f1" name="Actual" radius={[4, 4, 0, 0]} />
                <Bar dataKey="budget" fill="#e0e7ff" name="Budget" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <EmptyChartState message="Add entries with both actual and budget values to see variance" />
      )}

      {varianceData.length > 0 && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Variance Detail</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[420px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-card">
                <TableRow className="h-9 hover:bg-transparent">
                  <TableHead className="text-sm">Period</TableHead>
                  <TableHead className="text-sm">Category</TableHead>
                  <TableHead className="text-sm text-right">Actual</TableHead>
                  <TableHead className="text-sm text-right">Budget</TableHead>
                  <TableHead className="text-sm text-right">Variance</TableHead>
                  <TableHead className="text-sm text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {varianceData.map((row, i) => (
                  <TableRow key={i} className="h-9">
                    <TableCell className="text-sm">{row.period}</TableCell>
                    <TableCell className="text-sm">{row.category}</TableCell>
                    <TableCell className="text-sm text-right">{formatCurrency(row.actual)}</TableCell>
                    <TableCell className="text-sm text-right">{formatCurrency(row.budget)}</TableCell>
                    <TableCell className={`text-sm text-right font-medium ${row.variance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {row.variance >= 0 ? "+" : ""}{formatCurrency(row.variance)}
                    </TableCell>
                    <TableCell className={`text-sm text-right font-medium ${row.variancePct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {formatPercent(row.variancePct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── Profitability Tab ────────────────────────────────────────────────────────
function ProfitabilityTab({ entries, categories }: { entries: any[]; categories: any[] }) {
  const profitCategories = categories.filter((c) => c.type === "profitability");
  const profitEntries = entries.filter((e) =>
    profitCategories.some((c) => c.id === e.categoryId)
  );

  const pieData = useMemo(() => {
    const byCat: Record<string, number> = {};
    profitEntries.forEach((e) => {
      const cat = categories.find((c) => c.id === e.categoryId);
      const key = cat?.name ?? "Unknown";
      byCat[key] = (byCat[key] ?? 0) + parseFloat(String(e.actual ?? 0));
    });
    return Object.entries(byCat).map(([name, value]) => ({ name, value }));
  }, [profitEntries, categories]);

  const lineData = useMemo(() => {
    const byPeriod: Record<string, any> = {};
    profitEntries.forEach((e) => {
      const cat = categories.find((c) => c.id === e.categoryId);
      if (!byPeriod[e.period]) byPeriod[e.period] = { period: e.label ?? e.period };
      byPeriod[e.period][cat?.name ?? "Unknown"] = parseFloat(String(e.actual ?? 0));
    });
    return Object.values(byPeriod).sort((a, b) => a.period.localeCompare(b.period));
  }, [profitEntries, categories]);

  const totalProfit = profitEntries.reduce((a, e) => a + parseFloat(String(e.actual ?? 0)), 0);
  const totalRevenue = entries
    .filter((e) => categories.find((c) => c.id === e.categoryId)?.type === "revenue")
    .reduce((a, e) => a + parseFloat(String(e.actual ?? 0)), 0);
  const margin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <KpiStatCard label="Total Profit" value={totalProfit} icon={TrendingUp} color="bg-emerald-50 text-emerald-600" />
        <KpiStatCard label="Revenue Base" value={totalRevenue} icon={DollarSign} color="bg-primary/10 text-primary" />
        <KpiStatCard label="Profit Margin" value={margin} icon={Percent} color="bg-blue-50 text-blue-600" format="percent" />
      </div>

      <div className="grid grid-cols-2 gap-6">
        {pieData.length > 0 ? (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Profit Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: "8px", border: "1px solid oklch(0.91 0.005 240)", fontSize: "12px" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : (
          <EmptyChartState message="Add profitability entries to see distribution" />
        )}

        {lineData.length > 0 && profitCategories.length > 0 ? (
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Profitability Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <LineChart data={lineData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.91 0.005 240)" vertical={false} />
                  <XAxis dataKey="period" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: "8px", border: "1px solid oklch(0.91 0.005 240)", fontSize: "12px" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  {profitCategories.map((cat, i) => (
                    <Line
                      key={cat.id}
                      type="monotone"
                      dataKey={cat.name}
                      stroke={PIE_COLORS[i % PIE_COLORS.length]}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <Card className="border-0 shadow-sm border-dashed border-2 border-border">
      <CardContent className="p-10 flex flex-col items-center text-center gap-3">
        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{message}</p>
      </CardContent>
    </Card>
  );
}

function OperationalSummaryTab() {
  const { data, isLoading } = trpc.finance.summary.useQuery();
  if (isLoading) return <Skeleton className="h-48" />;
  const t = data?.totals;
  if (!t) return null;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiStatCard label="Receita orçada" value={t.budgetedRevenue} icon={DollarSign} color="bg-primary/10 text-primary" />
        <KpiStatCard label="Receita real" value={t.actualRevenue} icon={TrendingUp} color="bg-emerald-50 text-emerald-600" />
        <KpiStatCard label="Custo orçado" value={t.budgetedCost} icon={BarChart3} color="bg-amber-50 text-amber-600" />
        <KpiStatCard label="Custo real" value={t.actualCost} icon={Minus} color="bg-orange-50 text-orange-600" />
        <KpiStatCard label="Lucro orçado" value={t.budgetedProfit} icon={Percent} color="bg-blue-50 text-blue-600" />
        <KpiStatCard label="Lucro real" value={t.actualProfit} icon={TrendingUp} color="bg-violet-50 text-violet-600" />
      </div>
    </div>
  );
}

function parseBrlInput(value: string): number {
  const cleaned = value.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isNaN(n) ? 0 : n;
}

function EditableMoneyCell({
  value,
  onSave,
  disabled,
}: {
  value: number;
  onSave: (value: number) => void;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const startEditing = () => {
    if (disabled) return;
    setDraft(value.toFixed(2).replace(".", ","));
    setEditing(true);
  };

  const commit = () => {
    const parsed = parseBrlInput(draft);
    setEditing(false);
    if (parsed !== value) onSave(parsed);
  };

  if (editing) {
    return (
      <Input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setEditing(false);
        }}
        className="h-8 w-28 text-sm tabular-nums"
        autoFocus
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className="text-sm tabular-nums rounded px-1.5 py-0.5 -mx-1.5 hover:bg-muted/60 transition-colors text-left disabled:cursor-default disabled:hover:bg-transparent"
      title="Clique para editar"
    >
      {fmtBrl(value)}
    </button>
  );
}

function ProjectsFinanceTab() {
  const { data, isLoading } = trpc.finance.summary.useQuery();
  const utils = trpc.useUtils();
  const updateFinance = trpc.finance.updateProjectFinance.useMutation({
    onSuccess: () => {
      utils.finance.summary.invalidate();
      toast.success("Valores atualizados");
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) return <Skeleton className="h-48" />;

  const saveField = (projectId: number, field: "budgetedRevenue" | "actualRevenue" | "actualCost", value: number) => {
    updateFinance.mutate({ projectId, [field]: value });
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead><TableHead>Area</TableHead>
          <TableHead>Rec. orçada</TableHead><TableHead>Rec. real</TableHead>
          <TableHead>Custo real</TableHead><TableHead>Lucro real</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.projects.map((p) => (
          <TableRow key={p.projectId}>
            <TableCell className="font-medium text-sm">{p.projectName}</TableCell>
            <TableCell className="text-sm">{getProjectAreaLabel(p.area as any)}</TableCell>
            <TableCell>
              <EditableMoneyCell
                value={p.budgetedRevenue}
                onSave={(v) => saveField(p.projectId, "budgetedRevenue", v)}
                disabled={updateFinance.isPending}
              />
            </TableCell>
            <TableCell>
              <EditableMoneyCell
                value={p.actualRevenue}
                onSave={(v) => saveField(p.projectId, "actualRevenue", v)}
                disabled={updateFinance.isPending}
              />
            </TableCell>
            <TableCell>
              <EditableMoneyCell
                value={p.actualCost}
                onSave={(v) => saveField(p.projectId, "actualCost", v)}
                disabled={updateFinance.isPending}
              />
            </TableCell>
            <TableCell className="text-sm tabular-nums font-medium">
              {fmtBrl(p.actualProfit)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ContractPlTab() {
  const { data, isLoading } = trpc.finance.contractPl.useQuery();
  const sendReminders = trpc.finance.sendPaymentReminders.useMutation({
    onSuccess: (r) => toast.success(`Lembretes: ${r.sent} enviados, ${r.skipped} ignorados → ${r.to}`),
    onError: (e) => toast.error(e.message),
  });
  if (isLoading) return <Skeleton className="h-48" />;
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" className="text-xs" disabled={sendReminders.isPending}
          onClick={() => sendReminders.mutate()}>
          Enviar e-mails de vencimento
        </Button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Contrato</TableHead>
            <TableHead>Projeto</TableHead>
            <TableHead>Receita orçada</TableHead>
            <TableHead>Receita real</TableHead>
            <TableHead>Custo orçado</TableHead>
            <TableHead>Custo real</TableHead>
            <TableHead>Lucro orçado</TableHead>
            <TableHead>Lucro real</TableHead>
            <TableHead>Recebido</TableHead>
            <TableHead>Pendente</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data?.contracts ?? []).map((c) => (
            <TableRow key={c.id}>
              <TableCell className="text-sm font-medium">{c.title}<div className="text-xs text-muted-foreground">{c.clientName}</div></TableCell>
              <TableCell className="text-sm">{c.projectName ?? "—"}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.budgetedRevenue)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.actualRevenue)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.budgetedCost)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.actualCost)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.budgetedProfit)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.actualProfit)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.received)}</TableCell>
              <TableCell className="text-sm">{fmtBrl(c.pending)}</TableCell>
            </TableRow>
          ))}
          {!data?.contracts?.length && (
            <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhum contrato</TableCell></TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function TeamUtilizationTab() {
  const { data, isLoading } = trpc.finance.teamUtilization.useQuery();
  if (isLoading) return <Skeleton className="h-48" />;
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead><TableHead>Project</TableHead>
          <TableHead>Available h</TableHead><TableHead>Worked h</TableHead><TableHead>Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map((row, i) => (
          <TableRow key={i}>
            <TableCell className="text-sm">{row.userName ?? "—"}</TableCell>
            <TableCell className="text-sm">{row.projectName ?? "—"}</TableCell>
            <TableCell className="text-sm">{row.availableHours}</TableCell>
            <TableCell className="text-sm">{row.workedHours}</TableCell>
            <TableCell className="text-sm">{row.hourlyRate ? fmtBrl(row.hourlyRate) : "—"}</TableCell>
          </TableRow>
        ))}
        {!data?.length && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No allocations configured</TableCell></TableRow>}
      </TableBody>
    </Table>
  );
}

// ─── Main Finance Page ────────────────────────────────────────────────────────
export default function Finance() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [mainTab, setMainTab] = useState(isAdmin ? "operational" : "utilization");
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [activeTab, setActiveTab] = useState("revenue");
  const [periodType, setPeriodType] = useState<"monthly" | "quarterly" | "annual">("monthly");

  const { data: categories, isLoading: catsLoading } = trpc.kpi.categories.useQuery();
  const { data: entries, isLoading: entriesLoading } = trpc.kpi.entries.useQuery({ periodType });
  const utils = trpc.useUtils();

  const deleteEntry = trpc.kpi.deleteEntry.useMutation({
    onSuccess: () => { utils.kpi.entries.invalidate(); toast.success("Entry deleted"); },
  });

  const handleExport = async () => {
    const csv = await utils.client.kpi.exportCsv.query();
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kpi-export-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("KPI data exported");
  };

  const isLoading = catsLoading || entriesLoading;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Finance</h1>
            {isAdmin && (
              <Badge variant="secondary" className="bg-primary/10 text-primary border-0 text-xs">Admin</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Receitas, custos, lucro por projeto e utilização da equipe
          </p>
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          {isAdmin && <TabsTrigger value="operational">Resumo</TabsTrigger>}
          {isAdmin && <TabsTrigger value="projects">Por projeto</TabsTrigger>}
          {isAdmin && <TabsTrigger value="contracts">Contratos P&L</TabsTrigger>}
          <TabsTrigger value="utilization">Utilização equipe</TabsTrigger>
          {isAdmin && <TabsTrigger value="kpi">Histórico KPI</TabsTrigger>}
        </TabsList>

        {isAdmin && (
          <TabsContent value="operational" className="mt-4"><OperationalSummaryTab /></TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="projects" className="mt-4"><ProjectsFinanceTab /></TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="contracts" className="mt-4"><ContractPlTab /></TabsContent>
        )}
        <TabsContent value="utilization" className="mt-4"><TeamUtilizationTab /></TabsContent>
        {isAdmin && (
          <TabsContent value="kpi" className="mt-4">
            <LegacyKpiSection
              showAddEntry={showAddEntry}
              setShowAddEntry={setShowAddEntry}
              showAddCategory={showAddCategory}
              setShowAddCategory={setShowAddCategory}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
              periodType={periodType}
              setPeriodType={setPeriodType}
              categories={categories}
              entries={entries}
              isLoading={isLoading}
              deleteEntry={deleteEntry}
              handleExport={handleExport}
            />
          </TabsContent>
        )}
      </Tabs>

      <AddEntryModal open={showAddEntry} onClose={() => setShowAddEntry(false)} categories={categories ?? []} />
      <AddCategoryModal open={showAddCategory} onClose={() => setShowAddCategory(false)} />
    </div>
  );
}

function LegacyKpiSection({
  showAddEntry, setShowAddEntry, showAddCategory, setShowAddCategory,
  activeTab, setActiveTab, periodType, setPeriodType,
  categories, entries, isLoading, deleteEntry, handleExport,
}: {
  showAddEntry: boolean;
  setShowAddEntry: (v: boolean) => void;
  showAddCategory: boolean;
  setShowAddCategory: (v: boolean) => void;
  activeTab: string;
  setActiveTab: (v: string) => void;
  periodType: "monthly" | "quarterly" | "annual";
  setPeriodType: (v: "monthly" | "quarterly" | "annual") => void;
  categories: any[] | undefined;
  entries: any[] | undefined;
  isLoading: boolean;
  deleteEntry: { mutate: (input: { id: number }) => void };
  handleExport: () => void;
}) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end gap-2">
        <Select value={periodType} onValueChange={(v) => setPeriodType(v as any)}>
          <SelectTrigger className="h-8 text-xs w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="quarterly">Quarterly</SelectItem>
            <SelectItem value="annual">Annual</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={handleExport}><Download className="h-4 w-4 mr-1" />Export</Button>
        <Button variant="outline" size="sm" onClick={() => setShowAddCategory(true)}><Plus className="h-3 w-3 mr-1" />Category</Button>
        <Button size="sm" onClick={() => setShowAddEntry(true)}><Plus className="h-3.5 w-3.5 mr-1" />Add Entry</Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-64" />
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="h-9 bg-muted/50">
            <TabsTrigger value="revenue" className="text-xs">Revenue</TabsTrigger>
            <TabsTrigger value="budget" className="text-xs">Budget</TabsTrigger>
            <TabsTrigger value="variance" className="text-xs">Variance</TabsTrigger>
            <TabsTrigger value="profitability" className="text-xs">Profitability</TabsTrigger>
            <TabsTrigger value="data" className="text-xs">Raw Data</TabsTrigger>
          </TabsList>
          <TabsContent value="revenue" className="mt-6">
            <RevenueTab entries={entries ?? []} categories={categories ?? []} />
          </TabsContent>

          <TabsContent value="budget" className="mt-6">
            <BudgetTab entries={entries ?? []} categories={categories ?? []} />
          </TabsContent>

          <TabsContent value="variance" className="mt-6">
            <VarianceTab entries={entries ?? []} categories={categories ?? []} />
          </TabsContent>

          <TabsContent value="profitability" className="mt-6">
            <ProfitabilityTab entries={entries ?? []} categories={categories ?? []} />
          </TabsContent>

          <TabsContent value="data" className="mt-6">
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">All KPI Entries</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {!entries?.length ? (
                  <div className="p-10 text-center">
                    <p className="text-sm text-muted-foreground">No entries yet. Add your first KPI entry.</p>
                  </div>
                ) : (
                  <div className="max-h-[480px] overflow-auto">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-card">
                      <TableRow className="h-9 hover:bg-transparent">
                        <TableHead className="text-sm">Period</TableHead>
                        <TableHead className="text-sm">Category</TableHead>
                        <TableHead className="text-sm text-right">Actual</TableHead>
                        <TableHead className="text-sm text-right">Projected</TableHead>
                        <TableHead className="text-sm text-right">Budget</TableHead>
                        <TableHead className="text-sm w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => {
                        const cat = categories?.find((c) => c.id === entry.categoryId);
                        return (
                          <TableRow key={entry.id} className="h-9">
                            <TableCell className="text-sm">{entry.label ?? entry.period}</TableCell>
                            <TableCell className="text-sm">
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                {cat?.name ?? "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-right">{formatCurrency(entry.actual)}</TableCell>
                            <TableCell className="text-sm text-right">{formatCurrency(entry.projected)}</TableCell>
                            <TableCell className="text-sm text-right">{formatCurrency(entry.budget)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                onClick={() => deleteEntry.mutate({ id: entry.id })}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
