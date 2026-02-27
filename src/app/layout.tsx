import type { Metadata } from "next";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PwaRegister } from "@/components/PwaRegister";
import { HelpPanel } from "@/components/HelpPanel";
import { WhatsNewPanel } from "@/components/WhatsNewPanel";
import { getHelpContent } from "@/lib/help-content";
import { getChangelogContent } from "@/lib/changelog-content";
import { BackgroundLibraryTasksProvider } from "@/components/BackgroundLibraryTasksProvider";
import { BackgroundTaskOverlay } from "@/components/BackgroundTaskOverlay";
import { Footer } from "@/components/Footer";

export const metadata: Metadata = {
  title: "mixtape gen",
  description: "intelligent music curation",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [helpContent, changelogContent] = await Promise.all([
    getHelpContent(),
    getChangelogContent(),
  ]);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content="#0b0b0f" />
        <link rel="icon" href="/icon.svg" />
        <link rel="apple-touch-icon" href="/icon.svg" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const theme = localStorage.getItem('theme') || 'dark';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch (e) {
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
              })();
            `,
          }}
        />
      </head>
      <body className="flex min-h-screen flex-col">
        <ThemeProvider>
          <BackgroundLibraryTasksProvider>
            <PwaRegister />
            <Navigation />
            <BackgroundTaskOverlay />
            <HelpPanel markdown={helpContent} />
            <WhatsNewPanel markdown={changelogContent} />
            <main className="flex-1 bg-app-bg">
              <div className="container mx-auto max-w-6xl px-4 py-8 md:py-12">
                {children}
              </div>
            </main>
            <Footer />
          </BackgroundLibraryTasksProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

