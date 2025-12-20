/**
 * AddSectionForm Component
 * 
 * Form component for adding a new flow arc section to a playlist strategy.
 * Allows selecting from standard section names or creating custom sections
 * with position, tempo, and energy level configuration.
 * 
 * Features:
 * - Standard section name selection (warmup, build, peak, cooldown, transition)
 * - Custom section name input
 * - Position configuration (start/end percentages)
 * - Tempo target selection (slow/medium/fast)
 * - Energy level selection (low/medium/high)
 * - Save/cancel actions
 * 
 * Props:
 * - `standardNames`: Array of standard section names
 * - `existingNames`: Array of already-used section names (to filter out)
 * - `onSave`: Callback when section is saved
 * - `onCancel`: Callback when form is cancelled
 * 
 * @module components/AddSectionForm
 * 
 * @example
 * ```tsx
 * <AddSectionForm
 *   standardNames={['warmup', 'build', 'peak', 'cooldown']}
 *   existingNames={['warmup', 'peak']}
 *   onSave={(section) => addSection(section)}
 *   onCancel={() => setIsAdding(false)}
 * />
 * ```
 */

"use client";

import { useState } from "react";
import { Save, X } from "lucide-react";
import type { EditableSection, SectionName, TempoTarget, EnergyLevel } from "@/hooks/useFlowArcSections";

export interface AddSectionFormProps {
  standardNames: readonly SectionName[];
  existingNames: SectionName[];
  onSave: (section: EditableSection) => void;
  onCancel: () => void;
}

export function AddSectionForm({
  standardNames,
  existingNames,
  onSave,
  onCancel,
}: AddSectionFormProps) {
  const [name, setName] = useState<SectionName>("");
  const [startPosition, setStartPosition] = useState<number>(0);
  const [endPosition, setEndPosition] = useState<number>(0.2);
  const [tempoTarget, setTempoTarget] = useState<TempoTarget | undefined>();
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel | undefined>();
  const [isCustom, setIsCustom] = useState(false);

  const handleSave = () => {
    if (!name.trim()) {
      alert("Please enter a section name");
      return;
    }
    onSave({
      name: name.trim(),
      startPosition,
      endPosition,
      tempoTarget,
      energyLevel,
      isCustom: !standardNames.includes(name.trim()),
    });
  };

  return (
    <div className="p-4 bg-app-surface border border-accent-primary rounded-sm space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-app-primary font-medium">Add New Section</h4>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSave}
            className="p-1.5 text-green-500 hover:bg-app-hover rounded-sm transition-colors"
          >
            <Save className="size-4" />
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="p-1.5 text-red-500 hover:bg-app-hover rounded-sm transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-app-secondary text-xs mb-1">Name</label>
          <select
            value={isCustom ? "" : name}
            onChange={(e) => {
              if (e.target.value) {
                setName(e.target.value);
                setIsCustom(false);
              } else {
                setIsCustom(true);
              }
            }}
            className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
          >
            <option value="">Custom...</option>
            {standardNames
              .filter((n) => !existingNames.includes(n))
              .map((n) => (
                <option key={n} value={n}>
                  {n.charAt(0).toUpperCase() + n.slice(1)}
                </option>
              ))}
          </select>
          {isCustom && (
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Custom section name"
              className="w-full mt-2 px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
            />
          )}
        </div>

        <div>
          <label className="block text-app-secondary text-xs mb-1">Start Position (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={Math.round(startPosition * 100)}
            onChange={(e) => setStartPosition(parseInt(e.target.value) / 100)}
            className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
          />
        </div>

        <div>
          <label className="block text-app-secondary text-xs mb-1">End Position (%)</label>
          <input
            type="number"
            min="0"
            max="100"
            step="1"
            value={Math.round(endPosition * 100)}
            onChange={(e) => setEndPosition(parseInt(e.target.value) / 100)}
            className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
          />
        </div>

        <div>
          <label className="block text-app-secondary text-xs mb-1">Tempo Target</label>
          <select
            value={tempoTarget || ""}
            onChange={(e) =>
              setTempoTarget(e.target.value ? (e.target.value as TempoTarget) : undefined)
            }
            className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
          >
            <option value="">None</option>
            <option value="slow">Slow</option>
            <option value="medium">Medium</option>
            <option value="fast">Fast</option>
          </select>
        </div>

        <div>
          <label className="block text-app-secondary text-xs mb-1">Energy Level</label>
          <select
            value={energyLevel || ""}
            onChange={(e) =>
              setEnergyLevel(e.target.value ? (e.target.value as EnergyLevel) : undefined)
            }
            className="w-full px-3 py-2 bg-app-hover text-app-primary rounded-sm border border-app-border focus:outline-none focus:border-accent-primary"
          >
            <option value="">None</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>
      </div>
    </div>
  );
}

