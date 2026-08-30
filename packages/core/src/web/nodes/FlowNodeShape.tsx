import * as React from 'react';
import { Handle, Position } from '@xyflow/react';

export type FlowNodeShapeData = {
  label: string;
  content?: string | undefined;
  kind: string;
  status?: string | undefined;
  icon?: string | undefined;
  color?: string | undefined;
  bgColor?: string | undefined;
};

export type FlowNodeShapeProps = {
  data: FlowNodeShapeData;
  selected?: boolean | undefined;
};

type KindDefault = { bg: string; border: string; text?: string };

export const KIND_DEFAULTS: Record<string, KindDefault> = {
  root: {
    bg: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    border: '#4f46e5',
    text: '#ffffff',
  },
  goal: { bg: '#eef2ff', border: '#6366f1' },
  milestone: { bg: '#fef3c7', border: '#f59e0b' },
  risk: { bg: '#ffe4e6', border: '#e11d48' },
  insight: { bg: '#ccfbf1', border: '#0d9488' },
  question: { bg: '#ede9fe', border: '#7c3aed' },
  task: { bg: '#eff6ff', border: '#3b82f6' },
  branch: { bg: '#ffffff', border: '#cbd5e1' },
  decision: { bg: '#fef3c7', border: '#f59e0b' },
  note: { bg: '#fefce8', border: '#facc15' },
  leaf: { bg: '#f8fafc', border: '#94a3b8' },
};

export const KIND_DEFAULTS_DARK: Record<string, KindDefault> = {
  root: {
    bg: 'linear-gradient(135deg, #4338ca 0%, #6d28d9 100%)',
    border: '#6366f1',
    text: '#ffffff',
  },
  goal: { bg: '#1e1b4b', border: '#818cf8', text: '#c7d2fe' },
  milestone: { bg: '#451a03', border: '#fbbf24', text: '#fde68a' },
  risk: { bg: '#4c0519', border: '#fb7185', text: '#7f1d1d' },
  insight: { bg: '#042f2e', border: '#2dd4bf', text: '#99f6e4' },
  question: { bg: '#2e1065', border: '#a78bfa', text: '#ddd6fe' },
  task: { bg: '#1e1b4b', border: '#60a5fa', text: '#bfdbfe' },
  branch: { bg: '#1f2937', border: '#4b5563', text: '#e5e7eb' },
  decision: { bg: '#451a03', border: '#fbbf24', text: '#fde68a' },
  note: { bg: '#422006', border: '#facc15', text: '#fef08a' },
  leaf: { bg: '#1e293b', border: '#64748b', text: '#cbd5e1' },
};

export const STATUS_DOT: Record<string, { bg: string; label: string; pulse?: boolean }> = {
  todo: { bg: '#9ca3af', label: 'todo' },
  doing: { bg: '#3b82f6', label: 'doing', pulse: true },
  done: { bg: '#10b981', label: 'done' },
  blocked: { bg: '#ef4444', label: 'blocked' },
  idea: { bg: '#a855f7', label: 'idea' },
};

function isDarkMode(): boolean {
  return typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
}

function resolveColors(
  kind: string,
  color: string | undefined,
  bgColor: string | undefined,
): { background: string; borderColor: string; textColor: string | undefined } {
  const dark = isDarkMode();
  const defs = dark ? KIND_DEFAULTS_DARK : KIND_DEFAULTS;
  const def = defs[kind] ?? defs.branch!;
  const background = bgColor ?? def.bg;
  const borderColor = color ?? def.border;
  const textColor = def.text ?? (kind === 'root' ? '#ffffff' : dark ? '#e5e7eb' : undefined);
  return { background, borderColor, textColor };
}

type ShapeConfig = {
  clipPath?: string;
  points?: string;
  borderRadius?: number | string;
  bgClip?: boolean;
  contentPadding?: string;
  contentMaxWidth?: string;
};

