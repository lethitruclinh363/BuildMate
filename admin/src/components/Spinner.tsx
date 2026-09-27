import { Loader2 } from 'lucide-react';

export function Spinner() {
  return (
    <div className="grid min-h-[40vh] place-items-center">
      <Loader2 className="h-8 w-8 animate-spin text-copper-400" />
    </div>
  );
}
