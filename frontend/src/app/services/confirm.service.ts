import { Injectable, signal } from '@angular/core';

export interface ConfirmConfig {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  readonly config = signal<ConfirmConfig | null>(null);
  private _resolve?: (result: boolean) => void;

  show(config: ConfirmConfig): Promise<boolean> {
    this.config.set(config);
    return new Promise(resolve => { this._resolve = resolve; });
  }

  confirm() {
    this._resolve?.(true);
    this.config.set(null);
  }

  cancel() {
    this._resolve?.(false);
    this.config.set(null);
  }
}
