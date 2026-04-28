import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useState, useMemo } from "react";
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
} from "lucide-react";
import { toast } from "sonner";

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
    <Card className="border-0 shadow-sm hover:shadow-md transition-shadow duration-200">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            <p className="text-2xl font-semibold mt-1.5 tracking-tight">{displayValue}</p>
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs">Category</TableHead>
                  <TableHead className="text-xs text-right">Actual</TableHead>
                  <TableHead className="text-xs text-right">Budget</TableHead>
                  <TableHead className="text-xs text-right">Variance</TableHead>
                  <TableHead className="text-xs text-right">%</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {varianceData.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-xs">{row.period}</TableCell>
                    <TableCell className="text-xs">{row.category}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(row.actual)}</TableCell>
                    <TableCell className="text-xs text-right">{formatCurrency(row.budget)}</TableCell>
                    <TableCell className={`text-xs text-right font-medium ${row.variance >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {row.variance >= 0 ? "+" : ""}{formatCurrency(row.variance)}
                    </TableCell>
                    <TableCell className={`text-xs text-right font-medium ${row.variancePct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                      {formatPercent(row.variancePct)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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

// ─── Main Finance Page ────────────────────────────────────────────────────────
export default function Finance() {
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

  const isLoading = catsLoading || entriesLoading;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">Finance KPI</h1>
            <Badge variant="secondary" className="bg-primary/10 text-primary border-0 text-xs">
              Finance Dept.
            </Badge>
          </div>
          <p className="text-muted-foreground text-sm mt-1">
            Revenue projections, budget tracking, variance analysis & profitability metrics
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={periodType} onValueChange={(v) => setPeriodType(v as any)}>
            <SelectTrigger className="h-8 text-xs w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">Monthly</SelectItem>
              <SelectItem value="quarterly">Quarterly</SelectItem>
              <SelectItem value="annual">Annual</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowAddCategory(true)}>
            <Plus className="h-3 w-3" />
            Category
          </Button>
          <Button size="sm" className="gap-1.5 h-8 text-xs" onClick={() => setShowAddEntry(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add Entry
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border-0 shadow-sm">
                <CardContent className="p-5">
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-7 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
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
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Period</TableHead>
                        <TableHead className="text-xs">Category</TableHead>
                        <TableHead className="text-xs text-right">Actual</TableHead>
                        <TableHead className="text-xs text-right">Projected</TableHead>
                        <TableHead className="text-xs text-right">Budget</TableHead>
                        <TableHead className="text-xs w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => {
                        const cat = categories?.find((c) => c.id === entry.categoryId);
                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="text-xs">{entry.label ?? entry.period}</TableCell>
                            <TableCell className="text-xs">
                              <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                                {cat?.name ?? "—"}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(entry.actual)}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(entry.projected)}</TableCell>
                            <TableCell className="text-xs text-right">{formatCurrency(entry.budget)}</TableCell>
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
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}

      <AddEntryModal
        open={showAddEntry}
        onClose={() => setShowAddEntry(false)}
        categories={categories ?? []}
      />
      <AddCategoryModal
        open={showAddCategory}
        onClose={() => setShowAddCategory(false)}
      />
    </div>
  );
}
