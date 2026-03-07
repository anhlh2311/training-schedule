import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, dayjsLocalizer, type SlotInfo, type View, type EventProps, type HeaderProps, type ToolbarProps } from "react-big-calendar";
import dayjs from "dayjs";
import "dayjs/locale/en-gb";
import type { CalendarEvent } from "../types";

dayjs.locale("en-gb");
const localizer = dayjsLocalizer(dayjs);

const SWIPE_THRESHOLD = 50;

function useSwipe(onLeft: () => void, onRight: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    function handleTouchStart(e: TouchEvent) {
      const t = e.touches[0];
      touchStart.current = { x: t.clientX, y: t.clientY };
    }

    function handleTouchEnd(e: TouchEvent) {
      if (!touchStart.current) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - touchStart.current.x;
      const dy = t.clientY - touchStart.current.y;
      touchStart.current = null;
      if (Math.abs(dx) < SWIPE_THRESHOLD || Math.abs(dy) > Math.abs(dx)) return;
      if (dx > 0) onRight();
      else onLeft();
    }

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, [onLeft, onRight]);

  return ref;
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

const USER_COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#06B6D4", "#84CC16", "#F97316", "#6366F1",
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getUserColor(userId: string): string {
  return USER_COLORS[hashString(userId) % USER_COLORS.length];
}

