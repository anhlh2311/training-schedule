import { useCallback, useMemo, useState } from "react";
import { Calendar, dayjsLocalizer, type SlotInfo, type View, type NavigateAction } from "react-big-calendar";
import dayjs from "dayjs";
import type { CalendarEvent } from "../types";

const localizer = dayjsLocalizer(dayjs);

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
  initialView?: View;
}

export default function CalendarView({
  events,
  selectable = false,
  onSelectSlot,
  onSelectEvent,
  initialView = "week",
}: CalendarViewProps) {
  const [view, setView] = useState<View>(initialView);
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
        popup
        step={30}
        timeslots={2}
      />
    </div>
  );
}
