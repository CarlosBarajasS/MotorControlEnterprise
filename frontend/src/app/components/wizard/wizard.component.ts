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
    localStorageType: 'nvr' as 'nvr' | 'dvr' | 'none',
    nvrIp: '',
    nvrPort: 80,
    nvrUser: 'admin',
    nvrPassword: '',
    nvrBrand: 'hikvision' as 'hikvision' | 'dahua' | 'generic'
  };
  clientErrors = signal<any>({});

  // Step 5: Acceso Web (antes User)
  userData = {
    email: '',
    name: '',
    password: ''
  };
  userErrors = signal<any>({});
  isCreatingUser = signal<boolean>(false);
  userCreated = signal<boolean>(false);

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

  async nextStep() {
    if (this.currentStep() === 1) {
      if (!this.validateStep1()) return;
      const created = await this.createClientInApi();
      if (!created) return;
      this.clearAlert(1);
    } else if (this.currentStep() === 2) {
      if (!this.validateStep2()) return;
      await this.createCamerasInApi();
      await this.generateFiles();
      this.clearAlert(2);
    } else if (this.currentStep() === 5) {
      if (this.userCreated()) {
        this.router.navigate(['/clients']);
      } else {
        this.createUserInApi();
      }
      return;
    }

    if (this.currentStep() < this.totalSteps) {
      this.currentStep.update(v => v + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  prevStep() {
    if (this.currentStep() > 1 && this.currentStep() !== 5) {
      this.currentStep.update(v => v - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  // --- Step 1 ---
  clientId = signal<number | null>(null);

  validateStep1(): boolean {
    const err: any = {};
    if (!this.clientData.name.trim()) err.name = true;
    if (!this.clientData.businessType) err.businessType = true;
    if (!this.clientData.contactName.trim()) err.contactName = true;
    if (!this.clientData.location.trim()) err.location = true;
    if (!this.clientData.gatewayId.trim()) err.gatewayId = true;

    this.clientErrors.set(err);
    return Object.keys(err).length === 0;
  }

  async createClientInApi(): Promise<boolean> {
    if (this.clientId()) return true; // Ya creado

    try {
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
        this.showAlert(1, 'error', clientBody.error || clientBody.message || 'Error al registrar el cliente.');
        return false;
      }

      const body = await clientRes.json();
      this.clientId.set(body.id);
      this.userData.name = this.clientData.contactName;
      return true;
    } catch (e: any) {
      this.showAlert(1, 'error', 'Error de conexión: ' + e.message);
      return false;
    }
  }

  updateGatewayId() {
    if (!this.clientData.gatewayId && this.clientData.name) {
      const gId = 'edge-gateway-' + this.clientData.name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      this.clientData.gatewayId = gId;
    }
  }

  // --- Step 2 (Cámaras) ---

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

  validateStep2(): boolean {
    if (this.cameras().length === 0) {
      this.showAlert(2, 'error', 'Agrega al menos una cámara');
      return false;
    }
    for (const cam of this.cameras()) {
      if (!cam.id || !cam.ip || !cam.rtspPath) {
        this.showAlert(2, 'error', 'Completa el nombre, IP y ruta RTSP de todas las cámaras');
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
            ptz: false,
            clientId: this.clientId()
          })
        });
      } catch (e) {
        console.warn('Error creating camera:', cam.id, e);
      }
    }
  }

  // --- Step 3: Archivos (Desde API) ---
  async generateFiles() {
    this.alerts.update(a => {
      const newAlerts = { ...a };
      delete newAlerts[3];
      return newAlerts;
    });

    try {
      const res = await fetch(`${this.API_URL}/admin/clients/${this.clientId()}/edge-config`, {
        method: 'GET',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('motor_control_token')
        }
      });

      if (!res.ok) {
        const body = await res.json();
        this.showAlert(3, 'error', body.message || 'Error al obtener la configuración del Edge Gateway desde el servidor central.');
        return;
      }

      const configData = await res.json();

      this.generatedFiles.set({
        env: configData.env,
        compose: configData.dockerCompose,
        mediamtx: configData.mediamtxYml
      });

    } catch (e: any) {
      this.showAlert(3, 'error', 'Error de red al contactar al servidor: ' + e.message);
    }
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

  // --- Step 5: Acceso Web ---
  generateRandomPassword() {
    const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    let pass = "";
    for (let i = 0; i < 12; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
    this.userData.password = pass;
  }

  async createUserInApi() {
    this.clearAlert(5);
    const err: any = {};
    if (!this.userData.email.includes('@')) err.email = true;
    if (!this.userData.name.trim()) err.name = true;
    if (this.userData.password.length < 8) err.password = true;

    this.userErrors.set(err);
    if (Object.keys(err).length > 0) return;

    this.isCreatingUser.set(true);
    try {
      const res = await fetch(`${this.API_URL}/clients/${this.clientId()}/create-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + localStorage.getItem('motor_control_token')
        },
        body: JSON.stringify({
          email: this.userData.email,
          name: this.userData.name,
          password: this.userData.password
        })
      });

      const body = await res.json();
      this.isCreatingUser.set(false);

      if (!res.ok) {
        this.showAlert(5, 'error', body.message || 'Error al crear el acceso web');
        return;
      }

      this.userCreated.set(true);
      this.showAlert(5, 'success', `Acceso creado y credenciales enviadas a ${this.userData.email}`);
    } catch (e: any) {
      this.isCreatingUser.set(false);
      this.showAlert(5, 'error', 'Error de conexión: ' + e.message);
    }
  }

}
