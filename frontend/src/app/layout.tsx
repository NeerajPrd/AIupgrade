import { Suspense } from "react";
import type { Metadata } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import { TokenProvider } from "@/contexts/TokenContext";
import { ThemeProvider } from "@/components/theme-provider";
import ThemeToggle from "@/components/ThemeToggle";

import { Quicksand } from "next/font/google";
import Head from "next/head";
import { ToastContainer } from "@/utils/toast";
import { SelectedModelProvider } from "@/contexts/SelectedModelContext";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import NovaMiniChat from "@/components/common/NovaMiniChat";
import QueryProvider from "@/components/providers/QueryProvider";
import { PoweredBy } from "@/components/common/PoweredBy";

const quickSand = Quicksand({
  subsets: ["latin"],
  variable: "--font-plex-sans",
  weight: ["400", "500", "700"], // Load necessary weights
});

export const metadata: Metadata = {
  title: "Spirit Monkey",
  description: "Spirit Monkey dashboard: AI chatbots that answer customers and capture leads 24/7.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <Head>
        <meta
          httpEquiv="Content-Security-Policy"
          content="upgrade-insecure-requests"
        />

      </Head>
      <body className={`${quickSand.variable} antialiased `}>
        {/* <GradientBackground /> */}

        <QueryProvider>
          <TokenProvider>
            <SelectedModelProvider>
              <TooltipProvider>
                <div className="flex min-h-screen bg-brand-50/60 dark:bg-background">
                    <Suspense fallback={null}>
                      <Sidebar />
                    </Suspense>
                  <div className="flex flex-col flex-1 h-screen overflow-y-auto">
                    <div className="flex-1  slim-scrollbar">
                      <ThemeProvider
                        attribute="class"
                        defaultTheme="light"
                        enableSystem
                      >
                        <ThemeToggle />
                        {children}
                        <PoweredBy className="fixed bottom-4 right-4 z-20 bg-background/80 backdrop-blur-sm px-3 py-1 rounded-full border border-border shadow-sm" />
                        {/* <div className="fixed bottom-10 right-10">
                          <NovaMiniChat />
                        </div> */}
                        <ToastContainer position="bottom-right" />
                      </ThemeProvider>
                    </div>
                  </div>
                </div>
              </TooltipProvider>
            </SelectedModelProvider>
          </TokenProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
