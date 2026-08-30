import * as React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  getSmoothStepPath,
  getStraightPath,
  type EdgeProps,
} from '@xyflow/react';

/**
 * 社区包替代手搓边：保留 CommunityMindMapNode 的统一卡片形态，
 * 边侧改用 BaseEdge + 官方 get*Path（避免 SmartEdgeProvider 的路由循环导致 React #185）
 * 样式仍区分 8 kind，足够视觉区分且稳定
 */

function isDarkMode(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function EdgeLabel({
  labelX,
  labelY,
  label,
}: { labelX: number; labelY: number; label: string | undefined }): React.JSX.Element | null {
  if (!label) return null;
  const isDark = isDarkMode();
  return (
    <EdgeLabelRenderer>
      <div
        style={{
          position: 'absolute',
          transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
          background: isDark ? '#27272a' : '#fff',
          color: isDark ? '#e5e7eb' : '#111827',
          border: `1px solid ${isDark ? '#3f3f46' : '#e5e7eb'}`,
          borderRadius: 6,
          padding: '2px 6px',
          fontSize: 11,
          fontWeight: 600,
          whiteSpace: 'nowrap',
        }}
        className="nodrag nopan"
      >
        {label}
      </div>
    </EdgeLabelRenderer>
  );
}

// 统一用 get*Path + BaseEdge（无 SmartEdgeProvider，避免 #185 循环）
export function CommunityHierarchicalEdge(props: EdgeProps): React.JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, style } =
    props;
  const [path, lx, ly] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: '#94a3b8', strokeWidth: 1.8, ...(style as object) } as React.CSSProperties}
      />
      <EdgeLabel labelX={lx} labelY={ly} label={typeof label === 'string' ? label : undefined} />
    </>
  );
}

export function CommunitySequenceEdge(props: EdgeProps): React.JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, style } =
    props;
  const [path, lx, ly] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: '#0f172a', strokeWidth: 2, ...(style as object) } as React.CSSProperties}
      />
      <EdgeLabel labelX={lx} labelY={ly} label={typeof label === 'string' ? label : undefined} />
    </>
  );
}

export function CommunityDependencyEdge(props: EdgeProps): React.JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, style } =
    props;
  const [path, lx, ly] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={
          {
            stroke: '#f59e0b',
            strokeWidth: 2,
            strokeDasharray: '6 4',
            ...(style as object),
          } as React.CSSProperties
        }
      />
      <EdgeLabel labelX={lx} labelY={ly} label={typeof label === 'string' ? label : undefined} />
    </>
  );
}

export function CommunityAsyncEdge(props: EdgeProps): React.JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, style } =
    props;
  const [path, lx, ly] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={
          {
            stroke: '#0ea5e9',
            strokeWidth: 2,
            strokeDasharray: '2 6',
            ...(style as object),
          } as React.CSSProperties
        }
      />
      <EdgeLabel labelX={lx} labelY={ly} label={typeof label === 'string' ? label : undefined} />
    </>
  );
}

export function CommunityReferenceEdge(props: EdgeProps): React.JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, label, style } = props;
  const [path, lx, ly] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={
          {
            stroke: '#9ca3af',
            strokeWidth: 1.5,
            strokeDasharray: '2 4',
            ...(style as object),
          } as React.CSSProperties
        }
      />
      <EdgeLabel labelX={lx} labelY={ly} label={typeof label === 'string' ? label : undefined} />
    </>
  );
}

export function CommunityCausalEdge(props: EdgeProps): React.JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, style } =
    props;
  const [path, lx, ly] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 0,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: '#7c3aed', strokeWidth: 2.5, ...(style as object) } as React.CSSProperties}
      />
      <EdgeLabel labelX={lx} labelY={ly} label={typeof label === 'string' ? label : undefined} />
    </>
  );
}

export function CommunityFeedbackEdge(props: EdgeProps): React.JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, style } =
    props;
  const [path, lx, ly] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: -0.6,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={
          {
            stroke: '#14b8a6',
            strokeWidth: 2,
            strokeDasharray: '6 4',
            ...(style as object),
          } as React.CSSProperties
        }
      />
      <EdgeLabel
        labelX={lx}
        labelY={ly}
        label={typeof label === 'string' && label ? label : 'feedback'}
      />
    </>
  );
}

export function CommunityBlockedEdge(props: EdgeProps): React.JSX.Element {
  const { id, sourceX, sourceY, targetX, targetY, label, style } = props;
  const [path, lx, ly] = getStraightPath({ sourceX, sourceY, targetX, targetY });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke: '#e11d48', strokeWidth: 2, ...(style as object) } as React.CSSProperties}
      />
      <EdgeLabel
        labelX={lx}
        labelY={ly}
        label={typeof label === 'string' && label ? label : 'blocked'}
      />
    </>
  );
}
