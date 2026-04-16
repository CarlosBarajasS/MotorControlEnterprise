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
  nvrChannel?: number;  // canal DVR (1-16), undefined para cámaras IP individuales
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


interface DvrConfig {
  ip: string;
  port: number;
  brand: 'dahua' | 'hikvision' | 'generic';
  user: string;
  pass: string;
}

interface DvrChannel {
  channel: number;
  name: string;
  resolution?: string;
  fps?: number;
}

type InstallMode = 'dvr' | 'ip' | 'nvr';

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
  currentStep = signal<1 | 2 | 3 | 4 | 5>(1);
  totalSteps = 5;

  // -- Paso 1: Cliente --------------------------------------------------------
  clients = signal<ClientOption[]>([]);
  loadingClients = signal(false);
  selectedClient = signal<ClientOption | null>(null);

  // -- Paso 2: Gateway ----------------------------------------------------------
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

  step2Error = signal('');  // for gateway step

  // -- Paso 3: Tipo de instalacion ----------------------------------------------
  installMode = signal<InstallMode>('dvr');

  dvrConfig: DvrConfig = {
    ip: '',
    port: 80,
    brand: 'dahua',
    user: 'admin',
    pass: ''
  };

  // -- Paso 3: Camaras (modo IP manual) -----------------------------------------
  cameras = signal<CameraForm[]>([]);
  private nextCameraUid = 1;
  step3Error = signal('');

  // -- Paso 4: Archivos ----------------------------------------------------------
  activeTab = signal<'env' | 'mediamtx' | 'compose'>('env');
  generatedFiles = signal<{ env: string; compose: string; mediamtx: string }>({
    env: '', compose: '', mediamtx: ''
  });

  // -- Paso 5: Despliegue & Discovery -------------------------------------------
  discoveryStatus = signal<DiscoveryStatus | null>(null);
  private discoveryPollInterval: ReturnType<typeof setInterval> | null = null;
  private discoveryStartTime = 0;
  private readonly DISCOVERY_TIMEOUT_MS = 5 * 60 * 1000;
  manualRtspInputs = signal<Record<number, string>>({});

  // -- Paso 5: DVR Scan ----------------------------------------------------------
  dvrScanStatus = signal<'idle' | 'scanning' | 'done' | 'error'>('idle');
  dvrChannels = signal<DvrChannel[]>([]);
  dvrScanError = signal('');
  channelNames: Record<number, string> = {};
  channelIncluded: Record<number, boolean> = {};
  private dvrScanPollInterval: ReturnType<typeof setInterval> | null = null;
  private gatewayPollInterval: ReturnType<typeof setInterval> | null = null;
  camerasCreated = signal(false);

  // ── Computed ──────────────────────────────────────────────────────────────
  activeGatewayId = computed(() => {
    if (this.gatewayMode() === 'existing') return this.selectedGateway()?.gatewayId ?? null;
    return this.newGateway.gatewayId.trim() || null;
  });

  canFinish = computed(() => {
    if (this.installMode() === 'dvr' || this.installMode() === 'nvr') {
      return this.camerasCreated();
    }
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
    if (this.gatewayPollInterval) clearInterval(this.gatewayPollInterval);
    if (this.dvrScanPollInterval) clearInterval(this.dvrScanPollInterval);
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
      if (!await this.submitStep2Gateway()) return;
    } else if (this.currentStep() === 3) {
      if (!await this.submitStep3Install()) return;
    } else if (this.currentStep() === 4) {
      this.startDeployPolling();
    } else if (this.currentStep() === 5) {
      this.router.navigate(['/clients']);
      return;
    }
    this.currentStep.update(v => (v + 1) as any);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  prevStep(): void {
    if (this.currentStep() === 1) return;
    if (this.currentStep() === 5) this.stopDiscoveryPolling();
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
    return true;
  }

  // ── Step 2: Cámaras ───────────────────────────────────────────────────────

  addCamera(): void {
    this.cameras.update(list => [
      ...list,
      { uid: this.nextCameraUid++, name: '', ip: '', onvifPort: 8000, onvifUser: 'admin', onvifPass: '', nvrChannel: undefined }
    ]);
  }

  removeCamera(uid: number): void {
    this.cameras.update(list => list.filter(c => c.uid !== uid));
  }

  private async submitIpCameras(): Promise<void> {
    this.step3Error.set('');
    const clientId = this.selectedClient()!.id;
    const cloudActive = this.selectedClient()!.cloudStorageActive;
    let failedCount = 0;

    for (const cam of this.cameras()) {
      if (!cam.name.trim() || !cam.ip.trim()) continue; // skip incomplete
      const base = {
        name: cam.name, cameraId: cam.name, onvifPort: cam.onvifPort || 8000,
        onvifUser: cam.onvifUser, onvifPass: cam.onvifPass, onvifIp: cam.ip,
        nvrChannel: cam.nvrChannel || null,
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
      this.step3Error.set(
        `${failedCount} cámara(s) no se pudieron registrar. Agrégalas después desde el módulo de Cámaras.`
      );
    }
  }

  // -- Step 2: Gateway (submit) -------------------------------------------

  private async submitStep2Gateway(): Promise<boolean> {
    this.step2Error.set('');
    const clientId = this.selectedClient()!.id;
    if (this.gatewayMode() === 'existing') {
      if (!this.selectedGateway()) { this.step2Error.set('Selecciona un gateway existente.'); return false; }
      return true;
    }
    if (!this.newGateway.name.trim()) { this.step2Error.set('El nombre del punto es requerido.'); return false; }
    if (!this.newGateway.gatewayId.trim()) { this.step2Error.set('El ID del dispositivo es requerido.'); return false; }
    if (!this.newGateway.edgeToken.trim()) { this.step2Error.set('Genera o ingresa un token de acceso.'); return false; }
    this.savingGateway.set(true);
    try {
      const result = await firstValueFrom(
        this.http.post<GatewayOption>(`${API_URL}/gateways`, {
          clientId, name: this.newGateway.name, gatewayId: this.newGateway.gatewayId,
          edgeToken: this.newGateway.edgeToken, location: this.newGateway.location || null
        })
      );
      this.selectedGateway.set(result);
      return true;
    } catch (err: any) {
      this.step2Error.set(err?.error?.message ?? 'Error al registrar el gateway.');
      return false;
    } finally {
      this.savingGateway.set(false);
    }
  }

  // -- Paso 3: Tipo instalacion (submit) ------------------------------------

  private async submitStep3Install(): Promise<boolean> {
    this.step3Error.set('');
    const mode = this.installMode();
    if (mode === 'dvr' || mode === 'nvr') {
      if (!this.dvrConfig.ip.trim()) { this.step3Error.set('La IP del DVR es requerida.'); return false; }
      const clientId = this.selectedClient()!.id;
      const gatewayId = this.activeGatewayId();
      try {
        await firstValueFrom(this.http.post(`${API_URL}/admin/clients/${clientId}/scan-dvr`, {
          gatewayId,
          nvrIp:       this.dvrConfig.ip,
          nvrPort:     this.dvrConfig.port,
          nvrUser:     this.dvrConfig.user,
          nvrPassword: this.dvrConfig.pass,
          nvrBrand:    this.dvrConfig.brand,
        }));
        this.dvrScanStatus.set('scanning');
        await this.generateFiles();
        return true;
      } catch (err: any) {
        this.step3Error.set(err?.error?.message ?? 'Error al iniciar el escaneo DVR.');
        return false;
      }
    }
    const filesOk = await this.generateFiles();
    if (!filesOk) return false;
    await this.submitIpCameras();
    return true;
  }

  startDeployPolling(): void {
    if (this.installMode() === 'dvr' || this.installMode() === 'nvr') {
      this.pollDvrScanOnce();
      this.dvrScanPollInterval = setInterval(() => this.pollDvrScanOnce(), 3000);
    } else {
      this.startDiscoveryPolling();
    }
  }

  private async pollDvrScanOnce(): Promise<void> {
    const clientId = this.selectedClient()?.id;
    const gatewayId = this.activeGatewayId();
    if (!clientId || !gatewayId) return;
    try {
      const data = await firstValueFrom(
        this.http.get<{ status: string; channels: DvrChannel[] }>(
          `${API_URL}/admin/clients/${clientId}/dvr-scan-status`
        )
      );
      this.dvrScanStatus.set(data.status as any);
      if (data.status === 'done') {
        this.stopDvrScanPolling();
        this.dvrChannels.set(data.channels ?? []);
        for (const ch of data.channels ?? []) { this.channelNames[ch.channel] = ch.name; this.channelIncluded[ch.channel] = true; }
      } else if (data.status === 'error') {
        this.stopDvrScanPolling();
        this.dvrScanError.set('El escaneo falló. Verifica la IP y credenciales del DVR.');
      }
    } catch { /* ignore */ }
  }

  stopDvrScanPolling(): void {
    if (this.dvrScanPollInterval) { clearInterval(this.dvrScanPollInterval); this.dvrScanPollInterval = null; }
  }

  async createDvrCameras(): Promise<void> {
    const clientId = this.selectedClient()!.id;
    const gatewayId = this.activeGatewayId();
    const channels = this.dvrChannels().filter(ch => this.channelIncluded[ch.channel])
      .map(ch => ({ channel: ch.channel, name: this.channelNames[ch.channel] || ch.name }));
    try {
      await firstValueFrom(this.http.post(`${API_URL}/admin/clients/${clientId}/create-dvr-cameras`, {
        gatewayId,
        cameras: channels.map(ch => ({ channel: ch.channel, name: ch.name })),
      }));
      this.camerasCreated.set(true);
    } catch (err: any) {
      this.dvrScanError.set(err?.error?.message ?? 'Error al crear las cámaras.');
    }
  }

  canContinueFromStep4(): boolean { return this.generatedFiles().env !== ''; }

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
