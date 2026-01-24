import React, { useState, useEffect } from "react";
import { format } from "date-fns";
import {
  ArrowRight,
  Check,
  X,
  Play,
  RefreshCw,
  Package,
  AlertCircle,
  TrendingUp,
  Scale,
} from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";

import {
  fetchRebalancingSuggestions,
  generateRebalancingSuggestions,
  updateRebalancingStatus,
  executeRebalancingSuggestion,
  type RebalancingSuggestionDetail,
  type RebalancingSuggestionItem,
} from "@/services/warehouseService";

type SuggestionStatus = "pending" | "approved" | "executed" | "rejected";

const reasonIcons: Record<string, React.ReactNode> = {
  shortage_prevention: <AlertCircle className="h-4 w-4 text-red-400" />,
  surplus_redistribution: <TrendingUp className="h-4 w-4 text-amber-400" />,
  capacity_optimization: <Scale className="h-4 w-4 text-cyan-400" />,
};

const reasonLabels: Record<string, string> = {
  shortage_prevention: "Shortage Prevention",
  surplus_redistribution: "Surplus Redistribution",
  capacity_optimization: "Capacity Optimization",
};

const priorityColors: Record<string, string> = {
  high: "bg-red-600",
  medium: "bg-amber-600",
  low: "bg-green-600",
};

