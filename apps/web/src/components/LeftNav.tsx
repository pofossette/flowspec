import { Button } from '@heroui/react';
import type { FlowListEntry } from '../hooks/useFlowList.js';
import { FlowTabs } from './FlowTabs.js';

export function LeftNav(props: {
  flowList: FlowListEntry[];
  activeId: string;
  dir: string;
  menuCollapsed: boolean;
  onToggle: () => void;
  onSwitchFlow: (id: string) => void;
}): React.JSX.Element {
  const { flowList, activeId, dir, menuCollapsed, onToggle, onSwitchFlow } = props;
  return (
    <nav
      className={`flex shrink-0 flex-col border-r border-panel-line bg-panel-surface transition-all ${menuCollapsed ? 'w-[56px]' : 'w-[220px]'}`}
    >
      <div className="flex items-center justify-between px-2 py-2 border-b border-default-200">
        {!menuCollapsed ? (
          <span className="text-xs font-semibold px-1">工作区</span>
        ) : (
          <span className="text-xs px-1">⟁</span>
        )}
        <Button
          size="sm"
          variant="tertiary"
          className="h-6 w-6 min-w-0 p-0"
          onPress={onToggle}
          aria-label={menuCollapsed ? '展开' : '收起'}
        >
          {menuCollapsed ? '›' : '‹'}
        </Button>
      </div>
      <div className="flex-1 overflow-auto">
        <FlowTabs
          flowList={flowList}
          activeId={activeId}
          dir={dir}
          collapsed={menuCollapsed}
          onSwitch={onSwitchFlow}
        />
      </div>
    </nav>
  );
}
