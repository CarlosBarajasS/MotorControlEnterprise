import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuditLogService, AuditEntry } from '../../services/audit-log.service';

const ACTION_LABELS: Record<string, string> = {
  create_client:         'Creó cliente',
  create_client_user:    'Creó acceso de usuario',
  access_foreign_client: 'Consultó clientes ajenos',
  modify_foreign_client: 'Modificó cliente ajeno',
};

@Component({
  selector: 'app-audit-log',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  template: `
    <div class="audit-page">
      <div class="audit-header">
        <h2>Registro de Auditoría</h2>
      </div>

      <div class="audit-filters">
        <select [(ngModel)]="filterAction" (change)="loadPage(1)">
          <option value="">Todas las acciones</option>
          <option value="create_client">Creó cliente</option>
          <option value="create_client_user">Creó acceso de usuario</option>
          <option value="access_foreign_client">Consultó clientes ajenos</option>
          <option value="modify_foreign_client">Modificó cliente ajeno</option>
        </select>
        <input type="date" [(ngModel)]="filterFrom" (change)="loadPage(1)">
        <input type="date" [(ngModel)]="filterTo"   (change)="loadPage(1)">
      </div>

      @if (loading()) {
        <p class="audit-loading">Cargando...</p>
      } @else {
        <table class="audit-table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Usuario</th>
              <th>Acción</th>
              <th>Entidad</th>
              <th>Detalle</th>
            </tr>
          </thead>
          <tbody>
            @for (entry of entries(); track entry.id) {
              <tr>
                <td>{{ entry.createdAt | date:'dd/MM/yy HH:mm' }}</td>
                <td>
                  <span class="user-name">{{ entry.user.name || entry.user.email }}</span>
                  <span class="user-role">{{ entry.user.role }}</span>
                </td>
                <td><span class="action-badge action-{{ entry.action }}">{{ label(entry.action) }}</span></td>
                <td>{{ entry.entityType }} {{ entry.entityId ? '#' + entry.entityId : '' }}</td>
                <td class="detail-cell">{{ entry.details }}</td>
              </tr>
            }
          </tbody>
        </table>

        <div class="audit-pagination">
          <button (click)="loadPage(page() - 1)" [disabled]="page() <= 1">‹ Anterior</button>
          <span>Página {{ page() }} · {{ total() }} registros</span>
          <button (click)="loadPage(page() + 1)" [disabled]="page() * pageSize >= total()">Siguiente ›</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .audit-page { padding: 24px; }
    .audit-header h2 { margin: 0 0 20px; font-size: 20px; }
    .audit-filters { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
    .audit-filters select,
    .audit-filters input { padding: 6px 10px; border: 1px solid var(--outline); border-radius: 6px; background: var(--surface); color: rgba(var(--ink-rgb), 1); font-size: 13px; }
    .audit-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .audit-table th { text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--outline); color: var(--muted); font-weight: 600; }
    .audit-table td { padding: 8px 12px; border-bottom: 1px solid var(--outline); vertical-align: top; }
    .user-name { display: block; font-weight: 500; }
    .user-role { font-size: 11px; color: var(--muted); }
    .action-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 11px; background: rgba(var(--ink-rgb), 0.08); }
    .action-badge.action-modify_foreign_client { background: rgba(255,180,0,0.15); color: #b87800; }
    .action-badge.action-access_foreign_client { background: rgba(var(--teal), 0.12); color: var(--teal); }
    .action-badge.action-create_client { background: rgba(var(--green), 0.12); color: var(--green); }
    .detail-cell { max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 12px; }
    .audit-pagination { display: flex; align-items: center; gap: 16px; margin-top: 16px; font-size: 13px; color: var(--muted); }
    .audit-pagination button { padding: 4px 12px; border: 1px solid var(--outline); border-radius: 6px; background: var(--surface); cursor: pointer; }
    .audit-pagination button:disabled { opacity: 0.4; cursor: default; }
    .audit-loading { color: var(--muted); }
  `]
})
export class AuditLogComponent implements OnInit {
  private svc = inject(AuditLogService);

  entries   = signal<AuditEntry[]>([]);
  total     = signal(0);
  page      = signal(1);
  loading   = signal(false);
  readonly pageSize = 50;

  filterAction = '';
  filterFrom   = '';
  filterTo     = '';

  ngOnInit() { this.loadPage(1); }

  loadPage(p: number) {
    this.page.set(p);
    this.loading.set(true);
    this.svc.getAll({
      action:   this.filterAction || undefined,
      from:     this.filterFrom   || undefined,
      to:       this.filterTo     || undefined,
      page:     p,
      pageSize: this.pageSize
    }).subscribe({
      next: res => { this.entries.set(res.items); this.total.set(res.total); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  label(action: string): string { return ACTION_LABELS[action] ?? action; }
}
