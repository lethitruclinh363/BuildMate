const STEPS = [1, 2, 3, 4, 5, 6] as const;

export function EkycStepper({
  current,
  errorStep,
}: {
  current: number;
  errorStep?: number | null;
}) {
  return (
    <ol className="mb-5 grid grid-cols-6 gap-1.5">
      {STEPS.map((step) => {
        const done = step < current;
        const active = step === current;
        const failed = errorStep === step;
        return (
          <li key={step} className="flex flex-col items-center gap-1">
            <span
              className={[
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold',
                failed
                  ? 'bg-red-600 text-white'
                  : done
                    ? 'bg-copper-500 text-white'
                    : active
                      ? 'bg-navy-800 text-white'
                      : 'bg-paper-100 text-ink-400',
              ].join(' ')}
            >
              {done && !failed ? '✓' : step}
            </span>
            <span className={`h-1 w-full rounded-full ${failed ? 'bg-red-500' : done || active ? 'bg-navy-800' : 'bg-navy-800/10'}`} />
          </li>
        );
      })}
    </ol>
  );
}
