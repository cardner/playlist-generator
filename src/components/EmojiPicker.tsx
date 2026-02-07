/**
 * EmojiPicker Component
 *
 * A tooltip/popover component that allows users to select or remove an emoji
 * for playlists. Displays a grid of available emojis organized by category.
 *
 * @module components/EmojiPicker
 */

"use client";

import { useState } from "react";
import { Smile, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover } from "@/design-system/components";

// All available emojis organized by category
const EMOJI_CATEGORIES = {
  mood: {
    label: "Mood",
    emojis: ["🌊", "😌", "🧘", "🌙", "❄️", "⚡", "🎉", "🔥", "💥", "😊", "💙", "📸", "💕", "✨"],
  },
  activity: {
    label: "Activity",
    emojis: ["💪", "🏃", "📚", "💼", "🚗", "🎊", "👨‍🍳", "🛋️", "😴", "🎯"],
  },
  genre: {
    label: "Genre",
    emojis: ["🎸", "🎤", "🎷", "🎹", "🎧", "🎵", "🤠", "🤘", "🎨", "🪕"],
  },
  common: {
    label: "Common",
    emojis: ["🎵", "🎶", "🎼", "🎹", "🎧", "🎤", "🎷", "🎸", "🥁", "🎺", "🎻", "🪗", "🎪", "🎭", "🎨", "🎬"],
  },
};

interface EmojiPickerProps {
  /** Current emoji value (null if no emoji) */
  value: string | null;
  /** Callback when emoji is selected or removed */
  onChange: (emoji: string | null) => void;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Emoji picker component with tooltip/popover
 *
 * Displays a button that opens a popover with emoji categories.
 * Users can select an emoji or remove the current one.
 */
export function EmojiPicker({ value, onChange, className }: EmojiPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleSelectEmoji = (emoji: string) => {
    onChange(emoji);
    setIsOpen(false);
  };

  const handleRemoveEmoji = () => {
    onChange(null);
    setIsOpen(false);
  };

  return (
    <Popover
      open={isOpen}
      onOpenChange={setIsOpen}
      trigger={
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "p-1.5 rounded-sm transition-colors",
            "hover:bg-app-hover text-app-secondary hover:text-app-primary",
            "flex items-center justify-center",
            value && "text-app-primary",
            className
          )}
          aria-label="Change emoji"
          aria-expanded={isOpen}
        >
          {value ? (
            <span className="leading-none">{value}</span>
          ) : (
            <Smile className="size-5" />
          )}
        </button>
      }
      contentClassName="min-w-[280px] max-w-[320px]"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-app-primary uppercase tracking-wider">
          Select Emoji
        </span>
        <button
          onClick={() => setIsOpen(false)}
          className="p-1 text-app-secondary hover:text-app-primary hover:bg-app-hover rounded-sm transition-colors"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Remove emoji option */}
      {value && (
        <div className="mb-3 pb-3 border-b border-app-border">
          <button
            onClick={handleRemoveEmoji}
            className="w-full px-3 py-2 text-left text-sm text-app-secondary hover:bg-app-hover hover:text-app-primary rounded-sm transition-colors flex items-center gap-2"
          >
            <X className="size-4" />
            <span>Remove emoji</span>
          </button>
        </div>
      )}

      {/* Emoji categories */}
      <div className="space-y-4 max-h-[400px] overflow-y-auto">
        {Object.entries(EMOJI_CATEGORIES).map(([key, category]) => (
          <div key={key}>
            <div className="text-xs font-medium text-app-tertiary uppercase tracking-wider mb-2">
              {category.label}
            </div>
            <div className="grid grid-cols-8 gap-1">
              {category.emojis.map((emoji, index) => (
                <button
                  key={`${key}-${index}`}
                  onClick={() => handleSelectEmoji(emoji)}
                  className={cn(
                    "p-2 rounded-sm text-lg leading-none transition-colors",
                    "hover:bg-app-hover",
                    value === emoji && "bg-accent-primary/20 ring-2 ring-accent-primary"
                  )}
                  aria-label={`Select ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Popover>
  );
}
