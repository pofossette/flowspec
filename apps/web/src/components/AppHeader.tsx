import type { FlowSpec } from '@flowspec/domain';
import { Button, Chip, ListBox, Modal, Select } from '@heroui/react';
import * as React from 'react';
import type { ThemeMode } from '../store/theme-store.js';

function formatLockTime(acquiredAt: string | undefined): string {
  if (!acquiredAt) return '';
  const t = Date.parse(acquiredAt);
  if (!Number.isFinite(t)) return acquiredAt;
  const d = new Date(t);
  const diff = Date.now() - t;
  const mins = Math.max(0, Math.floor(diff / 60000));
  const remain = Math.max(0, 30 - mins);
  const timeStr = d.toLocaleString();
  if (mins < 60) return `${timeStr} · 已持有 ${mins} 分钟${remain > 0 ? ` · ${remain} 分钟后自动过期` : ' · 即将过期'}`;
  const hours = Math.floor(mins / 60);
  return `${timeStr} · 已持有 ${hours} 小时 ${mins % 60} 分钟 · 已过期将自动解锁`;
}

export function AppHeader(props: {
  spec: FlowSpec;
  id: string;
  dir: string;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  locked: boolean;
  isOwnedByMe: boolean;
  lockHolder: string | undefined;
  lockAcquiredAt?: string | undefined;
  editMode: boolean;
  readOnly: boolean;
  saving?: boolean;
  onToggleEdit: () => void;
  onSave: () => void;
  onRefresh: () => void;
  onUnlock?: () => void;
}): React.JSX.Element {
  const {
    spec,
    id,
    dir,
    mode,
    setMode,
    locked,
    isOwnedByMe,
    lockHolder,
    lockAcquiredAt,
    editMode,
    readOnly,
    saving,
    onToggleEdit,
    onSave,
    onRefresh,
    onUnlock,
  } = props;
  const [unlockOpen, setUnlockOpen] = React.useState(false);
  const [tick, setTick] = React.useState(0);
  // 每分钟刷新一次持有时长显示
  React.useEffect(() => {
    if (!locked || !lockAcquiredAt) return;
    const t = setInterval(() => setTick((v) => v + 1), 60000);
    return () => clearInterval(t);
  }, [locked, lockAcquiredAt]);
  // tick 用于触发 formatLockTime 重新计算
  void tick;
  const lockTimeText = locked ? formatLockTime(lockAcquiredAt) : '';
  return (
    <>
      <header data-testid="app-header" className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-panel-line bg-panel-surface px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white font-bold text-sm">
            ⟁
          </div>
          <div>
            <div data-testid="flow-title" className="font-semibold leading-none">{spec.title}</div>
            <div className="text-xs text-default-500">
              {id} · {dir} · {spec.nodes.length} 节点 · {spec.edges.length} 边
              {lockTimeText ? ` · 🔒 ${lockTimeText}` : ''}
            </div>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Select
            aria-label="主题"
            value={mode}
            onChange={(val) => {
              if (val) setMode(val as ThemeMode);
            }}
            className="w-[140px]"
          >
            <Select.Trigger className="h-8 text-sm">
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover className="min-w-[160px] rounded-xl border border-default-200 bg-white p-1.5 shadow-lg">
              <ListBox className="outline-none">
                <ListBox.Item
                  id="system"
                  textValue="跟随系统"
                  className="rounded-md px-3 py-2 text-sm data-[selected=true]:font-medium"
                >
                  跟随系统
                </ListBox.Item>
                <ListBox.Item
                  id="light"
                  textValue="亮色"
                  className="rounded-md px-3 py-2 text-sm data-[selected=true]:font-medium"
                >
                  亮色
                </ListBox.Item>
                <ListBox.Item
                  id="dark"
                  textValue="暗色"
                  className="rounded-md px-3 py-2 text-sm data-[selected=true]:font-medium"
                >
                  暗色
                </ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
          {locked ? (
            <Chip
              data-testid="lock-banner"
              color={isOwnedByMe ? 'success' : 'warning'}
              variant="soft"
              size="sm"
              className="font-medium"
              title={lockTimeText}
            >
              {isOwnedByMe ? '编辑中已锁定' : '操作中已锁定'} · {lockHolder ?? ''}
            </Chip>
          ) : editMode ? (
            <Chip data-testid="edit-banner" color="success" variant="soft" size="sm">
              编辑中
            </Chip>
          ) : (
            <Chip variant="soft" color="default" size="sm">
              预览模式
            </Chip>
          )}
          {locked ? (
            <Button
              size="sm"
              variant="secondary"
              className="font-medium border-amber-300 text-amber-700 hover:bg-amber-50"
              onPress={() => setUnlockOpen(true)}
            >
              解锁
            </Button>
          ) : null}
          <Button
            data-testid="edit-toggle"
            size="sm"
            variant={editMode ? 'secondary' : 'primary'}
            onPress={onToggleEdit}
            isDisabled={!!(locked && !isOwnedByMe && !editMode)}
            className="font-medium"
          >
            {editMode ? '预览模式' : '编辑'}
          </Button>
          <Button
            data-testid="save-button"
            size="sm"
            variant="secondary"
            onPress={onSave}
            isDisabled={readOnly || !!saving}
            className="font-medium"
          >
            保存
          </Button>
          <Button size="sm" variant="secondary" onPress={onRefresh}>
            刷新
          </Button>
        </div>
      </header>

      <Modal isOpen={unlockOpen} onOpenChange={(open) => !open && setUnlockOpen(false)}>
        <Modal.Backdrop>
          <Modal.Container>
            <Modal.Dialog className="max-w-md border border-panel-line bg-panel-surface shadow-panel">
              <Modal.Header>
                <Modal.Heading className="text-base font-semibold">确认解锁？</Modal.Heading>
              </Modal.Header>
              <Modal.Body className="text-sm leading-6 text-default-600">
                <div>
                  当前流程 <b className="text-foreground">{id}</b> 正被{' '}
                  <code className="rounded bg-default-100 px-1.5 py-0.5 text-xs">{lockHolder ?? '未知'}</code>{' '}
                  锁定。
                </div>
                {lockAcquiredAt ? (
                  <div className="mt-1 text-xs text-default-500">加锁时间：{new Date(lockAcquiredAt).toLocaleString()}</div>
                ) : null}
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                  解锁后他人可立即编辑，未保存的改动可能丢失。若对方异常退出导致持续拿锁，建议强制解锁；
                  超过 30 分钟的锁下次访问会自动过期。
                </div>
                <div className="mt-2 text-xs text-muted">此操作等同于 CLI：<code>flowspec unlock {id}</code></div>
              </Modal.Body>
              <Modal.Footer className="justify-end gap-2">
                <Button size="sm" variant="tertiary" onPress={() => setUnlockOpen(false)}>
                  取消
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  className="bg-amber-600 hover:bg-amber-700"
                  onPress={() => {
                    setUnlockOpen(false);
                    onUnlock?.();
                  }}
                >
                  确认解锁
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </>
  );
}
