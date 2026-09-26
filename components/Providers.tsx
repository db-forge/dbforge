"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import type { Locale } from "@/lib/frontend/i18n";
import { wagmiConfig } from "@/lib/frontend/wagmi";
import { I18nProvider } from "./I18nProvider";
import { ToastProvider } from "./Toaster";

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <I18nProvider locale={locale}>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>{children}</ToastProvider>
        </QueryClientProvider>
      </WagmiProvider>
    </I18nProvider>
  );
}
