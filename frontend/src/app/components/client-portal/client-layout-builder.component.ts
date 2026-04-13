import {
  Component, Input, Output, EventEmitter,
  OnInit, signal, computed, ChangeDetectionStrategy
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LayoutCell, LayoutConfig } from '../../models/client-layout.model';

interface BuilderCell extends LayoutCell {
  cameraName: string;
}

@Component({
  selector: 'app-client-layout-builder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="builder-wrap">

      <!-- Toolbar del builder -->
      <div class="builder-bar">
        <span class="builder-title">Editor de layout</span>

        <div class="builder-controls">
          <label class="cols-label">
            Columnas
            <select [ngModel]="totalCols()" (ngModelChange)="setTotalCols($event)">
              @for (n of [1,2,3,4]; track n) {
                <option [value]="n">{{ n }}</option>
              }
            </select>
          </label>

          <button class="btn-secondary" (click)="clearGrid()">Limpiar</button>
          <button class="btn-primary" (click)="onSave()">Guardar layout</button>
          <button class="btn-cancel" (click)="cancel.emit()">Cancelar</button>
        </div>
      </div>

      <div class="builder-body">

        <!-- Panel izquierdo: cámaras disponibles -->
        <div class="camera-palette">
          <p class="palette-title">Cámaras disponibles</p>
          @for (cam of unplacedCameras(); track cam.id) {
            <div
              class="palette-item"
              draggable="true"
              (dragstart)="onPaletteDragStart($event, cam.id)">
              <svg class="drag-icon" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <circle cx="9" cy="7" r="1" fill="currentColor"/><circle cx="15" cy="7" r="1" fill="currentColor"/>
                <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
                <circle cx="9" cy="17" r="1" fill="currentColor"/><circle cx="15" cy="17" r="1" fill="currentColor"/>
              </svg>
              <span class="palette-name">{{ cam.name }}</span>
              @if (cam.isClientRestricted) {
                <span class="palette-lock" title="Cámara restringida">🔒</span>
              }
            </div>
          }
          @if (unplacedCameras().length === 0) {
            <p class="palette-empty">Todas las cámaras están en el grid</p>
          }
        </div>

        <!-- Grid editable -->
        <div class="grid-area">
          <div
            class="builder-grid"
            [style.--cols]="totalCols()"
            (dragover)="onGridDragOver($event)"
            (drop)="onGridDrop($event)">

            <!-- Celdas ocupadas -->
            @for (cell of cells(); track cell.cameraId) {
              <div
                class="grid-cell occupied"
                [style.grid-column]="cell.col + ' / span ' + cell.colspan"
                [style.grid-row]="cell.row + ' / span ' + cell.rowspan"
                draggable="true"
                (dragstart)="onCellDragStart($event, cell.cameraId)"
                (dragover)="$event.preventDefault()"
                (drop)="onCellDrop($event, cell)">

                <div class="cell-header">
                  <span class="cell-name">{{ cell.cameraName }}</span>
                  <button class="cell-remove" (click)="removeCell(cell.cameraId)" title="Quitar">✕</button>
                </div>

                <!-- Resize controls -->
                <div class="cell-resize">
                  <div class="resize-row">
                    <span class="resize-label">Col span</span>
                    <button class="resize-btn" (click)="changeSpan(cell, 'colspan', -1)" [disabled]="cell.colspan <= 1">−</button>
                    <span class="resize-val">{{ cell.colspan }}</span>
                    <button class="resize-btn" (click)="changeSpan(cell, 'colspan', 1)" [disabled]="cell.colspan >= totalCols()">+</button>
                  </div>
                  <div class="resize-row">
                    <span class="resize-label">Row span</span>
                    <button class="resize-btn" (click)="changeSpan(cell, 'rowspan', -1)" [disabled]="cell.rowspan <= 1">−</button>
                    <span class="resize-val">{{ cell.rowspan }}</span>
                    <button class="resize-btn" (click)="changeSpan(cell, 'rowspan', 1)">+</button>
                  </div>
                </div>

                <!-- Toggle restringida -->
                <div class="cell-footer">
                  <label class="restrict-toggle" [title]="getCam(cell.cameraId)?.isClientRestricted ? 'Quitar restricción' : 'Marcar como privada'">
                    <input
                      type="checkbox"
                      [checked]="getCam(cell.cameraId)?.isClientRestricted"
                      (change)="toggleRestricted(cell.cameraId, $event)">
                    <span class="restrict-label">🔒 Privada</span>
                  </label>
                </div>
              </div>
            }

            <!-- Drop zones vacías -->
            @for (zone of dropZones(); track zone) {
              <div
                class="grid-cell empty-zone"
                [style.grid-column]="zone.col"
                [style.grid-row]="zone.row"
                [class.drag-over]="dragOverZone() === zone.col + '-' + zone.row"
                (dragover)="onZoneDragOver($event, zone)"
                (dragleave)="dragOverZone.set('')"
                (drop)="onZoneDrop($event, zone)">
                <span class="drop-hint">Soltar aquí</span>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; }

    .builder-wrap {
      display: flex; flex-direction: column;
      background: var(--surface);
      border-top: 1px solid var(--outline);
    }

    /* ── Bar ── */
    .builder-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 10px 16px; border-bottom: 1px solid var(--outline);
      background: rgba(var(--ink-rgb), 0.02); flex-wrap: wrap; gap: 8px;
    }
    .builder-title { font-size: 13px; font-weight: 600; color: rgba(var(--ink-rgb), 1); }
    .builder-controls { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

    .cols-label {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px; color: var(--muted);
    }
    .cols-label select {
      padding: 4px 8px; border-radius: 6px; border: 1px solid var(--outline);
      background: var(--surface); color: rgba(var(--ink-rgb), 1);
      font-size: 12px; cursor: pointer;
    }

    .btn-primary {
      padding: 6px 14px; border-radius: 8px; border: none;
      background: var(--accent); color: #fff; font-size: 12px; font-weight: 600;
      cursor: pointer; transition: opacity 0.2s;
    }
    .btn-primary:hover { opacity: 0.85; }

    .btn-secondary {
      padding: 6px 12px; border-radius: 8px; border: 1px solid var(--outline);
      background: transparent; color: rgba(var(--ink-rgb), 0.75); font-size: 12px;
      cursor: pointer; transition: border-color 0.2s;
    }
    .btn-secondary:hover { border-color: var(--accent); }

    .btn-cancel {
      padding: 6px 12px; border-radius: 8px; border: 1px solid var(--outline);
      background: transparent; color: var(--muted); font-size: 12px; cursor: pointer;
    }
    .btn-cancel:hover { color: var(--red); border-color: var(--red); }

    /* ── Body layout ── */
    .builder-body {
      display: flex; gap: 0; min-height: 340px; overflow: hidden;
    }

    /* ── Palette ── */
    .camera-palette {
      width: 180px; flex-shrink: 0; padding: 12px;
      border-right: 1px solid var(--outline); overflow-y: auto;
    }
    .palette-title {
      font-size: 11px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 0.06em; color: var(--muted); margin: 0 0 10px;
    }
    .palette-item {
      display: flex; align-items: center; gap: 6px;
      padding: 7px 8px; border-radius: 8px; border: 1px solid var(--outline);
      margin-bottom: 6px; cursor: grab; background: var(--surface);
      transition: border-color 0.2s, background 0.2s; user-select: none;
    }
    .palette-item:hover { border-color: var(--accent); background: rgba(var(--accent-rgb,0,120,255),0.04); }
    .palette-item:active { cursor: grabbing; }
    .drag-icon { color: var(--muted); flex-shrink: 0; }
    .palette-name { font-size: 12px; color: rgba(var(--ink-rgb), 0.9); flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .palette-lock { font-size: 11px; }
    .palette-empty { font-size: 12px; color: var(--muted); text-align: center; margin-top: 20px; }

    /* ── Grid ── */
    .grid-area {
      flex: 1; padding: 12px; overflow: auto;
      background: rgba(var(--ink-rgb), 0.01);
    }
    .builder-grid {
      display: grid;
      grid-template-columns: repeat(var(--cols, 2), 1fr);
      gap: 8px; min-height: 280px;
    }

    /* ── Cells ── */
    .grid-cell {
      border-radius: 10px; border: 1px solid var(--outline);
      min-height: 120px; transition: border-color 0.2s, box-shadow 0.2s;
    }
    .grid-cell.occupied {
      background: var(--surface); padding: 8px;
      display: flex; flex-direction: column; gap: 6px;
      cursor: grab;
    }
    .grid-cell.occupied:hover { border-color: var(--accent); box-shadow: 0 0 0 2px rgba(var(--accent-rgb,0,120,255),0.12); }
    .grid-cell.empty-zone {
      border: 1.5px dashed var(--outline); background: rgba(var(--ink-rgb), 0.01);
      display: flex; align-items: center; justify-content: center;
    }
    .grid-cell.empty-zone.drag-over {
      border-color: var(--accent); background: rgba(var(--accent-rgb,0,120,255),0.05);
    }
    .drop-hint { font-size: 11px; color: var(--muted); user-select: none; }

    .cell-header { display: flex; align-items: center; justify-content: space-between; }
    .cell-name { font-size: 12px; font-weight: 600; color: rgba(var(--ink-rgb), 0.9); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .cell-remove {
      width: 20px; height: 20px; border-radius: 5px; border: none;
      background: transparent; color: var(--muted); cursor: pointer; font-size: 11px;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .cell-remove:hover { background: rgba(var(--red-rgb), 0.1); color: var(--red); }

    .cell-resize { display: flex; flex-direction: column; gap: 4px; flex: 1; }
    .resize-row { display: flex; align-items: center; gap: 4px; }
    .resize-label { font-size: 10px; color: var(--muted); width: 50px; flex-shrink: 0; }
    .resize-btn {
      width: 20px; height: 20px; border-radius: 5px; border: 1px solid var(--outline);
      background: transparent; color: rgba(var(--ink-rgb), 0.7); cursor: pointer; font-size: 13px;
      display: flex; align-items: center; justify-content: center; line-height: 1;
      transition: border-color 0.15s;
    }
    .resize-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .resize-btn:disabled { opacity: 0.3; cursor: not-allowed; }
    .resize-val { font-size: 12px; font-weight: 600; width: 16px; text-align: center; color: rgba(var(--ink-rgb), 0.9); }

    .cell-footer { border-top: 1px solid var(--outline); padding-top: 6px; }
    .restrict-toggle { display: flex; align-items: center; gap: 6px; cursor: pointer; }
    .restrict-toggle input { cursor: pointer; }
    .restrict-label { font-size: 11px; color: var(--muted); }
  `]
})
export class ClientLayoutBuilderComponent implements OnInit {
  @Input() cameras: any[] = [];
  @Input() initialConfig: LayoutConfig = { totalCols: 2, cells: [] };
  @Output() save = new EventEmitter<LayoutConfig>();
  @Output() cancel = new EventEmitter<void>();
  @Output() restrictedChange = new EventEmitter<{ cameraId: number; restricted: boolean }>();

  totalCols   = signal(2);
  cells       = signal<BuilderCell[]>([]);
  dragOverZone = signal('');
  private draggingId: number | null = null;
  private draggingFromGrid = false;

  ngOnInit() {
    this.totalCols.set(this.initialConfig.totalCols ?? 2);
    const initial: BuilderCell[] = this.initialConfig.cells.map(c => ({
      ...c,
      cameraName: this.getCam(c.cameraId)?.name ?? `Cámara ${c.cameraId}`
    }));
    this.cells.set(initial);
  }

  getCam(id: number): any {
    return this.cameras.find(c => c.id === id) ?? null;
  }

  unplacedCameras = computed(() => {
    const placed = new Set(this.cells().map(c => c.cameraId));
    return this.cameras.filter(c => !placed.has(c.id));
  });

  dropZones = computed(() => {
    const cols = this.totalCols();
    const placed = this.cells();
    const occupiedKeys = new Set<string>();
    for (const cell of placed) {
      for (let r = cell.row; r < cell.row + cell.rowspan; r++) {
        for (let c = cell.col; c < cell.col + cell.colspan; c++) {
          occupiedKeys.add(`${c}-${r}`);
        }
      }
    }
    const zones: { col: number; row: number }[] = [];
    const maxRow = placed.length === 0 ? 3 : Math.max(...placed.map(c => c.row + c.rowspan - 1)) + 2;
    for (let row = 1; row <= maxRow; row++) {
      for (let col = 1; col <= cols; col++) {
        if (!occupiedKeys.has(`${col}-${row}`)) {
          zones.push({ col, row });
        }
      }
    }
    return zones;
  });

  setTotalCols(val: string | number) {
    const n = Number(val);
    this.totalCols.set(n);
    // Clamp position and span so col + colspan - 1 <= n
    this.cells.update(cs => cs.map(c => {
      const newCol = Math.min(c.col, n);
      const newColspan = Math.min(c.colspan, n - newCol + 1);
      return { ...c, col: newCol, colspan: newColspan };
    }));
  }

  clearGrid() {
    this.cells.set([]);
  }

  removeCell(cameraId: number) {
    this.cells.update(cs => cs.filter(c => c.cameraId !== cameraId));
  }

  changeSpan(cell: BuilderCell, key: 'colspan' | 'rowspan', delta: number) {
    this.cells.update(cs => cs.map(c =>
      c.cameraId === cell.cameraId
        ? { ...c, [key]: Math.max(1, c[key] + delta) }
        : c
    ));
  }

  toggleRestricted(cameraId: number, event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.restrictedChange.emit({ cameraId, restricted: checked });
  }

  // ── Drag from palette ──
  onPaletteDragStart(event: DragEvent, cameraId: number) {
    this.draggingId = cameraId;
    this.draggingFromGrid = false;
    event.dataTransfer?.setData('text/plain', String(cameraId));
  }

  // ── Drag from grid cell ──
  onCellDragStart(event: DragEvent, cameraId: number) {
    this.draggingId = cameraId;
    this.draggingFromGrid = true;
    event.dataTransfer?.setData('text/plain', String(cameraId));
  }

  // ── Drop onto an empty zone ──
  onZoneDragOver(event: DragEvent, zone: { col: number; row: number }) {
    event.preventDefault();
    this.dragOverZone.set(`${zone.col}-${zone.row}`);
  }

  onZoneDrop(event: DragEvent, zone: { col: number; row: number }) {
    event.preventDefault();
    this.dragOverZone.set('');
    if (this.draggingId === null) return;
    const camId = this.draggingId;
    this.draggingId = null;

    if (this.draggingFromGrid) {
      // Move existing cell to new position
      this.cells.update(cs => cs.map(c =>
        c.cameraId === camId ? { ...c, col: zone.col, row: zone.row } : c
      ));
    } else {
      // Place new camera from palette
      const cam = this.getCam(camId);
      if (!cam) return;
      this.cells.update(cs => [
        ...cs,
        { cameraId: camId, cameraName: cam.name, col: zone.col, row: zone.row, colspan: 1, rowspan: 1 }
      ]);
    }
  }

  // ── Drop onto an occupied cell (swap) ──
  onGridDragOver(event: DragEvent) { event.preventDefault(); }

  onCellDrop(event: DragEvent, targetCell: BuilderCell) {
    event.preventDefault();
    event.stopPropagation();
    if (this.draggingId === null || this.draggingId === targetCell.cameraId) return;
    const srcId = this.draggingId;
    this.draggingId = null;

    if (this.draggingFromGrid) {
      // Swap positions between two grid cells
      this.cells.update(cs => {
        const src = cs.find(c => c.cameraId === srcId);
        const tgt = cs.find(c => c.cameraId === targetCell.cameraId);
        if (!src || !tgt) return cs;
        const srcPos = { col: src.col, row: src.row };
        return cs.map(c => {
          if (c.cameraId === srcId) return { ...c, col: tgt.col, row: tgt.row };
          if (c.cameraId === tgt.cameraId) return { ...c, col: srcPos.col, row: srcPos.row };
          return c;
        });
      });
    } else {
      // Replace target cell with dragged camera from palette
      const cam = this.getCam(srcId);
      if (!cam) return;
      this.cells.update(cs => [
        ...cs.filter(c => c.cameraId !== srcId),
        { cameraId: srcId, cameraName: cam.name, col: targetCell.col, row: targetCell.row, colspan: targetCell.colspan, rowspan: targetCell.rowspan }
      ]);
    }
  }

  onGridDrop(event: DragEvent) {
    // Prevent ghost drop on grid background
    event.preventDefault();
  }

  onSave() {
    const config: LayoutConfig = {
      totalCols: this.totalCols(),
      cells: this.cells().map(({ cameraId, col, row, colspan, rowspan }) => ({
        cameraId, col, row, colspan, rowspan
      }))
    };
    this.save.emit(config);
  }
}
