/**
 * FlowArcEditor Component
 * 
 * Component for editing playlist flow arc sections (warmup, build, peak, cooldown).
 * Provides a visual interface for adding, editing, reordering, and deleting flow
 * arc sections that control how tracks are ordered in the playlist.
 * 
 * Features:
 * - Visual section editor with drag-and-drop reordering
 * - Add/edit/delete flow arc sections
 * - Section position editing (start/end positions 0-1)
 * - Tempo and energy level configuration
 * - Real-time strategy updates
 * 
 * State Management:
 * - Uses `useFlowArcSections` hook for section CRUD operations
 * - Uses `useDragAndDrop` hook for reordering functionality
 * - Manages editing state and form visibility
 * 
 * Flow Arc Sections:
 * - **warmup**: Slow tempo, familiar tracks (0-20% of playlist)
 * - **build**: Gradually increasing tempo (20-60%)
 * - **peak**: Highest energy, fastest tempo (60-80%)
 * - **cooldown**: Gradually decreasing tempo (80-100%)
 * - **transition**: Custom transition sections
 * 
 * Props:
 * - `strategy`: Current playlist strategy containing ordering plan
 * - `onUpdate`: Callback when strategy is updated
 * - `onReorder`: Callback when sections are reordered
 * 
 * @module components/FlowArcEditor
 * 
 * @example
 * ```tsx
 * <FlowArcEditor
 *   strategy={playlistStrategy}
 *   onUpdate={(updated) => setStrategy(updated)}
 *   onReorder={(sections) => updateOrderingPlan(sections)}
 * />
 * ```
 */

"use client";

