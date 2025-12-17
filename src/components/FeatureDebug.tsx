"use client";

import {
  supportsFileSystemAccess,
  supportsIndexedDB,
  supportsCacheStorage,
  supportsWebWorkers,
} from "@/lib/feature-detection";

export function FeatureDebug() {
  const features = {
    "File System Access API": supportsFileSystemAccess(),
    "IndexedDB": supportsIndexedDB(),
    "Cache Storage": supportsCacheStorage(),
    "Web Workers": supportsWebWorkers(),
  };

  return (
    <div className="mt-8 p-4 bg-gray-100 dark:bg-gray-800 rounded-lg">
      <h3 className="font-semibold mb-3">Browser Feature Detection (Debug)</h3>
      <div className="space-y-2 text-sm">
        {Object.entries(features).map(([name, supported]) => (
          <div key={name} className="flex items-center justify-between">
            <span className="text-gray-700 dark:text-gray-300">{name}:</span>
            <span
              className={`font-mono ${
                supported
                  ? "text-green-600 dark:text-green-400"
                  : "text-red-600 dark:text-red-400"
              }`}
            >
              {supported ? "✅ Supported" : "❌ Not Supported"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

