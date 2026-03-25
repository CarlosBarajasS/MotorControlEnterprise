import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';
import { firstValueFrom } from 'rxjs';

const API_URL = '/api';

interface ClientOption {
  id: number;
  name: string;
  cloudStorageActive: boolean;
  localStorageType: string;
}

interface GatewayOption {
  id: number;
  gatewayId: string;
  name: string;
  location?: string;
}

interface CameraForm {
  uid: number;        // local unique id para tracking en @for
  name: string;
  ip: string;
  onvifPort: number;
  onvifUser: string;
  onvifPass: string;
}

interface DiscoveryCamera {
  id: number;
  name: string;
  ip?: string;
  status: 'pending' | 'discovering' | 'discovered' | 'onvif_failed' | 'manual';
  brand?: string;
  model?: string;
  resolution?: string;
  fps?: number;
}

interface DiscoveryStatus {
  gatewayOnline: boolean;
  cameras: DiscoveryCamera[];
}

@Component({
  selector: 'app-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './wizard.component.html',
  styleUrls: ['./wizard.component.scss']
})
export class WizardComponent implements OnInit, OnDestroy {
  private http = inject(HttpClient);
  private router = inject(Router);

  // ── Progreso ──────────────────────────────────────────────────────────────
  currentStep = signal<1 | 2 | 3 | 4>(1);
  totalSteps = 4;

  // ── Paso 1: Cliente & Gateway ─────────────────────────────────────────────
  clients = signal<ClientOption[]>([]);
  loadingClients = signal(false);
  selectedClient = signal<ClientOption | null>(null);

  gateways = signal<GatewayOption[]>([]);
  loadingGateways = signal(false);
  gatewayMode = signal<'existing' | 'new'>('existing');
  selectedGateway = signal<GatewayOption | null>(null);

  newGateway = {
    name: '',
    gatewayId: '',
    edgeToken: '',
    location: ''
  };
  showToken = signal(false);   // true = texto plano, false = password
  step1Error = signal('');
  savingGateway = signal(false);

  // ── Paso 2: Cámaras ───────────────────────────────────────────────────────
  cameras = signal<CameraForm[]>([]);
  private nextCameraUid = 1;
  step2Error = signal('');

  // ── Paso 3: Archivos ──────────────────────────────────────────────────────
  activeTab = signal<'env' | 'mediamtx' | 'compose'>('env');
  generatedFiles = signal<{ env: string; compose: string; mediamtx: string }>({
    env: '', compose: '', mediamtx: ''
  });
  step3Error = signal('');

  // ── Paso 4: Despliegue & Discovery ────────────────────────────────────────
  discoveryStatus = signal<DiscoveryStatus | null>(null);
  private discoveryPollInterval: ReturnType<typeof setInterval> | null = null;
  private discoveryStartTime = 0;
  private readonly DISCOVERY_TIMEOUT_MS = 5 * 60 * 1000;
  manualRtspInputs = signal<Record<number, string>>({});

  // ── Computed ──────────────────────────────────────────────────────────────
  activeGatewayId = computed(() => {
    if (this.gatewayMode() === 'existing') return this.selectedGateway()?.gatewayId ?? null;
    return this.newGateway.gatewayId.trim() || null;
  });

  canContinueFromStep4 = computed(() => {
    const status = this.discoveryStatus();
    if (!status?.cameras?.length) return false;
    return status.cameras.every(c =>
      ['discovered', 'onvif_failed', 'manual'].includes(c.status)
    ) || status.gatewayOnline;
  });

  // ─────────────────────────────────────────────────────────────────────────

  ngOnInit(): void {
    this.loadClients();
  }

  ngOnDestroy(): void {
    this.stopDiscoveryPolling();
  }

  // ── Clientes ──────────────────────────────────────────────────────────────

  loadClients(): void {
    this.loadingClients.set(true);
    this.http.get<ClientOption[]>(`${API_URL}/clients`).subscribe({
      next: (res) => { this.clients.set(res ?? []); this.loadingClients.set(false); },
      error: () => this.loadingClients.set(false)
    });
  }

  onClientChange(clientId: string): void {
    const id = parseInt(clientId, 10);
    const client = this.clients().find(c => c.id === id) ?? null;
    this.selectedClient.set(client);
    this.selectedGateway.set(null);
    this.gateways.set([]);
    this.step1Error.set('');

    if (!client) return;

    this.loadingGateways.set(true);
    this.http.get<GatewayOption[]>(`${API_URL}/clients/${client.id}/gateways`).subscribe({
      next: (res) => {
        this.gateways.set(res ?? []);
        this.loadingGateways.set(false);
        // Sin gateways → modo "nuevo" forzado
        this.gatewayMode.set(res?.length ? 'existing' : 'new');
      },
      error: () => this.loadingGateways.set(false)
    });
  }

