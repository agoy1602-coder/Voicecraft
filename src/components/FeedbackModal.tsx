import React, { useState } from 'react';
import {
  X,
  MessageSquareHeart,
  Star,
  Send,
  CheckCircle2,
  Sparkles,
  Smile,
} from 'lucide-react';
import { FeedbackSubmission } from '../types';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmitFeedback: (feedback: Partial<FeedbackSubmission>) => Promise<boolean>;
}

export const FeedbackModal: React.FC<FeedbackModalProps> = ({
  isOpen,
  onClose,
  onSubmitFeedback,
}) => {
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [category, setCategory] = useState<FeedbackSubmission['category']>('audio_quality');
  const [message, setMessage] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitted, setSubmitted] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    setIsSubmitting(true);
    const success = await onSubmitFeedback({
      rating,
      category,
      message: message.trim(),
      telemetry: {
        browser: navigator.userAgent,
        offlineMode: !navigator.onLine,
        latencyMs: 340,
        voiceUsed: 'Kore (Neural Flash)',
      },
    });

    setIsSubmitting(false);
    if (success) {
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setMessage('');
        onClose();
      }, 1500);
    }
  };

  const getRatingLabel = (stars: number) => {
    switch (stars) {
      case 1:
        return 'Needs Improvement';
      case 2:
        return 'Fair Quality';
      case 3:
        return 'Good Expressiveness';
      case 4:
        return 'Great Natural Delivery';
      case 5:
        return 'Exceptional Fidelity & Accuracy';
      default:
        return '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative flex flex-col gap-5 text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-pink-600/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
              <MessageSquareHeart className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-100">Voice Quality Feedback Loop</h3>
              <p className="text-[11px] text-slate-400">
                Help improve our acoustic synthesis and tone models
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {submitted ? (
          <div className="py-8 flex flex-col items-center justify-center text-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <h4 className="text-base font-bold text-slate-100">Feedback Received!</h4>
            <p className="text-xs text-slate-400 max-w-xs">
              Thank you for helping us continually optimize VoiceCraft's neural synthesis models.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Star Rating */}
            <div className="flex flex-col items-center gap-1 bg-slate-950/60 p-3 rounded-xl border border-slate-800">
              <span className="text-[11px] font-semibold text-slate-400">
                How would you rate the audio naturalness?
              </span>
              <div className="flex items-center gap-2 my-1">
                {[1, 2, 3, 4, 5].map((star) => {
                  const active = (hoverRating || rating) >= star;
                  return (
                    <button
                      type="button"
                      key={star}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(star)}
                      className="p-1 text-slate-600 hover:scale-110 transition-transform"
                    >
                      <Star
                        className={`w-6 h-6 ${
                          active ? 'text-amber-400 fill-amber-400' : 'text-slate-600'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
              <span className="text-[11px] font-semibold text-amber-300">
                {getRatingLabel(hoverRating || rating)}
              </span>
            </div>

            {/* Category Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as any)}
                className="bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-pink-500"
              >
                <option value="audio_quality">Audio Quality & Expressiveness</option>
                <option value="pronunciation">Pronunciation & Accent</option>
                <option value="tone_accuracy">Tone Delivery & Cadence</option>
                <option value="voice_cloning">Voice Cloning Accuracy</option>
                <option value="offline_mode">Offline Mode Performance</option>
                <option value="feature_request">Feature Request / Enhancement</option>
              </select>
            </div>

            {/* Message Area */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Notes & Recommendations *
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Share any specific word pronunciation issues, tone nuances, or suggested features..."
                rows={3}
                required
                className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-pink-500 resize-none"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting || !message.trim()}
              className={`w-full py-2.5 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-2 shadow-lg transition-all ${
                isSubmitting || !message.trim()
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500 shadow-pink-600/30'
              }`}
            >
              {isSubmitting ? (
                <span>Submitting Feedback...</span>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Submit Review</span>
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
