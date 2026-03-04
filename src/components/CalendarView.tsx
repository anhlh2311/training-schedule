import { useCallback, useEffect, useMemo, useState } from "react";
import { Calendar, dayjsLocalizer, type SlotInfo, type View, type NavigateAction, type EventProps, type HeaderProps, type ToolbarProps } from "react-big-calendar";
import dayjs from "dayjs";
import type { CalendarEvent } from "../types";

const localizer = dayjsLocalizer(dayjs);

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

/* ------------------------------------------------------------------ */
/*  react-big-calendar custom components                               */
/* ------------------------------------------------------------------ */

function CustomHeader({ date }: HeaderProps) {
  const d = dayjs(date);
  return (
    <div className="flex flex-col items-center leading-tight">
      <span className="text-xs font-medium text-gray-500">{d.format("ddd")}</span>
      <span className="text-sm font-semibold text-gray-900">{d.format("DD")}</span>
    </div>
  );
}

const VIEW_STYLES: Record<string, { active: string; inactive: string }> = {
  month: {
    active:  "border-violet-600 bg-violet-600 text-white hover:bg-violet-700",
    inactive: "border-violet-200 bg-violet-50 text-violet-600 hover:bg-violet-100",
  },
  week: {
    active:  "border-blue-600 bg-blue-600 text-white hover:bg-blue-700",
    inactive: "border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100",
  },
  day: {
    active:  "border-teal-600 bg-teal-600 text-white hover:bg-teal-700",
    inactive: "border-teal-200 bg-teal-50 text-teal-600 hover:bg-teal-100",
  },
};

const VIEW_LABELS: Record<string, string> = { month: "Month", week: "Week", day: "Day" };

function CustomToolbar({ label, onNavigate, onView, view, views }: ToolbarProps) {
  const btnBase =
    "inline-flex items-center justify-center rounded-lg border text-sm font-medium transition h-10 min-w-[40px] px-4";
  const navBtn = `${btnBase} border-gray-300 bg-white text-gray-700 hover:bg-gray-100`;

  return (
    <div className="mb-3 flex flex-col items-center gap-2">
      <span className="text-sm font-semibold text-gray-900 sm:text-base">{label}</span>

      <div className="flex items-center gap-1.5">
        <button onClick={() => onNavigate("PREV")} className={navBtn} aria-label="Back">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <button onClick={() => onNavigate("TODAY")} className={navBtn}>
          Today
        </button>
        <button onClick={() => onNavigate("NEXT")} className={navBtn} aria-label="Next">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-1.5">
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
    </div>
  );
}

function CustomEvent({ event }: EventProps<CalendarEvent>) {
  const photoURL = event.resource?.userPhotoURL;
  return (
    <div className="flex items-center gap-1.5 overflow-hidden">
      {photoURL ? (
        <img
          src={photoURL}
          alt=""
          className="h-4 w-4 shrink-0 rounded-full"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/30 text-[8px] font-bold">
          {event.resource?.userName?.[0] ?? "?"}
        </div>
      )}
      <span className="truncate">{event.title}</span>
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

  const btnBase =
    "inline-flex items-center justify-center rounded-lg border text-sm font-medium transition h-10 min-w-[40px] px-4";

  return (
    <div className="flex flex-col">
      {/* View buttons */}
      <div className="mb-3 flex items-center justify-center gap-1.5">
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

      {/* Month header with nav */}
      <div className="flex items-center justify-between px-1 pb-3">
        <button
          onClick={() => onNavigateWeek("prev")}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Previous week"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold text-gray-900">
            {selectedDate.format("MMMM YYYY")}
          </span>
          {!selectedDate.isSame(today, "week") && (
            <button
              onClick={() => onNavigateWeek("today")}
              className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
            >
              Today
            </button>
          )}
        </div>
        <button
          onClick={() => onNavigateWeek("next")}
          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          aria-label="Next week"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
          {selectedDate.format("dddd, MMMM D, YYYY")}
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
                const color = getUserColor(event.resource.userId);
                const photoURL = event.resource.userPhotoURL;
                return (
                  <button
                    key={event.id}
                    onClick={() => onSelectEvent?.(event)}
                    className="flex flex-col rounded-xl border border-gray-100 bg-white p-3 text-left shadow-sm active:bg-gray-50"
                    style={{ borderLeftWidth: 4, borderLeftColor: color }}
                  >
                    <span className="text-sm font-semibold text-gray-900">
                      {event.title}
                    </span>
                    <span className="mt-0.5 text-xs text-gray-400">
                      {dayjs(event.start).format("HH:mm")} – {dayjs(event.end).format("HH:mm")}
                      <span className="ml-1.5 text-gray-300">·</span>
                      <span className="ml-1.5">{formatDuration(event.start, event.end)}</span>
                    </span>
                    <div className="mt-2 flex items-center gap-2">
                      {photoURL ? (
                        <img
                          src={photoURL}
                          alt=""
                          className="h-6 w-6 rounded-full"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div
                          className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white"
                          style={{ backgroundColor: color }}
                        >
                          {event.resource.userName?.[0] ?? "?"}
                        </div>
                      )}
                      <span className="text-xs font-medium text-gray-600">
                        {event.resource.userName}
                      </span>
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
  const [view, setView] = useState<View>(() => (window.innerWidth < 768 ? "day" : "week"));
  const [date, setDate] = useState<Date>(new Date());
  const [mobileDate, setMobileDate] = useState(() => dayjs());

  const handleNavigate = useCallback((newDate: Date, _view: View, _action: NavigateAction) => {
    setDate(newDate);
  }, []);

  const handleViewChange = useCallback((newView: View) => {
    setView(newView);
  }, []);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const color = getUserColor(event.resource.userId);
    return {
      style: {
        backgroundColor: color,
        borderRadius: "6px",
        border: "none",
        color: "#fff",
        fontSize: "0.8rem",
        padding: "2px 6px",
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
    timeGutterFormat: "HH:mm",
    eventTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${dayjs(start).format("HH:mm")} – ${dayjs(end).format("HH:mm")}`,
    selectRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${dayjs(start).format("HH:mm")} – ${dayjs(end).format("HH:mm")}`,
    agendaTimeRangeFormat: ({ start, end }: { start: Date; end: Date }) =>
      `${dayjs(start).format("HH:mm")} – ${dayjs(end).format("HH:mm")}`,
    agendaTimeFormat: "HH:mm",
  }), []);

  // Mobile + Day view → card-based layout
  if (isMobile && view === "day") {
    return (
      <MobileDayView
        events={events}
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
    <div className="h-[calc(100vh-280px)] min-h-[400px]">
      <Calendar
        localizer={localizer}
        events={events}
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
      />
    </div>
  );
}