import { useCallback, useMemo, useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { GripVertical, Plus } from "lucide-react";
import { ParentSize } from "@visx/responsive";
import { scaleLinear } from "@visx/scale";
import { LinePath, AreaClosed } from "@visx/shape";
import { curveMonotoneX } from "d3-shape";
import { AxisBottom, AxisLeft } from "@visx/axis";
import { LinearGradient } from "@visx/gradient";
import { localPoint } from "@visx/event";
import type { PlaylistStrategy } from "@/features/playlists";
import { useFlowArcSections, normalizePositions, type EditableSection } from "@/hooks/useFlowArcSections";
import { useDragAndDrop } from "@/hooks/useDragAndDrop";
import { SectionEditor } from "./SectionEditor";
import { AddSectionForm } from "./AddSectionForm";

type SectionArray = PlaylistStrategy['orderingPlan']['sections'];

interface FlowArcEditorProps {
  strategy: PlaylistStrategy;
  durationSeconds?: number;
  onUpdate: (updatedStrategy: PlaylistStrategy) => void;
  onReorder: (reorderedSections: SectionArray) => void;
}

type ChartPoint = {
  index: number;
  x: number;
  intensity: number;
};

const ENERGY_THRESHOLDS = {
  low: 0.33,
  medium: 0.66,
} as const;

const DEFAULT_SECTION_WIDTH = 0.1;
const MIN_SECTION_GAP = 0.03;

function energyToIntensity(level?: EditableSection["energyLevel"]): number {
  if (level === "high") return 0.85;
  if (level === "medium") return 0.55;
  return 0.2;
}

function intensityToEnergy(intensity: number): EditableSection["energyLevel"] {
  if (intensity >= ENERGY_THRESHOLDS.medium) return "high";
  if (intensity >= ENERGY_THRESHOLDS.low) return "medium";
  return "low";
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function intensityToColor(intensity: number): string {
  if (intensity >= ENERGY_THRESHOLDS.medium) return "#ef4444";
  if (intensity >= ENERGY_THRESHOLDS.low) return "#a855f7";
  return "#3b82f6";
}

export function FlowArcEditor({ strategy, durationSeconds = 0, onUpdate, onReorder }: FlowArcEditorProps) {
  const standardSectionNames = ["warmup", "peak", "cooldown", "transition"] as const;

  // Use hooks for section management and drag-and-drop
  const {
    sections,
    editingIndex,
    isAdding,
    handleEdit,
    handleSave,
    handleCancel,
    handleDelete,
    handleAdd,
    handleAddSection,
    handleCancelAdd,
    moveSection,
    updateSections,
  } = useFlowArcSections({ strategy, onUpdate, onReorder });

  // Handle drag-and-drop reordering
  const {
    draggedIndex,
    handleDragStart,
    handleDragOver,
    handleDragEnd: handleDragEndInternal,
  } = useDragAndDrop({
    items: sections,
    onReorder: (reorderedSections) => {
      const normalized = normalizePositions(reorderedSections);
      updateSections(normalized);
      // Convert to SectionArray and notify parent
      const validSections: SectionArray = normalized.map((s) => {
        const validName = standardSectionNames.includes(s.name as any)
          ? (s.name as "warmup" | "peak" | "cooldown" | "transition")
          : "transition";
        return {
          name: validName,
          startPosition: s.startPosition,
          endPosition: s.endPosition,
          tempoTarget: s.tempoTarget,
          energyLevel: s.energyLevel,
        };
      });
      onReorder(validSections);
    },
  });

  const handleDragOverWrapper = (e: React.DragEvent, index: number) => {
    handleDragOver(e, index);
  };

  const handleDragEndWrapper = () => {
    handleDragEndInternal();
  };

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const dragMovedRef = useRef(false);
  const pressedIndexRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const points = useMemo<ChartPoint[]>(() => {
    return sections.map((section, index) => ({
      index,
      x: clamp(section.startPosition, 0, 1),
      intensity: clamp(energyToIntensity(section.energyLevel), 0, 1),
    }));
  }, [sections]);

  const linePoints = useMemo(() => {
    if (sections.length === 0) return [];
    const sorted = [...points].sort((a, b) => a.x - b.x);
    const lastSection = sections.reduce((acc, section) =>
      section.startPosition > acc.startPosition ? section : acc
    );
    const endPoint = {
      index: -1,
      x: clamp(lastSection.endPosition, 0, 1),
      intensity: clamp(energyToIntensity(lastSection.energyLevel), 0, 1),
    };
    return [...sorted, endPoint];
  }, [points, sections]);

  const getNeighborBounds = useCallback(
    (index: number) => {
      const positions = sections
        .map((section, idx) => ({ index: idx, start: section.startPosition }))
        .sort((a, b) => a.start - b.start);
      const positionIndex = positions.findIndex((entry) => entry.index === index);
      const prev = positions[positionIndex - 1];
      const next = positions[positionIndex + 1];
      const min = prev ? prev.start + MIN_SECTION_GAP : 0;
      const max = next ? next.start - MIN_SECTION_GAP : 1;
      return {
        min: clamp(min, 0, 1),
        max: clamp(max, 0, 1),
      };
    },
    [sections]
  );

  const applyPointUpdate = useCallback(
    (index: number, nextX: number, nextIntensity: number) => {
      const { min, max } = getNeighborBounds(index);
      const clampedX = clamp(nextX, min, max);
      const updatedSections = sections.map((section, idx) => {
        if (idx !== index) return section;
        const minEnd = clamp(clampedX + DEFAULT_SECTION_WIDTH, 0, 1);
        return {
          ...section,
          startPosition: clampedX,
          endPosition: Math.max(section.endPosition, minEnd),
          energyLevel: intensityToEnergy(nextIntensity),
        };
      });
      updateSections(updatedSections);
    },
    [getNeighborBounds, sections, updateSections]
  );

  const handleChartPointerUp = useCallback(() => {
    if (dragMovedRef.current) {
      suppressClickRef.current = true;
    }
    setDraggingIndex(null);
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-app-primary text-lg font-semibold flex items-center gap-2">
          <GripVertical className="size-5" />
          Flow Arc Editor
        </h3>
        <button
          type="button"
          onClick={handleAdd}
          className="flex items-center gap-2 px-3 py-1.5 bg-accent-primary text-white rounded-sm hover:bg-accent-primary/90 transition-colors text-sm"
        >
          <Plus className="size-4" />
          Add Section
        </button>
      </div>

      <div className="space-y-2">
        {sections.map((section, index) => (
          <SectionEditor
            key={`${section.name}-${index}`}
            section={section}
            index={index}
            isEditing={editingIndex === index}
            isDragging={draggedIndex === index}
            standardNames={standardSectionNames}
            onEdit={() => handleEdit(index)}
            onSave={(updated) => handleSave(index, updated)}
            onCancel={handleCancel}
            onDelete={() => handleDelete(index)}
            onDragStart={() => handleDragStart(index)}
            onDragOver={(e) => handleDragOverWrapper(e, index)}
            onDragEnd={handleDragEndWrapper}
            onMoveUp={() => moveSection(index, "up")}
            onMoveDown={() => moveSection(index, "down")}
            canMoveUp={index > 0}
            canMoveDown={index < sections.length - 1}
          />
        ))}
      </div>

      {isAdding && (
        <AddSectionForm
          standardNames={standardSectionNames}
          existingNames={sections.map((s) => s.name)}
          onSave={handleAddSection}
          onCancel={handleCancelAdd}
        />
      )}

      {/* Interactive Flow Arc Chart */}
      <div className="mt-6 p-6 rounded-xl border border-white/10 bg-[#141218] shadow-[0_24px_70px_rgba(0,0,0,0.6)]">
        <h4 className="text-white/80 text-sm font-medium mb-4">Flow Arc Preview</h4>
        <div className="h-72">
          <ParentSize>
            {({ width, height }: { width: number; height: number }) => {
              const margin = { top: 18, right: 24, bottom: 44, left: 64 };
              const innerWidth = Math.max(width - margin.left - margin.right, 0);
              const innerHeight = Math.max(height - margin.top - margin.bottom, 0);
              const xScale = scaleLinear({
                domain: [0, 1],
                range: [0, innerWidth],
              });
              const yScale = scaleLinear({
                domain: [0, 1],
                range: [innerHeight, 0],
              });
              const xTickValues = [0, 0.5, 1];
              const yTickValues = [0.2, 0.55, 0.85];

              const handleChartPointerMove = (event: PointerEvent<SVGSVGElement>) => {
                if (draggingIndex === null) return;
                const point = localPoint(event);
                if (!point) return;
                const localX = point.x - margin.left;
                const localY = point.y - margin.top;
                const nextX = xScale.invert(clamp(localX, 0, innerWidth));
                const nextIntensity = yScale.invert(clamp(localY, 0, innerHeight));
                dragMovedRef.current = true;
                applyPointUpdate(draggingIndex, nextX, nextIntensity);
              };

              const handleChartClick = (event: MouseEvent<SVGSVGElement>) => {
                const target = event.target as SVGElement | null;
                if (target?.tagName === "circle") {
                  return;
                }
                if (draggingIndex !== null || pressedIndexRef.current !== null) {
                  return;
                }
                if (suppressClickRef.current) {
                  suppressClickRef.current = false;
                  dragMovedRef.current = false;
                  return;
                }
                if (dragMovedRef.current) {
                  dragMovedRef.current = false;
                  return;
                }
                const point = localPoint(event);
                if (!point) return;
                const localX = point.x - margin.left;
                const localY = point.y - margin.top;
                const nextX = xScale.invert(clamp(localX, 0, innerWidth));
                const nextIntensity = yScale.invert(clamp(localY, 0, innerHeight));
                const newSection: EditableSection = {
                  name: "transition",
                  startPosition: clamp(nextX, 0, 1),
                  endPosition: clamp(nextX + DEFAULT_SECTION_WIDTH, 0, 1),
                  energyLevel: intensityToEnergy(nextIntensity),
                  isCustom: true,
                };
                updateSections([...sections, newSection]);
              };

              return (
                <svg
                  ref={svgRef}
                  width={width}
                  height={height}
                  onPointerMove={handleChartPointerMove}
                  onPointerUp={handleChartPointerUp}
                  onPointerLeave={handleChartPointerUp}
                  onClick={handleChartClick}
                >
                  <LinearGradient id="flow-arc-gradient" from="#ef4444" to="#3b82f6" vertical>
                    <stop offset="50%" stopColor="#a855f7" />
                  </LinearGradient>
                  <filter id="flow-arc-glow" x="-40%" y="-40%" width="180%" height="180%">
                    <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <marker
                    id="axis-arrow"
                    viewBox="0 0 10 10"
                    refX="5"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b7280" />
                  </marker>
                  <rect
                    x={margin.left}
                    y={margin.top}
                    width={innerWidth}
                    height={innerHeight}
                    rx={8}
                    fill="transparent"
                  />
                  <g transform={`translate(${margin.left}, ${margin.top})`}>
                    {yTickValues.map((tick) => (
                      <line
                        key={`y-grid-${tick}`}
                        x1={0}
                        x2={innerWidth}
                        y1={yScale(tick)}
                        y2={yScale(tick)}
                        stroke="#2a2530"
                        strokeDasharray="4 6"
                      />
                    ))}
                    {points.map((point) => (
                      <line
                        key={`x-grid-${point.index}`}
                        x1={xScale(point.x)}
                        x2={xScale(point.x)}
                        y1={0}
                        y2={innerHeight}
                        stroke="#2a2530"
                        strokeDasharray="4 6"
                      />
                    ))}
                  </g>
                  <g transform={`translate(${margin.left}, ${margin.top})`}>
                    <line
                      x1={0}
                      x2={0}
                      y1={innerHeight}
                      y2={0}
                      stroke="#6b7280"
                      strokeWidth={1.5}
                      markerEnd="url(#axis-arrow)"
                    />
                    <line
                      x1={0}
                      x2={innerWidth}
                      y1={innerHeight}
                      y2={innerHeight}
                      stroke="#6b7280"
                      strokeWidth={1.5}
                      markerEnd="url(#axis-arrow)"
                    />
                  </g>
                  <g transform={`translate(${margin.left}, ${margin.top})`}>
                    <AreaClosed<ChartPoint>
                      data={linePoints}
                      x={(d: ChartPoint) => xScale(d.x)}
                      y={(d: ChartPoint) => yScale(d.intensity)}
                      yScale={yScale}
                      curve={curveMonotoneX}
                      fill="url(#flow-arc-gradient)"
                      fillOpacity={0.22}
                    />
                    <LinePath<ChartPoint>
                      data={linePoints}
                      x={(d: ChartPoint) => xScale(d.x)}
                      y={(d: ChartPoint) => yScale(d.intensity)}
                      curve={curveMonotoneX}
                      stroke="url(#flow-arc-gradient)"
                      strokeWidth={4}
                    />
                    {points.map((point) => (
                      <circle
                        key={`point-${point.index}`}
                        cx={xScale(point.x)}
                        cy={yScale(point.intensity)}
                        r={8}
                        fill={intensityToColor(point.intensity)}
                        stroke="#0b0b10"
                        strokeWidth={2}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          dragMovedRef.current = false;
                          pressedIndexRef.current = point.index;
                          setDraggingIndex(point.index);
                        }}
                        onPointerUp={(event) => {
                          event.stopPropagation();
                          if (
                            pressedIndexRef.current === point.index &&
                            !dragMovedRef.current
                          ) {
                            handleDelete(point.index);
                          }
                          pressedIndexRef.current = null;
                          dragMovedRef.current = false;
                          setDraggingIndex(null);
                        }}
                      />
                    ))}
                    <AxisLeft
                      scale={yScale}
                      tickValues={yTickValues}
                      tickFormat={(value) => {
                        const intensity = Number(value);
                        return intensity >= ENERGY_THRESHOLDS.medium
                          ? "High"
                          : intensity >= ENERGY_THRESHOLDS.low
                          ? "Medium"
                          : "Low";
                      }}
                      tickLabelProps={() => ({
                        fill: "#9ca3af",
                        fontSize: 10,
                        textAnchor: "end",
                        dx: "-0.5em",
                        dy: "0.3em",
                      })}
                      stroke="transparent"
                      tickStroke="#2a2530"
                    />
                    <AxisBottom
                      top={innerHeight}
                      scale={xScale}
                      tickValues={xTickValues}
                      tickFormat={(value) => {
                        const seconds = Number(value) * Math.max(durationSeconds, 0);
                        return formatDuration(seconds);
                      }}
                      tickLabelProps={() => ({
                        fill: "#9ca3af",
                        fontSize: 12,
                        textAnchor: "middle",
                        dy: "0.9em",
                      })}
                      stroke="transparent"
                      tickStroke="#2a2530"
                    />
                  </g>
                  <text
                    x={margin.left - 48}
                    y={margin.top + innerHeight / 2}
                    fill="#9ca3af"
                    fontSize={12}
                    textAnchor="middle"
                    transform={`rotate(-90 ${margin.left - 48} ${margin.top + innerHeight / 2})`}
                  >
                    Intensity
                  </text>
                  <text
                    x={margin.left + innerWidth / 2}
                    y={margin.top + innerHeight + 34}
                    fill="#9ca3af"
                    fontSize={12}
                    textAnchor="middle"
                  >
                    Duration
                  </text>
                </svg>
              );
            }}
          </ParentSize>
        </div>
      </div>
    </div>
  );
}

