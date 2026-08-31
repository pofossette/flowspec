import type { FlowSpec } from '@flowspec/domain';
import * as React from 'react';
import { flowSpecToRF, type RFEdge, type RFNode, rfToFlowSpec } from './adapter.js';
import { flowEdgeTypes } from './edges/index.js';
import { FlowGlobalStyles } from './FlowGlobalStyles.js';
import { KIND_DEFAULTS } from './nodes/FlowNodeShape.js';
import { flowNodeTypes } from './nodes/index.js';
import type { FlowMapProps } from './types.js';

/**
 * Minimal React Flow wrapper with soft dependency.
 * - If @xyflow/react is installed, uses it; otherwise renders a fallback JSON + SVG preview.
 * - Keeps build green even when peer not installed (CLI-only usage).
 */
type RFModule = typeof import('@xyflow/react');

function FallbackCanvas(
  props: FlowMapProps & { rf: ReturnType<typeof flowSpecToRF> }
): React.JSX.Element {
  const { spec, mode = 'edit', className, allowManualAdd = true, rf, readOnly, lockHolder } = props;
  return (
    <div data-testid="flow-canvas" className={className} style={{ padding: 16, border: '1px dashed #888', borderRadius: 8 }}>
      {readOnly ? (
        <div
          data-testid="lock-banner"
          style={{
            background: '#fef3c7',
            border: '1px solid #fcd34d',
            padding: '6px 10px',
            borderRadius: 6,
            fontSize: 12,
            marginBottom: 8,
          }}
        >
          操作中已锁定，仅允许预览{lockHolder ? ` · ${lockHolder}` : ''} — 预览模式
        </div>
      ) : null}
      <div data-testid="flow-title" style={{ fontWeight: 700, marginBottom: 8 }}>{spec.title}</div>
      <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>{spec.description}</div>
      <pre
        style={{
          fontSize: 12,
          maxHeight: 400,
          overflow: 'auto',
          background: '#f6f6f6',
          padding: 12,
        }}
      >
        {JSON.stringify(spec, null, 2)}
      </pre>
      <div style={{ fontSize: 12, opacity: 0.6 }}>
        Install <code>@xyflow/react</code> to enable interactive canvas. Nodes: {rf.nodes.length},
        Edges: {rf.edges.length} — mode {mode} {allowManualAdd ? '(manual add enabled)' : ''}{' '}
        {readOnly ? '(read-only)' : ''}
      </div>
    </div>
  );
}

