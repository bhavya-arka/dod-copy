import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  ListOrdered,
  Grid3X3,
  Plane,
  TrendingUp,
  ArrowRightLeft,
  Calendar,
  BarChart3,
  Settings2,
} from "lucide-react";
import type { WarehouseSite, ToastMessage } from "./types";
import PriorityQueueDashboard from "./PriorityQueueDashboard";
import NetworkInventoryMatrix from "./NetworkInventoryMatrix";
import InboundCargoFeed from "./InboundCargoFeed";
import CapacityForecast from "./CapacityForecast";
import RebalancingSuggestions from "./RebalancingSuggestions";
import TransportCalendar from "./TransportCalendar";
import SiteBenchmarks from "./SiteBenchmarks";
import ThresholdManagement from "./ThresholdManagement";

interface WMSInterSiteProps {
  sites: WarehouseSite[];
  onShowToast: (message: string, type?: ToastMessage["type"]) => void;
}

type InterSiteTab =
  | "priority-queue"
  | "network-inventory"
  | "inbound"
  | "capacity"
  | "rebalancing"
  | "transport-calendar"
  | "benchmarks"
  | "thresholds";

const interSiteTabs: { id: InterSiteTab; label: string; icon: React.ReactNode }[] = [
  { id: "priority-queue", label: "Priority Queue", icon: <ListOrdered className="w-4 h-4" /> },
  { id: "network-inventory", label: "Network Inventory", icon: <Grid3X3 className="w-4 h-4" /> },
  { id: "inbound", label: "Inbound", icon: <Plane className="w-4 h-4" /> },
  { id: "capacity", label: "Capacity", icon: <TrendingUp className="w-4 h-4" /> },
  { id: "rebalancing", label: "Rebalancing", icon: <ArrowRightLeft className="w-4 h-4" /> },
  { id: "transport-calendar", label: "Transport Calendar", icon: <Calendar className="w-4 h-4" /> },
  { id: "benchmarks", label: "Benchmarks", icon: <BarChart3 className="w-4 h-4" /> },
  { id: "thresholds", label: "Thresholds", icon: <Settings2 className="w-4 h-4" /> },
];

export default function WMSInterSite({ sites, onShowToast }: WMSInterSiteProps) {
  const [activeTab, setActiveTab] = useState<InterSiteTab>("priority-queue");

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-white border border-[#E5E7EB] shadow-sm p-4"
      >
        <nav className="flex gap-1 overflow-x-auto hide-scrollbar">
          {interSiteTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? "bg-purple-600 text-white shadow-sm"
                  : "text-[#6B7280] hover:text-[#111827] hover:bg-[#FAFAFA]"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </motion.div>

      <div>
        {activeTab === "priority-queue" && (
          <PriorityQueueDashboard onShowToast={onShowToast} />
        )}

        {activeTab === "network-inventory" && (
          <NetworkInventoryMatrix onShowToast={onShowToast} />
        )}

        {activeTab === "inbound" && (
          <InboundCargoFeed sites={sites} onShowToast={onShowToast} />
        )}

        {activeTab === "capacity" && (
          <CapacityForecast />
        )}

        {activeTab === "rebalancing" && (
          <RebalancingSuggestions />
        )}

        {activeTab === "transport-calendar" && (
          <TransportCalendar sites={sites} onShowToast={onShowToast} />
        )}

        {activeTab === "benchmarks" && (
          <SiteBenchmarks sites={sites} onShowToast={onShowToast} />
        )}

        {activeTab === "thresholds" && (
          <ThresholdManagement onShowToast={onShowToast} />
        )}
      </div>
    </div>
  );
}