  setGatewayMode(mode: 'existing' | 'new'): void {
    this.gatewayMode.set(mode);
    this.selectedGateway.set(null);
    this.step1Error.set('');
  }

  onGatewayChange(gatewayId: string): void {
    const gw = this.gateways().find(g => g.gatewayId === gatewayId) ?? null;
    this.selectedGateway.set(gw);
  }

  generateToken(): void {
    this.newGateway.edgeToken = crypto.randomUUID();
    this.showToken.set(true);
  }

  // ── Navegación ────────────────────────────────────────────────────────────

  async nextStep(): Promise<void> {
    if (this.currentStep() === 1) {
      if (!await this.submitStep1()) return;
    } else if (this.currentStep() === 2) {
      await this.submitStep2();
      if (!await this.generateFiles()) return;
    } else if (this.currentStep() === 3) {
      this.startDiscoveryPolling();
    } else if (this.currentStep() === 4) {
      this.router.navigate(['/clients']);
      return;
    }
    this.currentStep.update(v => (v + 1) as any);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  prevStep(): void {
    if (this.currentStep() === 1) return;
    if (this.currentStep() === 4) this.stopDiscoveryPolling();
    this.currentStep.update(v => (v - 1) as any);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ── Step 1 submit ─────────────────────────────────────────────────────────

  private async submitStep1(): Promise<boolean> {
    this.step1Error.set('');
    if (!this.selectedClient()) {
      this.step1Error.set('Selecciona un cliente.');
      return false;
    }

    if (this.gatewayMode() === 'existing') {
      if (!this.selectedGateway()) {
        this.step1Error.set('Selecciona un gateway existente.');
        return false;
      }
      return true;
    }

    // Modo "nuevo"
    if (!this.newGateway.name.trim()) { this.step1Error.set('El nombre del punto es requerido.'); return false; }
    if (!this.newGateway.gatewayId.trim()) { this.step1Error.set('El ID del dispositivo es requerido.'); return false; }
    if (!this.newGateway.edgeToken.trim()) { this.step1Error.set('Genera o ingresa un token de acceso.'); return false; }

    this.savingGateway.set(true);
    try {
      const body = {
        gatewayId: this.newGateway.gatewayId.trim(),
        name: this.newGateway.name.trim(),
        location: this.newGateway.location.trim() || null,
        clientId: this.selectedClient()!.id,
        edgeToken: this.newGateway.edgeToken.trim()
      };

      const created = await firstValueFrom(
        this.http.post<{ id: number }>(`${API_URL}/gateways`, body)
      );

      // Guardar como gateway seleccionado (id viene del backend)
      this.selectedGateway.set({
        id: created?.id ?? 0,
        gatewayId: body.gatewayId,
        name: body.name,
        location: body.location ?? undefined
      });
      return true;
    } catch (err: any) {
      this.step1Error.set(
        err?.error?.message ?? 'Error al registrar el gateway. Verifica el ID del dispositivo.'
      );
      return false;
    } finally {
      this.savingGateway.set(false);
    }
  }

  // ── Step 2: Cámaras ───────────────────────────────────────────────────────

  addCamera(): void {
    this.cameras.update(list => [
      ...list,
      { uid: this.nextCameraUid++, name: '', ip: '', onvifPort: 8000, onvifUser: 'admin', onvifPass: '' }
    ]);
  }

  removeCamera(uid: number): void {
    this.cameras.update(list => list.filter(c => c.uid !== uid));
  }

  private async submitStep2(): Promise<void> {
    this.step2Error.set('');
    const clientId = this.selectedClient()!.id;
    const cloudActive = this.selectedClient()!.cloudStorageActive;
    let failedCount = 0;

    for (const cam of this.cameras()) {
      if (!cam.name.trim() || !cam.ip.trim()) continue; // skip incomplete
      const base = {
        name: cam.name, cameraId: cam.name, onvifPort: cam.onvifPort || 8000,
        onvifUser: cam.onvifUser, onvifPass: cam.onvifPass, onvifIp: cam.ip,
        ptz: false, isRecordingOnly: false, clientId
      };
      try {
        await firstValueFrom(this.http.post(`${API_URL}/cameras`, base));
        if (cloudActive) {
          await firstValueFrom(this.http.post(`${API_URL}/cameras`, {
            ...base,
            name: `${cam.name}-low`, cameraId: `${cam.name}-low`,
            isRecordingOnly: true
          }));
        }
      } catch { failedCount++; }
    }

    if (failedCount > 0) {
      this.step2Error.set(
        `${failedCount} cámara(s) no se pudieron registrar. Agrégalas después desde el módulo de Cámaras.`
      );
    }
  }

  // ── Step 3: Archivos ──────────────────────────────────────────────────────

  async generateFiles(): Promise<boolean> {
    this.step3Error.set('');
    const clientId = this.selectedClient()!.id;
    const gatewayId = this.activeGatewayId();

    if (!gatewayId) {
      this.step3Error.set('No hay gateway seleccionado.');
      return false;
    }

    try {
      const data = await firstValueFrom(
        this.http.get<{ env: string; dockerCompose: string; mediamtxYml: string }>(
          `${API_URL}/admin/clients/${clientId}/edge-config?gatewayId=${encodeURIComponent(gatewayId)}`
        )
      );
      this.generatedFiles.set({ env: data.env, compose: data.dockerCompose, mediamtx: data.mediamtxYml });
      return true;
    } catch (err: any) {
      this.step3Error.set(err?.error?.message ?? 'Error al obtener la configuración.');
      return false;
    }
  }

  showTab(tab: 'env' | 'mediamtx' | 'compose'): void { this.activeTab.set(tab); }

  downloadFile(type: 'env' | 'mediamtx' | 'compose'): void {
    const map = {
      env:      { content: this.generatedFiles().env,     name: 'edge-gateway.env' },
      mediamtx: { content: this.generatedFiles().mediamtx, name: 'mediamtx.yml' },
      compose:  { content: this.generatedFiles().compose,  name: 'docker-compose.yml' }
    };
    const { content, name } = map[type];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ── Step 4: Discovery ────────────────────────────────────────────────────

  startDiscoveryPolling(): void {
    this.discoveryStartTime = Date.now();
    this.pollDiscoveryOnce();
    this.discoveryPollInterval = setInterval(() => {
      if (Date.now() - this.discoveryStartTime > this.DISCOVERY_TIMEOUT_MS) {
        this.stopDiscoveryPolling();
        return;
      }
      this.pollDiscoveryOnce();
    }, 3000);
  }

  stopDiscoveryPolling(): void {
    if (this.discoveryPollInterval) { clearInterval(this.discoveryPollInterval); this.discoveryPollInterval = null; }
  }

  private async pollDiscoveryOnce(): Promise<void> {
    const clientId = this.selectedClient()?.id;
    if (!clientId) return;
    try {
      const data = await firstValueFrom(
        this.http.get<DiscoveryStatus>(`${API_URL}/admin/clients/${clientId}/discovery-status`)
      );
      this.discoveryStatus.set(data);
      const allTerminal = data.cameras?.every(c =>
        ['discovered', 'onvif_failed', 'manual'].includes(c.status)
      );
      if (allTerminal && data.cameras?.length > 0) this.stopDiscoveryPolling();
    } catch { /* ignore */ }
  }

  async retryDiscovery(cameraId?: number): Promise<void> {
    const clientId = this.selectedClient()?.id;
    if (!clientId) return;
    const gatewayId = this.activeGatewayId();
    const base = `${API_URL}/admin/clients/${clientId}/trigger-discovery`;
    const params = new URLSearchParams();
    if (cameraId) params.set('cameraId', String(cameraId));
    if (gatewayId) params.set('gatewayId', gatewayId);
    const url = params.toString() ? `${base}?${params}` : base;
    try {
      await firstValueFrom(this.http.post(url, {}));
    } catch { /* ignore */ }
    if (!this.discoveryPollInterval) this.startDiscoveryPolling();
  }

  setManualRtsp(camId: number, value: string): void {
    this.manualRtspInputs.update(m => ({ ...m, [camId]: value }));
  }

  async saveManualRtsp(cameraId: number): Promise<void> {
    const rtspUrl = this.manualRtspInputs()[cameraId];
    if (!rtspUrl?.startsWith('rtsp://')) return;
    const cam = this.discoveryStatus()?.cameras.find(c => c.id === cameraId);
    if (!cam) return;
    try {
      await firstValueFrom(
        this.http.put(`${API_URL}/cameras/${cameraId}`, {
          name: cam.name,
          location: null,
          rtspUrl,
          clientId: this.selectedClient()?.id ?? null,
          ptz: false,
          isRecordingOnly: false
        })
      );
    } catch { return; }
    this.discoveryStatus.update(s => s ? ({
      ...s,
      cameras: s.cameras.map(c => c.id === cameraId ? { ...c, status: 'manual' as const } : c)
    }) : null);
    await this.pollDiscoveryOnce();
  }
}
