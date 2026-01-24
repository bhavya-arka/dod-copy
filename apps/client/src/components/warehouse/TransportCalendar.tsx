import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  AlertTriangle,
  X,
  Truck,
  Plane,
  Ship,
  Clock,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle,
  Filter,
  Loader2,
} from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../ui/dialog";
import type { WarehouseSite } from "./types";
import {
  fetchTransportReservations,
  fetchReservationConflicts,
  createTransportReservation,
  updateTransportReservation,
  cancelTransportReservation,
  type TransportReservation,
  type ReservationConflict,
} from "../../services/warehouseService";

interface TransportCalendarProps {
  sites: WarehouseSite[];
  onShowToast?: (message: string, type?: "info" | "success" | "warning" | "error") => void;
}

const TRANSPORT_MODES = [
  { value: "ground", label: "Ground", icon: Truck },
  { value: "air", label: "Air", icon: Plane },
  { value: "sea", label: "Sea", icon: Ship },
];

const ASSET_TYPES = [
  { value: "forklift", label: "Forklift" },
  { value: "crane", label: "Crane" },
  { value: "dock", label: "Loading Dock" },
  { value: "pallet_jack", label: "Pallet Jack" },
  { value: "container_handler", label: "Container Handler" },
  { value: "truck_bay", label: "Truck Bay" },
];

const TIME_SLOTS = [
  { value: "0600-1000", label: "06:00 - 10:00" },
  { value: "1000-1400", label: "10:00 - 14:00" },
  { value: "1400-1800", label: "14:00 - 18:00" },
  { value: "1800-2200", label: "18:00 - 22:00" },
];

const STATUS_COLORS = {
  tentative: "bg-gray-500",
  confirmed: "bg-green-500",
  cancelled: "bg-red-500",
};

