import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface SubUser {
  id: number;
  email: string;
  name?: string;
  isActive: boolean;
  mustChangePassword: boolean;
  createdAt: string;
}

const API_URL = '/api';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule],
  templateUrl: './client-detail.component.html',
  styleUrls: ['./client-detail.component.scss']
})
export class ClientDetailComponent implements OnInit, OnDestroy {
  route = inject(ActivatedRoute);
  router = inject(Router);
  http = inject(HttpClient);

  clientId = signal<string>('');
  clientData = signal<any>(null);
  cameras = signal<any[]>([]);
  loading = signal<boolean>(true);

  reScanPollInterval: ReturnType<typeof setInterval> | null = null;

  // Sub-usuarios
  subUsers = signal<SubUser[]>([]);
  showAddSubUser = signal(false);
  savingSubUser = signal(false);
  subUserError = signal('');
  subUserForm = { email: '', name: '', password: '', mustChangePassword: true };

  // Edge Config Modal
  showEdgeConfig = signal<boolean>(false);
  edgeConfigLoading = signal<boolean>(false);
  edgeConfig = signal<any>(null);
  edgeConfigTab = signal<'env' | 'compose' | 'mediamtx'>('env');
  copyFeedback = signal<string>('');

  ngOnInit() {
    this.clientId.set(this.route.snapshot.paramMap.get('id') || '');
    if (this.clientId()) {
      this.loadClientDetails();
    }
  }

  loadClientDetails() {
    this.loading.set(true);
    this.http.get<any>(`${API_URL}/clients/${this.clientId()}`).subscribe({
      next: (res) => {
        this.clientData.set(res.client || res);
        this.cameras.set(res.cameras || []);
        this.loading.set(false);
        this.loadSubUsers();
      },
      error: (err) => {
        console.error('Error cargando detalles del cliente/gateway:', err);
        this.loading.set(false);
      }
    });
  }

  loadSubUsers() {
    this.http.get<SubUser[]>(`${API_URL}/clients/${this.clientId()}/sub-users`).subscribe({
      next: (users) => this.subUsers.set(users),
      error: (err) => console.error('Error cargando sub-usuarios:', err)
    });
  }

  openAddSubUser() {
    this.subUserForm = { email: '', name: '', password: '', mustChangePassword: true };
    this.subUserError.set('');
    this.showAddSubUser.set(true);
  }

  closeAddSubUser() {
    this.showAddSubUser.set(false);
  }

  createSubUser() {
    if (!this.subUserForm.email || !this.subUserForm.password) return;
    this.savingSubUser.set(true);
    this.subUserError.set('');
    this.http.post<SubUser>(`${API_URL}/clients/${this.clientId()}/sub-users`, {
      email: this.subUserForm.email,
      password: this.subUserForm.password,
      name: this.subUserForm.name || undefined,
      mustChangePassword: this.subUserForm.mustChangePassword
    }).subscribe({
      next: (user) => {
        this.subUsers.update(list => [...list, user]);
        this.savingSubUser.set(false);
        this.closeAddSubUser();
      },
      error: (err) => {
        this.subUserError.set(err?.error?.message || 'Error al crear el usuario.');
        this.savingSubUser.set(false);
      }
    });
  }

  toggleSubUserStatus(user: SubUser) {
    this.http.patch(`${API_URL}/clients/${this.clientId()}/sub-users/${user.id}/status`, {
      isActive: !user.isActive
    }).subscribe({
      next: () => this.subUsers.update(list =>
        list.map(u => u.id === user.id ? { ...u, isActive: !u.isActive } : u)
      ),
      error: (err) => console.error('Error actualizando estado:', err)
    });
  }

  deleteSubUser(user: SubUser) {
    if (!confirm(`¿Eliminar acceso de ${user.email}? Esta acción no se puede deshacer.`)) return;
    this.http.delete(`${API_URL}/clients/${this.clientId()}/sub-users/${user.id}`).subscribe({
      next: () => this.subUsers.update(list => list.filter(u => u.id !== user.id)),
      error: (err) => console.error('Error eliminando sub-usuario:', err)
    });
  }

  openEdgeConfig() {
    this.showEdgeConfig.set(true);
    this.edgeConfigLoading.set(true);
    this.http.get<any>(`${API_URL}/admin/clients/${this.clientId()}/edge-config`).subscribe({
      next: (res) => {
        this.edgeConfig.set(res);
        this.edgeConfigLoading.set(false);
      },
      error: (err) => {
        console.error('Error cargando edge config:', err);
        this.edgeConfigLoading.set(false);
      }
    });
  }

