
import React from 'react';
import { Rating } from '../types';
import { Clapperboard, Sparkles, Repeat2 } from 'lucide-react';
import { RATING_CONFIG } from '../constants';
import { motion } from 'motion/react';
import GlareHover from './GlareHover';

interface RatingButtonsProps {
  rating: Rating | null;
  isVague: boolean;
  isAbsoluteCinema: boolean;
  isRewatch: boolean;
  onRatingChange: (rating: Rating) => void;
  onVagueToggle: (isVague: boolean) => void;
  onAbsoluteCinemaToggle: (isAbsoluteCinema: boolean) => void;
  onRewatchToggle: (isRewatch: boolean) => void;
}

const RatingButtons: React.FC<RatingButtonsProps> = ({
  rating,
  isVague,
  isAbsoluteCinema,
  isRewatch,
  onRatingChange,
  onVagueToggle,
  onAbsoluteCinemaToggle,
  onRewatchToggle
}) => {
  const ratings = [
    { id: Rating.BAD, label: 'BAD' },
    { id: Rating.MID, label: 'MID' },
    { id: Rating.GOOD, label: 'GOOD' },
    { id: Rating.PEAK, label: 'PEAK' }
  ];

  return (
    <div className="w-full flex flex-col items-center gap-6 md:gap-8">
      {/* Container for the rating scale - Pill shaped segmented control */}
      <div className="w-full bg-[#0c0c0e] p-2 rounded-[2.5rem] border border-white/5 flex items-center relative overflow-hidden shadow-inner">
        {ratings.map((r) => {
          const cfg = RATING_CONFIG[r.id];
          const isActive = rating === r.id;

          return (
            <motion.button
              key={r.id}
              type="button"
              whileTap={{ scale: 0.96 }}
              onClick={() => onRatingChange(r.id)}
              className={`
                flex-1 py-4 md:py-5 rounded-[2rem] font-black text-[9px] md:text-[10px] uppercase tracking-[0.3em] italic
                transition-all duration-300 ease-out relative z-10 outline-none
                ${isActive
                  ? `text-black`
                  : 'text-zinc-400 hover:text-white'}
              `}
            >
              <motion.span
                animate={{
                  scale: isActive ? 1.05 : 1,
                  opacity: isActive ? 1 : 0.7
                }}
                className="relative z-20"
              >
                {r.label}
              </motion.span>
              {isActive && (
                <motion.div
                  layoutId="activeRatingOverlay"
                  className={`absolute inset-0 ${cfg.color} shadow-[0_0_30px_rgba(0,0,0,0.4)] z-0 rounded-[2rem]`}
                  initial={false}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Special Tags - 3 Column Grid */}
      <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Vague Watch Toggle */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => onVagueToggle(!isVague)}
          className={`
            flex items-center justify-center gap-4 px-6 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all duration-300 border outline-none
            ${isVague
              ? 'bg-white text-black border-white shadow-xl'
              : 'bg-transparent text-zinc-400 border-white/10 hover:border-white/20 hover:text-white'}
          `}
        >
          <Clapperboard size={14} className={isVague ? 'text-black' : 'text-zinc-400'} />
          <span>{isVague ? 'Vague Entry' : 'Vague'}</span>
        </motion.button>

        {/* Rewatch Toggle */}
        <motion.button
          type="button"
          whileTap={{ scale: 0.98 }}
          onClick={() => onRewatchToggle(!isRewatch)}
          className={`
            flex items-center justify-center gap-4 px-6 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.3em] transition-all duration-300 border outline-none
            ${isRewatch
              ? 'bg-emerald-500 text-white border-emerald-500 shadow-xl shadow-emerald-500/20'
              : 'bg-transparent text-zinc-400 border-white/10 hover:border-white/20 hover:text-white'}
          `}
        >
          <Repeat2 size={14} className={isRewatch ? 'text-white' : 'text-zinc-400'} />
          <span>{isRewatch ? 'Rewatch' : 'Rewatch?'}</span>
        </motion.button>

        {/* Absolute Cinema Toggle */}
        <GlareHover
          width="100%"
          height="auto"
          background="transparent"
          borderRadius="1rem"
          borderColor="transparent"
          glareColor="#b88aff"
          glareOpacity={0.25}
          glareSize={200}
          transitionDuration={600}
          className="w-full h-full"
        >
          <motion.button
            type="button"
            whileTap={{ scale: 0.98 }}
            onClick={() => onAbsoluteCinemaToggle(!isAbsoluteCinema)}
            className={`
              w-full flex items-center justify-center gap-4 px-6 py-5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] transition-all duration-300 border outline-none overflow-hidden relative
              ${isAbsoluteCinema
                ? 'bg-[#8b5cf6] text-white border-[#8b5cf6] absolute-glow-active'
                : 'bg-transparent text-zinc-400 border-white/10 hover:border-white/20 hover:text-white'}
            `}
          >
            {isAbsoluteCinema && (
              <div className="animate-sweep-active" />
            )}
            <span className="text-lg relative z-10 whitespace-nowrap">✋😮🤚</span>
            <span className="relative z-10">Cinema</span>
          </motion.button>
        </GlareHover>
      </div>
    </div>
  );
};

export default RatingButtons;
