/** Shared class strings. Kept out of component files so fast refresh works. */
export const inputClass = (hasError) =>
  `w-full px-3 py-2.5 rounded-xl border bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 text-sm outline-none focus:ring-2 ${
    hasError
      ? 'border-rose-300 focus:ring-rose-400'
      : 'border-slate-200 dark:border-slate-700 focus:ring-emerald-500'
  }`;
