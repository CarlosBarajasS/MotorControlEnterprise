import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ConfirmService } from '../../../services/confirm.service';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="confirm-overlay" *ngIf="confirm.config()" (click)="confirm.cancel()">
      <div class="confirm-modal" (click)="$event.stopPropagation()">
        <div class="confirm-icon" [class.danger]="confirm.config()!.danger">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div class="confirm-body">
          <h3 class="confirm-title">{{ confirm.config()!.title }}</h3>
          <p class="confirm-message">{{ confirm.config()!.message }}</p>
        </div>
        <div class="confirm-actions">
          <button class="confirm-cancel" (click)="confirm.cancel()">
            {{ confirm.config()!.cancelLabel ?? 'Cancelar' }}
          </button>
          <button class="confirm-ok" [class.danger]="confirm.config()!.danger" (click)="confirm.confirm()">
            {{ confirm.config()!.confirmLabel ?? 'Confirmar' }}
          </button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .confirm-overlay {
      position: fixed; inset: 0; z-index: 9990;
      background: rgba(0,0,0,0.55);
      display: flex; align-items: center; justify-content: center;
      animation: overlayIn 0.15s ease-out forwards;
      backdrop-filter: blur(4px);
    }
    @keyframes overlayIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }
    .confirm-modal {
      background: var(--surface);
      border: 1px solid var(--outline);
      border-radius: 16px;
      padding: 28px;
      width: 100%;
      max-width: 400px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      box-shadow: 0 24px 48px rgba(0,0,0,0.3);
      animation: modalIn 0.2s cubic-bezier(0.34,1.4,0.64,1) forwards;
    }
    @keyframes modalIn {
      from { opacity: 0; transform: scale(0.92) translateY(8px); }
      to   { opacity: 1; transform: scale(1) translateY(0); }
    }
    .confirm-icon {
      width: 48px; height: 48px; border-radius: 12px;
      display: flex; align-items: center; justify-content: center;
      background: rgba(245,158,11,0.12);
      color: #f59e0b;
    }
    .confirm-icon.danger {
      background: rgba(239,68,68,0.12);
      color: #ef4444;
    }
    .confirm-title {
      font-size: 16px; font-weight: 700;
      color: rgba(var(--ink-rgb), 1);
      margin: 0;
    }
    .confirm-message {
      font-size: 13px; color: var(--muted); margin: 4px 0 0; line-height: 1.5;
    }
    .confirm-actions {
      display: flex; gap: 10px; justify-content: flex-end; margin-top: 4px;
    }
    .confirm-cancel {
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 500;
      background: rgba(var(--ink-rgb), 0.06);
      border: 1px solid var(--outline);
      color: rgba(var(--ink-rgb), 1); cursor: pointer;
      transition: background 0.15s;
    }
    .confirm-cancel:hover { background: rgba(var(--ink-rgb), 0.1); }
    .confirm-ok {
      padding: 9px 18px; border-radius: 8px; font-size: 13px; font-weight: 600;
      background: var(--accent); border: none;
      color: #fff; cursor: pointer;
      transition: opacity 0.15s;
    }
    .confirm-ok:hover { opacity: 0.85; }
    .confirm-ok.danger { background: var(--red); }
  `]
})
export class ConfirmDialogComponent {
  confirm = inject(ConfirmService);
}
