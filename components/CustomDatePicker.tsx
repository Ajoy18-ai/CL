import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CustomDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  label?: string;
  className?: string;
}

export const CustomDatePicker: React.FC<CustomDatePickerProps> = ({
  value,
  onChange,
  label = "Watch Date",
  className = ""
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  // Parse current value
  const currentDate = useMemo(() => {
    if (!value) return new Date();
    const [y, m, d] = value.split('-').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date();
    return new Date(y, m - 1, d);
  }, [value]);

  // Keep track of active viewing calendar state
  const [viewYear, setViewYear] = useState(currentDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(currentDate.getMonth()); // 0-11

  // Navigation views: 'days' | 'months' | 'years'
  const [currentView, setCurrentView] = useState<'days' | 'months' | 'years'>('days');

  // Ref to active year button for auto-scrolling
  const activeYearRef = useRef<HTMLButtonElement>(null);

  // Memoized years list from 1920 to current + 20 years
  const yearsList = useMemo(() => {
    const startYear = 1920;
    const endYear = new Date().getFullYear() + 20;
    const list = [];
    for (let y = endYear; y >= startYear; y--) {
      list.push(y);
    }
    return list;
  }, []);

  // Update view coordinates when actual selected value changes (e.g. initial load)
  useEffect(() => {
    setViewYear(currentDate.getFullYear());
    setViewMonth(currentDate.getMonth());
  }, [currentDate]);

  // Auto-scroll selected year into view when year selector opens
  useEffect(() => {
    if (currentView === 'years' && activeYearRef.current) {
      setTimeout(() => {
        activeYearRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }, 50);
    }
  }, [currentView]);

  // Handle escape key & click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (e: MouseEvent) => {
      if (
        pickerRef.current && !pickerRef.current.contains(e.target as Node) &&
        triggerRef.current && !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const shortMonthNames = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const weekdays = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  // Helper date calculations
  const calendarCells = useMemo(() => {
    const cells = [];

    // First day of current view month
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startOfWeekDay = firstDay.getDay(); // 0 is Sunday, 6 is Saturday

    // Days in current month
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();

    // Days in previous month
    const totalDaysPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    // Populate previous month remaining days
    for (let i = startOfWeekDay - 1; i >= 0; i--) {
      cells.push({
        dayNum: totalDaysPrevMonth - i,
        monthOffset: -1,
        dateString: formatDateStr(
          viewMonth === 0 ? viewYear - 1 : viewYear,
          viewMonth === 0 ? 11 : viewMonth - 1,
          totalDaysPrevMonth - i
        )
      });
    }

    // Populate current month days
    for (let i = 1; i <= totalDays; i++) {
      cells.push({
        dayNum: i,
        monthOffset: 0,
        dateString: formatDateStr(viewYear, viewMonth, i)
      });
    }

    // Populate next month padding days to round up to a perfect grid
    // Standard grids are 42 cells (6 rows of 7 days)
    const remainingCells = 42 - cells.length;
    for (let i = 1; i <= remainingCells; i++) {
      cells.push({
        dayNum: i,
        monthOffset: 1,
        dateString: formatDateStr(
          viewMonth === 11 ? viewYear + 1 : viewYear,
          viewMonth === 11 ? 0 : viewMonth + 1,
          i
        )
      });
    }

    return cells;
  }, [viewYear, viewMonth]);

  function formatDateStr(y: number, m: number, d: number) {
    const monthStr = String(m + 1).padStart(2, '0');
    const dayStr = String(d).padStart(2, '0');
    return `${y}-${monthStr}-${dayStr}`;
  }

  const handleDaySelect = (dateStr: string) => {
    onChange(dateStr);
    setIsOpen(false);
  };

  const handlePrevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear(prev => prev - 1);
    } else {
      setViewMonth(prev => prev - 1);
    }
  };

  const handleNextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear(prev => prev + 1);
    } else {
      setViewMonth(prev => prev + 1);
    }
  };



  // Convert Date output back into nice verbal display formats
  const formattedSelectedLabel = useMemo(() => {
    return currentDate.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }).toUpperCase();
  }, [currentDate]);

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button with 44px+ hit area */}
      <button
        id="custom-date-picker-trigger"
        ref={triggerRef}
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setCurrentView('days');
          setViewYear(currentDate.getFullYear());
          setViewMonth(currentDate.getMonth());
        }}
        className="w-full h-16 bg-[#111] border border-white/5 hover:border-white/10 rounded-2xl px-6 text-white text-left focus:outline-none focus:ring-1 focus:ring-purple-500/30 transition-all font-bold text-sm flex items-center justify-between cursor-pointer group"
      >
        <span className="truncate italic tracking-wide text-zinc-300 group-hover:text-white transition-colors">
          {formattedSelectedLabel}
        </span>
        <CalendarIcon size={16} className="text-zinc-600 group-hover:text-purple-400 transition-all ml-3 shrink-0" />
      </button>

      {/* Floating Gorgeous Calendar Component */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 md:absolute md:inset-auto md:top-[calc(100%+8px)] md:left-0 md:right-0 z-[2600] flex items-end md:items-start justify-center p-4 pb-28 md:p-0">
            {/* Dark Mobile Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 bg-black/90 backdrop-blur-md md:hidden"
            />

            {/* Calendar Container */}
            <motion.div
              ref={pickerRef}
              initial={{ opacity: 0, y: 100, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 100, scale: 0.95 }}
              transition={{ type: "spring", damping: 30, stiffness: 350 }}
              className="relative w-full md:max-w-[340px] bg-[#0c0c0e] md:bg-[#111113] border border-white/10 rounded-[2.5rem] md:rounded-3xl shadow-[0_30px_60px_rgba(0,0,0,0.8)] overflow-hidden p-6 md:p-5 flex flex-col gap-4 z-10"
            >
              {/* Header section */}
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                {currentView === 'days' && (
                  <>
                    <button
                      type="button"
                      onClick={handlePrevMonth}
                      className="p-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentView('months');
                      }}
                      className="text-xs font-black uppercase tracking-[0.2em] italic text-zinc-300 hover:text-purple-400 transition-colors px-3 py-1 cursor-pointer"
                    >
                      {monthNames[viewMonth]} {viewYear}
                    </button>
                    <button
                      type="button"
                      onClick={handleNextMonth}
                      className="p-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}

                {currentView === 'months' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setViewYear(prev => prev - 1)}
                      className="p-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentView('years');
                      }}
                      className="text-xs font-black uppercase tracking-[0.2em] italic text-zinc-300 hover:text-purple-400 transition-colors px-3 py-1 cursor-pointer"
                    >
                      Select Month ({viewYear})
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewYear(prev => prev + 1)}
                      className="p-2 bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </>
                )}

                {currentView === 'years' && (
                  <>
                    <div className="w-9" />
                    <span className="text-xs font-black uppercase tracking-[0.2em] italic text-purple-400 px-3 py-1">
                      SELECT YEAR
                    </span>
                    <div className="w-9" />
                  </>
                )}

                {/* Mobile close helper button */}
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-2 bg-white/5 text-zinc-400 hover:text-white rounded-xl transition-all cursor-pointer md:hidden ml-1"
                >
                  <X size={16} />
                </button>
              </div>

              {/* View Rendering */}
              <div className="flex-1">
                {/* 1. DAYS VIEW */}
                {currentView === 'days' && (
                  <div className="space-y-2">
                    {/* Weekday headers */}
                    <div className="grid grid-cols-7 text-center">
                      {weekdays.map((day, idx) => (
                        <div key={idx} className="text-[10px] font-black text-zinc-600 uppercase tracking-wider py-1">
                          {day}
                        </div>
                      ))}
                    </div>

                    {/* Days grid */}
                    <div className="grid grid-cols-7 gap-1">
                      {calendarCells.map((cell, idx) => {
                        const isCurrentMonth = cell.monthOffset === 0;
                        const isSelected = cell.dateString === value;
                        const isToday = cell.dateString === formatDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleDaySelect(cell.dateString)}
                            className={`aspect-square w-full rounded-xl text-xs font-bold transition-all flex items-center justify-center cursor-pointer relative
                              ${!isCurrentMonth ? 'text-zinc-700 hover:text-zinc-400 hover:bg-white/5' : ''}
                              ${isCurrentMonth && !isSelected ? 'text-zinc-200 hover:bg-white/5 hover:text-white' : ''}
                              ${isSelected ? 'bg-[#9b5cff] text-white font-black shadow-xl shadow-purple-500/20' : ''}
                              ${isToday && !isSelected ? 'border border-[#9b5cff]/30 text-purple-400' : ''}
                            `}
                          >
                            <span>{cell.dayNum}</span>
                            {isToday && !isSelected && (
                              <span className="absolute bottom-1 w-1 h-1 bg-purple-500 rounded-full" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* 2. MONTHS GRID VIEW */}
                {currentView === 'months' && (
                  <div className="grid grid-cols-3 gap-2 py-1">
                    {shortMonthNames.map((name, index) => {
                      const isCurrentSelectedMonth = index === viewMonth;
                      return (
                        <button
                          key={index}
                          type="button"
                          onClick={() => {
                            setViewMonth(index);
                            setCurrentView('days');
                          }}
                          className={`py-4 rounded-2xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer italic
                            ${isCurrentSelectedMonth
                              ? 'bg-[#9b5cff] text-white font-black'
                              : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 3. YEARS GRID VIEW */}
                {currentView === 'years' && (
                  <div className="grid grid-cols-3 gap-2 py-1 max-h-[220px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {yearsList.map((yr) => {
                      const isCurrentSelectedYear = yr === viewYear;
                      return (
                        <button
                          key={yr}
                          ref={isCurrentSelectedYear ? activeYearRef : null}
                          type="button"
                          onClick={() => {
                            setViewYear(yr);
                            setCurrentView('months');
                          }}
                          className={`py-3 rounded-2xl text-xs font-black transition-all cursor-pointer italic
                            ${isCurrentSelectedYear
                              ? 'bg-[#9b5cff] text-white font-black'
                              : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                            }`}
                        >
                          {yr}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Helper Quick buttons */}
              {currentView === 'days' && (
                <div className="flex gap-2 border-t border-white/5 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      const todayStr = formatDateStr(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
                      handleDaySelect(todayStr);
                    }}
                    className="flex-1 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-white bg-white/5 rounded-xl transition-colors cursor-pointer text-center"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentView('years');
                    }}
                    className="flex-1 py-2 text-[10px] font-black uppercase tracking-wider text-zinc-400 hover:text-purple-400 bg-white/5 rounded-xl transition-colors cursor-pointer text-center"
                  >
                    Jump Year
                  </button>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
