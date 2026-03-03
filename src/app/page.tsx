"use client";

import React, { useState, useMemo, useEffect } from "react";
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
  parse
} from "date-fns";
import { ja } from "date-fns/locale";
import {
  Plus, Search, Calendar as CalendarIcon, Grid, List,
  Users, Printer, RefreshCw, Settings, Menu, Filter,
  CheckSquare, ChevronLeft, ChevronRight, Calculator,
  ColumnsIcon, CalendarDays, Sun, MapPin, Copy
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

export default function CalendarApp() {
  // --- State ---
  const [currentDate, setCurrentDate] = useState(new Date(2026, 2, 3)); // March 2026 as per screenshot
  const [viewMode, setViewMode] = useState<"day" | "week" | "month" | "year" | "list">("month");
  const [entries, setEntries] = useState<WorkEntry[]>([]);
  const [filterPresetId, setFilterPresetId] = useState<string>("all");
  const [presets, setPresets] = useState<HourlyRatePreset[]>([
    { id: "1", name: "基本時給", rate: 3000, color: PRESET_COLORS[0] },
    { id: "2", name: "品川学藝高校", rate: 5000, color: PRESET_COLORS[1] },
    { id: "3", name: "戸塚", rate: 4500, color: PRESET_COLORS[4] },
  ]);

  // --- Derived Data ---
  const filteredEntries = useMemo(() => {
    let base = entries;
    if (viewMode === "list" || viewMode === "month" || viewMode === "week") {
      // 基本的には currentDate の月に限定（リスト表示用）
      base = entries.filter(e => isSameMonth(new Date(e.date), currentDate));
    }
    if (filterPresetId !== "all") {
      base = base.filter(e => e.presetId === filterPresetId);
    }
    return base.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [entries, currentDate, filterPresetId, viewMode]);

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

  // Form states
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formStart, setFormStart] = useState("09:00");
  const [formEnd, setFormEnd] = useState("12:00");
  const [formPresetId, setFormPresetId] = useState("1");
  const [formCommPresetId, setFormCommPresetId] = useState<string>("c2");
  const [formCommuting, setFormCommuting] = useState(1200);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [togglePos, setTogglePos] = useState({ y: 16 });
  const [isDragging, setIsDragging] = useState(false);

  // Initialize toggle position after mount to avoid SSR issues
  useEffect(() => {
    setTogglePos({ y: window.innerHeight / 2 - 24 });
  }, []);

  // Drag logic for mobile toggle
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    const newY = Math.max(0, Math.min(window.innerHeight - 48, touch.clientY - 24));
    setTogglePos({ y: newY });
  };

  // --- Logic ---
  useEffect(() => {
    const saved = localStorage.getItem("cal-entries");
    const savedPresets = localStorage.getItem("cal-presets");
    const savedCommPresets = localStorage.getItem("cal-comm-presets");
    if (saved) setEntries(JSON.parse(saved));
    if (savedPresets) setPresets(JSON.parse(savedPresets));
    if (savedCommPresets) setCommPresets(JSON.parse(savedCommPresets));
  }, []);

  useEffect(() => {
    localStorage.setItem("cal-entries", JSON.stringify(entries));
    localStorage.setItem("cal-presets", JSON.stringify(presets));
    localStorage.setItem("cal-comm-presets", JSON.stringify(commPresets));
  }, [entries, presets, commPresets]);

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday start
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const addEntry = () => {
    const newEntry: WorkEntry = {
      id: Math.random().toString(36).substr(2, 9),
      date: formDate.toISOString(),
      startTime: formStart,
      endTime: formEnd,
      presetId: formPresetId,
      commuting: formCommuting,
    };
    setEntries([...entries, newEntry]);
    setIsAddEntryOpen(false);
  };

  const deleteEntry = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEntries(entries.filter(ent => ent.id !== id));
  };

  // --- Render Helpers ---
  const getDailyEntries = (day: Date) => {
    return entries.filter(ent => isSameDay(new Date(ent.date), day));
  };

  // 勤務時間の計算
  const calculateDuration = (start: string, end: string) => {
    try {
      const startTimeDate = parse(start, "HH:mm", new Date());
      const endTimeDate = parse(end, "HH:mm", new Date());
      let diff = differenceInMinutes(endTimeDate, startTimeDate);
      if (diff < 0) diff += 24 * 60;
      return diff;
    } catch {
      return 0;
    }
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
                  <div key={entry.id} className="flex items-center justify-between p-8 bg-gray-50 rounded-[2.5rem] border border-gray-100 group">
                    <div className="flex items-center gap-6">
                      <div className={cn("w-4 h-16 rounded-full", preset?.color.split(" ")[0])} />
                      <div>
                        <p className="text-3xl font-black tracking-tighter">{entry.startTime} - {entry.endTime} <span className="text-gray-300 ml-2">({(minutes / 60).toFixed(1)}h)</span></p>
                        <p className="text-lg font-bold text-gray-400">{preset?.name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-3xl font-black text-blue-600">¥{(Math.round((minutes / 60) * (preset?.rate || 0)) + entry.commuting).toLocaleString()}</p>
                      <Button variant="ghost" size="sm" onClick={(e) => deleteEntry(entry.id, e as any)} className="text-red-400 opacity-0 group-hover:opacity-100">記録を削除</Button>
                    </div>
                  </div>
                );
              })}
              <Button variant="outline" className="w-full h-24 rounded-[2.5rem] border-dashed border-2 text-gray-400 text-xl font-bold" onClick={() => setIsAddEntryOpen(true)}>
                <Plus className="mr-2" /> 新しい勤務を追加
              </Button>
            </div>
          </div>
        );

      case "week":
        const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });
        const weekDays = eachDayOfInterval({ start: weekStart, end: addDays(weekStart, 6) });
        return (
          <div className="flex-1 overflow-y-auto p-8 bg-gray-50/20 space-y-6">
            <div className="grid grid-cols-7 gap-4 h-full">
              {weekDays.map((day, i) => {
                const dailyEntries = getDailyEntries(day);
                return (
                  <div key={i} className="flex flex-col gap-4">
                    <div className={cn(
                      "p-4 rounded-2xl text-center shadow-sm border",
                      isSameDay(day, new Date()) ? "bg-purple-600 text-white border-purple-400" : "bg-white text-gray-800 border-gray-100"
                    )}>
                      <p className="text-xs font-bold uppercase opacity-70">{["月", "火", "水", "木", "金", "土", "日"][i] || format(day, "eee", { locale: ja })}</p>
                      <p className="text-2xl font-black">{format(day, "d")}</p>
                    </div>
                    <div className="flex-1 space-y-3">
                      {dailyEntries.map(entry => {
                        const preset = presets.find(p => p.id === entry.presetId);
                        return (
                          <div key={entry.id} className={cn("p-3 rounded-xl border-l-[4px] shadow-sm bg-white border-gray-100", preset?.color.replace("bg-", "border-"))}>
                            <p className="text-[10px] font-black text-gray-400">{entry.startTime} - {entry.endTime}</p>
                            <p className="text-xs font-bold truncate">{preset?.name}</p>
                            <p className="text-[10px] font-black text-blue-600">¥{(Math.round((calculateDuration(entry.startTime, entry.endTime) / 60) * (preset?.rate || 0)) + entry.commuting).toLocaleString()}</p>
                          </div>
                        );
                      })}
                      <Button variant="ghost" className="w-full h-12 border-2 border-dashed border-gray-200 rounded-xl text-gray-300" onClick={() => { setFormDate(day); setIsAddEntryOpen(true); }}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );

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
                          <tr key={entry.id} className="hover:bg-gray-50/50 transition-colors group">
                            <td className="px-8 py-6">
                              <p className="text-lg font-black text-gray-800">{format(new Date(entry.date), "dd (E)", { locale: ja })}</p>
                            </td>
                            <td className="px-8 py-6">
                              <div className="flex items-center gap-3">
                                <div className={cn("w-3 h-3 rounded-full", preset?.color.split(" ")[0])} />
                                <span className="font-bold text-gray-600">{preset?.name}</span>
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
                      setFormDate(day);
                      setCurrentDate(day);
                      setViewMode("day");
                      setIsAddEntryOpen(true);
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
                            className={cn(
                              "px-2 py-[2px] rounded-[2px] text-[10px] font-bold leading-none truncate shadow-sm flex items-center gap-1.5 border-l-[3px] border-black/10",
                              preset?.color || "bg-gray-200"
                            )}
                          >
                            <span className="opacity-80 flex-shrink-0 tracking-tighter font-medium">{entry.startTime}</span>
                            <span className="truncate">{preset?.name}</span>
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
              <span className="truncate max-w-[120px] md:max-w-none">
                {viewMode === "year" ? format(currentDate, "yyyy年") : format(currentDate, "M月", { locale: ja })}
              </span>
              {viewMode !== "year" && <span className="text-xl md:text-4xl text-gray-400 ml-2">{format(currentDate, "yyyy")}</span>}
            </h1>
            <div className="flex items-center gap-1 ml-4 scale-75 md:scale-100 origin-left">
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(viewMode === "year" ? subYears(currentDate, 1) : subMonths(currentDate, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" onClick={() => setCurrentDate(viewMode === "year" ? addYears(currentDate, 1) : addMonths(currentDate, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="secondary" size="icon" className="h-10 w-12 bg-gray-100/50 rounded-md" onClick={() => setIsAddEntryOpen(true)}>
              <Plus className="h-6 w-6 text-gray-600" />
            </Button>
            <Button variant="secondary" size="icon" className="h-10 w-12 bg-gray-100/50 rounded-md">
              <CheckSquare className="h-5 w-5 text-gray-600" />
            </Button>

            {/* Filter Toggle */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={filterPresetId !== "all" ? "default" : "secondary"} size="icon" className={cn("h-10 w-12 rounded-md", filterPresetId !== "all" ? "bg-blue-600 text-white" : "bg-gray-100/50")}>
                  <Filter className="h-5 w-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-2 rounded-2xl shadow-2xl border-none">
                <div className="space-y-1">
                  <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest p-2">表示を絞り込む</p>
                  <button onClick={() => setFilterPresetId("all")} className={cn("w-full text-left px-3 py-2 rounded-xl text-sm font-bold flex items-center justify-between", filterPresetId === "all" ? "bg-blue-50 text-blue-600" : "hover:bg-gray-50")}>
                    すべて表示 {filterPresetId === "all" && <CheckSquare className="h-4 w-4" />}
                  </button>
                  {presets.map(p => (
                    <button key={p.id} onClick={() => setFilterPresetId(p.id)} className={cn("w-full text-left px-3 py-2 rounded-xl text-sm font-bold flex items-center justify-between", filterPresetId === p.id ? "bg-blue-50 text-blue-600" : "hover:bg-gray-50")}>
                      <div className="flex items-center gap-2">
                        <div className={cn("w-2 h-2 rounded-full", p.color.split(" ")[0])} />
                        {p.name}
                      </div>
                      {filterPresetId === p.id && <CheckSquare className="h-4 w-4" />}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>

            <div className="hidden md:block">
              <Button variant="secondary" size="icon" className="h-10 w-12 bg-gray-100/50 rounded-md">
                <Menu className="h-6 w-6 text-gray-600" />
              </Button>
            </div>
          </div>
        </header>

        {/* Floating Toggle Button for Mobile */}
        <Button
          variant="secondary"
          size="icon"
          className={cn(
            "fixed top-4 right-4 z-[60] h-12 w-12 bg-zinc-800 text-white rounded-full shadow-2xl transition-all duration-300 md:hidden flex items-center justify-center",
            isSidebarOpen ? "rotate-90 bg-white text-zinc-800" : "rotate-0"
          )}
          onClick={() => setIsSidebarOpen(!isSidebarOpen)}
        >
          <Menu className="h-6 w-6" />
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
        {/* Draggable Toggle Handle for Mobile */}
        <button
          onClick={() => !isDragging && setIsSidebarOpen(!isSidebarOpen)}
          onTouchStart={() => setIsDragging(true)}
          onTouchEnd={() => setTimeout(() => setIsDragging(false), 50)}
          onTouchMove={(e) => {
            const touch = e.touches[0];
            const newY = Math.max(0, Math.min(window.innerHeight - 48, touch.clientY - 24));
            setTogglePos({ y: newY });
          }}
          style={{ top: `${togglePos.y}px` }}
          className="absolute left-[-40px] w-10 h-12 bg-[#444] rounded-l-xl flex items-center justify-center md:hidden shadow-[-4px_0_10px_rgba(0,0,0,0.1)] transition-transform active:scale-95 z-50 pointer-events-auto"
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
        <button className="flex flex-col items-center gap-1 opacity-80 hover:opacity-100 transition-opacity">
          <Users className="h-7 w-7" />
          <span className="text-[11px] font-medium tracking-tighter">招待</span>
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
      <Dialog open={isAddEntryOpen} onOpenChange={setIsAddEntryOpen}>
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
                      <div key={entry.id} className="flex items-center justify-between p-4 bg-white rounded-2xl border border-gray-100 shadow-sm group transition-all hover:border-blue-200">
                        <div className="flex items-center gap-4">
                          <div className={cn("w-2 h-10 rounded-full", preset?.color.split(" ")[0])} />
                          <div>
                            <p className="font-black text-lg tracking-tighter">{entry.startTime} - {entry.endTime}</p>
                            <p className="text-xs font-bold text-gray-400">{preset?.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={(e) => {
                              e.stopPropagation();
                              const copy = { ...entry, id: Math.random().toString(36).substr(2, 9) };
                              setEntries([...entries, copy]);
                            }}
                            className="rounded-full text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
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

            {/* New Entry Form */}
            <div className="space-y-6">
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">新規登録</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-gray-500 ml-1">開始時間</Label>
                  <input type="time" value={formStart} onChange={(e) => setFormStart(e.target.value)} className="w-full rounded-2xl h-14 text-xl font-black bg-gray-50 border-none shadow-inner px-4 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-gray-500 ml-1">終了時間</Label>
                  <input type="time" value={formEnd} onChange={(e) => setFormEnd(e.target.value)} className="w-full rounded-2xl h-14 text-xl font-black bg-gray-50 border-none shadow-inner px-4 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-gray-500 ml-1">勤務先 / 時給プリセット</Label>
                <Select value={formPresetId} onValueChange={setFormPresetId}>
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
                  commutingPresetId: formCommPresetId
                };
                setEntries([...entries, newEntry]);
                setIsAddEntryOpen(false);
              }} className="w-full h-16 bg-zinc-900 hover:bg-black text-white rounded-[1.25rem] font-black text-xl shadow-xl transition-all active:scale-95">
                記録を追加
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