function shapeConfig(kind: string): ShapeConfig {
  switch (kind) {
    case 'goal':
      return {
        clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)',
        points: '25,0 75,0 100,50 75,100 25,100 0,50',
        bgClip: true,
        contentPadding: '8px 28px',
        contentMaxWidth: '68%',
      };
    case 'risk':
      // triangle — safe text in lower 60%, top is tip
      return {
        clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
        points: '50,0 0,100 100,100',
        bgClip: true,
        contentPadding: '20px 14px 8px',
        contentMaxWidth: '62%',
      };
    case 'question':
      return {
        clipPath: 'polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)',
        points: '30,0 70,0 100,30 100,70 70,100 30,100 0,70 0,30',
        bgClip: true,
        contentPadding: '10px 18px',
        contentMaxWidth: '74%',
      };
    case 'insight':
      return { borderRadius: 9999, contentPadding: '10px 20px' };
    case 'milestone':
    case 'decision':
      return {
        clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
        points: '50,0 100,50 50,100 0,50',
        bgClip: true,
        contentPadding: '10px 30px',
        contentMaxWidth: '66%',
      };
    default:
      return { borderRadius: 12 };
  }
}

function IconBadge({ icon }: { icon: string }): React.JSX.Element {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 18,
        height: 18,
        borderRadius: 9999,
        background: 'rgba(0,0,0,0.08)',
        fontSize: 11,
        lineHeight: 1,
        flexShrink: 0,
      }}
    >
      {icon}
    </span>
  );
}

function StatusDot({ status }: { status: string }): React.JSX.Element | null {
  const cfg = STATUS_DOT[status];
  if (!cfg) return null;
  const isDone = status === 'done';
  return (
    <span
      title={status}
      style={{
        position: 'absolute',
        top: -5,
        right: -5,
        width: 12,
        height: 12,
        borderRadius: 9999,
        background: cfg.bg,
        border: '2px solid #ffffff',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 7,
        color: '#ffffff',
        lineHeight: 1,
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
        animation: cfg.pulse ? 'flow-pulse 1.4s ease-in-out infinite' : undefined,
      }}
    >
      {isDone ? '✓' : null}
    </span>
  );
}

