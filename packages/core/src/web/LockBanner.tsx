import * as React from 'react';
import type { LockInfo } from '../lock/types.js';

export type LockBannerProps = {
  lock: LockInfo | null;
  isLocked: boolean;
  holder?: string;
  onRefresh?: () => void;
};

export function LockBanner({ lock, isLocked }: LockBannerProps): React.JSX.Element | null {
  if (!isLocked || !lock) return null;
  return (
    <div
      style={{
        background: '#fef3c7',
        border: '1px solid #fcd34d',
        color: '#92400e',
        padding: '8px 12px',
        borderRadius: 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        fontSize: 13,
      }}
    >
      <span>
        <strong>操作中已锁定</strong> — 仅允许预览，不允许编辑 · 持有者 <code>{lock.holder}</code> ·{' '}
        {new Date(lock.acquiredAt).toLocaleString()}
        {lock.note ? ` · ${lock.note}` : ''}
      </span>
      <span style={{ fontSize: 12, opacity: 0.7 }}>flowspec lock</span>
    </div>
  );
}

export function WebEditingBanner({ holder }: { holder?: string }): React.JSX.Element {
  return (
    <div
      style={{
        background: '#dcfce7',
        border: '1px solid #86efac',
        color: '#166534',
        padding: '8px 12px',
        borderRadius: 8,
        fontSize: 13,
      }}
    >
      <strong>编辑中已锁定</strong> — 你已持有锁，保存后将自动解锁并落盘{' '}
      {holder ? `· ${holder}` : ''}
    </div>
  );
}
