import { QueryClientProvider } from "@tanstack/react-query";

import { LaplaceDirectTutor } from "@/features/laplace/components/LaplaceDirectTutor";
import { queryClient } from "@/lib/query-client";


export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <main className="min-h-screen bg-background text-foreground">
        <LaplaceDirectTutor />
      </main>
    </QueryClientProvider>
  );
}