  closeEdgeConfig() {
    this.showEdgeConfig.set(false);
    this.edgeConfig.set(null);
  }

  setEdgeTab(tab: 'env' | 'compose' | 'mediamtx') {
    this.edgeConfigTab.set(tab);
  }

  getActiveFileContent(): string {
    const cfg = this.edgeConfig();
    if (!cfg) return '';
    switch (this.edgeConfigTab()) {
      case 'env': return cfg.env || '';
      case 'compose': return cfg.dockerCompose || '';
      case 'mediamtx': return cfg.mediamtxYml || '';
    }
  }

  copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      this.copyFeedback.set('✅ Copiado');
      setTimeout(() => this.copyFeedback.set(''), 2000);
    });
  }

  downloadEdgeFile(type: 'env' | 'compose' | 'mediamtx') {
    const cfg = this.edgeConfig();
    if (!cfg) return;
    let content = '';
    let filename = '';
    const gw = cfg.gatewayId || 'edge';

    if (type === 'env') { content = cfg.env; filename = '.env'; }
    else if (type === 'compose') { content = cfg.dockerCompose; filename = `${gw}_docker-compose.yml`; }
    else { content = cfg.mediamtxYml; filename = `${gw}_mediamtx.yml`; }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  }

  toggleCloudStorage(event: Event) {
    const enabled = (event.target as HTMLInputElement).checked;
    this.http.patch(`${API_URL}/clients/${this.clientId()}`, { cloudStorageEnabled: enabled }).subscribe({
      next: () => this.loadClientDetails(),
      error: (err: any) => console.error('Error toggling cloud storage:', err)
    });
  }

  parseDiscovery(metadata: string | null | undefined): any {
    try {
      const m = JSON.parse(metadata || '{}');
      return m.discovery || { status: 'pending' };
    } catch { return { status: 'pending' }; }
  }

  async reScanOnvif(clientId: number, cameraId: number) {
    const token = localStorage.getItem('motor_control_token');
    await fetch(`/api/admin/clients/${clientId}/trigger-discovery?cameraId=${cameraId}`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token }
    });

    // Optimistic update: set the badge to "discovering" immediately
    this.cameras.update(cams => cams.map(cam => {
      if (cam.id !== cameraId) return cam;
      let meta: any = {};
      try { meta = JSON.parse(cam.metadata || '{}'); } catch { /* ignore */ }
      meta.discovery = { ...(meta.discovery || {}), status: 'discovering' };
      return { ...cam, metadata: JSON.stringify(meta) };
    }));

    // Start polling for terminal state
    this.stopReScanPoll();
    let elapsed = 0;
    const TIMEOUT_MS = 60_000;
    const INTERVAL_MS = 3_000;

    this.reScanPollInterval = setInterval(async () => {
      elapsed += INTERVAL_MS;
      if (elapsed > TIMEOUT_MS) {
        this.stopReScanPoll();
        return;
      }
      try {
        const res = await fetch(
          `/api/monitoring/wizard/discovery-status?clientId=${clientId}&cameraId=${cameraId}`,
          { headers: { 'Authorization': 'Bearer ' + token } }
        );
        if (!res.ok) return;
        const data = await res.json();
        const status: string = data?.status ?? 'pending';
        // Update local badge with latest polled status
        this.cameras.update(cams => cams.map(cam => {
          if (cam.id !== cameraId) return cam;
          let meta: any = {};
          try { meta = JSON.parse(cam.metadata || '{}'); } catch { /* ignore */ }
          meta.discovery = { ...(meta.discovery || {}), ...data };
          return { ...cam, metadata: JSON.stringify(meta) };
        }));
        if (['discovered', 'onvif_failed', 'manual'].includes(status)) {
          this.stopReScanPoll();
          await this.loadClientDetails(); // final reload to get full data
        }
      } catch { /* ignore network errors, keep polling */ }
    }, INTERVAL_MS);
  }

  stopReScanPoll() {
    if (this.reScanPollInterval) {
      clearInterval(this.reScanPollInterval);
      this.reScanPollInterval = null;
    }
  }

  ngOnDestroy() {
    this.stopReScanPoll();
  }
}
