import * as React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react';

type FlowEdgeData = {
  kind?: string | undefined;
  color?: string | undefined;
  width?: number | undefined;
  dash?: string | undefined;
  content?: string | undefined;
};

// shared animation css — now centralized in FlowGlobalStyles (singleton); kept for reference
export const EDGE_ANIMATION_CSS = `@keyframes dashflow{to{stroke-dashoffset:-20}} .flow-edge-animated{animation:dashflow 1.2s linear infinite}`;

function isDarkMode(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function resolveStroke(
  data: FlowEdgeData | undefined,
  fallbackColor: string,
  fallbackWidth: number,
  fallbackDash: string | undefined,
  darkFallback?: string,
): { stroke: string; strokeWidth: number; strokeDasharray: string | undefined } {
  const isDark = isDarkMode();
  const effectiveFallback = isDark && darkFallback ? darkFallback : fallbackColor;
  const stroke = data?.color ?? effectiveFallback;
  const strokeWidth = data?.width ?? fallbackWidth;
  const strokeDasharray = data?.dash ?? fallbackDash;
  return { stroke, strokeWidth, strokeDasharray };
}

function EdgeLabel({
  labelX,
  labelY,
  label,
  variant,
}: {
  labelX: number;
  labelY: number;
  label: string | undefined;
  variant?: 'default' | 'blocked' | undefined;
}): React.JSX.Element | null {
  if (label == null || label === '') return null;
  const isBlocked = variant === 'blocked';
  const isDark = isDarkMode();
  return (
    <EdgeLabelRenderer>
      <div
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          pointerEvents: 'all',
          background: isBlocked ? (isDark ? '#4c0519' : '#ffe4e6') : isDark ? '#1f2937' : '#ffffff',
          color: isBlocked ? (isDark ? '#fecdd3' : '#e11d48') : isDark ? '#e5e7eb' : '#111827',
          border: isBlocked
            ? `1px solid ${isDark ? '#881337' : '#fecdd3'}`
            : `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
          borderRadius: 6,
          padding: '4px 8px',
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.2,
          whiteSpace: 'nowrap',
          boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
        }}
        className="nodrag nopan"
      >
        {label}
      </div>
    </EdgeLabelRenderer>
  );
}

function ArrowMarkerDef({
  id,
  color,
  size = 8,
}: {
  id: string;
  color: string;
  size?: number;
}): React.JSX.Element {
  return (
    <svg style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden' }} aria-hidden>
      <defs>
        <marker
          id={id}
          viewBox="0 0 10 10"
          refX={9}
          refY={5}
          markerWidth={size}
          markerHeight={size}
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill={color} />
        </marker>
      </defs>
    </svg>
  );
}

// hierarchical: smoothstep + slate-300 2px, markerEnd arrowClosed slate
export function HierarchicalEdge(props: EdgeProps): React.JSX.Element {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    label,
    style,
  } = props;
  const d = data as FlowEdgeData | undefined;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });
  const { stroke, strokeWidth, strokeDasharray } = resolveStroke(
    d,
    '#cbd5e1',
    2,
    undefined,
    '#475569',
  );
  const markerId = `arrow-hier-${id}`;
  const edgeStyle: React.CSSProperties = {
    stroke,
    strokeWidth,
    ...(strokeDasharray ? { strokeDasharray } : {}),
    ...(style as React.CSSProperties | undefined),
  };
  return (
    <>
      <ArrowMarkerDef id={markerId} color={stroke} size={8} />
      <BaseEdge id={id} path={path} style={edgeStyle} markerEnd={`url(#${markerId})`} />
      <EdgeLabel
        labelX={labelX}
        labelY={labelY}
        label={typeof label === 'string' ? label : undefined}
      />
    </>
  );
}

// sequence: bezier + slate-900 2px solid big arrow
export function SequenceEdge(props: EdgeProps): React.JSX.Element {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    label,
    style,
  } = props;
  const d = data as FlowEdgeData | undefined;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const { stroke, strokeWidth, strokeDasharray } = resolveStroke(
    d,
    '#0f172a',
    2,
    undefined,
    '#e2e8f0',
  );
  const markerId = `arrow-seq-${id}`;
  const edgeStyle: React.CSSProperties = {
    stroke,
    strokeWidth,
    ...(strokeDasharray ? { strokeDasharray } : {}),
    ...(style as React.CSSProperties | undefined),
  };
  return (
    <>
      <ArrowMarkerDef id={markerId} color={stroke} size={10} />
      <BaseEdge id={id} path={path} style={edgeStyle} markerEnd={`url(#${markerId})`} />
      <EdgeLabel
        labelX={labelX}
        labelY={labelY}
        label={typeof label === 'string' ? label : undefined}
      />
    </>
  );
}

// dependency: bezier + amber-500 2px dashed 6 4 + animated dashflow 1.2s
export function DependencyEdge(props: EdgeProps): React.JSX.Element {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    label,
    style,
  } = props;
  const d = data as FlowEdgeData | undefined;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const { stroke, strokeWidth, strokeDasharray } = resolveStroke(d, '#f59e0b', 2, '6 4', '#fbbf24');
  const markerId = `arrow-dep-${id}`;
  const edgeStyle: React.CSSProperties = {
    stroke,
    strokeWidth,
    strokeDasharray,
    ...(style as React.CSSProperties | undefined),
  };
  return (
    <>
      <ArrowMarkerDef id={markerId} color={stroke} size={8} />
      <BaseEdge
        id={id}
        path={path}
        style={edgeStyle}
        markerEnd={`url(#${markerId})`}
        className="flow-edge-animated"
      />
      <EdgeLabel
        labelX={labelX}
        labelY={labelY}
        label={typeof label === 'string' ? label : undefined}
      />
    </>
  );
}

