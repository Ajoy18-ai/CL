
import React from 'react';
import { Rating, WatchListItem } from './types';

export const TMDB_KEY = '259cb917c8ad62d5bb68d8025e5badfd';
export const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
export const TMDB_IMAGE_LARGE = 'https://image.tmdb.org/t/p/w780';
export const TMDB_IMAGE_ORIGINAL = 'https://image.tmdb.org/t/p/original';

export const USER_AVATAR = "https://images.unsplash.com/photo-1633332755192-727a05c4013d?q=80&w=2080&auto=format&fit=crop";

/**
 * Global blocklist removed to prevent data loss.
 */
export const BLOCKED_TMDB_IDS: number[] = [];

export const RATING_CONFIG: Record<Rating, { label: string, color: string, text: string, bg: string }> = {
  [Rating.BAD]: {
    label: 'BAD',
    color: 'bg-[#ff4d6d]',
    text: 'text-[#ff4d6d]',
    bg: 'bg-[#ff4d6d]/10'
  },
  [Rating.MID]: {
    label: 'MID',
    color: 'bg-[#ffb703]',
    text: 'text-[#ffb703]',
    bg: 'bg-[#ffb703]/10'
  },
  [Rating.GOOD]: {
    label: 'GOOD',
    color: 'bg-[#00f5a0]',
    text: 'text-[#00f5a0]',
    bg: 'bg-[#00f5a0]/10'
  },
  [Rating.PEAK]: {
    label: 'PEAK',
    color: 'bg-[#9b5cff]',
    text: 'text-[#9b5cff]',
    bg: 'bg-[#9b5cff]/10'
  },
  [Rating.VAGUE]: {
    label: 'VAGUE',
    color: 'bg-zinc-500',
    text: 'text-zinc-400',
    bg: 'bg-zinc-500/10'
  }
};
