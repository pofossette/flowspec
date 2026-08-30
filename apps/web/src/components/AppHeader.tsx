import type { FlowSpec } from '@flowspec/domain';
import { Button, Chip, ListBox, Select } from '@heroui/react';
import type { ThemeMode } from '../store/theme-store.js';

export function AppHeader(props: {
  spec: FlowSpec;
  id: string;
  dir: string;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  locked: boolean;
  isOwnedByMe: boolean;
  lockHolder: string | undefined;
  editMode: boolean;
  readOnly: boolean;
  saving?: boolean;
  onToggleEdit: () => void;
  onSave: () => void;
  onRefresh: () => void;
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
    editMode,
    readOnly,
    saving,
    onToggleEdit,
    onSave,
    onRefresh,
  } = props;
  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-panel-line bg-panel-surface px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white font-bold text-sm">
          ⟁
        </div>
        <div>
          <div className="font-semibold leading-none">{spec.title}</div>
          <div className="text-xs text-default-500">
            {id} · {dir} · {spec.nodes.length} 节点 · {spec.edges.length} 边
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
        {locked && !isOwnedByMe ? (
          <Chip color="warning" variant="soft" size="sm" className="font-medium">
            已锁定 · {lockHolder ?? ''}
          </Chip>
        ) : editMode ? (
          <Chip color="success" variant="soft" size="sm">
            编辑中
          </Chip>
        ) : (
          <Chip variant="soft" color="default" size="sm">
            预览模式
          </Chip>
        )}
        <Button
          size="sm"
          variant={editMode ? 'secondary' : 'primary'}
          onPress={onToggleEdit}
          isDisabled={!!(locked && !isOwnedByMe && !editMode)}
          className="font-medium"
        >
          {editMode ? '预览模式' : '编辑'}
        </Button>
        <Button
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
  );
}
