import * as React from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';

/**
 * 社区包替代手搓：基于 xyflow/react-flow-mindmap-app 的 MindMapNode（MIT）
 * - 单一组件 + data.kind 驱动颜色/图标，不再用 clipPath 手搓多形态
 * - Tailwind + HeroUI Chip，圆角矩形统一形态，彻底避免三角/菱形/六边形文字溢出与边框错位
 * - 支持 11 kind 的语义色，复用 KIND_DEFAULTS 但仅用于 Chip/边框，不再裁剪背景
 */
import { KIND_DEFAULTS, KIND_DEFAULTS_DARK, STATUS_DOT } from './FlowNodeShape.js';

export type CommunityNodeData = {
  label: string;
  content?: string | undefined;
  kind: string;
  status?: string | undefined;
  icon?: string | undefined;
  color?: string | undefined;
  bgColor?: string | undefined;
};

function useIsDark(): boolean {
  const [isDark, setIsDark] = React.useState(false);
  React.useEffect(() => {
    const check = () => setIsDark(document.documentElement.classList.contains('dark'));
    check();
    const obs = new MutationObserver(check);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return isDark;
}

export const CommunityMindMapNode = React.memo(function CommunityMindMapNode(
  props: NodeProps,
): React.JSX.Element {
  const data = props.data as CommunityNodeData;
  const kind = data.kind ?? 'branch';
  const isDark = useIsDark();
  const defs = isDark ? KIND_DEFAULTS_DARK : KIND_DEFAULTS;
  const def = defs[kind] ?? defs.branch!;
  const bg = data.bgColor ?? def.bg;
  const borderColor = data.color ?? def.border;
  const isRoot = kind === 'root';

  // 统一圆角矩形，不再按 kind 裁剪，避免手搓 bug
  return (
    <div
      className="group relative flex flex-col gap-1.5 rounded-xl border-2 bg-white px-3 py-2.5 shadow-md transition-all hover:shadow-lg dark:bg-zinc-900"
      style={{
        minWidth: isRoot ? 160 : 140,
        maxWidth: 260,
        background: bg.startsWith('linear-gradient') ? bg : undefined,
        backgroundColor: bg.startsWith('linear-gradient') ? undefined : bg,
        borderColor,
        color: def.text ?? (isDark ? '#e5e7eb' : '#111827'),
        borderRadius: isRoot ? 16 : 12,
      }}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!h-2 !w-2 !bg-[var(--panel-accent)] !border-2 !border-white"
      />
      <div className="flex items-center gap-1.5">
        <span
          className="inline-flex items-center px-1 py-0 text-[10px] font-semibold capitalize"
          style={{
            background: 'transparent',
            color: borderColor,
          }}
        >
          {kind}
        </span>
        {data.status ? (
          <span
            className="inline-flex h-2 w-2 rounded-full"
            style={{ background: STATUS_DOT[data.status]?.bg ?? '#9ca3af' }}
            title={data.status}
          />
        ) : null}
        {data.icon ? <span className="text-xs opacity-70">{data.icon}</span> : null}
      </div>

      <div className="line-clamp-2 text-sm font-semibold leading-snug" title={data.label}>
        {data.label}
      </div>

      {data.content ? (
        <div className="line-clamp-2 text-xs leading-relaxed opacity-70" title={data.content}>
          {data.content}
        </div>
      ) : null}

      <Handle
        type="source"
        position={Position.Bottom}
        className="!h-2 !w-2 !bg-[var(--panel-accent)] !border-2 !border-white"
      />
    </div>
  );
});
