"use client";

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  format,
  addMonths,
  subMonths,
  addYears,
  subYears,
  differenceInMinutes,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addDays,
  subDays,
  addWeeks,
  subWeeks,
  addMinutes,
  parse
} from "date-fns";
import { ja } from "date-fns/locale";
import {
  Plus, Search, Calendar as CalendarIcon, Grid, List,
  Users, Printer, RefreshCw, Settings, Menu, Filter,
  CheckSquare, ChevronLeft, ChevronRight, Calculator,
  ColumnsIcon, CalendarDays, Sun, MapPin, Copy,
  Banknote, Wallet, Coins, CircleDollarSign
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

// --- Types ---
interface HourlyRatePreset {
  id: string;
  name: string;
  rate: number;
  color: string;
  workplace?: string;
  linkedCommutingPresetId?: string;
  closingDay?: number;
  paymentMonthOffset?: number;
  paymentDay?: number;
}

interface CommutingPreset {
  id: string;
  name: string;
  amount: number;
}

interface WorkEntry {
  id: string;
  date: string; // ISO string for easy storage
  startTime: string;
  endTime: string;
  presetId: string;
  commuting: number;
  commutingPresetId?: string;
  workplace?: string;
}

const PRESET_COLORS = [
  "bg-lime-400 text-lime-950",
  "bg-sky-500 text-white",
  "bg-emerald-500 text-white",
  "bg-amber-400 text-amber-950",
  "bg-purple-600 text-white",
  "bg-rose-600 text-white",
  "bg-blue-600 text-white",
  "bg-orange-500 text-white",
];

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-10 bg-red-50 text-red-900 overflow-auto h-screen">
          <h1 className="text-2xl font-bold mb-4">予期しないエラーが発生しました</h1>
          <pre className="p-4 bg-white border border-red-200 rounded-lg text-xs">
            {this.state.error?.toString()}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <Button onClick={() => window.location.reload()} className="mt-4 bg-red-600">
            アプリを再読み込み
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CalendarAppWrapper() {
  return (
    <ErrorBoundary>
      <CalendarApp />
    </ErrorBoundary>
  );
}

function CalendarApp() {
  // --- Helpers (Hoisted or defined before use) ---
  function calculateDuration(start: string, end: string) {
    try {
      const startTimeDate = parse(start, "HH:mm", new Date());
      const endTimeDate = parse(end, "HH:mm", new Date());
      let diff = differenceInMinutes(endTimeDate, startTimeDate);
      if (diff < 0) diff += 24 * 60;
      return diff;
    } catch {
      return 0;
    }
  }

  function getDailyEntries(day: Date) {
    return entries.filter(ent => isSameDay(new Date(ent.date), day));
  }

  // --- State ---
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 3)); // March 2026 as per screenshot
  const [viewMode, setViewMode] = useState<"day" | "week" | "month" | "year" | "list">("month");
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [filterPresetIds, setFilterPresetIds] = useState<string[]>([]);
  const [presets, setPresets] = useState<HourlyRatePreset[]>([
    { id: "1", name: "基本時給", rate: 3000, color: PRESET_COLORS[0], workplace: "自宅" },
    { id: "2", name: "品川学藝高校", rate: 5000, color: PRESET_COLORS[1], workplace: "品川" },
    { id: "3", name: "戸塚", rate: 4500, color: PRESET_COLORS[4], workplace: "横浜" },
  ]);

  // --- Derived Data ---
  const filteredEntries = useMemo(() => {
    let base = entries;
    if (viewMode === "list" || viewMode === "month" || viewMode === "week") {
      // 基本的には currentDate の月に限定（リスト表示用）
      base = entries.filter(e => isSameMonth(new Date(e.date), currentDate));
    }
    if (filterPresetIds.length > 0) {
      base = base.filter(e => filterPresetIds.includes(e.presetId));
    }
    return base.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [entries, currentDate, filterPresetIds, viewMode]);

  const summary = useMemo(() => {
    return filteredEntries.reduce((acc, curr) => {
      const preset = presets.find(p => p.id === curr.presetId);
      const minutes = calculateDuration(curr.startTime, curr.endTime);
      const salary = Math.round((minutes / 60) * (preset?.rate || 0));
      return {
        salary: acc.salary + salary,
        commuting: acc.commuting + curr.commuting,
        total: acc.total + salary + curr.commuting
      };
    }, { salary: 0, commuting: 0, total: 0 });
  }, [filteredEntries, presets]);
  const [commPresets, setCommPresets] = useState<CommutingPreset[]>([
    { id: "c1", name: "電車定期内", amount: 0 },
    { id: "c2", name: "往復 1,200円", amount: 1200 },
    { id: "c3", name: "バス代込 1,500円", amount: 1500 },
  ]);

  // Dialog states
  const [isAddEntryOpen, setIsAddEntryOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDayPopupOpen, setIsDayPopupOpen] = useState(false);
  const [isPaydayAggregationOpen, setIsPaydayAggregationOpen] = useState(false);
  const [selectedDayPopup, setSelectedDayPopup] = useState<Date | null>(null);

  const paydayAggregations = useMemo(() => {
    const agg: Record<string, { total: number, salary: number, commuting: number, dateObj: Date }> = {};
    entries.forEach(entry => {
      const preset = presets.find(p => p.id === entry.presetId);
      if (!preset) return;

      let payName = "未設定";
      let payDateObj = new Date("2099-12-31");

      const cDaySetting = preset.closingDay ?? 31;
      const pOffsetSetting = preset.paymentMonthOffset ?? 1;
      const pDaySetting = preset.paymentDay ?? 31;

      const eDate = new Date(entry.date);
      let closingMonth = eDate.getMonth();
      let closingYear = eDate.getFullYear();

      const lastDayOfE = endOfMonth(eDate).getDate();
      const cDay = cDaySetting === 31 ? lastDayOfE : Math.min(cDaySetting, lastDayOfE);

      if (eDate.getDate() > cDay) {
        closingMonth += 1;
      }

      const payMonth = closingMonth + pOffsetSetting;
      const tempPay = new Date(closingYear, payMonth, 1);
      const lastDayOfP = endOfMonth(tempPay).getDate();
      const pDay = pDaySetting === 31 ? lastDayOfP : Math.min(pDaySetting, lastDayOfP);

      payDateObj = new Date(tempPay.getFullYear(), tempPay.getMonth(), pDay);
      payName = format(payDateObj, "yyyy年M月d日");

      if (!agg[payName]) {
        agg[payName] = { total: 0, salary: 0, commuting: 0, dateObj: payDateObj };
      }

      const minutes = calculateDuration(entry.startTime, entry.endTime);
      const salary = Math.round((minutes / 60) * preset.rate);
      agg[payName].salary += salary;
      agg[payName].commuting += entry.commuting;
      agg[payName].total += salary + entry.commuting;
    });

    return Object.entries(agg)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime());
  }, [entries, presets]);

  // Form states
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("12:00");
  const [formPresetId, setFormPresetId] = useState("1");
  const [formCommPresetId, setFormCommPresetId] = useState<string>("c2");
  const [formCommuting, setFormCommuting] = useState(1200);
  const [formWorkplace, setFormWorkplace] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [togglePos, setTogglePos] = useState({ y: 80 }); // Moved down a bit from top
  const [isDragging, setIsDragging] = useState(false);
  const [dragStartY, setDragStartY] = useState(0);
  const [dragStartToggleY, setDragStartToggleY] = useState(0);
  const [durationMinutes, setDurationMinutes] = useState(180); // Default 3 hours
  const [isCopying, setIsCopying] = useState(false);
  const [editingEntry, setEditingEntry] = useState<WorkEntry | null>(null);
  const [isEditEntryOpen, setIsEditEntryOpen] = useState(false);
  const [workplaceHistory, setWorkplaceHistory] = useState<string[]>([]);

  // 編集用フォーム（編集ダイアログ専用）
  const [editFormDate, setEditFormDate] = useState<Date>(new Date());
  const [editFormStart, setEditFormStart] = useState("09:00");
  const [editFormEnd, setEditFormEnd] = useState("12:00");
  const [editFormPresetId, setEditFormPresetId] = useState("1");
  const [editFormCommPresetId, setEditFormCommPresetId] = useState<string>("c2");
  const [editFormCommuting, setEditFormCommuting] = useState(1200);
  const [editFormWorkplace, setEditFormWorkplace] = useState("");
  const [editDurationMinutes, setEditDurationMinutes] = useState(180);

  const openEditModal = (entry: WorkEntry) => {
    setEditingEntry(entry);
    setEditFormDate(new Date(entry.date));
    setEditFormStart(entry.startTime);
    setEditFormEnd(entry.endTime);
    setEditFormPresetId(entry.presetId);
    setEditFormCommuting(entry.commuting);
    setEditFormCommPresetId(entry.commutingPresetId || "");
    setEditFormWorkplace(entry.workplace || "");
    try {
      const start = parse(entry.startTime, "HH:mm", new Date());
      const end = parse(entry.endTime, "HH:mm", new Date());
      let diff = differenceInMinutes(end, start);
      if (diff < 0) diff += 24 * 60;
      setEditDurationMinutes(diff);
    } catch (e) { }
    setIsEditEntryOpen(true);
  };

  // 編集用 endTime 自動更新
  useEffect(() => {
    try {
      const start = parse(editFormStart, "HH:mm", new Date());
      const end = addMinutes(start, editDurationMinutes);
      setEditFormEnd(format(end, "HH:mm"));
    } catch (e) { }
  }, [editFormStart, editDurationMinutes]);

  const handleEditEndTimeChange = (val: string) => {
    setEditFormEnd(val);
    try {
      const start = parse(editFormStart, "HH:mm", new Date());
      const end = parse(val, "HH:mm", new Date());
      let diff = differenceInMinutes(end, start);
      if (diff < 0) diff += 24 * 60;
      setEditDurationMinutes(diff);
    } catch (e) { }
  };

  // Update endTime when startTime or duration changes
  useEffect(() => {
    try {
      const start = parse(formStart, "HH:mm", new Date());
      const end = addMinutes(start, durationMinutes);
      setFormEnd(format(end, "HH:mm"));
    } catch (e) { }
  }, [formStart, durationMinutes]);

  // Update duration when endTime changes manually
  const handleEndTimeChange = (val: string) => {
    setFormEnd(val);
    try {
      const start = parse(formStart, "HH:mm", new Date());
      const end = parse(val, "HH:mm", new Date());
      let diff = differenceInMinutes(end, start);
      if (diff < 0) diff += 24 * 60;
      setDurationMinutes(diff);
    } catch (e) { }
  };

  // Initialize toggle position after mount to avoid SSR issues
  useEffect(() => {
    setTogglePos({ y: window.innerHeight / 2 - 24 });
  }, []);

  // Drag logic for mobile toggle
  const handleTouchStart = (e: React.TouchEvent) => {
    setDragStartY(e.touches[0].clientY);
    setDragStartToggleY(togglePos.y);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaY = e.touches[0].clientY - dragStartY;
    if (Math.abs(deltaY) > 5) {
      setIsDragging(true);
      const newY = Math.max(0, Math.min(window.innerHeight - 80, dragStartToggleY + deltaY));
      setTogglePos({ y: newY });
    }
  };

  const handleTouchEnd = () => {
    setDragStartY(0);
    setTimeout(() => setIsDragging(false), 100);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setDragStartY(e.clientY);
    setDragStartToggleY(togglePos.y);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragStartY === 0) return;
    const deltaY = e.clientY - dragStartY;
    if (Math.abs(deltaY) > 5) {
      setIsDragging(true);
      const newY = Math.max(0, Math.min(window.innerHeight - 80, dragStartToggleY + deltaY));
      setTogglePos({ y: newY });
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    setDragStartY(0);
    // Use a shorter timeout or check if we actually moved significantly
    setTimeout(() => setIsDragging(false), 50);
  };

  // --- Logic ---
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState<Date | null>(null);

  const loadData = async () => {
    setIsSyncing(true);
    try {
      // First try local storage for immediate render
      const saved = localStorage.getItem("cal-entries");
      const savedPresets = localStorage.getItem("cal-presets");
      const savedCommPresets = localStorage.getItem("cal-comm-presets");
      const savedHistory = localStorage.getItem("cal-workplace-history");

      let hasLocalData = false;
      if (saved) { setEntries(JSON.parse(saved)); hasLocalData = true; }
      if (savedPresets) setPresets(JSON.parse(savedPresets));
      if (savedCommPresets) setCommPresets(JSON.parse(savedCommPresets));
      if (savedHistory) setWorkplaceHistory(JSON.parse(savedHistory));

      // Then fetch from server
      const res = await fetch('/api/data');
      if (res.ok) {
        const { data } = await res.json();
        if (data && data.entries) {
          setEntries(data.entries);
          if (data.presets) setPresets(data.presets);
          if (data.commPresets) setCommPresets(data.commPresets);
          setLastSynced(new Date());

          // Update local storage with fresh server data
          localStorage.setItem("cal-entries", JSON.stringify(data.entries));
          localStorage.setItem("cal-presets", JSON.stringify(data.presets || []));
          localStorage.setItem("cal-comm-presets", JSON.stringify(data.commPresets || []));
        }
      }
    } catch (error) {
      console.error("Failed to load data:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const saveData = async (currentEntries: any, currentPresets: any, currentCommPresets: any) => {
    setIsSyncing(true);
    try {
      const dataToSave = {
        entries: currentEntries,
        presets: currentPresets,
        commPresets: currentCommPresets,
        updatedAt: new Date().toISOString()
      };

      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dataToSave)
      });
      setLastSynced(new Date());
    } catch (error) {
      console.error("Failed to save data:", error);
    } finally {
      setIsSyncing(false);
    }
  };

  const updateWorkplaceHistory = (wp: string) => {
    if (!wp || !wp.trim()) return;
    setWorkplaceHistory(prev => {
      const newHistory = [wp.trim(), ...prev.filter(item => item !== wp.trim())].slice(0, 20);
      localStorage.setItem("cal-workplace-history", JSON.stringify(newHistory));
      return newHistory;
    });
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Skip initial empty render save
    if (entries.length === 0 && presets.length === 3) return;

    localStorage.setItem("cal-entries", JSON.stringify(entries));
    localStorage.setItem("cal-presets", JSON.stringify(presets));
    localStorage.setItem("cal-comm-presets", JSON.stringify(commPresets));

    // Debounce server save to avoid too many requests
    const timeoutId = setTimeout(() => {
      saveData(entries, presets, commPresets);
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [entries, presets, commPresets]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const deleteEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEntries(entries.filter(ent => ent.id !== id));
  };

  // --- Main Render Branching ---
  const renderMainContent = () => {
    switch (viewMode) {
      case "day":
        return (
          <div className="flex-1 overflow-y-auto p-12 bg-white space-y-8">
            <h2 className="text-6xl font-black tracking-tighter text-gray-800">{format(currentDate, "M月d日")}</h2>
            <div className="space-y-4">
              {getDailyEntries(currentDate).map(entry => {
                const preset = presets.find(p => p.id === entry.presetId);
                const minutes = calculateDuration(entry.startTime, entry.endTime);
                return (
                  <div key={entry.id} onClick={() => openEditModal(entry)} className="cursor-pointer hover:bg-gray-100 transition-colors flex items-center justify-between p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100 group">
                    <div className="flex items-center gap-6">
                      <div className={cn("w-4 h-16 rounded-full", preset?.color?.split(" ")[0])} />
                      <div>
                        <p className="text-3xl font-black tracking-tighter">{entry.startTime} - {entry.endTime} <span className="text-gray-300 ml-2">({(minutes / 60).toFixed(1)}h)</span></p>
                        <p className="text-lg font-bold text-gray-400">
                          {entry.workplace || preset?.workplace ? `${entry.workplace || preset?.workplace} @ ` : ""}
                          {preset?.name}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black text-blue-600">¥{(Math.round((minutes / 60) * (preset?.rate || 0)) + entry.commuting).toLocaleString()}</p>
                      <Button variant="ghost" size="sm" onClick={(e) => deleteEntry(entry.id, e as any)} className="text-red-400 lg:opacity-0 lg:group-hover:opacity-100">記録を削除</Button>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" className="w-full h-24 rounded-[2.5rem] border-dashed border-2 text-gray-400 text-xl font-bold" onClick={() => { setFormDate(currentDate); setIsCopying(false); setIsAddEntryOpen(true); }}>
                <Plus className="mr-2" /> 新しい勤務を追加
              </Button>
            </div>
          </div>
        );

      case "week": {
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
        const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

        const renderMobileDayCard = (day: Date, i: number) => {
          const dailyEntries = getDailyEntries(day);
          const isToday = isSameDay(day, new Date());
          const isSat = i === 5;
          const isSun = i === 6;
          return (
            <div key={i} className={cn("border-b border-gray-100 last:border-b-0", isToday && "bg-purple-50/40")}>
              <div
                className="flex items-baseline gap-2 px-3 pt-2 pb-1 cursor-pointer active:opacity-70"
                onClick={() => { setCurrentDate(day); setViewMode("day"); }}
              >
                <span className={cn(
                  "text-2xl font-black leading-none",
                  isToday ? "bg-purple-600 text-white rounded-full w-9 h-9 flex items-center justify-center text-lg" :
                    isSat ? "text-blue-600" : isSun ? "text-rose-600" : "text-gray-800"
                )}>{format(day, "d")}</span>
                <span className={cn(
                  "text-sm font-bold",
                  isToday ? "text-purple-600" : isSat ? "text-blue-400" : isSun ? "text-rose-400" : "text-gray-400"
                )}>{DAY_LABELS[i]}</span>
              </div>
              <div className="px-2 pb-3 space-y-1 min-h-[28px]">
                {dailyEntries.map(entry => {
                  const preset = presets.find(p => p.id === entry.presetId);
                  const label = (entry.workplace || preset?.workplace)
                    ? `${entry.workplace || preset?.workplace} @ ${preset?.name ?? ""}`
                    : (preset?.name ?? "");
                  const textColorClass = preset?.color ? preset.color.split(" ")[0].replace("bg-", "text-") : "text-gray-600";
                  return (
                    <div
                      key={entry.id}
                      onClick={() => openEditModal(entry)}
                      className="flex items-start gap-1.5 px-2 py-[2px] rounded-md cursor-pointer active:opacity-70 group relative"
                    >
                      <span className={cn("text-[11px] font-black flex-shrink-0 tabular-nums pt-[1px]", textColorClass)}>{entry.startTime}</span>
                      <span className={cn("text-[11px] font-bold leading-snug break-words", textColorClass)}>{label}</span>
                    </div>
                  );
                })}
                <button
                  onClick={() => { setFormDate(day); setIsCopying(false); setIsAddEntryOpen(true); }}
                  className="w-full flex justify-center text-gray-200 hover:text-gray-400 transition-colors pt-0.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        };

        return (
          <>
            {/* === スマホ: 左(月〜木) / 右(金〜日) 縦積み2カラム === */}
            <div className="md:hidden flex-1 overflow-y-auto flex bg-white">
              <div className="flex-1 border-r border-gray-200 flex flex-col">
                {weekDays.slice(0, 4).map((day, i) => renderMobileDayCard(day, i))}
              </div>
              <div className="flex-1 flex flex-col">
                {weekDays.slice(4, 7).map((day, i) => renderMobileDayCard(day, i + 4))}
              </div>
            </div>

            {/* === PC: 7カラムグリッド === */}
            <div className="hidden md:block flex-1 overflow-y-auto p-8 bg-gray-50/20">
              <div className="grid grid-cols-7 gap-4">
                {weekDays.map((day, i) => {
                  const dailyEntries = getDailyEntries(day);
                  return (
                    <div key={i} className="flex flex-col gap-4">
                      <div
                        onClick={() => { setCurrentDate(day); setViewMode("day"); }}
                        className={cn(
                          "p-4 rounded-2xl text-center shadow-sm border cursor-pointer hover:opacity-80 transition-opacity",
                          isSameDay(day, new Date()) ? "bg-purple-600 text-white border-purple-400" : "bg-white text-gray-800 border-gray-100"
                        )}
                      >
                        <p className="text-xs font-bold uppercase opacity-70">{DAY_LABELS[i]}</p>
                        <p className="text-2xl font-black">{format(day, "d")}</p>
                      </div>
                      <div className="flex-1 space-y-3">
                        {dailyEntries.map(entry => {
                          const preset = presets.find(p => p.id === entry.presetId);
                          return (
                            <div
                              key={entry.id}
                              onClick={() => openEditModal(entry)}
                              className={cn(
                                "p-3 rounded-xl border-l-[4px] shadow-sm bg-white cursor-pointer hover:bg-gray-50 transition-colors group relative",
                                preset?.color ? preset.color.split(" ")[0].replace("bg-", "border-") : "border-gray-200"
                              )}
                            >
                              <p className="text-[10px] font-black text-gray-400">{entry.startTime} - {entry.endTime}</p>
                              <p className="text-xs font-bold truncate pr-4 text-gray-700">
                                {(entry.workplace || preset?.workplace) ? `${entry.workplace || preset?.workplace} @ ` : ""}
                                {preset?.name}
                              </p>
                              <p className="text-[10px] font-black text-blue-600">¥{(Math.round((calculateDuration(entry.startTime, entry.endTime) / 60) * (preset?.rate || 0)) + entry.commuting).toLocaleString()}</p>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id, e as any); }}
                                className="absolute top-1 right-1 text-gray-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          );
                        })}
                        <Button variant="ghost" className="w-full h-12 border-2 border-dashed border-gray-200 rounded-xl text-gray-300" onClick={() => { setFormDate(day); setIsCopying(false); setIsAddEntryOpen(true); }}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        );
      }

      case "list":
        return (
          <div className="flex-1 overflow-y-auto p-12 bg-white space-y-12">
            <div className="flex items-end justify-between border-b-4 border-gray-900 pb-6">
              <h2 className="text-7xl font-black tracking-tighter text-gray-900">{format(currentDate, "yyyy M月")}</h2>
              <div className="text-right space-y-1">
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest">対象期間 合計額</p>
                <p className="text-6xl font-black text-blue-600 tracking-tighter">¥{summary.total.toLocaleString()}</p>
                <div className="flex justify-end gap-4 text-xs font-bold text-gray-400 mt-2">
                  <span>給与: ¥{summary.salary.toLocaleString()}</span>
                  <span>交通費: ¥{summary.commuting.toLocaleString()}</span>
                </div>
              </div>
            </div>

            {filterPresetIds.length > 1 && (
              <div className="flex flex-wrap gap-4 pb-4">
                {filterPresetIds.map(id => {
                  const p = presets.find(x => x.id === id);
                  if (!p) return null;
                  const pEntries = filteredEntries.filter(e => e.presetId === id);
                  const pSalary = pEntries.reduce((acc, curr) => acc + Math.round((calculateDuration(curr.startTime, curr.endTime) / 60) * p.rate), 0);
                  const pComm = pEntries.reduce((acc, curr) => acc + curr.commuting, 0);
                  const pTtl = pSalary + pComm;
                  return (
                    <div key={id} className="min-w-[160px] p-5 bg-gray-50 rounded-[2rem] border border-gray-100 flex-shrink-0 flex items-center justify-between gap-6 shadow-sm">
                      <div className="flex items-center gap-3">
                        <div className={cn("w-3 h-10 rounded-full", p.color.split(" ")[0])} />
                        <div>
                          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none mb-1">小計</p>
                          <p className="text-[13px] font-bold text-gray-600 leading-none">{p.name}</p>
                        </div>
                      </div>
                      <p className="text-3xl font-black text-gray-900 tracking-tighter">¥{pTtl.toLocaleString()}</p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="space-y-4">
              {filteredEntries.length === 0 ? (
                <div className="py-20 text-center border-4 border-dashed border-gray-100 rounded-[3rem]">
                  <p className="text-2xl font-bold text-gray-300">表示できる記録がありません</p>
                </div>
              ) : (
                <div className="overflow-hidden rounded-[2.5rem] border border-gray-100 shadow-sm">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-gray-50 border-b border-gray-100">
                      <tr>
                        <th className="px-8 py-6 text-sm font-black text-gray-400 uppercase tracking-widest">日付</th>
                        <th className="px-8 py-6 text-sm font-black text-gray-400 uppercase tracking-widest">勤務先</th>
                        <th className="px-8 py-6 text-sm font-black text-gray-400 uppercase tracking-widest">時間</th>
                        <th className="px-8 py-6 text-sm font-black text-gray-400 uppercase tracking-widest text-right">支給額</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredEntries.map(entry => {
                        const preset = presets.find(p => p.id === entry.presetId);
                        const minutes = calculateDuration(entry.startTime, entry.endTime);
                        const salary = Math.round((minutes / 60) * (preset?.rate || 0));
                        return (
                          <tr key={entry.id} onClick={() => openEditModal(entry)} className="cursor-pointer hover:bg-gray-50/50 transition-colors group">
                            <td className="px-8 py-6">
                              <p className="text-lg font-black text-gray-800">{format(new Date(entry.date), "dd (E)", { locale: ja })}</p>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-3">
                                <div className={cn("w-3 h-3 rounded-full", preset?.color?.split(" ")[0])} />
                                <span className="font-bold text-gray-600">
                                  {entry.workplace || preset?.workplace ? `${entry.workplace || preset?.workplace} @ ` : ""}
                                  {preset?.name}
                                </span>
                              </div>
                            </td>
                            <td className="px-8 py-6">
                              <p className="text-sm font-bold text-gray-400">{entry.startTime} - {entry.endTime}</p>
                              <p className="text-xs font-medium text-gray-300">{(minutes / 60).toFixed(1)}h</p>
                            </td>
                            <td className="px-8 py-6 text-right">
                              <p className="text-xl font-black text-gray-900 leading-tight">¥{(salary + entry.commuting).toLocaleString()}</p>
                              <p className="text-[10px] text-gray-400 font-bold tracking-tighter">¥{salary.toLocaleString()} + ¥{entry.commuting.toLocaleString()}</p>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        );

      case "year":
        return (
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/30 grid grid-cols-3 md:grid-cols-4 gap-8">
            {Array.from({ length: 12 }).map((_, m) => {
              const monthDate = new Date(currentDate.getFullYear(), m, 1);
              return (
                <div key={m} className="bg-white p-4 rounded-3xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setCurrentDate(monthDate); setViewMode("month"); }}>
                  <p className="text-lg font-black text-gray-800 mb-2">{m + 1}月</p>
                  <div className="grid grid-cols-7 gap-1">
                    {eachDayOfInterval({ start: startOfWeek(startOfMonth(monthDate), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(monthDate), { weekStartsOn: 1 }) }).map((d, i) => (
                      <div key={i} className={cn(
                        "w-full aspect-square rounded-full flex items-center justify-center text-[8px]",
                        !isSameMonth(d, monthDate) ? "text-gray-200" : "text-gray-500",
                        getDailyEntries(d).length > 0 && "bg-blue-600 text-white font-bold"
                      )}>
                        {format(d, "d")}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        );

      default: // Month View
        return (
          <>
            {/* Weekday Headers */}
            <div className="grid grid-cols-7 border-b-2 border-gray-900 bg-white">
              {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((dayEn, idx) => {
                const dayJa = ["月", "火", "水", "木", "金", "土", "日"][idx];
                return (
                  <div key={dayEn} className={cn(
                    "py-1 text-center text-[10px] md:text-sm font-black border-r border-gray-100 last:border-r-0",
                    idx === 5 ? "text-blue-600" : idx === 6 ? "text-rose-600" : "text-gray-900"
                  )}>
                    <span className="md:hidden">{dayJa}</span>
                    <span className="hidden md:inline">{dayEn}</span>
                  </div>
                );
              })}
            </div>

            {/* Calendar Grid */}
            <div className="grid grid-cols-7 flex-1 overflow-y-auto bg-gray-50/20 auto-rows-fr">
              {days.map((day, idx) => {
                const isSelectedMonth = isSameMonth(day, currentDate);
                const dailyEntries = filteredEntries.filter(ent => isSameDay(new Date(ent.date), day));

                return (
                  <div
                    key={day.toString()}
                    className={cn(
                      "relative min-h-[120px] border-r border-b border-gray-200/60 p-0 flex flex-col group hover:bg-white/50 transition-colors cursor-pointer",
                      !isSelectedMonth && "bg-gray-100/40 opacity-40",
                      isSameDay(day, new Date()) && "bg-blue-50/20"
                    )}
                    onClick={() => {
                      if (window.innerWidth < 768) {
                        setSelectedDayPopup(day);
                        setIsDayPopupOpen(true);
                      } else {
                        setCurrentDate(day);
                        setViewMode("day");
                      }
                    }}
                  >
                    <div className="flex items-center justify-between px-2 pt-1 font-sans">
                      <span className={cn(
                        "text-[14px] font-semibold tracking-tighter",
                        idx % 7 === 6 ? "text-rose-400" : "text-gray-400",
                        isSameDay(day, new Date()) && "bg-purple-600 text-white rounded-full w-6 h-6 flex items-center justify-center font-bold shadow-sm"
                      )}>
                        {format(day, "d")}
                      </span>
                      {dailyEntries.length > 3 && (
                        <span className="text-[10px] text-gray-400 font-bold">+{dailyEntries.length - 3}</span>
                      )}
                    </div>

                    <div className="flex flex-col gap-[1px] mt-1 px-[1px] overflow-hidden">
                      {dailyEntries.map(entry => {
                        const preset = presets.find(p => p.id === entry.presetId);
                        return (
                          <div
                            key={entry.id}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(entry);
                            }}
                            className={cn(
                              "px-2 py-[4px] rounded-[3px] text-[10px] font-bold leading-none truncate shadow-sm flex items-center justify-between gap-1.5 border-l-[3px] border-black/10 transition-transform active:scale-95 group/entry",
                              preset?.color || "bg-gray-200"
                            )}
                          >
                            <div className="flex items-center gap-1 overflow-hidden">
                              <span className="opacity-80 flex-shrink-0 tracking-tighter font-medium hidden md:inline">{entry.startTime}</span>
                              <span className="truncate">
                                {entry.workplace || preset?.workplace ? `${entry.workplace || preset?.workplace} @ ` : ""}
                                {preset?.name}
                              </span>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id, e as any); }}
                              className="text-white/40 hover:text-white/100 hidden md:block lg:opacity-0 lg:group-hover/entry:opacity-100 transition-opacity flex-shrink-0 p-[2px]"
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
    }
  };

  return (
    <div className="flex h-screen w-full bg-white select-none overflow-hidden font-sans">
      {/* --- Main Content Area --- */}
      <div className="flex flex-col flex-1 h-full min-w-0">

        {/* Header */}
        <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-baseline gap-4">
            <h1 className="text-3xl md:text-5xl font-light text-gray-700 leading-none flex items-baseline">
              {viewMode === "year" ? (
                <span className="truncate max-w-[120px] md:max-w-none cursor-pointer hover:text-gray-900 transition-colors" onClick={() => setViewMode("year")}>
                  {format(currentDate, "yyyy年")}
                </span>
              ) : (
                <>
                  <span
                    className="truncate max-w-[120px] md:max-w-none cursor-pointer hover:text-gray-900 transition-colors"
                    onClick={() => setViewMode("month")}
                    title="月表示に切り替え"
                  >
                    {format(currentDate, "M月", { locale: ja })}
                  </span>
                  <span
                    className="text-xl md:text-4xl text-gray-400 ml-2 cursor-pointer hover:text-gray-600 transition-colors"
                    onClick={() => setViewMode("year")}
                    title="年表示に切り替え"
                  >
                    {format(currentDate, "yyyy")}
                  </span>
                </>
              )}
            </h1>
            <div className="flex items-center gap-1 ml-4 scale-75 md:scale-100 origin-left">
              <Button variant="ghost" size="icon" onClick={() => {
                if (viewMode === "year") setCurrentDate(subYears(currentDate, 1));
                else if (viewMode === "month" || viewMode === "list") setCurrentDate(subMonths(currentDate, 1));
                else if (viewMode === "week") setCurrentDate(subWeeks(currentDate, 1));
                else if (viewMode === "day") setCurrentDate(subDays(currentDate, 1));
              }}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => {
                if (viewMode === "year") setCurrentDate(addYears(currentDate, 1));
                else if (viewMode === "month" || viewMode === "list") setCurrentDate(addMonths(currentDate, 1));
                else if (viewMode === "week") setCurrentDate(addWeeks(currentDate, 1));
                else if (viewMode === "day") setCurrentDate(addDays(currentDate, 1));
              }}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon" className="h-10 w-12 bg-gray-100/50 rounded-md" onClick={() => { setFormDate(currentDate); setIsCopying(false); setIsAddEntryOpen(true); }}>
              <Plus className="h-6 w-6 text-gray-600" />
            </Button>

            {/* Filter Toggle */}
            <Button variant="ghost" size="icon" className="h-10 w-12 rounded-md" onClick={loadData} disabled={isSyncing}>
              <RefreshCw className={cn("h-5 w-5 text-gray-400", isSyncing && "animate-spin text-blue-500")} />
            </Button>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant={filterPresetIds.length > 0 ? "default" : "secondary"} size="icon" className={cn("h-10 w-12 rounded-md", filterPresetIds.length > 0 ? "bg-blue-600 text-white" : "bg-gray-100/50")}>
                  <Filter className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2 rounded-2xl shadow-2xl border-none">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest p-2">表示を絞り込む</p>
                  <button onClick={() => setFilterPresetIds([])} className={cn("w-full text-left px-3 py-2 rounded-xl text-sm font-bold flex items-center justify-between", filterPresetIds.length === 0 ? "bg-blue-50 text-blue-600" : "hover:bg-gray-50")}>
                    すべて表示 {filterPresetIds.length === 0 && <CheckSquare className="h-4 w-4" />}
                  </button>
                  {presets.map(p => {
                    const isActive = filterPresetIds.includes(p.id);
                    const pEntries = entries.filter(e => isSameMonth(new Date(e.date), currentDate) && e.presetId === p.id);
                    const pTotal = pEntries.reduce((acc, curr) => acc + curr.commuting + Math.round((calculateDuration(curr.startTime, curr.endTime) / 60) * p.rate), 0);
                    return (
                      <button
                        key={p.id}
                        onClick={() => {
                          setFilterPresetIds(prev =>
                            prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                          );
                        }}
                        className={cn("w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition-colors", isActive ? "bg-blue-50/80" : "hover:bg-gray-50")}
                      >
                        <div className="flex items-center gap-2">
                          <div className={cn("w-2 h-2 rounded-full", p.color?.split(" ")[0])} />
                          <div>
                            <p className={cn("text-xs font-bold", isActive ? "text-blue-700" : "text-gray-700")}>{p.name}</p>
                            <p className={cn("text-[10px] font-black tracking-tighter", isActive ? "text-blue-500" : "text-gray-400")}>¥{pTotal.toLocaleString()}</p>
                          </div>
                        </div>
                        {isActive && <CheckSquare className="h-4 w-4 text-blue-600" />}
                      </button>
                    );
                  })}
                </div>
              </PopoverContent>
            </Popover>

            <div className="hidden md:block">
              <Button variant="secondary" size="icon" className="h-10 w-12 bg-gray-100/50 rounded-md" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
                <Menu className="h-6 w-6 text-gray-600" />
              </Button>
            </div>
          </div>
        </header>

        {/* Mobile Filter Chips */}
        <div className="md:hidden flex items-center gap-2 overflow-x-auto px-6 py-3 border-b border-gray-100 bg-white scrollbar-hide">
          <button
            onClick={() => setFilterPresetIds([])}
            className={cn(
              "whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all",
              filterPresetIds.length === 0 ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200" : "bg-gray-100 text-gray-500"
            )}
          >
            すべて
          </button>
          {presets.map(p => {
            const isActive = filterPresetIds.includes(p.id);
            return (
              <button
                key={p.id}
                onClick={() => {
                  setFilterPresetIds(prev =>
                    prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id]
                  );
                }}
                className={cn(
                  "whitespace-nowrap px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2",
                  isActive ? "bg-zinc-900 text-white shadow-lg shadow-zinc-200" : "bg-gray-100 text-gray-500"
                )}
              >
                <div className={cn("w-2 h-2 rounded-full", p.color?.split(" ")[0])} />
                {p.name}
              </button>
            );
          })}
        </div>



        {/* Floating Draggable Hamburger for Mobile */}
        <Button
          variant="secondary"
          size="icon"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setIsDragging(false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ top: `${togglePos.y}px`, touchAction: 'none' }}
          className={cn(
            "fixed right-4 z-[60] h-14 w-14 bg-zinc-900 text-white rounded-full shadow-2xl transition-transform duration-300 md:hidden flex items-center justify-center cursor-grab active:cursor-grabbing active:scale-95",
            isSidebarOpen ? "rotate-90 bg-white text-zinc-900" : "rotate-0"
          )}
          onClick={(e) => {
            if (!isDragging) {
              setIsSidebarOpen(!isSidebarOpen);
            }
          }}
        >
          <Menu className="h-7 w-7" />
        </Button>

        {renderMainContent()}
      </div>

      {/* --- Right Navigation Sidebar --- */}
      {/* --- Overlay for Sidebar on Mobile --- */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* --- Right Navigation Sidebar --- */}
      <aside className={cn(
        "fixed inset-y-0 right-0 z-50 w-24 bg-[#444] flex flex-col items-center py-6 gap-6 text-white overflow-y-auto transition-transform duration-300 ease-in-out md:relative md:translate-x-0 md:flex md:w-[88px]",
        isSidebarOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
      )}>
        {/* Draggable Toggle Handle for Mobile & PC */}
        <button
          onClick={() => { if (!isDragging) setIsSidebarOpen(!isSidebarOpen); }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => setIsDragging(false)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          style={{ top: `${togglePos.y}px`, touchAction: 'none' }}
          className="absolute left-[-40px] w-10 h-14 bg-[#444] rounded-l-xl flex items-center justify-center md:hidden shadow-[-4px_0_10px_rgba(0,0,0,0.1)] transition-transform active:scale-95 z-50 pointer-events-auto cursor-grab active:cursor-grabbing"
        >
          {isSidebarOpen ? <ChevronRight className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>

        <button className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
          <Search className="h-7 w-7" />
          <span className="text-[11px] font-medium tracking-tighter">検索</span>
        </button>
        <button
          className={cn("flex flex-col items-center gap-1 transition-all", viewMode === "day" ? "opacity-100 scale-110" : "opacity-80 hover:opacity-100")}
          onClick={() => { setViewMode("day"); setIsSidebarOpen(false); }}
        >
          <Sun className="h-7 w-7" />
          <span className="text-[11px] font-medium tracking-tighter">日</span>
        </button>
        <button
          className={cn("flex flex-col items-center gap-1 transition-all", viewMode === "week" ? "opacity-100 scale-110" : "opacity-80 hover:opacity-100")}
          onClick={() => { setViewMode("week"); setIsSidebarOpen(false); }}
        >
          <ColumnsIcon className="h-7 w-7" />
          <span className="text-[11px] font-medium tracking-tighter">週</span>
        </button>
        <button
          className={cn("flex flex-col items-center gap-1 transition-all", viewMode === "month" ? "opacity-100 scale-110" : "opacity-80 hover:opacity-100")}
          onClick={() => { setViewMode("month"); setIsSidebarOpen(false); }}
        >
          <Grid className="h-7 w-7" />
          <span className="text-[11px] font-bold tracking-tighter">月</span>
        </button>
        <button
          className={cn("flex flex-col items-center gap-1 transition-all", viewMode === "year" ? "opacity-100 scale-110" : "opacity-80 hover:opacity-100")}
          onClick={() => { setViewMode("year"); setIsSidebarOpen(false); }}
        >
          <CalendarDays className="h-7 w-7" />
          <span className="text-[11px] font-medium tracking-tighter">年</span>
        </button>
        <button
          className={cn("flex flex-col items-center gap-1 transition-all", viewMode === "list" ? "opacity-100 scale-110" : "opacity-80 hover:opacity-100")}
          onClick={() => { setViewMode("list"); setIsSidebarOpen(false); }}
        >
          <List className="h-7 w-7" />
          <span className="text-[11px] font-medium tracking-tighter">リスト表示</span>
        </button>
        <hr className="w-8 border-gray-500 opacity-30 my-2" />
        <button
          className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity"
          onClick={() => { setCurrentDate(new Date()); setViewMode("month"); setIsSidebarOpen(false); }}
        >
          <CalendarIcon className="h-7 w-7" />
          <span className="text-[11px] font-medium tracking-tighter">本日</span>
        </button>
        <button
          className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity"
          onClick={() => { setIsPaydayAggregationOpen(true); setIsSidebarOpen(false); }}
        >
          <CircleDollarSign strokeWidth={1.5} className="h-7 w-7 text-gray-300" />
          <span className="text-[11px] font-medium tracking-tighter">支払集計</span>
        </button>
        <button className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
          <Printer className="h-7 w-7" />
          <span className="text-[11px] font-medium tracking-tighter">印刷</span>
        </button>
        <button className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
          <RefreshCw className="h-7 w-7" />
          <span className="text-[11px] font-medium tracking-tighter">同期</span>
        </button>
        <button
          className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity mt-auto"
          onClick={() => { setIsSettingsOpen(true); setIsSidebarOpen(false); }}
        >
          <Settings className="h-7 w-7" />
          <span className="text-[11px] font-medium tracking-tighter">設定</span>
        </button>
      </aside>

      {/* --- Add Entry Dialog (Day Details) --- */}
      <Dialog open={isAddEntryOpen} onOpenChange={(open) => { setIsAddEntryOpen(open); if (!open) setIsCopying(false); }}>
        <DialogContent className="sm:max-w-[450px] rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-gray-50/50 p-8 border-b border-gray-100">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black tracking-tighter text-gray-800 flex items-center gap-3">
                <span className="bg-blue-600 text-white w-12 h-12 rounded-2xl flex items-center justify-center text-xl pb-1">{format(formDate, "d")}</span>
                {format(formDate, "M月dd日 (E)", { locale: ja })}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="p-8 space-y-8 max-h-[70vh] overflow-y-auto">
            {/* Existing Records for the day */}
            <div className="space-y-3">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">登録済みの記録</p>
              {getDailyEntries(formDate).length === 0 ? (
                <p className="text-sm text-gray-300 italic pl-1">記録はありません</p>
              ) : (
                <div className="space-y-2">
                  {getDailyEntries(formDate).map(entry => {
                    const preset = presets.find(p => p.id === entry.presetId);
                    return (
                      <div key={entry.id} onClick={() => openEditModal(entry)} className="cursor-pointer flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm group transition-all hover:border-blue-200 hover:bg-gray-50">
                        <div className="flex items-center gap-4">
                          <div className={cn("w-2 h-10 rounded-full", preset?.color?.split(" ")[0])} />
                          <div>
                            <p className="font-black text-lg tracking-tighter">{entry.startTime} - {entry.endTime}</p>
                            <p className="text-xs font-bold text-gray-400">
                              {(entry.workplace || preset?.workplace) ? `${entry.workplace || preset?.workplace} @ ` : ""}{preset?.name}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFormStart(entry.startTime);
                              setFormEnd(entry.endTime);
                              setFormPresetId(entry.presetId);
                              setFormCommuting(entry.commuting);
                              setFormCommPresetId(entry.commutingPresetId || "");
                              setFormWorkplace(entry.workplace || "");
                              const start = parse(entry.startTime, "HH:mm", new Date());
                              const end = parse(entry.endTime, "HH:mm", new Date());
                              let diff = differenceInMinutes(end, start);
                              if (diff < 0) diff += 24 * 60;
                              setDurationMinutes(diff);
                              setIsCopying(true);
                            }}
                            className="rounded-full text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-all"
                          >
                            <Copy className="h-5 w-5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => deleteEntry(entry.id, e as any)}
                            className="rounded-full text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                          >
                            <Trash2 className="h-5 w-5" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <hr className="border-gray-100" />

            {/* New Entry Form - always new entry mode */}
            <div className={cn("space-y-6 p-6 rounded-[1.5rem] border-2 transition-all", isCopying ? "bg-blue-50/50 border-blue-200 border-dashed" : "border-transparent")}>
              <div className="flex items-center justify-between pl-1">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{isCopying ? "コピー中..." : "新規登録"}</p>
                {isCopying && <Button variant="ghost" size="sm" onClick={() => setIsCopying(false)} className="h-6 text-[10px] text-blue-500 font-bold hover:bg-blue-100">キャンセル</Button>}
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">日付</Label>
                <div className="relative">
                  <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                  <input
                    type="date"
                    value={format(formDate, "yyyy-MM-dd")}
                    onChange={(e) => setFormDate(new Date(e.target.value))}
                    className="w-full rounded-2xl h-14 text-xl font-black bg-gray-50 border-none shadow-inner pl-12 pr-4 focus:ring-2 focus:ring-blue-500 outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-gray-500 ml-1">開始時間</Label>
                  <input type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)} className="w-full rounded-2xl h-14 text-xl font-black bg-gray-50 border-none shadow-inner px-4 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-gray-500 ml-1">終了時間</Label>
                  <input type="time" value={formEnd} onChange={(e) => handleEndTimeChange(e.target.value)} className="w-full rounded-2xl h-14 text-xl font-black bg-gray-50 border-none shadow-inner px-4 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">勤務時間 (分を入力して終了時刻を自動設定)</Label>
                <div className="flex gap-2">
                  <Input
                    type="number"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(Number(e.target.value))}
                    className="h-14 rounded-2xl text-xl font-black bg-gray-50 border-none shadow-inner"
                    placeholder="例: 180"
                  />
                  <div className="flex items-center text-gray-400 font-bold pr-2">分</div>
                </div>
                <div className="flex gap-2 flex-wrap pt-1">
                  {[30, 60, 90, 120, 180, 240, 300, 360].map(m => (
                    <Button key={m} variant="outline" size="sm" onClick={() => setDurationMinutes(m)} className="rounded-full text-[10px] h-7 px-3">
                      {m >= 60 ? `${m / 60}h` : `${m}m`}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">勤務先 / 備考 (@の後に表示されます)</Label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                  <Input
                    value={formWorkplace}
                    onChange={(e) => setFormWorkplace(e.target.value)}
                    placeholder="例: 文京区, 本社など"
                    className="pl-12 h-14 rounded-2xl text-xl font-black bg-gray-50 border-none shadow-inner"
                    list="workplace-history"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">勤務先 / 時給プリセット</Label>
                <Select value={formPresetId} onValueChange={(val) => {
                  setFormPresetId(val);
                  const p = presets.find(x => x.id === val);
                  if (p) {
                    if (!formWorkplace) setFormWorkplace(p.workplace || "");
                    if (p.linkedCommutingPresetId) {
                      setFormCommPresetId(p.linkedCommutingPresetId);
                      const cp = commPresets.find(c => c.id === p.linkedCommutingPresetId);
                      if (cp) setFormCommuting(cp.amount);
                    }
                  }
                }}>
                  <SelectTrigger className="h-14 rounded-2xl text-lg font-bold bg-gray-50 border-none shadow-inner px-5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-none shadow-2xl">
                    {presets.map(p => (
                      <SelectItem key={p.id} value={p.id} className="py-3 rounded-xl">
                        <span className="font-bold">{p.name}</span>
                        <span className="ml-2 text-blue-600 font-black">¥{p.rate.toLocaleString()}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">交通費プリセット</Label>
                <Select value={formCommPresetId} onValueChange={(val) => {
                  setFormCommPresetId(val);
                  const p = commPresets.find(cp => cp.id === val);
                  if (p) setFormCommuting(p.amount);
                }}>
                  <SelectTrigger className="h-14 rounded-2xl text-lg font-bold bg-gray-50 border-none shadow-inner px-5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="rounded-2xl border-none shadow-2xl">
                    {commPresets.map(p => (
                      <SelectItem key={p.id} value={p.id} className="py-3 rounded-xl">
                        <span className="font-bold">{p.name}</span>
                        <span className="ml-2 text-emerald-600 font-black">¥{p.amount.toLocaleString()}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">交通費 (調整/手入力)</Label>
                <div className="relative">
                  <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                  <Input type="number" value={formCommuting} onChange={(e) => setFormCommuting(Number(e.target.value))} className="pl-12 h-14 rounded-2xl text-xl font-black bg-gray-50 border-none shadow-inner" />
                </div>
              </div>
              <Button onClick={() => {
                const newEntry: WorkEntry = {
                  id: Math.random().toString(36).substr(2, 9),
                  date: formDate.toISOString(),
                  startTime: formStart,
                  endTime: formEnd,
                  presetId: formPresetId,
                  commuting: formCommuting,
                  commutingPresetId: formCommPresetId,
                  workplace: formWorkplace
                };
                setEntries(prev => [...prev, newEntry]);
                updateWorkplaceHistory(formWorkplace);
                setIsAddEntryOpen(false);
                setIsCopying(false);
              }} className="w-full h-16 bg-zinc-900 hover:bg-black text-white rounded-[1.25rem] font-black text-xl shadow-xl transition-all active:scale-95">
                {isCopying ? "記録を貼り付け（追加）" : "記録を追加"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- Edit Entry Dialog (別ダイアログ) --- */}
      <Dialog open={isEditEntryOpen} onOpenChange={(open) => { setIsEditEntryOpen(open); if (!open) setEditingEntry(null); }}>
        <DialogContent className="sm:max-w-[450px] rounded-[2rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-blue-600 p-8 border-b border-blue-500">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black tracking-tighter text-white flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="bg-white/20 text-white w-12 h-12 rounded-2xl flex items-center justify-center text-xl pb-1">{editingEntry ? format(new Date(editingEntry.date), "d") : ""}</span>
                  {editingEntry ? format(new Date(editingEntry.date), "M月dd日 (E)", { locale: ja }) : ""}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    if (!editingEntry) return;
                    setFormDate(editFormDate);
                    setFormStart(editFormStart);
                    setFormEnd(editFormEnd);
                    setFormPresetId(editFormPresetId);
                    setFormCommuting(editFormCommuting);
                    setFormCommPresetId(editFormCommPresetId);
                    setFormWorkplace(editFormWorkplace);
                    setDurationMinutes(editDurationMinutes);
                    setIsCopying(true);
                    setIsEditEntryOpen(false);
                    setTimeout(() => setIsAddEntryOpen(true), 200);
                  }}
                  className="h-10 w-10 rounded-full bg-white/10 hover:bg-white/20 text-white transition-all flex-shrink-0"
                  title="この記録をコピー"
                >
                  <Copy className="h-5 w-5" />
                </Button>
              </DialogTitle>
              <p className="text-blue-200 text-xs font-bold mt-1 uppercase tracking-widest">記録の編集</p>
            </DialogHeader>
          </div>

          <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-500 ml-1">日付</Label>
              <div className="relative">
                <CalendarIcon className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                <input
                  type="date"
                  value={format(editFormDate, "yyyy-MM-dd")}
                  onChange={(e) => setEditFormDate(new Date(e.target.value))}
                  className="w-full rounded-2xl h-14 text-xl font-black bg-gray-50 border-none shadow-inner pl-12 pr-4 focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">開始時間</Label>
                <input type="time" value={editFormStart} onChange={(e) => setEditFormStart(e.target.value)} className="w-full rounded-2xl h-14 text-xl font-black bg-gray-50 border-none shadow-inner px-4 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">終了時間</Label>
                <input type="time" value={editFormEnd} onChange={(e) => handleEditEndTimeChange(e.target.value)} className="w-full rounded-2xl h-14 text-xl font-black bg-gray-50 border-none shadow-inner px-4 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-500 ml-1">勤務時間 (分)</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  value={editDurationMinutes}
                  onChange={(e) => setEditDurationMinutes(Number(e.target.value))}
                  className="h-14 rounded-2xl text-xl font-black bg-gray-50 border-none shadow-inner"
                />
                <div className="flex items-center text-gray-400 font-bold pr-2">分</div>
              </div>
              <div className="flex gap-2 flex-wrap pt-1">
                {[30, 60, 90, 120, 180, 240, 300, 360].map(m => (
                  <Button key={m} variant="outline" size="sm" onClick={() => setEditDurationMinutes(m)} className="rounded-full text-[10px] h-7 px-3">
                    {m >= 60 ? `${m / 60}h` : `${m}m`}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-500 ml-1">勤務先 / 備考</Label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                <Input
                  value={editFormWorkplace}
                  onChange={(e) => setEditFormWorkplace(e.target.value)}
                  placeholder="例: 文京区, 本社など"
                  className="pl-12 h-14 rounded-2xl text-xl font-black bg-gray-50 border-none shadow-inner"
                  list="workplace-history"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-500 ml-1">勤務先 / 時給プリセット</Label>
              <Select value={editFormPresetId} onValueChange={(val) => {
                setEditFormPresetId(val);
                const p = presets.find(x => x.id === val);
                if (p) {
                  if (!editFormWorkplace) setEditFormWorkplace(p.workplace || "");
                  if (p.linkedCommutingPresetId) {
                    setEditFormCommPresetId(p.linkedCommutingPresetId);
                    const cp = commPresets.find(c => c.id === p.linkedCommutingPresetId);
                    if (cp) setEditFormCommuting(cp.amount);
                  }
                }
              }}>
                <SelectTrigger className="h-14 rounded-2xl text-lg font-bold bg-gray-50 border-none shadow-inner px-5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none shadow-2xl">
                  {presets.map(p => (
                    <SelectItem key={p.id} value={p.id} className="py-3 rounded-xl">
                      <span className="font-bold">{p.name}</span>
                      <span className="ml-2 text-blue-600 font-black">¥{p.rate.toLocaleString()}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-500 ml-1">交通費プリセット</Label>
              <Select value={editFormCommPresetId} onValueChange={(val) => {
                setEditFormCommPresetId(val);
                const p = commPresets.find(cp => cp.id === val);
                if (p) setEditFormCommuting(p.amount);
              }}>
                <SelectTrigger className="h-14 rounded-2xl text-lg font-bold bg-gray-50 border-none shadow-inner px-5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="rounded-2xl border-none shadow-2xl">
                  {commPresets.map(p => (
                    <SelectItem key={p.id} value={p.id} className="py-3 rounded-xl">
                      <span className="font-bold">{p.name}</span>
                      <span className="ml-2 text-emerald-600 font-black">¥{p.amount.toLocaleString()}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-gray-500 ml-1">交通費 (調整/手入力)</Label>
              <div className="relative">
                <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-300" />
                <Input type="number" value={editFormCommuting} onChange={(e) => setEditFormCommuting(Number(e.target.value))} className="pl-12 h-14 rounded-2xl text-xl font-black bg-gray-50 border-none shadow-inner" />
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  if (editingEntry) deleteEntry(editingEntry.id, { stopPropagation: () => { } } as any);
                  setIsEditEntryOpen(false);
                }}
                className="flex-1 h-16 rounded-[1.25rem] font-black text-xl border-2 border-red-200 text-red-500 hover:bg-red-50 px-0"
              >
                削除
              </Button>
              <Button
                onClick={() => {
                  if (!editingEntry) return;
                  setEntries(prev => prev.map(ent => ent.id === editingEntry.id ? {
                    ...ent,
                    date: editFormDate.toISOString(),
                    startTime: editFormStart,
                    endTime: editFormEnd,
                    presetId: editFormPresetId,
                    commuting: editFormCommuting,
                    commutingPresetId: editFormCommPresetId,
                    workplace: editFormWorkplace
                  } : ent));
                  updateWorkplaceHistory(editFormWorkplace);
                  setIsEditEntryOpen(false);
                  setEditingEntry(null);
                }}
                className="flex-[2] h-16 bg-blue-600 hover:bg-blue-700 text-white rounded-[1.25rem] font-black text-xl shadow-xl transition-all active:scale-95 px-0"
              >
                記録を更新
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- Settings Dialog --- */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl">
          <div className="bg-gray-100 p-8 border-b border-gray-200">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black tracking-tighter text-gray-800">アプリ設定</DialogTitle>
            </DialogHeader>
          </div>
          <div className="p-8 grid grid-cols-2 gap-8 max-h-[70vh] overflow-y-auto">
            {/* Hourly Rate Presets */}
            <div className="space-y-4">
              <p className="text-sm font-black text-blue-600 uppercase tracking-widest pl-1">時給設定</p>
              <div className="space-y-2">
                {presets.map(p => (
                  <div key={p.id} className="flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm gap-2">
                    <div className="flex items-center justify-between">
                      <input
                        className="font-bold text-sm tracking-tight bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-100 rounded px-2 py-1 w-full transition-all"
                        value={p.name}
                        onChange={(e) => setPresets(presets.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))}
                        placeholder="勤務先名"
                      />
                      <Button variant="ghost" size="icon" onClick={() => setPresets(presets.filter(x => x.id !== p.id))} className="text-gray-200 hover:text-red-500 flex-shrink-0"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <div className="flex items-center text-blue-600 font-extrabold gap-1 px-2">
                      <span className="text-sm">¥</span>
                      <input
                        type="number"
                        className="bg-transparent border-none outline-none focus:ring-2 focus:ring-blue-100 rounded px-1 w-28 text-lg"
                        value={p.rate}
                        onChange={(e) => setPresets(presets.map(x => x.id === p.id ? { ...x, rate: Number(e.target.value) } : x))}
                      />
                    </div>
                    <div className="px-2 pt-3 pb-1 border-t border-gray-50 mt-2 space-y-4">
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] font-bold text-gray-400">表示カラー</Label>
                        <div className="flex gap-1.5 flex-wrap justify-end max-w-[170px]">
                          {PRESET_COLORS.map(color => (
                            <button
                              key={color}
                              onClick={() => setPresets(presets.map(x => x.id === p.id ? { ...x, color } : x))}
                              className={cn("w-5 h-5 rounded-full border-2 transition-all", color.split(" ")[0], p.color === color ? "border-black scale-110 shadow-sm" : "border-transparent opacity-30 hover:opacity-100")}
                            />
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-gray-400">連動する交通費 (自動入力)</Label>
                        <Select value={p.linkedCommutingPresetId || "none"} onValueChange={(val) => {
                          setPresets(presets.map(x => x.id === p.id ? { ...x, linkedCommutingPresetId: val === "none" ? undefined : val } : x));
                        }}>
                          <SelectTrigger className="h-9 rounded-xl text-xs font-bold bg-gray-50 border-none px-3">
                            <SelectValue placeholder="連動なし" />
                          </SelectTrigger>
                          <SelectContent className="rounded-xl border-none shadow-xl">
                            <SelectItem value="none" className="text-xs text-gray-400">連動なし</SelectItem>
                            {commPresets.map(cp => (
                              <SelectItem key={cp.id} value={cp.id} className="text-xs">
                                {cp.name} (¥{cp.amount})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px] font-bold text-gray-400">締日・支払日</Label>
                        <div className="flex gap-1 items-center">
                          <Select value={p.closingDay?.toString() || "31"} onValueChange={(val) => setPresets(presets.map(x => x.id === p.id ? { ...x, closingDay: parseInt(val) } : x))}>
                            <SelectTrigger className="h-9 rounded-xl text-[10px] font-bold bg-gray-50 border-none px-2 flex-1">
                              <SelectValue placeholder="締日" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-none shadow-xl min-w-[80px]">
                              {[5, 10, 15, 20, 25, 28, 31].map(d => (
                                <SelectItem key={d} value={d.toString()} className="text-[10px]">{d === 31 ? "末日締め" : `${d}日締め`}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Select value={p.paymentMonthOffset?.toString() || "1"} onValueChange={(val) => setPresets(presets.map(x => x.id === p.id ? { ...x, paymentMonthOffset: parseInt(val) } : x))}>
                            <SelectTrigger className="h-9 rounded-xl text-[10px] font-bold bg-gray-50 border-none px-2 w-[55px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-none shadow-xl min-w-[55px]">
                              <SelectItem value="0" className="text-[10px]">当月</SelectItem>
                              <SelectItem value="1" className="text-[10px]">翌月</SelectItem>
                              <SelectItem value="2" className="text-[10px]">翌々月</SelectItem>
                            </SelectContent>
                          </Select>
                          <Select value={p.paymentDay?.toString() || "31"} onValueChange={(val) => setPresets(presets.map(x => x.id === p.id ? { ...x, paymentDay: parseInt(val) } : x))}>
                            <SelectTrigger className="h-9 rounded-xl text-[10px] font-bold bg-gray-50 border-none px-2 flex-1">
                              <SelectValue placeholder="支払日" />
                            </SelectTrigger>
                            <SelectContent className="rounded-xl border-none shadow-xl min-w-[80px]">
                              {[5, 10, 15, 20, 25, 28, 31].map(d => (
                                <SelectItem key={d} value={d.toString()} className="text-[10px]">{d === 31 ? "末日払い" : `${d}払い`}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="勤務先名" id="newPresetName" className="rounded-xl h-12" />
                <Input type="number" placeholder="時給額" id="newPresetRate" className="rounded-xl h-12" />
              </div>
              <Button className="w-full h-12 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold" onClick={() => {
                const n = (document.getElementById('newPresetName') as HTMLInputElement).value;
                const r = (document.getElementById('newPresetRate') as HTMLInputElement).value;
                if (!n || !r) return;
                setPresets([...presets, {
                  id: Math.random().toString(),
                  name: n,
                  rate: Number(r),
                  color: PRESET_COLORS[presets.length % PRESET_COLORS.length]
                }]);
                (document.getElementById('newPresetName') as HTMLInputElement).value = "";
                (document.getElementById('newPresetRate') as HTMLInputElement).value = "";
              }}>
                時給設定を追加
              </Button>
            </div>

            {/* Commuting Presets */}
            <div className="space-y-4">
              <p className="text-sm font-black text-emerald-600 uppercase tracking-widest pl-1">交通費設定</p>
              <div className="space-y-2">
                {commPresets.map(p => (
                  <div key={p.id} className="flex flex-col p-4 bg-white rounded-2xl border border-gray-100 shadow-sm gap-2">
                    <div className="flex items-center justify-between">
                      <input
                        className="font-bold text-sm tracking-tight bg-transparent border-none outline-none focus:ring-2 focus:ring-emerald-100 rounded px-2 py-1 w-full transition-all"
                        value={p.name}
                        onChange={(e) => setCommPresets(commPresets.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))}
                        placeholder="名称"
                      />
                      <Button variant="ghost" size="icon" onClick={() => setCommPresets(commPresets.filter(x => x.id !== p.id))} className="text-gray-200 hover:text-red-500 flex-shrink-0"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                    <div className="flex items-center text-emerald-600 font-extrabold gap-1 px-2">
                      <span className="text-sm">¥</span>
                      <input
                        type="number"
                        className="bg-transparent border-none outline-none focus:ring-2 focus:ring-emerald-100 rounded px-1 w-28 text-lg"
                        value={p.amount}
                        onChange={(e) => setCommPresets(commPresets.map(x => x.id === p.id ? { ...x, amount: Number(e.target.value) } : x))}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input placeholder="名称" id="newCommName" className="rounded-xl h-12" />
                <Input type="number" placeholder="金額" id="newCommAmt" className="rounded-xl h-12" />
              </div>
              <Button className="w-full h-12 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold" onClick={() => {
                const n = (document.getElementById('newCommName') as HTMLInputElement).value;
                const a = (document.getElementById('newCommAmt') as HTMLInputElement).value;
                if (!n || !a) return;
                setCommPresets([...commPresets, { id: Math.random().toString(), name: n, amount: Number(a) }]);
                (document.getElementById('newCommName') as HTMLInputElement).value = "";
                (document.getElementById('newCommAmt') as HTMLInputElement).value = "";
              }}>
                交通費を追加
              </Button>
            </div>
          </div>
          <div className="p-8 bg-gray-50 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400 font-medium">データはブラウザに自動保存されます</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* --- Payday Aggregation Dialog --- */}
      <Dialog open={isPaydayAggregationOpen} onOpenChange={setIsPaydayAggregationOpen}>
        <DialogContent className="sm:max-w-2xl rounded-[2.5rem] p-0 overflow-hidden border-none shadow-2xl bg-gray-50/50">
          <div className="bg-zinc-900 p-8 border-b border-zinc-800">
            <DialogHeader>
              <DialogTitle className="text-3xl font-black tracking-tighter text-white flex items-center gap-3">
                <CircleDollarSign strokeWidth={1.5} className="w-10 h-10 text-zinc-400" />
                支払日ごとの集計
              </DialogTitle>
              <p className="text-zinc-500 text-xs font-bold mt-2 uppercase tracking-widest pl-1">設定に基づいた見込み額</p>
            </DialogHeader>
          </div>
          <div className="p-8 space-y-4 max-h-[70vh] overflow-y-auto">
            {paydayAggregations.filter(agg => agg.name !== "未設定").length === 0 ? (
              <div className="py-20 text-center border-4 border-dashed border-gray-200 rounded-[3rem]">
                <p className="text-lg font-bold text-gray-400">集計データがありません</p>
                <p className="text-xs text-gray-400 mt-2">設定から締日・支払日を設定してください。</p>
              </div>
            ) : (
              paydayAggregations.filter(agg => agg.name !== "未設定").map(agg => (
                <div key={agg.name} className="bg-white p-6 rounded-[2rem] border border-gray-100/50 shadow-sm flex items-center justify-between hover:shadow-md transition-shadow">
                  <div>
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">支払日</p>
                    <p className="text-2xl font-black text-gray-800 tracking-tighter">{agg.name}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">見込み額</p>
                    <p className="text-4xl font-black text-zinc-900 tracking-tighter">¥{agg.total.toLocaleString()}</p>
                    <p className="text-[10px] text-gray-400 font-bold tracking-tighter mt-1">給与: ¥{agg.salary.toLocaleString()} + 交通費: ¥{agg.commuting.toLocaleString()}</p>
                  </div>
                </div>
              ))
            )}

            {/* 未設定分の集計がある場合は表示 */}
            {paydayAggregations.find(agg => agg.name === "未設定") && (
              <div className="mt-8 pt-8 border-t border-gray-200/50">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-4 pl-2">締日・支払日が未設定の記録</p>
                {(() => {
                  const unassigned = paydayAggregations.find(agg => agg.name === "未設定");
                  return unassigned ? (
                    <div className="bg-gray-100/50 p-6 rounded-[2rem] border border-gray-200/50 flex items-center justify-between opacity-80">
                      <div>
                        <p className="text-lg font-black text-gray-500 tracking-tighter">未設定</p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-black text-gray-600 tracking-tighter">¥{unassigned.total.toLocaleString()}</p>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <datalist id="workplace-history">
        {workplaceHistory.map((item, index) => (
          <option key={index} value={item} />
        ))}
      </datalist>

      <style jsx global>{`
        body {
          background-image: radial-gradient(circle at top right, rgba(239, 68, 68, 0.05), transparent 400px),
                            radial-gradient(circle at bottom left, rgba(59, 130, 246, 0.05), transparent 400px);
        }
        /* Custom scrollbar */
        *::-webkit-scrollbar { width: 6px; height: 6px; }
        *::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        *::-webkit-scrollbar-track { background: transparent; }
      `}</style>

      {/* --- Mobile Day Popup --- */}
      <Dialog open={isDayPopupOpen} onOpenChange={setIsDayPopupOpen}>
        <DialogContent className="max-w-[90%] w-[360px] max-h-[85vh] overflow-y-auto rounded-3xl p-6 bg-white border-0 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black text-gray-800">
              {selectedDayPopup && format(selectedDayPopup, "yyyy年M月d日 (E)", { locale: ja })}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-4 space-y-3">
            {selectedDayPopup && getDailyEntries(selectedDayPopup).length === 0 ? (
              <p className="text-gray-400 font-bold text-center py-4">記録がありません</p>
            ) : (
              selectedDayPopup && getDailyEntries(selectedDayPopup).map(entry => {
                const preset = presets.find(p => p.id === entry.presetId);
                const minutes = calculateDuration(entry.startTime, entry.endTime);
                return (
                  <div
                    key={entry.id}
                    className="p-4 rounded-2xl bg-gray-50 flex items-center gap-4 cursor-pointer hover:bg-gray-100 transition-colors"
                    onClick={() => {
                      setIsDayPopupOpen(false);
                      openEditModal(entry);
                    }}
                  >
                    <div className={cn("w-2 h-10 rounded-full flex-shrink-0", preset?.color?.split(" ")[0])} />
                    <div className="flex-1 overflow-hidden">
                      <p className="font-black text-gray-800 text-sm tracking-tighter">{entry.startTime} - {entry.endTime}</p>
                      <p className="text-[10px] font-bold text-gray-400 truncate mt-0.5">
                        {entry.workplace || preset?.workplace ? `${entry.workplace || preset?.workplace} @ ` : ""}
                        {preset?.name}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-blue-600 text-sm">¥{(Math.round((minutes / 60) * (preset?.rate || 0)) + entry.commuting).toLocaleString()}</p>
                    </div>
                  </div>
                );
              })
            )}

            <div className="pt-4 space-y-2 border-t border-gray-50">
              <Button
                className="w-full h-12 rounded-xl bg-gray-900 text-white font-bold inline-flex items-center justify-center p-0"
                onClick={() => {
                  if (selectedDayPopup) {
                    setFormDate(selectedDayPopup);
                    setCurrentDate(selectedDayPopup);
                    setIsDayPopupOpen(false);
                    // Slight delay to allow popup to close before opening the form
                    setTimeout(() => { setIsCopying(false); setIsAddEntryOpen(true); }, 150);
                  }
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                新しい記録を追加
              </Button>
              <Button
                variant="outline"
                className="w-full h-12 rounded-xl font-bold bg-white text-gray-600 border-gray-200"
                onClick={() => {
                  if (selectedDayPopup) {
                    setCurrentDate(selectedDayPopup);
                    setViewMode("day");
                    setIsDayPopupOpen(false);
                  }
                }}
              >
                一日の詳細を確認
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Trash2(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 6h18" />
      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
      <line x1="10" x2="10" y1="11" y2="17" />
      <line x1="14" x2="14" y1="11" y2="17" />
    </svg>
  );
}
