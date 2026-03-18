import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="toast-stack">
      <div
        class="toast"
        *ngFor="let t of toast.toasts()"
        [class]="'toast toast--' + t.type"
        (click)="toast.dismiss(t.id)"
      >
        <span class="toast-icon">
          <svg *ngIf="t.type==='success'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <svg *ngIf="t.type==='error'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          <svg *ngIf="t.type==='warning'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <svg *ngIf="t.type==='info'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </span>
        <span class="toast-message">{{ t.message }}</span>
        <button class="toast-close" (click)="$event.stopPropagation(); toast.dismiss(t.id)">✕</button>
      </div>
    </div>
  `,
  styles: [`
    .toast-stack {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: none;
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 16px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 500;
      min-width: 260px;
      max-width: 380px;
      cursor: pointer;
      pointer-events: all;
      border: 1px solid transparent;
      backdrop-filter: blur(12px);
      animation: toastIn 0.25s cubic-bezier(0.34,1.4,0.64,1) forwards;
      box-shadow: 0 8px 24px rgba(0,0,0,0.18);
    }
    @keyframes toastIn {
      from { opacity: 0; transform: translateX(40px) scale(0.95); }
      to   { opacity: 1; transform: translateX(0) scale(1); }
    }
    .toast--success {
      background: rgba(16, 185, 129, 0.12);
      border-color: rgba(16, 185, 129, 0.3);
      color: #10b981;
    }
    .toast--error {
      background: rgba(239, 68, 68, 0.12);
      border-color: rgba(239, 68, 68, 0.3);
      color: #ef4444;
    }
    .toast--warning {
      background: rgba(245, 158, 11, 0.12);
      border-color: rgba(245, 158, 11, 0.3);
      color: #f59e0b;
    }
    .toast--info {
      background: rgba(59, 130, 246, 0.12);
      border-color: rgba(59, 130, 246, 0.3);
      color: #3b82f6;
    }
    .toast-icon { flex-shrink: 0; }
    .toast-message { flex: 1; }
    .toast-close {
      background: none; border: none; cursor: pointer;
      opacity: 0.5; font-size: 11px; color: inherit;
      padding: 0; line-height: 1;
    }
    .toast-close:hover { opacity: 1; }
  `]
})
export class ToastContainerComponent {
  toast = inject(ToastService);
}
