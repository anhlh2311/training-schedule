import { useCallback, useMemo, useState } from "react";
import { Calendar, dayjsLocalizer, type SlotInfo, type View, type NavigateAction, type EventProps, type HeaderProps, type ToolbarProps } from "react-big-calendar";
import dayjs from "dayjs";
import type { CalendarEvent } from "../types";

const localizer = dayjsLocalizer(dayjs);

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

interface CalendarViewProps {
  events: CalendarEvent[];
  selectable?: boolean;
  onSelectSlot?: (slotInfo: SlotInfo) => void;
  onSelectEvent?: (event: CalendarEvent) => void;
}

function getDefaultView(): View {
  return window.innerWidth < 768 ? "day" : "week";
}

export default function CalendarView({
  events,
  selectable = false,
  onSelectSlot,
  onSelectEvent,
}: CalendarViewProps) {
  const [view, setView] = useState<View>(getDefaultView);
  const [date, setDate] = useState<Date>(new Date());

  const handleNavigate = useCallback((newDate: Date, _view: View, _action: NavigateAction) => {
    setDate(newDate);
  }, []);

  const handleViewChange = useCallback((newView: View) => {
    setView(newView);
  }, []);

  const eventStyleGetter = useCallback((event: CalendarEvent) => {
    const colorIndex = hashString(event.resource.userId) % USER_COLORS.length;
    const color = USER_COLORS[colorIndex];
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
