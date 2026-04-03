import { Component, Input, Output, EventEmitter, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ToastService } from '../../../services/toast.service';

const API_URL = '/api';

@Component({
    selector: 'app-alert-drawer',
    standalone: true,
    imports: [CommonModule],
    template: `
<div class="drawer-overlay" (click)="close.emit()"></div>
<div class="alert-drawer">
  <div class="drawer-header">
    <h3>Alertas</h3>
    <button class="close-btn" (click)="close.emit()">&#x2715;</button>
  </div>

  <div class="drawer-body">
    <div *ngIf="loading()" class="drawer-loading">Cargando...</div>

    <div *ngIf="!loading() && alerts().length === 0" class="drawer-empty">
      <svg width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.2" viewBox="0 0 24 24" opacity="0.3">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      <p>Sin alertas activas</p>
    </div>

    <div *ngFor="let a of alerts()" [class]="'alert-item priority-' + a.priority.toLowerCase()">
      <div class="alert-item-header">
        <span [class]="'priority-chip chip-' + a.priority.toLowerCase()">
          {{ a.priority }}
        </span>
        <span class="alert-status" *ngIf="a.status === 'Acknowledged'">ACK</span>
        <span class="alert-status resolved" *ngIf="a.status === 'Resolved'">RESUELTO</span>
        <span class="alert-time">{{ a.createdAt | date:'HH:mm dd/MM' }}</span>
      </div>
      <div class="alert-title">{{ a.title }}</div>
      <div class="alert-message">{{ a.message }}</div>
      <div class="alert-footer" *ngIf="a.clientName">
        <span class="alert-client">{{ a.clientName }}</span>
      </div>
      <div class="alert-actions">
        <button class="ack-btn"
          *ngIf="isAdmin && a.status === 'Active'"
          (click)="acknowledge(a.id)">
          Reconocer
        </button>
        <button class="resolve-btn"
          *ngIf="canResolve && (a.status === 'Active' || a.status === 'Acknowledged')"
          (click)="resolve(a.id)">
          Resolver
        </button>
      </div>
      <div class="ack-info" *ngIf="a.status === 'Acknowledged' && a.acknowledgedBy">
        Reconocida por {{ a.acknowledgedBy }}
      </div>
    </div>
  </div>
</div>
    `,
    styles: [`
.drawer-overlay {
  position: fixed; inset: 0; background: rgba(0,0,0,0.55);
  z-index: 3000;
}
.alert-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; width: 380px;
  background: var(--surface, #ffffff); border-left: 1px solid var(--outline);
  z-index: 3001; display: flex; flex-direction: column;
  box-shadow: -8px 0 40px rgba(0,0,0,0.25);
  animation: slideIn 0.25s ease-out;
}
@keyframes slideIn {
  from { transform: translateX(100%); }
  to   { transform: translateX(0); }
}
.drawer-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px; border-bottom: 1px solid var(--outline);
}
.drawer-header h3 { font-size: 16px; font-weight: 600; color: rgba(var(--ink-rgb), 1); margin: 0; }
.close-btn {
  width: 30px; height: 30px; border-radius: 8px;
  background: transparent; border: 1px solid var(--outline);
  color: var(--muted); cursor: pointer; font-size: 13px;
  display: flex; align-items: center; justify-content: center;
}
.close-btn:hover { background: rgba(239,68,68,0.12); color: var(--red); }
.drawer-body { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 10px; }
.drawer-loading, .drawer-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; padding: 60px 20px; color: var(--muted); font-size: 14px; text-align: center;
}
.alert-item {
  background: rgba(var(--ink-rgb), 0.04);
  border: 1px solid var(--outline);
  border-radius: 12px; padding: 14px; border-left: 4px solid var(--muted);
}
.alert-item.priority-p1 { border-left-color: var(--red); background: rgba(239,68,68,0.06); }
.alert-item.priority-p2 { border-left-color: #f97316; background: rgba(249,115,22,0.05); }
.alert-item.priority-p3 { border-left-color: #eab308; }
.alert-item.priority-p4 { border-left-color: var(--muted); }
.alert-item-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.priority-chip {
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 6px;
  letter-spacing: 0.05em; background: rgba(var(--ink-rgb), 0.08); color: var(--muted);
}
.priority-chip.chip-p1 { background: rgba(239,68,68,0.15); color: var(--red); animation: pulse-p1 2s ease-in-out infinite; }
.priority-chip.chip-p2 { background: rgba(249,115,22,0.15); color: #f97316; }
.priority-chip.chip-p3 { background: rgba(234,179,8,0.15); color: #ca8a04; }
.priority-chip.chip-p4 { background: rgba(var(--ink-rgb), 0.07); color: var(--muted); }
@keyframes pulse-p1 {
  0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.4); }
  50% { box-shadow: 0 0 0 4px rgba(239,68,68,0); }
}
.alert-status {
  font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 6px;
  background: rgba(var(--ink-rgb), 0.08); color: var(--muted);
}
.alert-status.resolved { background: rgba(0,200,150,0.12); color: var(--teal); }
.alert-time { font-size: 11px; color: var(--muted); margin-left: auto; }
.alert-title { font-weight: 600; font-size: 14px; color: rgba(var(--ink-rgb), 1); margin-bottom: 4px; }
.alert-message { font-size: 12px; color: var(--muted); line-height: 1.5; }
.alert-footer { margin-top: 6px; }
.alert-client { font-size: 11px; color: var(--accent); font-weight: 500; }
.alert-actions { display: flex; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
.ack-btn {
  padding: 6px 14px; border-radius: 8px;
  background: rgba(0,122,255,0.12); color: var(--accent);
  border: 1px solid rgba(0,122,255,0.25); font-size: 12px;
  font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.ack-btn:hover { background: rgba(0,122,255,0.2); }
.resolve-btn {
  padding: 6px 14px; border-radius: 8px;
  background: rgba(201,168,76,0.12); color: #C9A84C;
  border: 1px solid rgba(201,168,76,0.35); font-size: 12px;
  font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.resolve-btn:hover { background: rgba(201,168,76,0.25); border-color: rgba(201,168,76,0.55); }
.ack-info { margin-top: 8px; font-size: 11px; color: var(--muted); font-style: italic; }
    `]
})
export class AlertDrawerComponent implements OnInit {
    @Input() isAdmin = false;
    @Input() canResolve = false;
    @Output() close = new EventEmitter<void>();

    private http  = inject(HttpClient);
    private toast = inject(ToastService);
    alerts  = signal<any[]>([]);
    loading = signal(true);

    ngOnInit() {
        this.loadAlerts();
    }

    loadAlerts() {
        const url = this.isAdmin
            ? `${API_URL}/alerts?pageSize=50`
            : `${API_URL}/client/me/alerts`;

        this.http.get<any>(url).subscribe({
            next: (res) => {
                this.alerts.set(this.isAdmin ? (res.data ?? []) : (res ?? []));
                this.loading.set(false);
            },
            error: () => this.loading.set(false)
        });
    }

    acknowledge(alertId: number) {
        this.http.patch(`${API_URL}/alerts/${alertId}/acknowledge`, {}).subscribe({
            next: () => this.loadAlerts(),
            error: () => {}
        });
    }

    resolve(alertId: number) {
        this.http.patch(`${API_URL}/alerts/${alertId}/resolve`, {}).subscribe({
            next: () => {
                this.alerts.update(list =>
                    list.map(a => a.id === alertId ? { ...a, status: 'Resolved' } : a)
                );
                this.toast.success('Alerta resuelta correctamente');
            },
            error: () => {
                this.toast.error('No se pudo resolver la alerta');
            }
        });
    }
}