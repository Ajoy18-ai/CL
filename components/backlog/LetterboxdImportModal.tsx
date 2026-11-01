import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, Upload, Sparkles, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { importLetterboxdTitles } from '../../services/historicalPopularity';
import { useToastStore } from '../../store/useToastStore';

interface LetterboxdImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: (count: number) => void;
}

export const LetterboxdImportModal: React.FC<LetterboxdImportModalProps> = ({
  isOpen,
  onClose,
  onImportSuccess
}) => {
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const toast = useToastStore();

  if (!isOpen) return null;

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      // Parse input lines or comma-separated list
      // Format can be "Movie Title (Year)" or "Movie Title, Year" or JSON
      const lines = inputText
        .split(/[\n,]/)
        .map(l => l.trim())
        .filter(l => l.length > 1);

      const parsedTitles: { title: string; year?: number }[] = [];

      lines.forEach(line => {
        // Match "Movie Name (2012)" or "Movie Name 2012"
        const yearMatch = line.match(/\(?(\d{4})\)?$/);
        if (yearMatch) {
          const year = parseInt(yearMatch[1]);
          const title = line.replace(/\(?\d{4}\)?$/, '').trim();
          if (title) parsedTitles.push({ title, year });
        } else {
          parsedTitles.push({ title: line });
        }
      });

      if (parsedTitles.length === 0) {
        toast.error("Please enter at least one movie or TV title.");
        setIsProcessing(false);
        return;
      }

      const { added, matched } = await importLetterboxdTitles(parsedTitles);

      if (matched > 0) {
        toast.success(`Matched ${matched} title(s) on TMDB and injected ${added} into your candidate pool!`);
        onImportSuccess(added);
        onClose();
      } else {
        toast.error("No matches found for the entered titles. Please check the spelling and try again.");
      }
    } catch (err) {
      console.error("Import error:", err);
      toast.error("Failed to parse list. Please check format.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-lg bg-[#0f0f12] border border-white/15 rounded-[2.5rem] p-6 md:p-8 shadow-2xl overflow-hidden"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-white flex items-center justify-center transition-colors"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#9b5cff]/20 border border-[#b88aff]/30 flex items-center justify-center text-[#b88aff]">
            <Upload size={18} />
          </div>
          <div>
            <h3 className="text-xl font-black text-white italic uppercase tracking-tight">Import Custom / Letterboxd Titles</h3>
            <p className="text-[11px] text-zinc-400">Match exported favorites with TMDB and prioritize in Backlog Recovery</p>
          </div>
        </div>

        <form onSubmit={handleImport} className="space-y-4">
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.2em] text-[#b88aff] block mb-2">
              Paste Title List (One per line or comma-separated)
            </label>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder={`Examples:\nInception (2010)\nThe Prestige (2006)\nSholay (1975)\nDilwale Dulhania Le Jayenge\nInterstellar`}
              rows={6}
              className="w-full px-4 py-3 rounded-2xl bg-black/60 border border-white/15 text-white placeholder-zinc-600 text-xs font-mono focus:outline-none focus:border-[#b88aff]"
            />
          </div>

          <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-[11px] text-zinc-300">
            <span className="font-bold text-[#b88aff] uppercase tracking-wider block mb-1">Smart Match Engine</span>
            Each title is searched on TMDB, scored with historical weighting, and inserted into your discovery queue.
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 px-4 rounded-xl bg-zinc-900 border border-white/10 text-zinc-300 text-xs font-black uppercase tracking-wider"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing || !inputText.trim()}
              className="flex-1 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#600dca] to-[#9b5cff] text-white text-xs font-black uppercase tracking-widest shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  <span>Matching...</span>
                </>
              ) : (
                <span>Import & Discover</span>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};
