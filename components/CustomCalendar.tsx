import React from "react";

const RED = "#E53E3E";
const RED_LIGHT = "#fee2e2";

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function isInRange(day: Date, start: Date | null, end: Date | null) {
  if (!start || !end) return false;
  return day > start && day < end;
}

export default function CustomCalendar({
  startDate,
  endDate,
  onRangeChange,
}: {
  startDate: Date | null,
  endDate: Date | null,
  onRangeChange: (start: Date | null, end: Date | null) => void
}) {
  const today = new Date();
  const [currentMonth, setCurrentMonth] = React.useState((startDate || today).getMonth());
  const [currentYear, setCurrentYear] = React.useState((startDate || today).getFullYear());

  const daysInMonth = getDaysInMonth(currentYear, currentMonth);
  const firstDay = getFirstDayOfWeek(currentYear, currentMonth);

  const days: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    days.push(new Date(currentYear, currentMonth, d));
  }

  function handleDayClick(day: Date) {
    if (!startDate || (startDate && endDate)) {
      onRangeChange(day, null);
    } else if (startDate && !endDate) {
      if (day < startDate) {
        onRangeChange(day, null);
      } else if (day > startDate) {
        onRangeChange(startDate, day);
      } else {
        onRangeChange(day, null);
      }
    }
  }

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  }
  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  }

  return (
    <div className="max-w-md mx-auto p-4 border rounded-xl bg-white shadow">
      <div className="flex justify-between items-center mb-2">
        <button onClick={prevMonth} className="text-2xl px-2 text-red-500">&#60;</button>
        <span className="font-bold text-lg text-red-600">
          {new Date(currentYear, currentMonth).toLocaleString("default", { month: "long" })} {currentYear}
        </span>
        <button onClick={nextMonth} className="text-2xl px-2 text-red-500">&#62;</button>
      </div>
      <div className="grid grid-cols-7 gap-1 mb-1">
        {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
          <div key={d} className="font-bold text-center text-gray-500">{d}</div>
        ))}
        {days.map((date, i) => {
          if (!date) return <div key={i} />;
          const isSelected = (startDate && isSameDay(date, startDate)) || (endDate && isSameDay(date, endDate));
          const inRange = isInRange(date, startDate, endDate);
          return (
            <button
              key={i}
              onClick={() => handleDayClick(date)}
              className={`h-10 w-10 flex items-center justify-center rounded-full transition
                ${isSelected ? "bg-red-500 text-white font-bold" : inRange ? "bg-red-100 text-red-700" : "hover:bg-red-50 text-gray-800"}
              `}
              style={isSelected ? { border: `2px solid ${RED}` } : {}}
            >
              {date.getDate()}
            </button>
          );
        })}
      </div>
      {startDate && endDate && (
        <div className="mt-2 text-center text-sm text-red-700">
          Selected: {startDate.toLocaleDateString()} – {endDate.toLocaleDateString()}
        </div>
      )}
    </div>
  );
} 