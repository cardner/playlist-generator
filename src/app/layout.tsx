import type { Metadata } from "next";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PwaRegister } from "@/components/PwaRegister";
import { HelpPanel } from "@/components/HelpPanel";
import { getHelpContent } from "@/lib/help-content";

export const metadata: Metadata = {
  title: "mixtape gen",
  description: "intelligent music curation",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const helpContent = await getHelpContent();

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
      <body>
        <ThemeProvider>
          <PwaRegister />
          <Navigation />
          <HelpPanel markdown={helpContent} />
          <main className="min-h-screen bg-app-bg">
            <div className="container mx-auto px-4 py-8 md:py-12 max-w-6xl">
              {children}
            </div>
          </main>
        </ThemeProvider>
      </body>
    </html>
  );
}

