"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type InstallPromptButtonProps = {
  variant?: "desktop" | "mobile";
  label?: string;
  className?: string;
};

export function InstallPromptButton({
  variant = "desktop",
  label = "Install App",
  className = "",
}: InstallPromptButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    const checkInstalled = () => {
      const isStandalone =
        window.matchMedia?.("(display-mode: standalone)").matches ?? false;
      const isIosStandalone = window.navigator.standalone === true;
      setIsInstalled(isStandalone || isIosStandalone);
    };

    checkInstalled();

    const handleBeforeInstallPrompt = (event: BeforeInstallPromptEvent) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const classes = useMemo(() => {
    const base =
      "uppercase tracking-wider rounded-sm transition-colors font-medium text-app-secondary hover:bg-app-hover hover:text-app-primary";
    const sizing =
      variant === "mobile" ? "px-6 py-4 text-lg" : "px-3 py-2 text-sm";
    return `${base} ${sizing} ${className}`.trim();
  }, [variant, className]);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) {
      return;
    }
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      setDeferredPrompt(null);
    }
  }, [deferredPrompt]);

  if (!deferredPrompt || isInstalled) {
    return null;
  }

  return (
    <button className={classes} onClick={handleInstall}>
      {label}
    </button>
  );
}
