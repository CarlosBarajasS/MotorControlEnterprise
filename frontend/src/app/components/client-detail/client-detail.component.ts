import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

const API_URL = '/api';

@Component({
  selector: 'app-client-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './client-detail.component.html',
  styleUrls: ['./client-detail.component.scss']
})
export class ClientDetailComponent implements OnInit {
  route = inject(ActivatedRoute);
  router = inject(Router);
  http = inject(HttpClient);

  clientId = signal<string>('');
  clientData = signal<any>(null);
  cameras = signal<any[]>([]);
  loading = signal<boolean>(true);

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
      },
      error: (err) => {
        console.error('Error cargando detalles del cliente/gateway:', err);
        this.loading.set(false);
      }
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
}
