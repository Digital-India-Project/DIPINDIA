import { useState } from 'react';
import { BookOpen, Info, Scale, Send, Sparkles } from 'lucide-react';
import { LegalAssistMessage } from '../shared/types';
import { askLegalAssistant } from '../lib/api';

interface Props {
  documentTitle?: string;
  documentCategory?: string;
  jurisdictionState?: string;
  documentExcerpt?: string;
}

const QUICK_PROMPTS = [
  'Explain the key legal clauses and obligations in plain English',
  'What stamp duty and registration formalities apply in this State?',
  'Identify missing clauses, witness rules, or execution risks in this draft',
];

export function LegalAssistantPanel({
  documentTitle,
  documentCategory,
  jurisdictionState,
  documentExcerpt,
}: Props) {
  const [messages, setMessages] = useState<LegalAssistMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendQuestion = async (questionText: string) => {
    const trimmed = questionText.trim();
    if (!trimmed || loading) return;

    const userMsg: LegalAssistMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput('');
    setLoading(true);
    setError(null);

    try {
      const res = await askLegalAssistant({
        question: trimmed,
        documentTitle,
        documentCategory,
        jurisdictionState,
        documentExcerpt: documentExcerpt ? documentExcerpt.slice(0, 12000) : undefined,
        history: messages.slice(-8).map((m) => ({ role: m.role, content: m.content })),
      });
      setMessages([
        ...nextHistory,
        {
          role: 'assistant',
          content: res.answer,
          timestamp: res.timestamp,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to reach legal assistance service.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3.5 bg-[#FFF5F0] dark:bg-orange-950/35 border border-[#FED7AA] dark:border-orange-800 rounded-xl text-xs text-[#9A3412] dark:text-orange-200 flex items-start gap-2.5">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-[#FF671F]" />
        <div className="space-y-1">
          <strong className="block text-[#202124] dark:text-white">
            Informational Indian Legal Assistance Only — Not Formal Legal Advice
          </strong>
          <p className="text-slate-700 dark:text-slate-300">
            Responses explain Indian statutory context, stamp duty/registration steps, and clause meanings based on your current draft. Always verify final legal strategy with an Advocate enrolled under the Advocates Act, 1961.
          </p>
        </div>
      </div>

      {/* Quick Context Strip */}
      {(documentTitle || jurisdictionState) && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-600 dark:text-slate-300 font-mono-tabular bg-[#F7F8FA] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-2">
          <span className="inline-flex items-center gap-1 text-[#202124] dark:text-white font-semibold">
            <BookOpen className="w-3.5 h-3.5 text-[#138808] dark:text-emerald-400" />
            Context:
          </span>
          {documentTitle && <span>{documentTitle}</span>}
          {documentCategory && (
            <>
              <span aria-hidden="true">·</span>
              <span>{documentCategory}</span>
            </>
          )}
          {jurisdictionState && (
            <>
              <span aria-hidden="true">·</span>
              <span>State: {jurisdictionState}</span>
            </>
          )}
        </div>
      )}

      {/* Quick Prompt Actions */}
      <div className="space-y-1.5">
        <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 flex items-center gap-1">
          <Sparkles className="w-3 h-3 text-[#FF671F]" />
          Suggested Guidance Queries
        </span>
        <div className="flex flex-wrap gap-2">
          {QUICK_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              disabled={loading}
              onClick={() => void sendQuestion(prompt)}
              className="text-left px-3 py-1.5 text-xs text-[#202124] dark:text-slate-100 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-[#FF671F] hover:bg-[#FFF5F0] dark:hover:border-orange-500 dark:hover:bg-orange-950/35 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Conversation Transcript */}
      {messages.length > 0 && (
        <div className="space-y-3 max-h-[380px] overflow-y-auto p-3 bg-[#F7F8FA] dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl">
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={`p-3 rounded-xl text-xs leading-relaxed ${
                m.role === 'user'
                  ? 'bg-[#202124] dark:bg-indigo-600 text-white ml-6'
                  : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[#202124] dark:text-slate-100 mr-4'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1 opacity-80 text-[11px] font-mono-tabular">
                <span className="font-semibold">
                  {m.role === 'user' ? 'Your Question' : 'Legal Assistance Reference'}
                </span>
                <span>{new Date(m.timestamp).toLocaleTimeString('en-IN')}</span>
              </div>
              <div className="whitespace-pre-wrap">{m.content}</div>
            </div>
          ))}
          {loading && (
            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-600 dark:text-slate-300">
              Reviewing draft clauses and Indian statutory framework...
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-3 bg-[#FEF2F2] dark:bg-rose-950/40 border border-[#FECACA] dark:border-rose-800 rounded-lg text-xs text-[#991B1B] dark:text-rose-300 space-y-1">
          <p className="font-semibold flex items-center gap-1.5">
            <Scale className="w-3.5 h-3.5 shrink-0" />
            Legal Assistance Unavailable
          </p>
          <p>{error}</p>
        </div>
      )}

      {/* Ask Form */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void sendQuestion(input);
        }}
        className="flex gap-2"
      >
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about clauses, stamp duty, registration, BNS/BNSS/BSA 2023 updates, or witness rules..."
          aria-label="Ask Indian legal assistance question"
          className="flex-1 h-10 px-3 text-xs bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 rounded-lg text-[#202124] dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#FF671F]/25 focus:border-[#FF671F]"
        />
        <button
          type="submit"
          disabled={loading || input.trim().length < 2}
          className="inline-flex items-center gap-1.5 px-4 h-10 text-xs font-semibold text-white bg-[#138808] rounded-lg hover:bg-[#0F6D06] disabled:opacity-50 whitespace-nowrap cursor-pointer"
        >
          <Send className="w-3.5 h-3.5" />
          Ask
        </button>
      </form>
    </div>
  );
}
