"use client";

import { useEffect } from "react";

export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (!("serviceWorker" in navigator)) {
      return;
    }

    const registerServiceWorker = async () => {
      try {
        await navigator.serviceWorker.register("/sw.js");
      } catch (error) {
        console.warn("Service worker registration failed", error);
      }
    };

    const requestPersistentStorage = async () => {
      if (!("storage" in navigator) || typeof navigator.storage.persist !== "function") {
        return;
      }

      try {
        await navigator.storage.persist();
      } catch (error) {
        console.warn("Persistent storage request failed", error);
      }
    };

    if (document.readyState === "complete") {
      registerServiceWorker();
      requestPersistentStorage();
    } else {
      window.addEventListener("load", registerServiceWorker, { once: true });
      window.addEventListener("load", requestPersistentStorage, { once: true });
      return () => {
        window.removeEventListener("load", registerServiceWorker);
        window.removeEventListener("load", requestPersistentStorage);
      };
    }
  }, []);

  return null;
}
