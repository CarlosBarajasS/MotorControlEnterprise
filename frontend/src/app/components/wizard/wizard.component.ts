import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router, RouterModule } from '@angular/router';

@Component({
  selector: 'app-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './wizard.component.html',
  styleUrls: ['./wizard.component.scss']
})
export class WizardComponent implements OnInit {
  private http = inject(HttpClient);
  private router = inject(Router);

  API_URL = '/api';

  currentStep = signal<number>(1);
  totalSteps = 5;

  // Alerts
  alerts = signal<{ [key: number]: { type: 'error' | 'success' | 'info', message: string } }>({});

  // Step 1: Client
  clientData = {
    name: '',
    businessType: '',
    contactName: '',
    contactPhone: '',
    location: '',
    gatewayId: '',
    cloudStorageActive: true,
    localStorageType: 'nvr' as 'nvr' | 'dvr' | 'sd' | 'none',
    nvrIp: '',
    nvrPort: 80,
    nvrUser: 'admin',
    nvrPassword: '',
    nvrBrand: 'hikvision' as 'hikvision' | 'dahua' | 'generic'
  };
  clientErrors = signal<any>({});

  // Step 2: User
  userData = {
    email: '',
    password: '',
    confirmPassword: ''
  };
  userErrors = signal<any>({});
  isCreatingUser = signal<boolean>(false);

  // Step 3: Cameras
  cameras = signal<any[]>([{ id: 'cam1', ip: '', user: 'admin', password: '', rtspPath: '/Streaming/Channels/101' }]);

  // Step 4: Files
  activeTab = signal<'env' | 'mediamtx' | 'compose'>('env');
  generatedFiles = signal<{ env: string, compose: string, mediamtx: string }>({ env: '', compose: '', mediamtx: '' });

  ngOnInit(): void { }

  showAlert(step: number, type: 'error' | 'success' | 'info', message: string) {
    this.alerts.update(a => ({ ...a, [step]: { type, message } }));
  }

  clearAlert(step: number) {
    this.alerts.update(a => {
      const newAlerts = { ...a };
      delete newAlerts[step];
      return newAlerts;
    });
  }

