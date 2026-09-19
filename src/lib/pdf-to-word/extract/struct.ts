import type { StructTreeContent, StructTreeNode } from 'pdfjs-dist/types/src/display/api';
import type { Span, StructBlock, StructIndex, StructTable } from '../types';

/** The nearest one of these above a content leaf owns it. L and LI are containers, not blocks. */
const BLOCK_ROLES: ReadonlySet<string> = new Set([
  'P',
  'H',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'Title',
  'Lbl',
  'LBody',
  'TD',
  'TH',
  'Caption',
  'Figure',
  'Note',
]);

const ROW_GROUP_ROLES: ReadonlySet<string> = new Set(['TBody', 'THead', 'TFoot']);
const CELL_ROLES: ReadonlySet<string> = new Set(['TD', 'TH']);

/** cellBlocks entry for a cell no content leaf ever landed in. */
const EMPTY_CELL = -1;

interface CellRef {
  tableIndex: number;
  row: number;
  col: number;
}

const isNode = (child: StructTreeNode | StructTreeContent): child is StructTreeNode =>
  'children' in child;

/** pdf.js serialises /Alt and /ActualText into `alt`, but its own .d.ts omits the field. */
function altOf(node: StructTreeNode): string | null {
  const alt = (node as { alt?: unknown }).alt;
  return typeof alt === 'string' && alt !== '' ? alt : null;
}

/** Walks the page's struct tree into blocks in reading order; `tagOf` maps an mcid to its producer BDC tag. */
export function indexStruct(
  tree: StructTreeNode | null,
  tagOf?: ReadonlyMap<string, string>,
): StructIndex {
  const blocks: StructBlock[] = [];
  const tables: StructTable[] = [];
  const blockOf = new Map<string, number>();
  if (!tree) return { present: false, blockOf, blocks, tables };

  const cellOfNode = new Map<StructTreeNode, CellRef>();
  const blockOfNode = new Map<StructTreeNode, number>();
  const stack: StructTreeNode[] = [];
  const path: string[] = [];

  function enclosingCell(): CellRef | null {
    for (let i = stack.length - 1; i >= 0; i--) {
      const cell = cellOfNode.get(stack[i]);
      if (cell) return cell;
    }
    return null;
  }

  function addBlock(owner: StructTreeNode, depth: number, mcid: string): number {
    const cell = enclosingCell();
    const index = blocks.length;
    blocks.push({
      index,
      role: owner.role,
      path: path.slice(0, depth),
      producerTag: tagOf?.get(mcid) ?? null,
      alt: altOf(owner),
      tableIndex: cell ? cell.tableIndex : null,
      row: cell ? cell.row : null,
      col: cell ? cell.col : null,
    });
    if (cell) {
      const row = tables[cell.tableIndex].cellBlocks[cell.row];
      if (row[cell.col] === EMPTY_CELL) row[cell.col] = index;
    }
    return index;
  }

  /** Row and column come from tree position only — V7 exposes no /ColSpan or /RowSpan. */
  function registerTable(node: StructTreeNode): void {
    const tableIndex = tables.length;
    const table: StructTable = { rows: 0, cols: 0, cellBlocks: [] };
    tables.push(table);
    for (const group of node.children) {
      if (!isNode(group)) continue;
      const rows =
        group.role === 'TR'
          ? [group]
          : ROW_GROUP_ROLES.has(group.role)
            ? group.children.filter(isNode).filter((child) => child.role === 'TR')
            : [];
      for (const tr of rows) {
        const row = table.rows++;
        const cells: number[] = [];
        table.cellBlocks.push(cells);
        for (const cell of tr.children) {
          if (!isNode(cell) || !CELL_ROLES.has(cell.role)) continue;
          cellOfNode.set(cell, { tableIndex, row, col: cells.length });
          cells.push(EMPTY_CELL);
        }
        if (cells.length > table.cols) table.cols = cells.length;
      }
    }
  }

  function mapContent(mcid: string): void {
    if (stack.length === 0) return;
    let owner = -1;
    for (let i = stack.length - 1; i >= 0; i--) {
      if (BLOCK_ROLES.has(stack[i].role)) {
        owner = i;
        break;
      }
    }
    if (owner < 0) {
      // No block-level ancestor: one block per leaf, so paragraphs cannot all fuse into the parent.
      const node = stack[stack.length - 1];
      blockOf.set(mcid, addBlock(node, stack.length, mcid));
      return;
    }
    const node = stack[owner];
    const existing = blockOfNode.get(node);
    const index = existing ?? addBlock(node, owner + 1, mcid);
    if (existing === undefined) blockOfNode.set(node, index);
    blockOf.set(mcid, index);
  }

  function visit(node: StructTreeNode): void {
    stack.push(node);
    path.push(node.role);
    if (node.role === 'Table') registerTable(node);
    for (const child of node.children) {
      if (isNode(child)) visit(child);
      else if (child.type === 'content' && typeof child.id === 'string') mapContent(child.id);
    }
    stack.pop();
    path.pop();
  }

  if (tree.role === 'Root') {
    for (const child of tree.children) if (isNode(child)) visit(child);
  } else {
    visit(tree);
  }

  return { present: true, blockOf, blocks, tables };
}

/** The completeness guard: false means the whole page falls to geometry, never half a struct page. */
export function structCovers(index: StructIndex, spans: readonly Span[]): boolean {
  if (!index.present) return false;
  for (const span of spans) {
    if (span.artifact || span.synthetic || span.text === '') continue;
    if (span.mcid === null || !index.blockOf.has(span.mcid)) return false;
  }
  return true;
}
