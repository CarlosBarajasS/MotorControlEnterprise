import {
  Component, Input, Output, EventEmitter, signal, computed, inject, OnInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

const API_URL = '/api';

type ExportState = 'idle' | 'loading' | 'success' | 'error';

interface ExportError {
  code: 400 | 403 | 404 | 500 | 0;
  message: string;
}

@Component({
  selector: 'app-client-export-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="export-backdrop" (click)="onClose()"></div>
    <div class="export-panel" role="dialog" aria-modal="true" aria-labelledby="export-title">
      <div class="ep-header">
        <div class="ep-header-left">
          <div class="ep-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </div>
          <div>
            <h2 id="export-title" class="ep-title">Exportar Evidencia</h2>
            <p class="ep-subtitle">{{ cameraName }}</p>
          </div>
        </div>
        <button class="ep-close" (click)="onClose()" aria-label="Cerrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>
      </div>
      <div class="ep-body">
        <div class="ep-field">
          <label class="ep-label" for="exp-date">Fecha</label>
          <input id="exp-date" type="date" class="ep-input"
                 [(ngModel)]="date" [max]="todayDate" (change)="clearError()" />
        </div>
        <div class="ep-time-row">
          <div class="ep-field">
            <label class="ep-label" for="exp-start">Hora inicio</label>
            <input id="exp-start" type="time" class="ep-input"
                   [(ngModel)]="startTime" (change)="clearError()" />
          </div>
          <div class="ep-field-separator"><span class="sep-arrow">a</span></div>
          <div class="ep-field">
            <label class="ep-label" for="exp-end">Hora fin</label>
            <input id="exp-end" type="time" class="ep-input"
                   [(ngModel)]="endTime" (change)="clearError()" />
          </div>
        </div>
        <div class="ep-duration"
             [class.dur-warn]="durationMinutes() > 25"
             [class.dur-over]="durationMinutes() > 30"
             *ngIf="durationMinutes() > 0">
          {{ durationMinutes() }} min
          <span *ngIf="durationMinutes() > 30" class="dur-limit"> (max 30 min)</span>
        </div>
        <div class="ep-alert ep-alert-warn" *ngIf="validationError()">
          {{ validationError() }}
        </div>
        <div class="ep-alert"
             [class.ep-alert-404]="exportError()?.code === 404"
             [class.ep-alert-400]="exportError()?.code === 400"
             [class.ep-alert-err]="exportError()?.code === 500 || exportError()?.code === 0"
             *ngIf="exportError()">
          {{ exportError()!.message }}
        </div>
        <div class="ep-alert ep-alert-ok" *ngIf="exportState() === 'success'">
          Clip descargado correctamente
        </div>
      </div>
      <div class="ep-footer">
        <button class="ep-btn-cancel" (click)="onClose()">Cancelar</button>
        <button class="ep-btn-download"
                [disabled]="exportState() === 'loading' || !canSubmit()"
                (click)="requestExport()">
          <span class="btn-spinner" *ngIf="exportState() === 'loading'"></span>
          <svg *ngIf="exportState() !== 'loading'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          {{ exportState() === 'loading' ? 'Procesando...' : 'Descargar clip' }}
        </button>
      </div>
    </div>
  `,
  styles: [`
    .export-backdrop {
      position: fixed; inset: 0; z-index: 900;
      background: rgba(0,0,0,0.55); backdrop-filter: blur(4px);
      animation: fadein 0.18s ease;
    }
    .export-panel {
      position: fixed; z-index: 901;
      top: 50%; left: 50%; transform: translate(-50%, -50%);
      width: min(480px, calc(100vw - 32px));
      background: var(--surface); border: 1px solid var(--outline);
      border-radius: 20px;
      box-shadow: 0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(201,168,76,0.08);
      overflow: hidden;
      animation: slidein 0.22s cubic-bezier(0.34, 1.56, 0.64, 1);
    }
    @keyframes fadein  { from { opacity: 0 } to { opacity: 1 } }
    @keyframes slidein {
      from { opacity: 0; transform: translate(-50%, -46%) scale(0.96) }
      to   { opacity: 1; transform: translate(-50%, -50%) scale(1) }
    }
    .ep-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 20px 22px 16px; border-bottom: 1px solid var(--outline);
      background: linear-gradient(to bottom, rgba(201,168,76,0.04), transparent);
    }
    .ep-header-left { display: flex; align-items: center; gap: 14px; }
    .ep-icon {
      width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
      background: linear-gradient(135deg, rgba(201,168,76,0.2), rgba(201,168,76,0.08));
      border: 1px solid rgba(201,168,76,0.25);
      display: flex; align-items: center; justify-content: center; color: #C9A84C;
    }
    .ep-title {
      margin: 0 0 2px; font-size: 16px; font-weight: 700;
      color: rgba(var(--ink-rgb), 1); font-family: 'Space Grotesk', sans-serif;
    }
    .ep-subtitle {
      margin: 0; font-size: 12px; color: var(--muted);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 260px;
    }
    .ep-close {
      width: 30px; height: 30px; border-radius: 8px; flex-shrink: 0;
      background: rgba(var(--ink-rgb), 0.05); border: 1px solid var(--outline);
      color: var(--muted); cursor: pointer;
      display: flex; align-items: center; justify-content: center; transition: all 0.15s;
    }
    .ep-close:hover { background: rgba(var(--red-rgb), 0.15); color: var(--red); border-color: rgba(var(--red-rgb), 0.3); }
    .ep-body { padding: 20px 22px; display: flex; flex-direction: column; gap: 14px; }
    .ep-field { display: flex; flex-direction: column; gap: 6px; flex: 1; }
    .ep-label { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); }
    .ep-input {
      padding: 10px 13px; border-radius: 10px; font-size: 14px;
      background: rgba(var(--ink-rgb), 0.04); border: 1px solid var(--outline);
      color: rgba(var(--ink-rgb), 1); outline: none; width: 100%; box-sizing: border-box;
      transition: border-color 0.15s, box-shadow 0.15s; color-scheme: dark;
    }
    .ep-input:focus { border-color: #C9A84C; box-shadow: 0 0 0 3px rgba(201,168,76,0.12); }
    .ep-time-row { display: flex; align-items: flex-end; gap: 10px; }
    .ep-field-separator { display: flex; align-items: center; padding-bottom: 10px; flex-shrink: 0; }
    .sep-arrow { font-size: 11px; color: var(--muted); }
    .ep-duration {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 5px 12px; border-radius: 8px; font-size: 12px; font-weight: 600;
      background: rgba(var(--green-rgb), 0.12); color: var(--green);
      border: 1px solid rgba(var(--green-rgb), 0.2); transition: all 0.2s;
    }
    .ep-duration.dur-warn { background: rgba(var(--amber-rgb), 0.12); color: var(--amber); border-color: rgba(var(--amber-rgb), 0.2); }
    .ep-duration.dur-over { background: rgba(var(--red-rgb), 0.12); color: var(--red); border-color: rgba(var(--red-rgb), 0.2); }
    .dur-limit { font-weight: 400; opacity: 0.8; }
    .ep-alert { display: flex; align-items: flex-start; gap: 9px; padding: 11px 14px; border-radius: 10px; font-size: 13px; }
    .ep-alert-warn { background: rgba(var(--amber-rgb), 0.1); color: var(--amber); border: 1px solid rgba(var(--amber-rgb), 0.2); }
    .ep-alert-404  { background: rgba(var(--amber-rgb), 0.1); color: var(--amber); border: 1px solid rgba(var(--amber-rgb), 0.2); }
    .ep-alert-400  { background: rgba(var(--red-rgb), 0.1); color: var(--red); border: 1px solid rgba(var(--red-rgb), 0.2); }
    .ep-alert-err  { background: rgba(var(--red-rgb), 0.1); color: var(--red); border: 1px solid rgba(var(--red-rgb), 0.2); }
    .ep-alert-ok   { background: rgba(var(--green-rgb), 0.1); color: var(--green); border: 1px solid rgba(var(--green-rgb), 0.2); }
    .ep-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding: 16px 22px 20px; border-top: 1px solid var(--outline); }
    .ep-btn-cancel { padding: 9px 18px; border-radius: 10px; font-size: 13px; font-weight: 600; background: transparent; border: 1px solid var(--outline); color: var(--muted); cursor: pointer; transition: all 0.15s; }
    .ep-btn-cancel:hover { background: rgba(var(--ink-rgb), 0.06); color: rgba(var(--ink-rgb), 1); }
    .ep-btn-download { display: flex; align-items: center; gap: 8px; padding: 9px 20px; border-radius: 10px; font-size: 13px; font-weight: 700; background: linear-gradient(135deg, #C9A84C, #a8863a); border: 1px solid rgba(201,168,76,0.4); color: #1a1200; cursor: pointer; transition: all 0.2s; box-shadow: 0 2px 10px rgba(201,168,76,0.25); }
    .ep-btn-download:hover:not(:disabled) { background: linear-gradient(135deg, #d4b560, #b8973f); box-shadow: 0 4px 18px rgba(201,168,76,0.4); transform: translateY(-1px); }
    .ep-btn-download:active:not(:disabled) { transform: translateY(0); }
    .ep-btn-download:disabled { opacity: 0.45; cursor: not-allowed; box-shadow: none; transform: none; }
    .btn-spinner { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; border: 2px solid rgba(26,18,0,0.25); border-top-color: #1a1200; animation: spin 0.65s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @media (max-width: 520px) {
      .ep-time-row { flex-direction: column; gap: 14px; }
      .ep-field-separator { display: none; }
      .ep-footer { flex-direction: column-reverse; }
      .ep-btn-cancel, .ep-btn-download { width: 100%; justify-content: center; }
    }
  `]
})
export class ClientExportModalComponent implements OnInit {
  @Input() cameraId!: string | number;
  @Input() cameraName = 'Camara';
  @Output() closed = new EventEmitter<void>();

  private http = inject(HttpClient);

  date      = '';
  startTime = '';
  endTime   = '';

  exportState     = signal<ExportState>('idle');
  exportError     = signal<ExportError | null>(null);
  validationError = signal('');

  get todayDate(): string {
    return new Date().toISOString().slice(0, 10);
  }

  durationMinutes = computed(() => {
    if (!this.startTime || !this.endTime || !this.date) return 0;
    const start = new Date(this.date + 'T' + this.startTime + ':00');
    const end   = new Date(this.date + 'T' + this.endTime   + ':00');
    return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  });

  canSubmit = computed(() =>
    !!this.date && !!this.startTime && !!this.endTime &&
    this.durationMinutes() > 0 &&
    this.durationMinutes() <= 30 &&
    this.exportState() !== 'loading'
  );

  ngOnInit() { this.date = this.todayDate; }

  clearError() {
    this.exportError.set(null);
    this.validationError.set('');
  }

  onClose() {
    if (this.exportState() === 'loading') return;
    this.closed.emit();
  }

  requestExport() {
    this.exportError.set(null);
    this.validationError.set('');

    if (!this.date || !this.startTime || !this.endTime) {
      this.validationError.set('Completa la fecha, hora de inicio y hora de fin.');
      return;
    }
    const start = new Date(this.date + 'T' + this.startTime + ':00');
    const end   = new Date(this.date + 'T' + this.endTime   + ':00');
    const now   = new Date();

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      this.validationError.set('Fecha u hora invalida.');
      return;
    }
    if (end <= start) {
      this.validationError.set('La hora de fin debe ser posterior a la hora de inicio.');
      return;
    }
    if (start > now) {
      this.validationError.set('No puedes exportar un rango en el futuro.');
      return;
    }
    const diffMin = (end.getTime() - start.getTime()) / 60000;
    if (diffMin > 30) {
      this.validationError.set('El rango maximo de exportacion es 30 minutos.');
      return;
    }

    this.exportState.set('loading');

    const body = { startTime: start.toISOString(), endTime: end.toISOString() };

    this.http.post(
      API_URL + '/client/cameras/' + String(this.cameraId) + '/export',
      body,
      { responseType: 'blob', observe: 'response' }
    ).subscribe({
      next: (response) => {
        const blob = response.body;
        if (!blob) {
          this.exportState.set('error');
          this.exportError.set({ code: 500, message: 'Respuesta vacia del servidor.' });
          return;
        }
        let filename = 'clip_' + this.date + '_' + this.startTime.replace(':', '') + '-' + this.endTime.replace(':', '') + '.mp4';
        const cd = response.headers.get('Content-Disposition');
        if (cd) {
          const match = cd.match(/filename="?([^";]+)"?/i);
          if (match) filename = match[1].trim();
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        this.exportState.set('success');
      },
      error: (err) => {
        this.exportState.set('error');
        const status = (err && err.status) ? err.status : 0;
        if (status === 404) {
          this.exportError.set({ code: 404, message: 'No se encontraron grabaciones para el rango seleccionado. Prueba con otro horario.' });
        } else if (status === 400) {
          this.exportError.set({ code: 400, message: 'Rango invalido. Verifica que no supere 30 minutos y que las fechas sean correctas.' });
        } else if (status === 403) {
          this.exportError.set({ code: 0, message: 'No tienes permiso para exportar esta camara.' });
        } else {
          this.exportError.set({ code: 500, message: 'Error al procesar el clip. Intentalo de nuevo mas tarde.' });
        }
      }
    });
  }
}