// async: bezier + sky-500 2px dotted 2 6 + animated
export function AsyncEdge(props: EdgeProps): React.JSX.Element {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    label,
    style,
  } = props;
  const d = data as FlowEdgeData | undefined;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const { stroke, strokeWidth, strokeDasharray } = resolveStroke(d, '#0ea5e9', 2, '2 6', '#38bdf8');
  const markerId = `arrow-async-${id}`;
  const edgeStyle: React.CSSProperties = {
    stroke,
    strokeWidth,
    strokeDasharray,
    ...(style as React.CSSProperties | undefined),
  };
  return (
    <>
      <ArrowMarkerDef id={markerId} color={stroke} size={8} />
      <BaseEdge
        id={id}
        path={path}
        style={edgeStyle}
        markerEnd={`url(#${markerId})`}
        className="flow-edge-animated"
      />
      <EdgeLabel
        labelX={labelX}
        labelY={labelY}
        label={typeof label === 'string' ? label : undefined}
      />
    </>
  );
}

// reference: straight + gray-400 1.5px dotted
export function ReferenceEdge(props: EdgeProps): React.JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, data, label, style } = props;
  const d = data as FlowEdgeData | undefined;
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const { stroke, strokeWidth, strokeDasharray } = resolveStroke(
    d,
    '#9ca3af',
    1.5,
    '2 4',
    '#6b7280',
  );
  const edgeStyle: React.CSSProperties = {
    stroke,
    strokeWidth,
    strokeDasharray,
    ...(style as React.CSSProperties | undefined),
  };
  return (
    <>
      <BaseEdge id={id} path={path} style={edgeStyle} />
      <EdgeLabel
        labelX={labelX}
        labelY={labelY}
        label={typeof label === 'string' ? label : undefined}
      />
    </>
  );
}

// causal: step + violet-600 2.5px thick
export function CausalEdge(props: EdgeProps): React.JSX.Element {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    label,
    style,
  } = props;
  const d = data as FlowEdgeData | undefined;
  // step: sharp corners via borderRadius 0
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
  });
  const { stroke, strokeWidth, strokeDasharray } = resolveStroke(
    d,
    '#7c3aed',
    2.5,
    undefined,
    '#a78bfa',
  );
  const markerId = `arrow-causal-${id}`;
  const edgeStyle: React.CSSProperties = {
    stroke,
    strokeWidth,
    ...(strokeDasharray ? { strokeDasharray } : {}),
    ...(style as React.CSSProperties | undefined),
  };
  return (
    <>
      <ArrowMarkerDef id={markerId} color={stroke} size={9} />
      <BaseEdge id={id} path={path} style={edgeStyle} markerEnd={`url(#${markerId})`} />
      <EdgeLabel
        labelX={labelX}
        labelY={labelY}
        label={typeof label === 'string' ? label : undefined}
      />
    </>
  );
}

// feedback: bezier (curvature -0.6 backwind) + teal-500 2px dashed + label "feedback" centered
export function FeedbackEdge(props: EdgeProps): React.JSX.Element {
  const {
    id,
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    data,
    label,
    style,
  } = props;
  const d = data as FlowEdgeData | undefined;
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: -0.6,
  });
  const { stroke, strokeWidth, strokeDasharray } = resolveStroke(d, '#14b8a6', 2, '6 4', '#2dd4bf');
  const markerId = `arrow-feedback-${id}`;
  const edgeStyle: React.CSSProperties = {
    stroke,
    strokeWidth,
    strokeDasharray,
    ...(style as React.CSSProperties | undefined),
  };
  const displayLabel = typeof label === 'string' && label !== '' ? label : 'feedback';
  return (
    <>
      <ArrowMarkerDef id={markerId} color={stroke} size={8} />
      <BaseEdge id={id} path={path} style={edgeStyle} markerEnd={`url(#${markerId})`} />
      <EdgeLabel labelX={labelX} labelY={labelY} label={displayLabel} />
    </>
  );
}

// blocked: straight + rose-600 2px + markerEnd cross (svg × follows stroke/data.color) + label "blocked" red bg
export function BlockedEdge(props: EdgeProps): React.JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, data, label, style } = props;
  const d = data as FlowEdgeData | undefined;
  const [path, labelX, labelY] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  const { stroke, strokeWidth, strokeDasharray } = resolveStroke(
    d,
    '#e11d48',
    2,
    undefined,
    '#fb7185',
  );
  const edgeStyle: React.CSSProperties = {
    stroke,
    strokeWidth,
    ...(strokeDasharray ? { strokeDasharray } : {}),
    ...(style as React.CSSProperties | undefined),
  };
  const displayLabel = typeof label === 'string' && label !== '' ? label : 'blocked';
  // cross at target: two diagonal lines length 12 — stroke follows data.color via resolveStroke
  const crossSize = 6;
  return (
    <>
      <BaseEdge id={id} path={path} style={edgeStyle} />
      {/* cross marker at target — follows stroke */}
      <g>
        <line
          x1={targetX - crossSize}
          y1={targetY - crossSize}
          x2={targetX + crossSize}
          y2={targetY + crossSize}
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <line
          x1={targetX + crossSize}
          y1={targetY - crossSize}
          x2={targetX - crossSize}
          y2={targetY + crossSize}
          stroke={stroke}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </g>
      <EdgeLabel labelX={labelX} labelY={labelY} label={displayLabel} variant="blocked" />
    </>
  );
}