export const FlowNodeShape = React.memo(function FlowNodeShape(
  props: FlowNodeShapeProps,
): React.JSX.Element {
  const { data, selected } = props;
  const kind = data.kind ?? 'branch';
  const isRoot = kind === 'root';
  const { background, borderColor, textColor } = resolveColors(kind, data.color, data.bgColor);
  const cfg = shapeConfig(kind);

  const isDiamond = kind === 'milestone' || kind === 'decision';
  const isTriangle = kind === 'risk';
  const isClipped = !!cfg.bgClip;

  // base container — never clip text; background layer is clipped separately
  const base: React.CSSProperties = {
    minWidth: isRoot ? 140 : 120,
    maxWidth: 220,
    minHeight: isRoot ? 56 : isDiamond ? 88 : isTriangle ? 72 : undefined,
    height: isRoot ? 56 : undefined,
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.4,
    // transparent outer, background drawn in inner layer when clipped
    background: isClipped ? 'transparent' : `var(--flow-node-bg, ${background})`,
    borderColor: isClipped ? 'transparent' : `var(--flow-node-border, ${borderColor})`,
    borderWidth: isClipped ? 0 : 2,
    borderStyle: 'solid',
    color: textColor ? `var(--flow-node-text, ${textColor})` : 'var(--flow-node-text, #111827)',
    boxShadow: 'none',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: isRoot ? 'center' : 'flex-start',
    alignItems: isRoot ? 'center' : 'stretch',
    textAlign: isRoot || isTriangle ? 'center' : 'left',
    position: 'relative',
    boxSizing: 'border-box',
    overflow: 'visible',
    cursor: 'pointer',
  };
  (base as Record<string, string>)['--flow-node-bg'] = background;
  (base as Record<string, string>)['--flow-node-border'] = borderColor;
  (base as Record<string, string>)['--flow-node-text'] = textColor ?? '#111827';

  // rectangular shapes keep radius/border on outer
  if (!isClipped) {
    if (isRoot) {
      base.borderRadius = 9999;
      base.borderWidth = 0;
    } else if (kind === 'note') {
      base.borderRadius = 4;
      base.borderLeftWidth = 4;
    } else if (cfg.borderRadius !== undefined) {
      base.borderRadius = cfg.borderRadius as number;
    } else {
      base.borderRadius = 12;
    }
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 13,
    fontWeight: 700,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    display: 'block',
  };

  const contentStyle: React.CSSProperties = {
    fontSize: isTriangle ? 10 : 12,
    fontWeight: 400,
    lineHeight: 1.4,
    opacity: isRoot ? 0.95 : 0.75,
    color: textColor ?? '#374151',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical' as const,
    WebkitLineClamp: 2,
    overflow: 'hidden',
    wordBreak: 'break-word',
    overflowWrap: 'anywhere',
    textOverflow: 'ellipsis',
    textAlign: isTriangle ? 'center' : undefined,
    maxWidth: '100%',
  };

  const contentText = data.content ?? '';
  const showContent = !!contentText;

  // clipped shapes use SVG polygon for crisp border that follows shape (avoids clipPath border mismatch)
  const useSvgBg = isClipped && !!cfg.points;
  const bgLayer: React.CSSProperties | null =
    isClipped && !useSvgBg
      ? {
          position: 'absolute',
          inset: 0,
          background,
          border: `2px solid ${borderColor}`,
          clipPath: cfg.clipPath,
          pointerEvents: 'none',
        }
      : null;

  // selection ring — only for non-SVG (rect/ellipse); SVG uses stroke highlight
  const selectionRing: React.CSSProperties | null =
    isClipped && selected && !useSvgBg
      ? {
          position: 'absolute',
          inset: -2,
          borderRadius: 12,
          boxShadow: '0 0 0 2px #6366f1',
          pointerEvents: 'none',
        }
      : null;

  // inner content wrapper — safe inset prevents text sitting on slanted edges; triangle pushes down
  const innerStyle: React.CSSProperties = isClipped
    ? {
        position: 'relative',
        zIndex: 1,
        padding: cfg.contentPadding ?? '10px 14px',
        width: cfg.contentMaxWidth ?? '100%',
        maxWidth: cfg.contentMaxWidth ?? '100%',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: isTriangle ? 'flex-end' : 'center',
        alignItems: 'center',
        gap: 3,
        minWidth: 0,
        boxSizing: 'border-box',
        overflow: 'hidden',
        textAlign: 'center',
      }
    : {
        padding: isRoot ? '0 20px' : '10px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minWidth: 0,
        maxWidth: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
      };

  // outer shadow for non-clipped
  const outerShadow: React.CSSProperties = isClipped
    ? {}
    : {
        boxShadow: selected
          ? `0 0 0 2px #6366f1, ${isRoot ? '0 10px 15px -3px rgba(0,0,0,0.15)' : '0 4px 6px -1px rgba(0,0,0,0.1)'}`
          : isRoot
            ? '0 10px 15px -3px rgba(0,0,0,0.2), 0 4px 6px -4px rgba(0,0,0,0.1)'
            : '0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -2px rgba(0,0,0,0.1)',
      };

  return (
    <>
      <Handle
        type="target"
        position={Position.Top}
        style={{
          width: 8,
          height: 8,
          background: borderColor,
          border: '2px solid #fff',
          opacity: 0.9,
        }}
      />
      <div
        style={{ ...base, ...outerShadow }}
        title={contentText ? `${data.label}${contentText ? ' — ' + contentText : ''}` : data.label}
        data-kind={kind}
        data-selected={selected ? 'true' : 'false'}
      >
        {useSvgBg ? (
          <svg
            aria-hidden
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
              filter: selected
                ? 'drop-shadow(0 1px 3px rgba(99,102,241,0.6))'
                : 'drop-shadow(0 2px 3px rgba(0,0,0,0.12))',
            }}
          >
            <polygon
              points={cfg.points}
              fill={background}
              stroke={selected ? '#6366f1' : borderColor}
              strokeWidth={selected ? 2.5 : 2}
              vectorEffect="non-scaling-stroke"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        ) : bgLayer ? (
          <div aria-hidden style={bgLayer} />
        ) : null}
        {selectionRing ? <div aria-hidden style={selectionRing} /> : null}
        <div style={innerStyle}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              minWidth: 0,
              maxWidth: '100%',
              justifyContent: isRoot || isTriangle ? 'center' : 'flex-start',
              overflow: 'hidden',
            }}
          >
            {data.icon ? <IconBadge icon={data.icon} /> : null}
            <span
              style={{
                ...labelStyle,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                minWidth: 0,
                flex: selected ? '1 1 auto' : '0 1 auto',
              }}
            >
              {data.label}
            </span>
          </div>
          {showContent ? <span style={contentStyle}>{contentText}</span> : null}
        </div>
        {data.status ? <StatusDot status={data.status} /> : null}
      </div>
      <Handle
        type="source"
        position={Position.Bottom}
        style={{
          width: 8,
          height: 8,
          background: borderColor,
          border: '2px solid #fff',
          opacity: 0.9,
        }}
      />
    </>
  );
});