function formatDuration(start: Date, end: Date): string {
  const mins = dayjs(end).diff(dayjs(start), "minute");
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

/** Merge events with identical start/end into grouped events for cleaner display */
function mergeOverlappingEvents(events: CalendarEvent[]): CalendarEvent[] {
  const bySlot = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    const key = `${ev.start.getTime()}-${ev.end.getTime()}`;
    const arr = bySlot.get(key);
    if (arr) arr.push(ev);
    else bySlot.set(key, [ev]);
  }
  const result: CalendarEvent[] = [];
  for (const group of bySlot.values()) {
    if (group.length === 1) {
      result.push(group[0]);
    } else {
      const first = group[0];
      result.push({
        id: `group-${first.start.getTime()}-${first.end.getTime()}`,
        title: group.map((e) => e.resource.userName).join(", "),
        start: first.start,
        end: first.end,
        resource: {
          ...first.resource,
          users: group.map((e) => ({
            userId: e.resource.userId,
            userName: e.resource.userName,
            userPhotoURL: e.resource.userPhotoURL ?? "",
          })),
        },
      });
    }
  }
  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

/* ------------------------------------------------------------------ */
/*  react-big-calendar custom components                               */
/* ------------------------------------------------------------------ */

function CustomHeader({ date }: HeaderProps) {
  const d = dayjs(date);
  return (
    <div className="flex flex-col items-center gap-0 leading-tight">
      <span className="text-[11px] font-medium uppercase text-gray-500">{d.format("ddd")}</span>
      <span className="rbc-date-num text-xs font-semibold text-gray-900">{d.format("DD")}</span>
    </div>
  );
}

const VIEW_STYLES: Record<string, { active: string; inactive: string }> = {
  month: {
    active:  "bg-violet-600 text-white shadow-sm hover:bg-violet-700 active:scale-[0.97]",
    inactive: "bg-violet-50 text-violet-600 hover:bg-violet-100 active:scale-[0.97]",
  },
  week: {
    active:  "bg-blue-600 text-white shadow-sm hover:bg-blue-700 active:scale-[0.97]",
    inactive: "bg-blue-50 text-blue-600 hover:bg-blue-100 active:scale-[0.97]",
  },
  day: {
    active:  "bg-teal-600 text-white shadow-sm hover:bg-teal-700 active:scale-[0.97]",
    inactive: "bg-teal-50 text-teal-600 hover:bg-teal-100 active:scale-[0.97]",
  },
};

const VIEW_LABELS: Record<string, string> = { month: "Month", week: "Week", day: "Day" };

function CustomToolbar({ label, onNavigate, onView, view, views, date }: ToolbarProps<CalendarEvent, object>) {
  const btnBase =
    "inline-flex items-center justify-center rounded-xl text-sm font-medium transition h-10 min-w-[40px] px-4";
  const navBtn = `${btnBase} bg-gray-50 text-gray-600 hover:bg-gray-100 active:scale-[0.97]`;
  const todayBtn = "rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200 active:scale-[0.97]";

  const showToday = (() => {
    const d = dayjs(date);
    const now = dayjs();
    if (view === "month") return !d.isSame(now, "month");
    if (view === "week") return !d.isSame(now, "week");
    if (view === "day") return !d.isSame(now, "day");
    return false;
  })();

  return (
    <div className="mb-3 flex flex-col items-center gap-2">
      {/* Row 1: View buttons + optional Add button */}
      <div className="flex flex-wrap items-center justify-center gap-1.5">
        {(views as View[]).map((v) => {
          const colors = VIEW_STYLES[v] ?? VIEW_STYLES.week;
          return (
            <button
              key={v}
              onClick={() => onView(v)}
              className={`${btnBase} ${view === v ? colors.active : colors.inactive}`}
            >
              {VIEW_LABELS[v] ?? v}
            </button>
          );
        })}
      </div>
      {/* Row 2: Prev | Label | Today (conditional) | Next */}
      <div className="flex items-center justify-center gap-2">
        <button onClick={() => onNavigate("PREV")} className={navBtn} aria-label="Back">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="min-w-[120px] text-center text-sm font-semibold text-gray-900 sm:text-base">{label}</span>
        {showToday && (
          <button onClick={() => onNavigate("TODAY")} className={todayBtn}>
            Today
          </button>
        )}
        <button onClick={() => onNavigate("NEXT")} className={navBtn} aria-label="Next">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function CustomEvent({ event }: EventProps<CalendarEvent>) {
  const users = event.resource?.users;
  const isGrouped = users && users.length > 1;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [showPopover, setShowPopover] = useState(false);
  const [openedByClick, setOpenedByClick] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  const handleMouseEnter = useCallback(() => {
    clearHideTimer();
    setOpenedByClick(false);
    setShowPopover(true);
  }, [clearHideTimer]);

  const handleMouseLeave = useCallback(() => {
    hideTimerRef.current = setTimeout(() => setShowPopover(false), 150);
  }, []);

  const handleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    clearHideTimer();
    setOpenedByClick(true);
    setShowPopover((v) => !v);
  }, [clearHideTimer]);

  useEffect(() => () => clearHideTimer(), [clearHideTimer]);

  if (isGrouped) {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const showAbove = rect && rect.bottom + 120 > window.innerHeight && rect.top > 120;
    const popoverContent = showPopover && rect && (
      <div
        className="fixed z-[100] min-w-[180px] max-w-[220px] rounded-xl border border-indigo-100 bg-white py-3 shadow-xl"
        style={{
          left: Math.max(8, Math.min(rect.left, window.innerWidth - 228)),
          ...(showAbove
            ? { bottom: window.innerHeight - rect.top + 8 }
            : { top: rect.bottom + 8 }),
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col gap-2 px-4">
          {users!.map((u) => (
            <div key={u.userId} className="flex items-center gap-3">
              {u.userPhotoURL ? (
                <img
                  src={u.userPhotoURL}
                  alt=""
                  className="h-8 w-8 shrink-0 rounded-full ring-1 ring-indigo-100"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: getUserColor(u.userId) }}
                >
                  {u.userName?.[0] ?? "?"}
                </div>
              )}
              <span className="text-sm font-medium text-gray-900">
                {u.userName}
              </span>
            </div>
          ))}
        </div>
      </div>
    );

    return (
      <>
        <div
          ref={wrapperRef}
          className="flex cursor-pointer flex-col gap-0.5 overflow-hidden py-0.5"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
          onClick={handleClick}
        >
          {users!.map((u) => (
            <div key={u.userId} className="flex items-center gap-1.5 min-w-0">
              {u.userPhotoURL ? (
                <img
                  src={u.userPhotoURL}
                  alt=""
                  className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div
                  className="flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full text-[7px] font-bold text-white"
                  style={{ backgroundColor: getUserColor(u.userId) }}
                >
                  {u.userName?.[0] ?? "?"}
                </div>
              )}
              <span className="truncate text-[0.7rem] font-medium text-indigo-800">
                {u.userName}
              </span>
            </div>
          ))}
        </div>
        {showPopover &&
          createPortal(
            <>
              {openedByClick && (
                <div
                  className="fixed inset-0 z-[99]"
                  onClick={() => setShowPopover(false)}
                  aria-hidden
                />
              )}
              {popoverContent}
            </>,
            document.body
          )}
      </>
    );
  }

  const photoURL = event.resource?.userPhotoURL;
  const color = getUserColor(event.resource!.userId);
  return (
    <div className="flex items-center gap-1.5 overflow-hidden">
      {photoURL ? (
        <img
          src={photoURL}
          alt=""
          className="h-4 w-4 shrink-0 rounded-full ring-1 ring-white"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div
          className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-white"
          style={{ backgroundColor: color }}
        >
          {event.resource?.userName?.[0] ?? "?"}
        </div>
      )}
      <span className="truncate" style={{ color }}>{event.title}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Mobile Day view: card-based with week strip                        */
/* ------------------------------------------------------------------ */

const WEEKDAYS = ["M", "Tu", "W", "Th", "F", "Sa", "Su"];

function getWeekDays(anchor: dayjs.Dayjs): dayjs.Dayjs[] {
  const start = anchor.startOf("week");
  return Array.from({ length: 7 }, (_, i) => start.add(i, "day"));
}

interface TimeSlotGroup {
  key: string;
  label: string;
  events: CalendarEvent[];
}

function groupByTimeSlot(events: CalendarEvent[]): TimeSlotGroup[] {
  const sorted = [...events].sort((a, b) => a.start.getTime() - b.start.getTime());
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of sorted) {
    const key = dayjs(ev.start).format("HH:mm");
    const arr = map.get(key);
    if (arr) arr.push(ev);
    else map.set(key, [ev]);
  }
  return Array.from(map.entries()).map(([key, evts]) => ({
    key,
    label: key,
    events: evts,
  }));
}

function MobileDayView({
  events,
  selectedDate,
  onSelectDate,
  onNavigateWeek,
  onSelectEvent,
  onSwitchView,
  currentView,
}: {
  events: CalendarEvent[];
  selectedDate: dayjs.Dayjs;
  onSelectDate: (d: dayjs.Dayjs) => void;
  onNavigateWeek: (dir: "prev" | "next" | "today") => void;
  onSelectEvent?: (event: CalendarEvent) => void;
  onSwitchView: (v: View) => void;
  currentView: View;
}) {
  const weekDays = useMemo(() => getWeekDays(selectedDate), [selectedDate]);
  const today = dayjs();

  const dayEvents = useMemo(
    () => events.filter((e) => dayjs(e.start).isSame(selectedDate, "day")),
    [events, selectedDate]
  );

  const timeSlots = useMemo(() => groupByTimeSlot(dayEvents), [dayEvents]);

  const eventDates = useMemo(() => {
    const set = new Set<string>();
    events.forEach((e) => set.add(dayjs(e.start).format("YYYY-MM-DD")));
    return set;
  }, [events]);

  const swipeRef = useSwipe(
    useCallback(() => onSelectDate(selectedDate.add(1, "day")), [onSelectDate, selectedDate]),
    useCallback(() => onSelectDate(selectedDate.subtract(1, "day")), [onSelectDate, selectedDate]),
  );

  const btnBase =
    "inline-flex items-center justify-center rounded-xl text-sm font-medium transition h-10 min-w-[40px] px-4";
  const navBtn = `${btnBase} bg-gray-50 text-gray-600 hover:bg-gray-100 active:scale-[0.97]`;
  const todayBtn = "rounded-xl bg-gray-100 px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-200 active:scale-[0.97]";
  const showToday = !selectedDate.isSame(today, "day");

  return (
    <div ref={swipeRef} className="flex flex-col">
      {/* Row 1: View buttons (Month, Week, Day) */}
      <div className="mb-2 flex items-center justify-center gap-1.5">
        {(["month", "week", "day"] as View[]).map((v) => {
          const colors = VIEW_STYLES[v] ?? VIEW_STYLES.week;
          return (
            <button
              key={v}
              onClick={() => onSwitchView(v)}
              className={`${btnBase} ${currentView === v ? colors.active : colors.inactive}`}
            >
              {VIEW_LABELS[v] ?? v}
            </button>
          );
        })}
      </div>
      {/* Row 2: Prev | Label | Today (conditional) | Next */}
      <div className="mb-3 flex items-center justify-center gap-2">
        <button
          onClick={() => onNavigateWeek("prev")}
          className={navBtn}
          aria-label="Previous"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <span className="min-w-[120px] text-center text-sm font-semibold text-gray-900 sm:text-base">
          {selectedDate.format("MMM YYYY")}
        </span>
        {showToday && (
          <button onClick={() => onNavigateWeek("today")} className={todayBtn}>
            Today
          </button>
        )}
        <button
          onClick={() => onNavigateWeek("next")}
          className={navBtn}
          aria-label="Next"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      {/* Weekday labels */}
      <div className="grid grid-cols-7 gap-1 px-1 pb-1">
        {WEEKDAYS.map((wd) => (
          <div key={wd} className="text-center text-xs font-medium text-gray-400">
            {wd}
          </div>
        ))}
      </div>

      {/* Date pills */}
      <div className="grid grid-cols-7 gap-1 px-1 pb-3">
        {weekDays.map((d) => {
          const isSelected = d.isSame(selectedDate, "day");
          const isToday = d.isSame(today, "day");
          const hasEvents = eventDates.has(d.format("YYYY-MM-DD"));
          return (
            <button
              key={d.format("YYYY-MM-DD")}
              onClick={() => onSelectDate(d)}
              className={`flex flex-col items-center rounded-xl py-2 transition ${
                isSelected
                  ? "bg-gray-900 text-white"
                  : isToday
                    ? "bg-blue-50 text-blue-700"
                    : "text-gray-700 hover:bg-gray-100"
              }`}
            >
              <span className="text-lg font-semibold leading-tight">{d.format("D")}</span>
              <div className={`mt-1 h-1 w-1 rounded-full ${
                hasEvents
                  ? isSelected ? "bg-white" : "bg-blue-500"
                  : "bg-transparent"
              }`} />
            </button>
          );
        })}
      </div>

      {/* Selected date label */}
      <div className="border-t border-gray-100 px-1 pb-2 pt-3">
        <p className="text-sm font-medium text-gray-500">
          {selectedDate.format("ddd, MMM D, YYYY")}
        </p>
      </div>

      {/* Event cards grouped by time slot */}
      <div className="flex flex-col gap-4 px-1 pt-1">
        {timeSlots.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">
            No availability registered for this day
          </p>
        )}
        {timeSlots.map((slot) => (
          <div key={slot.key} className="flex gap-3">
            {/* Time label */}
            <div className="flex w-14 shrink-0 flex-col items-end pt-2">
              <span className="text-sm font-semibold text-gray-900">{slot.label}</span>
              {slot.events.length > 1 && (
                <span className="text-[10px] text-gray-400">
                  {slot.events.length} slots
                </span>
              )}
            </div>

            {/* Cards for this time slot */}
            <div className="flex flex-1 flex-col gap-2">
              {slot.events.map((event) => {
                const users = event.resource?.users;
                const isGrouped = users && users.length > 1;
                const displayUsers = isGrouped ? users! : [{
                  userId: event.resource!.userId,
                  userName: event.resource!.userName,
                  userPhotoURL: event.resource!.userPhotoURL ?? "",
                }];
                const borderColor = isGrouped ? "#6366f1" : getUserColor(event.resource!.userId);
                return (
                  <button
                    key={event.id}
                    onClick={() => onSelectEvent?.(event)}
                    className={`flex flex-col rounded-xl border border-gray-100 p-3 text-left shadow-sm active:opacity-90 ${
                      isGrouped ? "bg-indigo-50" : "bg-white active:bg-gray-50"
                    }`}
                    style={{ borderLeftWidth: 4, borderLeftColor: borderColor }}
                  >
                    <span className="text-sm font-semibold text-gray-900">
                      {event.title}
                    </span>
                    <span className="mt-0.5 text-xs text-gray-400">
                      {dayjs(event.start).format("HH:mm")} – {dayjs(event.end).format("HH:mm")}
                      <span className="ml-1.5 text-gray-300">·</span>
                      <span className="ml-1.5">{formatDuration(event.start, event.end)}</span>
                    </span>
                    <div className="mt-2 flex flex-col gap-1.5">
                      {displayUsers.map((u) => (
                        <div key={u.userId} className="flex items-center gap-2">
                          {u.userPhotoURL ? (
                            <img
                              src={u.userPhotoURL}
                              alt=""
                              className="h-6 w-6 rounded-full"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div
                              className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                              style={{ backgroundColor: getUserColor(u.userId) }}
                            >
                              {u.userName?.[0] ?? "?"}
                            </div>
                          )}
                          <span className={`text-xs font-medium ${isGrouped ? "text-indigo-800" : "text-gray-600"}`}>
                            {u.userName}
                          </span>
                        </div>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

interface CalendarViewProps {
  events: CalendarEvent[];
  selectable?: boolean;
  onSelectSlot?: (slotInfo: SlotInfo) => void;
  onSelectEvent?: (event: CalendarEvent) => void;
}

function useIsMobile(breakpoint = 768) {
  const [mobile, setMobile] = useState(() => window.innerWidth < breakpoint);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [breakpoint]);
  return mobile;
}

export default function CalendarView({
  events,
  selectable = false,
  onSelectSlot,
  onSelectEvent,
}: CalendarViewProps) {
  const isMobile = useIsMobile();
  const mergedEvents = useMemo(() => mergeOverlappingEvents(events), [events]);
  const [view, setView] = useState<View>(() => (window.innerWidth < 768 ? "day" : "week"));
  const [date, setDate] = useState<Date>(new Date());
  const [mobileDate, setMobileDate] = useState(() => dayjs());

  const handleNavigate = useCallback((newDate: Date) => {
    setDate(newDate);
  }, []);

  const handleViewChange = useCallback((newView: View) => {
    setView(newView);
  }, []);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const isGrouped = event.resource?.users && event.resource.users.length > 1;
    if (isGrouped) {
      return {
        style: {
          backgroundColor: "#e0e7ff",
          borderLeft: "3px solid #6366f1",
          borderRadius: "8px",
          color: "#4338ca",
          fontSize: "0.78rem",
          padding: "4px 8px",
        },
      };
    }
    const color = getUserColor(event.resource!.userId);
    return {
      style: {
        backgroundColor: `${color}18`,
        borderLeft: `3px solid ${color}`,
        borderRadius: "8px",
        color: color,
        fontSize: "0.78rem",
        fontWeight: 600,
        padding: "3px 8px",
      },
    };
  }, []);

  const components = useMemo(() => ({
    event: CustomEvent,
    header: CustomHeader,
    toolbar: CustomToolbar,
  }), []);

  const { scrollToTime, min, max } = useMemo(() => ({
    scrollToTime: dayjs().hour(8).minute(0).toDate(),
    min: dayjs().hour(8).minute(0).second(0).toDate(),
    max: dayjs().hour(22).minute(0).second(0).toDate(),
  }), []);

  const formats = useMemo(() => ({
    monthHeaderFormat: "MMM YYYY",
    dayRangeHeaderFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${dayjs(start).format("D MMM")} – ${dayjs(end).format("D MMM YYYY")}`,
    dayHeaderFormat: "ddd D MMM",
    timeGutterFormat: "HH:mm",
    eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${dayjs(start).format("HH:mm")} – ${dayjs(end).format("HH:mm")}`,
    selectRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${dayjs(start).format("HH:mm")} – ${dayjs(end).format("HH:mm")}`,
    agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${dayjs(start).format("HH:mm")} – ${dayjs(end).format("HH:mm")}`,
    agendaTimeFormat: "HH:mm",
  }), []);

  const navigatePrev = useCallback(() => {
    const unit = view === "month" ? "month" : view === "week" ? "week" : "day";
    setDate((d) => dayjs(d).subtract(1, unit).toDate());
  }, [view]);

  const navigateNext = useCallback(() => {
    const unit = view === "month" ? "month" : view === "week" ? "week" : "day";
    setDate((d) => dayjs(d).add(1, unit).toDate());
  }, [view]);

  const calSwipeRef = useSwipe(navigateNext, navigatePrev);

  // Mobile + Day view → card-based layout
  if (isMobile && view === "day") {
    return (
      <MobileDayView
        events={mergedEvents}
        selectedDate={mobileDate}
        onSelectDate={setMobileDate}
        onNavigateWeek={(dir) => {
          if (dir === "today") setMobileDate(dayjs());
          else setMobileDate((d) => d.add(dir === "next" ? 1 : -1, "week"));
        }}
        onSelectEvent={onSelectEvent}
        onSwitchView={handleViewChange}
        currentView={view}
      />
    );
  }

  // All other views (Month, Week on mobile; everything on desktop)
  return (
    <div ref={calSwipeRef} className="mb-5 h-[calc(100vh-220px)] min-h-[400px] md:h-[calc(100vh-280px)]">
      <Calendar
        localizer={localizer}
        events={mergedEvents}
        view={view}
        onView={handleViewChange}
        date={date}
        onNavigate={handleNavigate}
        views={["month", "week", "day"]}
        scrollToTime={scrollToTime}
        min={min}
        max={max}
        formats={formats}
        selectable={selectable}
        onSelectSlot={onSelectSlot}
        onSelectEvent={onSelectEvent}
        eventPropGetter={eventStyleGetter}
        components={components}
        popup
        step={30}
        timeslots={2}
        longPressThreshold={1}
      />
    </div>
  );
}
