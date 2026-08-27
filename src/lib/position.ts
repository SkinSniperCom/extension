import { runtime } from './messages';

// Where the floating panel (and its collapsed mini) sits. Two stored values:
// the corner picked in the popup (panel_pos) and an optional free position
// from dragging the panel (panel_xy), which overrides the corner until the
// popup picker clears it. Both live in extension storage so they reach every
// Steam tab; storage change events move already-mounted panels live.
export type PanelPos = 'br' | 'bl' | 'tr' | 'tl';
export type PanelXY = { x: number, y: number };

const POS_KEY = 'panel_pos';
const XY_KEY = 'panel_xy';
const POSITIONS: readonly PanelPos[] = ['br', 'bl', 'tr', 'tl'];
const POS_CLASSES = POSITIONS.map((p) => `ssx-pos-${p}`);
// A dragged position never sits flush against a screen edge.
const EDGE_MARGIN = 5;

export function clampPanelXY(x: number, y: number, size: { width: number, height: number }): PanelXY {
  return {
    x: Math.min(Math.max(x, EDGE_MARGIN), Math.max(EDGE_MARGIN, window.innerWidth - size.width - EDGE_MARGIN)),
    y: Math.min(Math.max(y, EDGE_MARGIN), Math.max(EDGE_MARGIN, window.innerHeight - size.height - EDGE_MARGIN)),
  };
}

let current: PanelPos = 'br';
let current_xy: PanelXY | null = null;
let inited = false;

function asPos(value: unknown): PanelPos | null {
  return POSITIONS.includes(value as PanelPos) ? value as PanelPos : null;
}

function asXY(value: unknown): PanelXY | null {
  const xy = value as PanelXY | null | undefined;
  return xy && typeof xy.x === 'number' && typeof xy.y === 'number' ? xy : null;
}

// Positions one floating node: the corner class always reflects the setting,
// and a dragged position, when present, overrides it with inline coordinates
// clamped to the viewport (a hidden node measures 0x0 and is re-placed when
// it is shown again).
export function placeNode(node: Element): void {
  node.classList.remove(...POS_CLASSES);
  node.classList.add(`ssx-pos-${current}`);
  const style = (node as HTMLElement).style;
  if (current_xy) {
    const xy = clampPanelXY(current_xy.x, current_xy.y, node.getBoundingClientRect());
    style.left = `${xy.x}px`;
    style.top = `${xy.y}px`;
    style.right = 'auto';
    style.bottom = 'auto';
  } else {
    style.left = '';
    style.top = '';
    style.right = '';
    style.bottom = '';
  }
}

function placeAll(): void {
  document.querySelectorAll('.ssx-panel.ssx-float, .ssx-mini').forEach(placeNode);
}

// Called by the drag handler when the user drops the panel: persists the
// position so every Steam tab (and future page loads) keeps it.
export function savePanelXY(xy: PanelXY): void {
  current_xy = xy;
  placeAll();
  void runtime.storage.local.set({ [XY_KEY]: xy }).catch(() => { /* position still holds on this page */ });
}

// Called from mountFloating: returns the corner to mount into and, on first
// use, starts following the stored settings (async - a mount racing the
// initial read starts in the default corner and is re-placed when the values
// land).
export function panelPos(): PanelPos {
  if (!inited) {
    inited = true;
    runtime.storage.local.get([POS_KEY, XY_KEY]).then((stored) => {
      const pos = asPos(stored[POS_KEY]);
      if (pos) current = pos;
      current_xy = asXY(stored[XY_KEY]);
      if (pos || current_xy) placeAll();
    }).catch(() => { /* default corner stays */ });
    runtime.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      const pos = asPos(changes[POS_KEY]?.newValue);
      if (pos) current = pos;
      if (XY_KEY in changes) current_xy = asXY(changes[XY_KEY]?.newValue);
      if (pos || XY_KEY in changes) placeAll();
    });
  }
  return current;
}
