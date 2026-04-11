import React from 'react';
import { X, Send, MessageSquareHeart } from 'lucide-react';

interface FeedbackDialogProps {
  onClose: () => void;
}

export function FeedbackDialog({ onClose }: FeedbackDialogProps) {
  const [loading, setLoading] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate sending feedback payload
    setTimeout(() => {
      setLoading(false);
      setSent(true);
      setTimeout(onClose, 2000); // Auto close after success
    }, 1200);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
      <div className="bg-[#1e1e2d] w-full max-w-lg rounded-2xl shadow-2xl border border-white/10 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <MessageSquareHeart className="w-5 h-5 text-rose-400" />
            Report Issue / Feedback
          </h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {sent ? (
            <div className="py-12 text-center flex flex-col items-center justify-center space-y-4">
              <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 mb-2">
                <Send className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-medium text-white">Message Sent</h3>
              <p className="text-white/50 text-sm">Thank you for helping us improve OMG Labels.</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-white/60 pb-2">
                Experiencing a bug or have a feature request? Let us know below. The system version and diagnostic logs will be attached automatically.
              </p>
              
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/70">Topic</label>
                <select className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500">
                  <option>Bug Report</option>
                  <option>Printer Integration Issue</option>
                  <option>Feature Request</option>
                  <option>General Feedback</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-white/70">Description</label>
                <textarea 
                  required
                  rows={5}
                  className="w-full bg-black/20 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"
                  placeholder="Tell us what happened..."
                />
              </div>

              <div className="pt-4 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 hover:bg-white/5 text-white/70 hover:text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : <Send className="w-4 h-4" />}
                  Submit
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
