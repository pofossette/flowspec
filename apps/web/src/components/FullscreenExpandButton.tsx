import type * as React from 'react';

function ExpandIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden="true"
    >
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
    </svg>
  );
}

export function FullscreenExpandButton(props: {
  onClick: () => void;
  title?: string;
}): React.JSX.Element {
  return (
    <button
      onClick={props.onClick}
      title={props.title ?? '全屏编辑'}
      className="inline-flex items-center gap-1 rounded-md border border-panel-line bg-white px-2 py-1 text-xs font-medium text-default-600 hover:bg-panel-elevated hover:text-foreground dark:bg-zinc-800 dark:border-zinc-700 dark:hover:bg-zinc-700 transition-colors"
    >
      <ExpandIcon />
      <span>全屏</span>
    </button>
  );
}