export default function TransportCalendar({ sites, onShowToast }: TransportCalendarProps) {
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedSiteId, setSelectedSiteId] = useState<number | "all">("all");
  const [reservations, setReservations] = useState<TransportReservation[]>([]);
  const [conflicts, setConflicts] = useState<ReservationConflict[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showConflictsPanel, setShowConflictsPanel] = useState(false);
  const [editingReservation, setEditingReservation] = useState<TransportReservation | null>(null);

  const [formData, setFormData] = useState({
    site_id: "",
    transport_mode: "ground",
    asset_type: "dock",
    capacity_units: "1",
    reservation_date: "",
    time_slot: "0600-1000",
    purpose: "",
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [year, month] = currentMonth.split("-").map(Number);
      const startDate = `${currentMonth}-01`;
      const lastDay = new Date(year, month, 0).getDate();
      const endDate = `${currentMonth}-${String(lastDay).padStart(2, "0")}`;

      const [reservationsData, conflictsData] = await Promise.all([
        fetchTransportReservations({
          site_id: selectedSiteId === "all" ? undefined : selectedSiteId,
          start_date: startDate,
          end_date: endDate,
        }),
        fetchReservationConflicts(selectedSiteId === "all" ? undefined : selectedSiteId),
      ]);

      setReservations(reservationsData);
      setConflicts(conflictsData);
    } catch (error) {
      onShowToast?.("Failed to load reservations", "error");
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    fetchData();
  }, [currentMonth, selectedSiteId]);

  const calendarDays = useMemo(() => {
    const [year, month] = currentMonth.split("-").map(Number);
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const days: { date: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    const startPadding = firstDay.getDay();
    for (let i = startPadding - 1; i >= 0; i--) {
      const d = new Date(year, month - 1, -i);
      days.push({
        date: d.toISOString().split("T")[0],
        dayNum: d.getDate(),
        isCurrentMonth: false,
      });
    }

    for (let d = 1; d <= lastDay.getDate(); d++) {
      const dateStr = `${currentMonth}-${String(d).padStart(2, "0")}`;
      days.push({ date: dateStr, dayNum: d, isCurrentMonth: true });
    }

    const endPadding = 42 - days.length;
    for (let i = 1; i <= endPadding; i++) {
      const d = new Date(year, month, i);
      days.push({
        date: d.toISOString().split("T")[0],
        dayNum: d.getDate(),
        isCurrentMonth: false,
      });
    }

    return days;
  }, [currentMonth]);

  const reservationsByDate = useMemo(() => {
    const map: Record<string, TransportReservation[]> = {};
    reservations.forEach((r) => {
      const date = r.reservation_date.split("T")[0];
      if (!map[date]) map[date] = [];
      map[date].push(r);
    });
    return map;
  }, [reservations]);

  const conflictDates = useMemo(() => {
    const dates = new Set<string>();
    conflicts.forEach((c) => {
      dates.add(c.date.split("T")[0]);
    });
    return dates;
  }, [conflicts]);

  const handleMonthChange = (direction: number) => {
    const [year, month] = currentMonth.split("-").map(Number);
    const newDate = new Date(year, month - 1 + direction, 1);
    setCurrentMonth(
      `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, "0")}`
    );
  };

  const handleDayClick = (date: string) => {
    setSelectedDay(date);
  };

  const handleAddReservation = async () => {
    if (!formData.site_id || !formData.reservation_date) {
      onShowToast?.("Please fill in required fields", "warning");
      return;
    }

    setLoading(true);
    try {
      await createTransportReservation({
        site_id: parseInt(formData.site_id),
        transport_mode: formData.transport_mode as "ground" | "air" | "sea",
        asset_type: formData.asset_type,
        capacity_units: parseInt(formData.capacity_units),
        reservation_date: formData.reservation_date,
        time_slot: formData.time_slot,
        purpose: formData.purpose,
        status: "tentative",
      });
      onShowToast?.("Reservation created successfully", "success");
      setShowAddModal(false);
      setFormData({
        site_id: "",
        transport_mode: "ground",
        asset_type: "dock",
        capacity_units: "1",
        reservation_date: "",
        time_slot: "0600-1000",
        purpose: "",
      });
      fetchData();
    } catch (error) {
      onShowToast?.("Failed to create reservation", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateReservation = async (id: number, data: Partial<TransportReservation>) => {
    setLoading(true);
    try {
      await updateTransportReservation(id, data);
      onShowToast?.("Reservation updated", "success");
      setEditingReservation(null);
      fetchData();
    } catch (error) {
      onShowToast?.("Failed to update reservation", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCancelReservation = async (id: number) => {
    setLoading(true);
    try {
      await cancelTransportReservation(id);
      onShowToast?.("Reservation cancelled", "success");
      fetchData();
    } catch (error) {
      onShowToast?.("Failed to cancel reservation", "error");
    } finally {
      setLoading(false);
    }
  };

  const getModeIcon = (mode: string) => {
    const found = TRANSPORT_MODES.find((m) => m.value === mode);
    return found ? found.icon : Truck;
  };

  const selectedDayReservations = selectedDay ? reservationsByDate[selectedDay] || [] : [];

  return (
    <div className="space-y-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
      >
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-blue-400" />
            Transport Calendar
          </h2>
          <p className="text-gray-500 mt-1">Schedule and manage transport reservations</p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowConflictsPanel(!showConflictsPanel)}
            className={`border-gray-200 ${conflicts.length > 0 ? "text-red-400 border-red-300" : "text-gray-600"}`}
          >
            <AlertTriangle className="w-4 h-4 mr-2" />
            {conflicts.length} Conflicts
          </Button>
          <Button
            onClick={() => setShowAddModal(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="w-4 h-4 mr-2" />
            Add Reservation
          </Button>
        </div>
      </motion.div>

      <div className="flex flex-col lg:flex-row gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex-1 bg-gray-50 border border-gray-200 rounded-xl p-4"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleMonthChange(-1)}
                className="text-gray-500 hover:text-gray-900"
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <span className="text-lg font-semibold text-gray-900 min-w-[140px] text-center">
                {new Date(currentMonth + "-01").toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleMonthChange(1)}
                className="text-gray-500 hover:text-gray-900"
              >
                <ChevronRight className="w-5 h-5" />
              </Button>
            </div>

            <Select
              value={selectedSiteId === "all" ? "all" : String(selectedSiteId)}
              onValueChange={(v) => setSelectedSiteId(v === "all" ? "all" : parseInt(v))}
            >
              <SelectTrigger className="w-[180px] bg-white border-gray-200 text-gray-900">
                <Filter className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Filter by site" />
              </SelectTrigger>
              <SelectContent className="bg-white border-gray-200">
                <SelectItem value="all" className="text-gray-900">All Sites</SelectItem>
                {sites.map((site) => (
                  <SelectItem key={site.id} value={String(site.id)} className="text-gray-900">
                    {site.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div key={day} className="text-center text-xs font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {calendarDays.map((day, idx) => {
                  const dayReservations = reservationsByDate[day.date] || [];
                  const hasConflict = conflictDates.has(day.date);
                  const isSelected = selectedDay === day.date;

                  return (
                    <button
                      key={idx}
                      onClick={() => handleDayClick(day.date)}
                      className={`
                        relative p-2 min-h-[80px] rounded-lg border transition-all
                        ${day.isCurrentMonth ? "bg-white" : "bg-gray-50 opacity-50"}
                        ${isSelected ? "border-blue-500 ring-2 ring-blue-500/20" : "border-gray-200"}
                        ${hasConflict ? "border-red-500 ring-1 ring-red-500/30" : ""}
                        hover:border-gray-300
                      `}
                    >
                      <span className={`text-sm font-medium ${day.isCurrentMonth ? "text-gray-900" : "text-gray-500"}`}>
                        {day.dayNum}
                      </span>

                      {hasConflict && (
                        <AlertCircle className="absolute top-1 right-1 w-4 h-4 text-red-500" />
                      )}

                      <div className="mt-1 space-y-1">
                        {dayReservations.slice(0, 3).map((r) => (
                          <div
                            key={r.id}
                            className={`text-xs px-1 py-0.5 rounded truncate ${STATUS_COLORS[r.status as keyof typeof STATUS_COLORS]} text-white`}
                          >
                            {r.time_slot?.split("-")[0]}
                          </div>
                        ))}
                        {dayReservations.length > 3 && (
                          <div className="text-xs text-gray-500">+{dayReservations.length - 3} more</div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-4 mt-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-gray-500" /> Tentative
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-green-500" /> Confirmed
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-3 h-3 rounded bg-red-500" /> Cancelled
                </span>
              </div>
            </>
          )}
        </motion.div>

        <AnimatePresence>
          {selectedDay && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="w-full lg:w-80 bg-gray-50 border border-gray-200 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">
                  {new Date(selectedDay).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setSelectedDay(null)}
                  className="text-gray-500 hover:text-gray-900"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {selectedDayReservations.length === 0 ? (
                <p className="text-gray-500 text-sm">No reservations for this day</p>
              ) : (
                <div className="space-y-3">
                  {selectedDayReservations.map((r) => {
                    const ModeIcon = getModeIcon(r.transport_mode);
                    return (
                      <div
                        key={r.id}
                        className={`p-3 rounded-lg border ${r.status === "cancelled" ? "border-red-300 bg-red-50" : "border-gray-200 bg-white"}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <ModeIcon className="w-4 h-4 text-blue-400" />
                            <span className="text-sm font-medium text-gray-900 capitalize">
                              {r.transport_mode}
                            </span>
                          </div>
                          <span
                            className={`text-xs px-2 py-0.5 rounded ${STATUS_COLORS[r.status as keyof typeof STATUS_COLORS]} text-white`}
                          >
                            {r.status}
                          </span>
                        </div>

                        <div className="text-xs text-gray-500 space-y-1">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {r.time_slot?.replace("-", " - ")}
                          </div>
                          <div>Asset: {r.asset_type}</div>
                          {r.purpose && <div>Purpose: {r.purpose}</div>}
                        </div>

                        {r.status !== "cancelled" && (
                          <div className="flex items-center gap-2 mt-3">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingReservation(r)}
                              className="text-gray-500 hover:text-gray-900 text-xs h-7"
                            >
                              <Edit2 className="w-3 h-3 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelReservation(r.id)}
                              className="text-red-400 hover:text-red-300 text-xs h-7"
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <Button
                onClick={() => {
                  setFormData((prev) => ({ ...prev, reservation_date: selectedDay }));
                  setShowAddModal(true);
                }}
                className="w-full mt-4 bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add for This Day
              </Button>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showConflictsPanel && conflicts.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="w-full lg:w-80 bg-gray-50 border border-red-300 rounded-xl p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-red-400 flex items-center gap-2">
                  <AlertTriangle className="w-5 h-5" />
                  Conflicts
                </h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowConflictsPanel(false)}
                  className="text-gray-500 hover:text-gray-900"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {conflicts.map((conflict) => (
                  <div key={conflict.id} className="p-3 rounded-lg border border-red-300 bg-red-50">
                    <div className="text-sm text-gray-900 mb-1">
                      {new Date(conflict.date).toLocaleDateString()}
                    </div>
                    <div className="text-xs text-gray-500 mb-2">
                      {conflict.reservations?.length || 0} overlapping reservations
                    </div>

                    <div className="space-y-2">
                      {conflict.reservations?.map((r: TransportReservation) => (
                        <div key={r.id} className="flex items-center justify-between text-xs">
                          <span className="text-gray-600">{r.time_slot}</span>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelReservation(r.id)}
                              className="h-6 px-2 text-red-400 hover:text-red-300"
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Add Reservation</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label className="text-gray-600">Site *</Label>
              <Select
                value={formData.site_id}
                onValueChange={(v) => setFormData((prev) => ({ ...prev, site_id: v }))}
              >
                <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                  <SelectValue placeholder="Select site" />
                </SelectTrigger>
                <SelectContent className="bg-white border-gray-200">
                  {sites.map((site) => (
                    <SelectItem key={site.id} value={String(site.id)} className="text-gray-900">
                      {site.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-600">Transport Mode</Label>
                <Select
                  value={formData.transport_mode}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, transport_mode: v }))}
                >
                  <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {TRANSPORT_MODES.map((mode) => (
                      <SelectItem key={mode.value} value={mode.value} className="text-gray-900">
                        {mode.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-gray-600">Asset Type</Label>
                <Select
                  value={formData.asset_type}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, asset_type: v }))}
                >
                  <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {ASSET_TYPES.map((type) => (
                      <SelectItem key={type.value} value={type.value} className="text-gray-900">
                        {type.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-600">Date *</Label>
                <Input
                  type="date"
                  value={formData.reservation_date}
                  onChange={(e) => setFormData((prev) => ({ ...prev, reservation_date: e.target.value }))}
                  className="bg-white border-gray-200 text-gray-900"
                />
              </div>
              <div>
                <Label className="text-gray-600">Time Slot</Label>
                <Select
                  value={formData.time_slot}
                  onValueChange={(v) => setFormData((prev) => ({ ...prev, time_slot: v }))}
                >
                  <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {TIME_SLOTS.map((slot) => (
                      <SelectItem key={slot.value} value={slot.value} className="text-gray-900">
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <Label className="text-gray-600">Capacity Units</Label>
              <Input
                type="number"
                min="1"
                value={formData.capacity_units}
                onChange={(e) => setFormData((prev) => ({ ...prev, capacity_units: e.target.value }))}
                className="bg-white border-gray-200 text-gray-900"
              />
            </div>

            <div>
              <Label className="text-gray-600">Purpose</Label>
              <Input
                value={formData.purpose}
                onChange={(e) => setFormData((prev) => ({ ...prev, purpose: e.target.value }))}
                placeholder="Optional description"
                className="bg-white border-gray-200 text-gray-900"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)} className="border-gray-200">
              Cancel
            </Button>
            <Button onClick={handleAddReservation} className="bg-blue-600 hover:bg-blue-700">
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingReservation} onOpenChange={() => setEditingReservation(null)}>
        <DialogContent className="bg-white border-gray-200 text-gray-900 max-w-md">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Edit Reservation</DialogTitle>
          </DialogHeader>

          {editingReservation && (
            <div className="space-y-4">
              <div>
                <Label className="text-gray-600">Status</Label>
                <Select
                  value={editingReservation.status}
                  onValueChange={(v) =>
                    setEditingReservation({ ...editingReservation, status: v as TransportReservation["status"] })
                  }
                >
                  <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    <SelectItem value="tentative" className="text-gray-900">Tentative</SelectItem>
                    <SelectItem value="confirmed" className="text-gray-900">Confirmed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-gray-600">Time Slot</Label>
                <Select
                  value={editingReservation.time_slot || "0600-1000"}
                  onValueChange={(v) =>
                    setEditingReservation({ ...editingReservation, time_slot: v })
                  }
                >
                  <SelectTrigger className="bg-white border-gray-200 text-gray-900">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-white border-gray-200">
                    {TIME_SLOTS.map((slot) => (
                      <SelectItem key={slot.value} value={slot.value} className="text-gray-900">
                        {slot.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingReservation(null)} className="border-gray-200">
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (editingReservation) {
                  handleUpdateReservation(editingReservation.id, {
                    status: editingReservation.status,
                    time_slot: editingReservation.time_slot,
                  });
                }
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
