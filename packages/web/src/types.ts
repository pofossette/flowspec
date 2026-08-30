import type { FlowSpec } from '@flowspec/domain';
import type { RFGraph } from './adapter.js';

export type FlowMapMode = 'view' | 'edit';

export type FlowSelection = { type: 'node' | 'edge'; id: string } | null;

export type FlowMapProps = {
  spec: FlowSpec;
  mode?: FlowMapMode;
  onChange?: (next: FlowSpec) => void;
  /** @deprecated use onSelection */
  onNodeSelect?: (nodeId: string | null) => void;
  /** 新：统一选中（节点或边），只读也可选以查看详情 */
  onSelection?: (sel: FlowSelection) => void;
  selected?: FlowSelection | undefined;
  className?: string;
  /**
   * When true, canvas allows manual add: drag handle -> pane creates node+edge.
   * Mirrors React Flow tutorial's onConnectStart/onConnectEnd pattern.
   */
  allowManualAdd?: boolean;
  /** When true (locked by others), canvas is preview-only: no drag/connect/edit */
  readOnly?: boolean;
  /** Optional lock badge rendered inside canvas wrapper */
  lockHolder?: string | undefined;
  /** 主题：跟随系统/亮色/暗色，透传给 React Flow colorMode */
  colorMode?: 'light' | 'dark' | 'system' | undefined;
};

export type FlowMapHandle = {
  getSpec: () => FlowSpec;
  getRF: () => RFGraph;
  exportJson: () => string;
  focusNode: (nodeId: string) => void;
};
