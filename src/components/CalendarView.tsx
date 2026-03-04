import { useCallback, useMemo, useState } from "react";
import { Calendar, dayjsLocalizer, type SlotInfo, type View, type NavigateAction, type EventProps } from "react-big-calendar";
import dayjs from "dayjs";
import type { CalendarEvent } from "../types";

const localizer = dayjsLocalizer(dayjs);

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
  }), []);

  const { scrollToTime, min, max } = useMemo(() => ({
    scrollToTime: dayjs().hour(8).minute(0).toDate(),
    min: dayjs().hour(8).minute(0).second(0).toDate(),
    max: dayjs().hour(22).minute(0).second(0).toDate(),
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