export default function RebalancingSuggestions() {
  const [suggestions, setSuggestions] = useState<RebalancingSuggestionDetail[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<SuggestionStatus>("pending");

  useEffect(() => {
    loadSuggestions();
  }, []);

  async function loadSuggestions() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchRebalancingSuggestions();
      setSuggestions(data);
    } catch (err) {
      setError("Failed to load rebalancing suggestions");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      await generateRebalancingSuggestions();
      await loadSuggestions();
    } catch (err) {
      setError("Failed to generate suggestions");
    } finally {
      setGenerating(false);
    }
  }

  async function handleApprove(id: number) {
    setActionLoading(id);
    try {
      await updateRebalancingStatus(id, "approved");
      await loadSuggestions();
    } catch (err) {
      setError("Failed to approve suggestion");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(id: number) {
    setActionLoading(id);
    try {
      await updateRebalancingStatus(id, "rejected");
      await loadSuggestions();
    } catch (err) {
      setError("Failed to reject suggestion");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleExecute(id: number) {
    setActionLoading(id);
    try {
      await executeRebalancingSuggestion(id);
      await loadSuggestions();
    } catch (err) {
      setError("Failed to execute suggestion");
    } finally {
      setActionLoading(null);
    }
  }

  const filteredSuggestions = suggestions.filter((s) => s.status === activeTab);
  const pendingCount = suggestions.filter((s) => s.status === "pending").length;
  const approvedNotExecuted = suggestions.filter(
    (s) => s.status === "approved"
  ).length;

  return (
    <div className="space-y-6 p-6 bg-slate-900 min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Scale className="h-6 w-6 text-cyan-400" />
          <h2 className="text-2xl font-bold text-white">
            Rebalancing Suggestions
          </h2>
        </div>

        <Button
          onClick={handleGenerate}
          disabled={generating}
          className="bg-cyan-600 hover:bg-cyan-700"
        >
          {generating ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Generate Suggestions
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" className="bg-red-900/50 border-red-700">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Pending Review</p>
              <p className="text-3xl font-bold text-amber-400">{pendingCount}</p>
            </div>
            <AlertCircle className="h-8 w-8 text-amber-400" />
          </CardContent>
        </Card>
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-400">Approved (Not Executed)</p>
              <p className="text-3xl font-bold text-cyan-400">
                {approvedNotExecuted}
              </p>
            </div>
            <Check className="h-8 w-8 text-cyan-400" />
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as SuggestionStatus)}>
        <TabsList className="bg-slate-800 border-slate-700">
          <TabsTrigger
            value="pending"
            className="data-[state=active]:bg-slate-700 text-slate-300 data-[state=active]:text-white"
          >
            Pending ({suggestions.filter((s) => s.status === "pending").length})
          </TabsTrigger>
          <TabsTrigger
            value="approved"
            className="data-[state=active]:bg-slate-700 text-slate-300 data-[state=active]:text-white"
          >
            Approved (
            {suggestions.filter((s) => s.status === "approved").length})
          </TabsTrigger>
          <TabsTrigger
            value="executed"
            className="data-[state=active]:bg-slate-700 text-slate-300 data-[state=active]:text-white"
          >
            Executed (
            {suggestions.filter((s) => s.status === "executed").length})
          </TabsTrigger>
          <TabsTrigger
            value="rejected"
            className="data-[state=active]:bg-slate-700 text-slate-300 data-[state=active]:text-white"
          >
            Rejected (
            {suggestions.filter((s) => s.status === "rejected").length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-48 bg-slate-800" />
              ))}
            </div>
          ) : filteredSuggestions.length === 0 ? (
            <Card className="bg-slate-800 border-slate-700">
              <CardContent className="p-8 text-center text-slate-400">
                No {activeTab} suggestions found.
                {activeTab === "pending" &&
                  ' Click "Generate Suggestions" to analyze inventory.'}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {filteredSuggestions.map((suggestion) => (
                <SuggestionCard
                  key={suggestion.id}
                  suggestion={suggestion}
                  onApprove={() => handleApprove(suggestion.id)}
                  onReject={() => handleReject(suggestion.id)}
                  onExecute={() => handleExecute(suggestion.id)}
                  loading={actionLoading === suggestion.id}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

interface SuggestionCardProps {
  suggestion: RebalancingSuggestionDetail;
  onApprove: () => void;
  onReject: () => void;
  onExecute: () => void;
  loading: boolean;
}

function SuggestionCard({
  suggestion,
  onApprove,
  onReject,
  onExecute,
  loading,
}: SuggestionCardProps) {
  return (
    <Card className="bg-slate-800 border-slate-700">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-lg font-semibold text-white">
              <span>{suggestion.source_site_name}</span>
              <ArrowRight className="h-5 w-5 text-cyan-400" />
              <span>{suggestion.destination_site_name}</span>
            </div>
            <Badge
              className={`${
                priorityColors[suggestion.priority] || "bg-slate-600"
              } text-white`}
            >
              {suggestion.priority?.toUpperCase() || "NORMAL"}
            </Badge>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            {reasonIcons[suggestion.reason] || <Package className="h-4 w-4" />}
            <span>
              {reasonLabels[suggestion.reason] || suggestion.reason}
            </span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-slate-900 rounded-lg p-3">
          <h4 className="text-sm font-medium text-slate-400 mb-2">Items</h4>
          <div className="space-y-2">
            {suggestion.items?.map((item: RebalancingSuggestionItem, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between text-sm"
              >
                <div className="flex items-center gap-2">
                  <Package className="h-4 w-4 text-slate-500" />
                  <span className="text-white font-mono">{item.nsn}</span>
                  {item.description && (
                    <span className="text-slate-400 truncate max-w-xs">
                      - {item.description}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-slate-300">
                  <span>Qty: {item.quantity}</span>
                  {item.weight && <span>{item.weight.toLocaleString()} lbs</span>}
                </div>
              </div>
            )) || (
              <div className="text-sm text-slate-400">
                {suggestion.suggested_quantity} units of {suggestion.nsn}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-sm text-slate-400">
          <div className="flex items-center gap-4">
            <span>
              Created:{" "}
              {suggestion.created_at
                ? format(new Date(suggestion.created_at), "MMM dd, yyyy")
                : "N/A"}
            </span>
            {suggestion.expires_at && (
              <span className="text-amber-400">
                Expires:{" "}
                {format(new Date(suggestion.expires_at), "MMM dd, yyyy")}
              </span>
            )}
          </div>

          {suggestion.status === "pending" && (
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={onReject}
                disabled={loading}
                className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
              >
                <X className="h-4 w-4 mr-1" />
                Reject
              </Button>
              <Button
                size="sm"
                onClick={onApprove}
                disabled={loading}
                className="bg-green-600 hover:bg-green-700"
              >
                {loading ? (
                  <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Check className="h-4 w-4 mr-1" />
                )}
                Approve
              </Button>
            </div>
          )}

          {suggestion.status === "approved" && (
            <Button
              size="sm"
              onClick={onExecute}
              disabled={loading}
              className="bg-cyan-600 hover:bg-cyan-700"
            >
              {loading ? (
                <RefreshCw className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Execute Transfer
            </Button>
          )}

          {suggestion.status === "executed" && (
            <Badge className="bg-green-600">Completed</Badge>
          )}

          {suggestion.status === "rejected" && (
            <Badge className="bg-red-600">Rejected</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
