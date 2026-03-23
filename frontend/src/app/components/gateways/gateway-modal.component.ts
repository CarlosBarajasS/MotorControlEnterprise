import { Component, OnInit, Input, Output, EventEmitter, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

const API_URL = '/api';

interface ClientOption {
  id: number;
  name: string;
}

interface GatewayFormData {
  clientId: number | null;
  name: string;
  location: string;
  gatewayId: string;
  edgeToken: string;
}

@Component({
  selector: 'app-gateway-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Overlay -->
    <div class="modal-overlay" (click)="onOverlayClick($event)">
      <div
        class="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        (click)="$event.stopPropagation()"
      >
        <!-- Header -->
        <div class="modal-header">
          <h2 id="modal-title" class="modal-title">Nuevo punto de acceso</h2>
          <button class="btn-close" type="button" aria-label="Cerrar" (click)="cancel()">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M2 2L14 14M14 2L2 14" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
          </button>
        </div>

        <div class="modal-divider"></div>

        <!-- Body -->
        <div class="modal-body">

          <!-- Cliente -->
          <div class="field-group">
            <label class="field-label" for="gw-client">Cliente <span class="required">*</span></label>
            <select
              id="gw-client"
              class="field-input"
              [(ngModel)]="form.clientId"
              [disabled]="clientId != null || loadingClients()"
              required
            >
              <option [ngValue]="null" disabled>
                {{ loadingClients() ? 'Cargando clientes...' : 'Selecciona un cliente' }}
              </option>
              <option *ngFor="let c of clients()" [ngValue]="c.id">{{ c.name }}</option>
            </select>
          </div>

          <!-- Nombre del punto -->
          <div class="field-group">
            <label class="field-label" for="gw-name">Nombre del punto <span class="required">*</span></label>
            <input
              id="gw-name"
              type="text"
              class="field-input"
              [(ngModel)]="form.name"
              placeholder="Ej: Edificio A, Planta Baja"
              required
              autocomplete="off"
            />
          </div>

          <!-- Ubicacion -->
          <div class="field-group">
            <label class="field-label" for="gw-location">
              Ubicación <span class="optional">(opcional)</span>
            </label>
            <input
              id="gw-location"
              type="text"
              class="field-input"
              [(ngModel)]="form.location"
              placeholder="Ej: Piso 2, junto al cuarto de red"
              autocomplete="off"
            />
          </div>

          <!-- ID del dispositivo -->
          <div class="field-group">
            <div class="label-row">
              <label class="field-label" for="gw-device-id">ID del dispositivo <span class="required">*</span></label>
              <div class="tooltip-wrapper">
                <button
                  class="btn-help"
                  type="button"
                  aria-label="Ayuda sobre el ID del dispositivo"
                  (mouseenter)="showTooltipDeviceId.set(true)"
                  (mouseleave)="showTooltipDeviceId.set(false)"
                  (focus)="showTooltipDeviceId.set(true)"
                  (blur)="showTooltipDeviceId.set(false)"
                >?</button>
                <div class="tooltip-box" role="tooltip" *ngIf="showTooltipDeviceId()">
                  Código único de tu Raspberry Pi. Lo encuentras en la etiqueta
                  pegada al dispositivo o ejecutando 'hostname' en su terminal.
                </div>
              </div>
            </div>
            <input
              id="gw-device-id"
              type="text"
              class="field-input mono"
              [(ngModel)]="form.gatewayId"
              placeholder="b8:27:eb:aa:bb:cc"
              required
              autocomplete="off"
              spellcheck="false"
            />
          </div>

          <!-- Token de acceso -->
          <div class="field-group">
            <div class="label-row">
              <label class="field-label" for="gw-token">Token de acceso <span class="required">*</span></label>
              <div class="tooltip-wrapper">
                <button
                  class="btn-help"
                  type="button"
                  aria-label="Ayuda sobre el token de acceso"
                  (mouseenter)="showTooltipToken.set(true)"
                  (mouseleave)="showTooltipToken.set(false)"
                  (focus)="showTooltipToken.set(true)"
                  (blur)="showTooltipToken.set(false)"
                >?</button>
                <div class="tooltip-box" role="tooltip" *ngIf="showTooltipToken()">
                  Contraseña que usa el dispositivo para conectarse al servidor.
                  Genera uno automáticamente o usa el que viene configurado en el RPi.
                </div>
              </div>
            </div>
            <div class="token-row">
              <input
                id="gw-token"
                type="password"
                class="field-input token-input"
                [(ngModel)]="form.edgeToken"
                placeholder="Token de autenticación"
                required
                autocomplete="new-password"
                spellcheck="false"
              />
              <button
                class="btn-generate"
                type="button"
                (click)="generateToken()"
                title="Generar token aleatorio"
              >Generar</button>
            </div>
          </div>

        </div>

        <div class="modal-divider"></div>

        <!-- Footer -->
        <div class="modal-footer">
          <div class="footer-left">
            <span class="error-msg" *ngIf="errorMsg()" role="alert">{{ errorMsg() }}</span>
          </div>
          <div class="footer-actions">
            <button class="btn-secondary" type="button" (click)="cancel()" [disabled]="saving()">
              Cancelar
            </button>
            <button
              class="btn-primary"
              type="button"
              (click)="save()"
              [disabled]="!isFormValid() || saving()"
            >
              <span *ngIf="saving()" class="spinner" aria-hidden="true"></span>
              {{ saving() ? 'Guardando...' : 'Guardar punto' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      padding: 16px;
    }

    .modal-panel {
      background: var(--surface);
      border: 1px solid var(--outline);
      border-radius: 12px;
      width: 100%;
      max-width: 480px;
      max-height: 90vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .modal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 20px 24px 16px;
    }

    .modal-title {
      font-size: 16px;
      font-weight: 600;
      color: rgba(var(--ink-rgb), 1);
      margin: 0;
    }

    .btn-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      border: none;
      background: rgba(var(--ink-rgb), 0.06);
      border-radius: 6px;
      color: var(--muted);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      flex-shrink: 0;
    }

    .btn-close:hover {
      background: rgba(var(--ink-rgb), 0.1);
      color: rgba(var(--ink-rgb), 1);
    }

    .modal-divider {
      height: 1px;
      background: var(--outline);
    }

    .modal-body {
      padding: 20px 24px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .field-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .field-label {
      font-size: 13px;
      font-weight: 500;
      color: rgba(var(--ink-rgb), 1);
    }

    .required {
      color: var(--red);
      margin-left: 2px;
    }

    .optional {
      font-size: 12px;
      font-weight: 400;
      color: var(--muted);
    }

    .field-input {
      width: 100%;
      padding: 8px 12px;
      background: rgba(var(--ink-rgb), 0.04);
      border: 1px solid var(--outline);
      border-radius: 6px;
      font-size: 14px;
      color: rgba(var(--ink-rgb), 1);
      outline: none;
      box-sizing: border-box;
      transition: border-color 0.15s;
    }

    .field-input:focus {
      border-color: var(--accent);
    }

    .field-input:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }

    .field-input.mono {
      font-family: 'Courier New', Courier, monospace;
      font-size: 13px;
      letter-spacing: 0.02em;
    }

    select.field-input {
      cursor: pointer;
      appearance: auto;
    }

    /* Label row with tooltip */
    .label-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .tooltip-wrapper {
      position: relative;
      display: flex;
      align-items: center;
    }

    .btn-help {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      border: 1px solid var(--outline);
      background: rgba(var(--ink-rgb), 0.04);
      color: var(--muted);
      font-size: 11px;
      font-weight: 700;
      cursor: pointer;
      line-height: 1;
      transition: border-color 0.15s, color 0.15s;
    }

    .btn-help:hover,
    .btn-help:focus {
      border-color: var(--accent);
      color: var(--accent);
      outline: none;
    }

    .tooltip-box {
      position: absolute;
      left: 24px;
      top: 50%;
      transform: translateY(-50%);
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      font-size: 12px;
      line-height: 1.5;
      padding: 8px 12px;
      border-radius: 6px;
      width: 260px;
      z-index: 10;
      pointer-events: none;
      white-space: normal;
    }

    /* Token row */
    .token-row {
      display: flex;
      gap: 8px;
    }

    .token-input {
      flex: 1;
      min-width: 0;
    }

    .btn-generate {
      padding: 8px 14px;
      background: rgba(var(--ink-rgb), 0.06);
      border: 1px solid var(--outline);
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      color: rgba(var(--ink-rgb), 1);
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s, border-color 0.15s;
      flex-shrink: 0;
    }

    .btn-generate:hover {
      background: rgba(var(--ink-rgb), 0.1);
      border-color: var(--accent);
    }

    /* Footer */
    .modal-footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px 20px;
      gap: 12px;
    }

    .footer-left {
      flex: 1;
      min-width: 0;
    }

    .footer-actions {
      display: flex;
      gap: 10px;
      flex-shrink: 0;
    }

    .error-msg {
      font-size: 13px;
      color: var(--red);
      line-height: 1.4;
    }

    .btn-secondary {
      padding: 8px 16px;
      background: rgba(var(--ink-rgb), 0.06);
      border: 1px solid var(--outline);
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      color: rgba(var(--ink-rgb), 1);
      cursor: pointer;
      transition: background 0.15s;
    }

    .btn-secondary:hover:not(:disabled) {
      background: rgba(var(--ink-rgb), 0.1);
    }

    .btn-secondary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .btn-primary {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 18px;
      background: var(--accent);
      border: 1px solid var(--accent);
      border-radius: 6px;
      font-size: 14px;
      font-weight: 600;
      color: #fff;
      cursor: pointer;
      transition: opacity 0.15s;
    }

    .btn-primary:hover:not(:disabled) {
      opacity: 0.88;
    }

    .btn-primary:disabled {
      opacity: 0.45;
      cursor: not-allowed;
    }

    /* Spinner */
    .spinner {
      display: inline-block;
      width: 14px;
      height: 14px;
      border: 2px solid rgba(255, 255, 255, 0.35);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class GatewayModalComponent implements OnInit {
  @Input() clientId?: number;
  @Output() saved = new EventEmitter<void>();
  @Output() cancelled = new EventEmitter<void>();

  private http = inject(HttpClient);

  clients = signal<ClientOption[]>([]);
  loadingClients = signal(false);
  saving = signal(false);
  errorMsg = signal('');
  showTooltipDeviceId = signal(false);
  showTooltipToken = signal(false);

  form: GatewayFormData = {
    clientId: null,
    name: '',
    location: '',
    gatewayId: '',
    edgeToken: ''
  };

  ngOnInit(): void {
    this.loadClients();
  }

  loadClients(): void {
    this.loadingClients.set(true);
    this.http.get<ClientOption[]>(`${API_URL}/clients`).subscribe({
      next: (res) => {
        this.clients.set(res || []);
        this.loadingClients.set(false);
        if (this.clientId != null) {
          this.form.clientId = this.clientId;
        }
      },
      error: () => {
        this.loadingClients.set(false);
      }
    });
  }

  isFormValid(): boolean {
    return (
      this.form.clientId != null &&
      this.form.name.trim().length > 0 &&
      this.form.gatewayId.trim().length > 0 &&
      this.form.edgeToken.trim().length > 0
    );
  }

  generateToken(): void {
    this.form.edgeToken = crypto.randomUUID();
  }

  save(): void {
    if (!this.isFormValid() || this.saving()) return;

    this.saving.set(true);
    this.errorMsg.set('');

    const body = {
      gatewayId: this.form.gatewayId.trim(),
      name: this.form.name.trim(),
      location: this.form.location.trim() || null,
      clientId: this.form.clientId,
      edgeToken: this.form.edgeToken.trim()
    };

    this.http.post(`${API_URL}/gateways`, body).subscribe({
      next: () => {
        this.saving.set(false);
        this.saved.emit();
      },
      error: (err) => {
        this.saving.set(false);
        this.errorMsg.set(
          err?.error?.message || err?.error?.title || 'Error al guardar el punto de acceso'
        );
      }
    });
  }

  cancel(): void {
    if (this.saving()) return;
    this.cancelled.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-overlay')) {
      this.cancel();
    }
  }
}