  nextStep() {
    if (this.currentStep() === 1) {
      if (!this.validateStep1()) return;
      this.clearAlert(1);
    } else if (this.currentStep() === 2) {
      this.validateStep2().then(isValid => {
        if (isValid) {
          this.currentStep.set(3);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      });
      return;
    } else if (this.currentStep() === 3) {
      if (!this.validateStep3()) return;
      this.createCamerasInApi();
      this.generateFiles();
      this.clearAlert(3);
    }

    if (this.currentStep() < this.totalSteps) {
      this.currentStep.update(v => v + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevStep() {
    if (this.currentStep() > 1) {
      this.currentStep.update(v => v - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // --- Step 1 ---
  validateStep1(): boolean {
    const err: any = {};
    if (!this.clientData.name.trim()) err.name = true;
    if (!this.clientData.businessType) err.businessType = true;
    if (!this.clientData.contactName.trim()) err.contactName = true;
    if (!this.clientData.location.trim()) err.location = true;
    if (!this.clientData.gatewayId.trim()) err.gatewayId = true;
    // NVR/DVR validation
    if ((this.clientData.localStorageType === 'nvr' || this.clientData.localStorageType === 'dvr') && !this.clientData.nvrIp.trim()) {
      err.nvrIp = true;
      this.showAlert(1, 'error', 'Ingresa la IP del ' + (this.clientData.localStorageType === 'nvr' ? 'NVR' : 'DVR'));
    }

    this.clientErrors.set(err);
    return Object.keys(err).length === 0;
  }

  updateGatewayId() {
    if (!this.clientData.gatewayId && this.clientData.name) {
      const gId = 'edge-gateway-' + this.clientData.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      this.clientData.gatewayId = gId;
    }
  }

  // --- Step 2 ---
  async validateStep2(): Promise<boolean> {
    this.clearAlert(2);
    const err: any = {};
    const emailStr = this.userData.email.trim();
    const passStr = this.userData.password;

    if (!emailStr || !emailStr.includes('@')) err.email = true;
    if (passStr.length < 8) err.password = true;
    if (passStr !== this.userData.confirmPassword) err.confirmPassword = true;

    this.userErrors.set(err);
    if (Object.keys(err).length > 0) return false;

    this.isCreatingUser.set(true);
    try {
      // Create User
      const userRes = await fetch(`${this.API_URL}/admin/auth/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem('motor_control_token')
        },
        body: JSON.stringify({ email: emailStr, password: passStr, name: this.clientData.contactName, role: 'client' })
      });
      const userBody = await userRes.json();

      if (!userRes.ok) {
        this.showAlert(2, 'error', userBody.error || 'Error al crear el usuario. ' + (userBody.errors ? JSON.stringify(userBody.errors) : ''));
        this.isCreatingUser.set(false);
        return false;
      }

      // Create Client
      const clientRes = await fetch(`${this.API_URL}/clients`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem('motor_control_token')
        },
        body: JSON.stringify({
          name: this.clientData.name,
          businessType: this.clientData.businessType,
          contactName: this.clientData.contactName,
          contactPhone: this.clientData.contactPhone,
          address: this.clientData.location,
          contactEmail: emailStr,
          userId: userBody.user.id || userBody.user.Id, // Fallback if capitalization changes
          gatewayId: this.clientData.gatewayId,
          cloudStorageActive: this.clientData.cloudStorageActive,
          localStorageType: this.clientData.localStorageType,
          nvrIp: this.clientData.nvrIp || null,
          nvrPort: this.clientData.nvrPort,
          nvrUser: this.clientData.nvrUser || null,
          nvrPassword: this.clientData.nvrPassword || null,
          nvrBrand: this.clientData.nvrBrand || null
        })
      });

      if (!clientRes.ok) {
        const clientBody = await clientRes.json();
        this.showAlert(2, 'error', clientBody.error || 'Error al registrar el cliente. ' + (clientBody.errors ? JSON.stringify(clientBody.errors) : ''));
        this.isCreatingUser.set(false);
        return false;
      }

      this.isCreatingUser.set(false);
      return true;
    } catch (e: any) {
      this.showAlert(2, 'error', 'Error de conexión con el servidor: ' + e.message);
      this.isCreatingUser.set(false);
      return false;
    }
  }

  calculatePasswordStrength(): number {
    const p = this.userData.password;
    if (!p) return 0;
    if (p.length < 8) return 33;
    if (/[a-zA-Z]/.test(p) && /[0-9]/.test(p) && p.length >= 8) return 66;
    if (/[a-zA-Z]/.test(p) && /[0-9]/.test(p) && /[^a-zA-Z0-9]/.test(p) && p.length >= 10) return 100;
    return 33;
  }

  // --- Step 3 ---
  addCamera() {
    this.cameras.update(c => [...c, { id: 'cam' + (c.length + 1), ip: '', user: 'admin', password: '', rtspPath: '/Streaming/Channels/101' }]);
  }

  removeCamera(index: number) {
    this.cameras.update(c => c.filter((_, i) => i !== index));
  }

  validateStep3(): boolean {
    if (this.cameras().length === 0) {
      this.showAlert(3, 'error', 'Agrega al menos una cámara');
      return false;
    }
    for (const cam of this.cameras()) {
      if (!cam.id || !cam.ip || !cam.rtspPath) {
        this.showAlert(3, 'error', 'Completa el nombre, IP y ruta RTSP de todas las cámaras');
        return false;
      }
    }
    return true;
  }

  async createCamerasInApi() {
    const token = localStorage.getItem('motor_control_token');
    for (const cam of this.cameras()) {
      try {
        await fetch(`${this.API_URL}/cameras`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
          },
          body: JSON.stringify({
            name: cam.id,
            location: this.clientData.location,
            rtspUrl: `rtsp://${cam.user || 'admin'}:${cam.password || ''}@${cam.ip}${cam.rtspPath}`,
            ptz: false
          })
        });
      } catch (e) {
        console.warn('Error creating camera:', cam.id, e);
      }
    }
  }

  // --- Step 4 ---
  generateFiles() {
    const env = this.buildEnv();
    const compose = this.buildDockerCompose();
    const mediamtx = this.buildMediamtxYml();
    this.generatedFiles.set({ env, compose, mediamtx });
  }

  buildEnv(): string {
    const gw = this.clientData.gatewayId;
    return `# NIRM GROUP Edge Gateway
# Cliente: ${this.clientData.name}
# Generado: ${new Date().toLocaleDateString('es-MX')}

# ===================================================
# IDENTIFICACION DEL GATEWAY
# ===================================================
CLIENT_ID=${gw}
GATEWAY_NAME=${this.clientData.name}
LOCATION=${this.clientData.location}

# ===================================================
# SERVIDOR CENTRAL - MQTT
# ===================================================
MQTT_HOST=177.247.175.4
MQTT_PORT=1885
MQTT_USERNAME=
MQTT_PASSWORD=
HEARTBEAT_INTERVAL_MS=30000

# ===================================================
# MEDIAMTX LOCAL
# ===================================================
MEDIAMTX_API_URL=http://mediamtx:9997
MEDIAMTX_USERNAME=edge
MEDIAMTX_PASSWORD=edge123

# ===================================================
# RELAY AL SERVIDOR CENTRAL
# ===================================================
CENTRAL_RTSP_HOST=177.247.175.4
CENTRAL_RTSP_PORT=8556
MEDIAMTX_PUSH_USER=edge-relay
MEDIAMTX_PUSH_PASS=relay-secret-2026

# ===================================================
# SERVIDOR HTTP (edge-agent)
# ===================================================
PORT=8090
TZ=America/Mexico_City

# ===================================================
# CREDENCIALES DE CAMARAS (para ISAPI y PTZ)
# ===================================================
${this.cameras().map(cam => `CAMERA_${(cam.id || 'cam').toUpperCase().replace(/-/g, '_')}_IP=${cam.ip}
CAMERA_${(cam.id || 'cam').toUpperCase().replace(/-/g, '_')}_USER=${cam.user || 'admin'}
CAMERA_${(cam.id || 'cam').toUpperCase().replace(/-/g, '_')}_PASS=${cam.password || ''}`).join('\n')}
`;
  }

  buildDockerCompose(): string {
    return `services:
  mediamtx:
    image: bluenviron/mediamtx:latest-ffmpeg
    container_name: edge-mediamtx
    restart: unless-stopped
    ports:
      - "8554:8554"   # RTSP
      - "8888:8888"   # HLS
      - "8889:8889"   # WebRTC HTTP
      - "8189:8189/udp" # WebRTC ICE/UDP
      - "9997:9997"   # API
    environment:
      - MEDIAMTX_USERNAME=\${MEDIAMTX_USERNAME:-edge}
      - MEDIAMTX_PASSWORD=\${MEDIAMTX_PASSWORD:-edge123}
      - MEDIAMTX_PUSH_USER=\${MEDIAMTX_PUSH_USER:-edge-relay}
      - MEDIAMTX_PUSH_PASS=\${MEDIAMTX_PUSH_PASS:-relay-secret-changeme}
      - CENTRAL_RTSP_HOST=\${CENTRAL_RTSP_HOST:-177.247.175.4}
      - CENTRAL_RTSP_PORT=\${CENTRAL_RTSP_PORT:-8556}
      - GATEWAY_CLIENT_ID=\${CLIENT_ID:-edge-gateway-001}
      - TZ=America/Mexico_City
    volumes:
      - ./mediamtx/mediamtx.yml:/mediamtx.yml:ro
      - ./data/recordings:/recordings
      - /usr/share/zoneinfo/America/Mexico_City:/usr/share/zoneinfo/America/Mexico_City:ro
      - /usr/share/zoneinfo/UTC:/usr/share/zoneinfo/UTC:ro
    networks:
      - edge-net

  edge-agent:
    build: ./edge-agent
    container_name: edge-agent
    restart: unless-stopped
    env_file:
      - .env
    environment:
      - TZ=\${TZ:-America/Mexico_City}
    volumes:
      - ./data/recordings:/recordings:ro
    depends_on:
      - mediamtx
    networks:
      - edge-net
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:8090/health"]
      interval: 30s
      timeout: 10s
      retries: 4
      start_period: 60s

networks:
  edge-net:
    driver: bridge
`;
  }

  buildMediamtxYml(): string {
    const gw = this.clientData.gatewayId;
    const camPaths = this.cameras().map(cam => {
      const user = cam.user ? cam.user : 'admin';
      const pass = cam.password ? cam.password : 'PASSWORD';
      return `  ${cam.id}:
    source: rtsp://${user}:${pass}@${cam.ip}${cam.rtspPath}`;
    }).join('\n\n');

    return `###############################################
# MediaMTX Edge Gateway
# Cliente: ${this.clientData.name}
# Gateway ID: ${gw}
###############################################

logLevel: info

api: yes
apiAddress: 0.0.0.0:9997

authInternalUsers:
  - user: "\${MEDIAMTX_USERNAME}"
    pass: "\${MEDIAMTX_PASSWORD}"
    permissions:
      - action: read
      - action: api
      - action: publish

rtspAddress: :8554
hlsAddress: :8888
webrtcAddress: :8889

pathDefaults:
  record: yes
  recordPath: /recordings/%path/%Y-%m-%d/%H-%M-%S
  recordSegmentDuration: 15m
  recordFormat: fmp4
  runOnReady: >-
    ffmpeg
    -rtsp_transport tcp
    -i rtsp://\${MEDIAMTX_USERNAME}:\${MEDIAMTX_PASSWORD}@127.0.0.1:8554/$MTX_PATH
    -c copy -f rtsp
    -rtsp_transport tcp
    rtsp://\${MEDIAMTX_PUSH_USER}:\${MEDIAMTX_PUSH_PASS}@\${CENTRAL_RTSP_HOST}:\${CENTRAL_RTSP_PORT}/\${GATEWAY_CLIENT_ID}/$MTX_PATH
  runOnReadyRestart: yes

paths:
${camPaths}
`;
  }

  showTab(tab: 'env' | 'mediamtx' | 'compose') {
    this.activeTab.set(tab);
  }

  downloadFile(type: 'env' | 'mediamtx' | 'compose') {
    let content = '';
    let filename = '';
    const gw = this.clientData.gatewayId;

    if (type === 'env') {
      content = this.generatedFiles().env;
      filename = '.env';
    } else if (type === 'mediamtx') {
      content = this.generatedFiles().mediamtx;
      filename = `${gw}_mediamtx.yml`;
    } else {
      content = this.generatedFiles().compose;
      filename = `${gw}_docker-compose.yml`;
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

}
