import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';

/** Komponen kecil bergaya kaca untuk dashboard staf. */

export function GlassCard({ title, actions, children, className = '' }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`glass p-6 ${className}`}>
      {(title || actions) && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-base font-bold text-stone-900">{title}</h2>}
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, tone = 'teal' }: { label: string; value: number | string; tone?: 'teal' | 'amber' | 'emerald' | 'stone' }) {
  const toneClass = {
    teal: 'from-teal-500/15 text-teal-800',
    amber: 'from-amber-400/20 text-amber-900',
    emerald: 'from-emerald-500/15 text-emerald-800',
    stone: 'from-stone-400/15 text-stone-700',
  }[tone];
  return (
    <div className={`glass bg-gradient-to-br ${toneClass} to-white/60 p-5`}>
      <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

export function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: ReactNode }) {
  return (
    <label className="block space-y-1.5 text-sm font-medium text-stone-800">
      <span>
        {label} {required && <span className="text-rose-700" aria-label="wajib">*</span>}
      </span>
      {children}
      {hint && <span className="block text-xs font-normal text-stone-500">{hint}</span>}
    </label>
  );
}

export function Notice({ tone, children }: { tone: 'error' | 'success' | 'info'; children: ReactNode }) {
  const style = {
    error: 'border-rose-200 bg-rose-50/90 text-rose-900',
    success: 'border-emerald-200 bg-emerald-50/90 text-emerald-900',
    info: 'border-teal-200 bg-teal-50/90 text-teal-900',
  }[tone];
  const Icon = tone === 'error' ? AlertTriangle : CheckCircle2;
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`flex gap-2 rounded-xl border p-3 text-sm ${style}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function Spinner({ label = 'Memuat…' }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-sm text-stone-600">
      <Loader2 className="h-4 w-4 animate-spin" /> {label}
    </p>
  );
}

export function StatusChip({ status }: { status: 'draft' | 'final' }) {
  return status === 'final' ? (
    <span className="chip bg-emerald-50 text-emerald-800 ring-emerald-200">Final</span>
  ) : (
    <span className="chip bg-amber-50 text-amber-900 ring-amber-200">Draf</span>
  );
}