export function FlowMapCanvas(props: FlowMapProps): React.JSX.Element {
  const { spec, colorMode } = props;
  const rf = React.useMemo(() => flowSpecToRF(spec), [spec]);
  const [rfMod, setRfMod] = React.useState<RFModule | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    import('@xyflow/react')
      .then((m) => {
        if (!cancelled) setRfMod(m as RFModule);
      })
      .catch(() => {
        // peer not installed — keep fallback
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!rfMod) return <FallbackCanvas {...props} rf={rf} />;
  const { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, addEdge } = rfMod;
  const readOnly = !!props.readOnly;
  return (
    <FlowMapCanvasInner
      rf={rf}
      spec={spec}
      onChange={props.onChange}
      onNodeSelect={props.onNodeSelect}
      onSelection={props.onSelection}
      selected={props.selected}
      allowManualAdd={readOnly ? false : (props.allowManualAdd ?? true)}
      readOnly={readOnly}
      lockHolder={props.lockHolder}
      colorMode={colorMode ?? 'system'}
      components={{
        ReactFlow,
        Background,
        Controls,
        MiniMap,
        useNodesState,
        useEdgesState,
        addEdge,
      }}
    />
  );
}

function FlowMapCanvasInner(props: {
  rf: { nodes: RFNode[]; edges: RFEdge[] };
  spec: FlowSpec;
  onChange?: ((n: FlowSpec) => void) | undefined;
  onNodeSelect?: ((id: string | null) => void) | undefined;
  onSelection?: ((sel: { type: 'node' | 'edge'; id: string } | null) => void) | undefined;
  selected?: { type: 'node' | 'edge'; id: string } | null | undefined;
  allowManualAdd: boolean;
  readOnly: boolean;
  lockHolder?: string | undefined;
  colorMode?: 'light' | 'dark' | 'system' | undefined;
  components: Pick<
    RFModule,
    | 'ReactFlow'
    | 'Background'
    | 'Controls'
    | 'MiniMap'
    | 'useNodesState'
    | 'useEdgesState'
    | 'addEdge'
  >;
}): React.JSX.Element {
  const {
    rf,
    spec,
    onChange,
    onNodeSelect,
    onSelection,
    selected,
    allowManualAdd,
    readOnly,
    lockHolder,
    colorMode,
    components,
  } = props;
  const { ReactFlow, Background, Controls, MiniMap, useNodesState, useEdgesState, addEdge } =
    components;
  const [nodes, setNodes, onNodesChange] = useNodesState(rf.nodes as never);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rf.edges as never);

  React.useEffect(() => {
    setNodes(rf.nodes as never);
    setEdges(rf.edges as never);
  }, [rf, setNodes, setEdges]);

  const onConnect = React.useCallback(
    (params: { source: string; target: string }) => {
      // lib type gap: RFEdge vs @xyflow Edge label ReactNode incompatibility, safe to cast via unknown
      setEdges(
        (eds) =>
          addEdge(
            { ...params, id: `e-${Date.now()}`, type: 'hierarchical' } as unknown as never,
            eds as unknown as never
          ) as unknown as never
      );
    },
    [addEdge, setEdges]
  );

  // Drag handle -> pane to create node (React Flow tutorial pattern)
  const connectingId = React.useRef<string | null>(null);
  const onConnectStart = React.useCallback((_: unknown, p: { nodeId?: string | null }) => {
    connectingId.current = (p?.nodeId as string) ?? null;
  }, []);
  const onConnectEnd = React.useCallback(
    (event: MouseEvent) => {
      if (!allowManualAdd || !connectingId.current) return;
      const target = event.target as Element | null;
      const isPane = target?.classList.contains('react-flow__pane');
      if (!isPane || !onChange) return;
      // Approximate position from mouse; real impl would use screenToFlowPosition
      const newId = `node-${Math.random().toString(36).slice(2, 6)}`;
      const nextSpec: FlowSpec = {
        ...spec,
        nodes: [
          ...spec.nodes,
          { id: newId, kind: 'branch', label: 'New node', position: { x: 0, y: 0 } },
        ],
        edges: [
          ...spec.edges,
          {
            id: `edge-${newId}`,
            source: connectingId.current!,
            target: newId,
            kind: 'hierarchical',
            directed: true,
          },
        ],
        updatedAt: new Date().toISOString(),
      };
      onChange(nextSpec);
    },
    [allowManualAdd, onChange, spec]
  );

  // sync back to FlowSpec on any rf change
  React.useEffect(() => {
    if (!onChange || readOnly) return;
    const t = setTimeout(() => {
      const next = rfToFlowSpec({ nodes: nodes as RFNode[], edges: edges as RFEdge[] }, spec);
      // avoid loops: only emit when counts differ
      if (next.nodes.length !== spec.nodes.length || next.edges.length !== spec.edges.length)
        onChange(next);
    }, 300);
    return () => clearTimeout(t);
  }, [nodes, edges, onChange, spec, readOnly]);

  // MiniMap per-kind coloring — aligned with node KIND_DEFAULTS border palette
  const minimapNodeColor = React.useCallback((n: { data?: { kind?: string } }): string => {
    const kind = (n.data?.kind ?? 'branch') as string;
    const def = (KIND_DEFAULTS as Record<string, { border: string }>)[kind];
    // use border color for vivid differentiation; fallback slate-300
    return def?.border ?? '#cbd5e1';
  }, []);

  const isDark = colorMode === 'dark';
  const canvasVars: React.CSSProperties & Record<string, string> = isDark
    ? {
        '--xy-node-background-color': '#1f2937',
        '--xy-node-border': '1px solid #374151',
        '--xy-node-border-radius': '12px',
        '--xy-background-color': '#0a0a0a',
        '--xy-controls-button-background-color': '#262626',
        '--xy-controls-button-background-color-hover': '#2e2e2e',
        '--xy-minimap-background-color': '#171717',
        '--xy-minimap-mask-background-color': 'rgba(10,10,10,0.6)',
        '--flow-canvas-bg': '#0a0a0a',
        '--flow-canvas-border': '#27272a',
      }
    : {
        '--xy-node-background-color': '#ffffff',
        '--xy-node-border': '1px solid #e5e7eb',
        '--xy-node-border-radius': '12px',
        '--xy-background-color': '#f9fafb',
        '--xy-controls-button-background-color': '#ffffff',
        '--xy-minimap-background-color': '#ffffff',
        '--flow-canvas-bg': '#f9fafb',
        '--flow-canvas-border': '#e5e7eb',
      };

  return (
    <div
      data-testid="flow-canvas"
      style={
        {
          width: '100%',
          height: '100%',
          minHeight: 0,
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          ...canvasVars,
        } as React.CSSProperties
      }
      className={isDark ? 'dark' : undefined}
    >
      <FlowGlobalStyles />
      {readOnly ? (
        <div
          data-testid="lock-banner"
          style={{
            background: isDark ? '#422006' : '#fef3c7',
            border: `1px solid ${isDark ? '#92400e' : '#fcd34d'}`,
            color: isDark ? '#fde68a' : '#92400e',
            padding: '8px 12px',
            borderRadius: 8,
            fontSize: 13,
          }}
        >
          操作中已锁定，仅允许预览，不允许任何编辑{lockHolder ? ` · ${lockHolder}` : ''}
        </div>
      ) : null}
      <div
        data-testid="flow-canvas"
        style={
          {
            width: '100%',
            flex: 1,
            minHeight: 400,
            height: '100%',
            borderRadius: 12,
            overflow: 'hidden',
            border: readOnly
              ? `1px solid ${isDark ? '#92400e' : '#fcd34d'}`
              : `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
            background: isDark ? '#0a0a0a' : '#f9fafb',
            opacity: readOnly ? 0.85 : 1,
            ...canvasVars,
          } as React.CSSProperties
        }
      >
        <ReactFlow
          nodes={nodes as never}
          edges={edges as never}
          nodeTypes={flowNodeTypes as never}
          edgeTypes={flowEdgeTypes as never}
          onNodesChange={(readOnly ? () => {} : onNodesChange) as never}
          onEdgesChange={(readOnly ? () => {} : onEdgesChange) as never}
          onConnect={(readOnly ? () => {} : onConnect) as never}
          onConnectStart={(readOnly ? () => {} : onConnectStart) as never}
          onConnectEnd={(readOnly ? () => {} : onConnectEnd) as never}
          onNodeClick={(_: unknown, node: { id: string }) => {
            const sel = { type: 'node' as const, id: node.id };
            onSelection?.(sel);
            onNodeSelect?.(node.id);
          }}
          onEdgeClick={(_: unknown, edge: { id: string }) => {
            const sel = { type: 'edge' as const, id: edge.id };
            onSelection?.(sel);
          }}
          onPaneClick={() => {
            onSelection?.(null);
            onNodeSelect?.(null);
          }}
          nodesDraggable={!readOnly}
          nodesConnectable={!readOnly}
          elementsSelectable
          fitView
          colorMode={colorMode ?? 'system'}
          style={
            {
              background: colorMode === 'dark' ? '#0a0a0a' : '#f9fafb',
              borderRadius: 12,
            } as React.CSSProperties
          }
        >
          <Background
            // lib type gap: Background variant union narrow, safe to pass string literal
            {...({
              variant: 'dots',
              gap: 12,
              size: 1,
              color: colorMode === 'dark' ? '#27272a' : '#e5e7eb',
            } as unknown as Record<string, unknown>)} // lib type gap: RF Background props narrow union
          />
          <Controls
            showInteractive={!readOnly}
            position="bottom-left"
            style={
              {
                borderRadius: 8,
                overflow: 'hidden',
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              } as React.CSSProperties
            }
          />
          <MiniMap
            nodeColor={minimapNodeColor as never}
            maskColor={isDark ? 'rgba(10,10,10,0.6)' : 'rgba(249,250,251,0.6)'}
            position="bottom-right"
            pannable
            zoomable
            style={
              {
                border: `1px solid ${isDark ? '#27272a' : '#e5e7eb'}`,
                borderRadius: 8,
                overflow: 'hidden',
                background: isDark ? '#171717' : '#ffffff',
              } as React.CSSProperties
            }
          />
        </ReactFlow>
      </div>
    </div>
  );
}
