import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _counter = 0;
  readonly toasts = signal<Toast[]>([]);

  success(message: string) { this._add(message, 'success'); }
  error(message: string)   { this._add(message, 'error'); }
  warning(message: string) { this._add(message, 'warning'); }
  info(message: string)    { this._add(message, 'info'); }

  dismiss(id: number) {
    this.toasts.update(t => t.filter(x => x.id !== id));
  }

  private _add(message: string, type: ToastType) {
    const id = ++this._counter;
    this.toasts.update(t => [...t, { id, message, type }]);
    setTimeout(() => this.dismiss(id), 4000);
  }
}
