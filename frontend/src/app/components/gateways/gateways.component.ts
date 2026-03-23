import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { GatewayModalComponent } from './gateway-modal.component';

const API_URL = '/api';

@Component({
  selector: 'app-gateways',
  standalone: true,
  imports: [CommonModule, FormsModule, GatewayModalComponent],
  templateUrl: './gateways.component.html',
  styleUrls: ['./gateways.component.scss']
})
export class GatewaysComponent implements OnInit {
  http = inject(HttpClient);

  gateways = signal<any[]>([]);
  searchTerm = signal('');
  filterStatus = signal<'all' | 'active' | 'inactive'>('all');
  showModal = signal(false);

  filtered = computed(() => {
    const term = this.searchTerm().toLowerCase();
    const status = this.filterStatus();
    return this.gateways().filter(gw => {
      const matchSearch = !term ||
        gw.name?.toLowerCase().includes(term) ||
        gw.clientName?.toLowerCase().includes(term) ||
        gw.location?.toLowerCase().includes(term) ||
        gw.gatewayId?.toLowerCase().includes(term);
      const matchStatus = status === 'all' || gw.status === status;
      return matchSearch && matchStatus;
    });
  });

  stats = computed(() => {
    const total = this.gateways().length;
    const active = this.gateways().filter(g => g.status === 'active').length;
    return { total, active };
  });

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.http.get<any[]>(`${API_URL}/gateways`).subscribe({
      next: (data) => {
        this.gateways.set(data.map(g => ({
          id: g.id,
          gatewayId: g.gatewayId,
          name: g.name,
          clientName: g.clientName,
          location: g.location || 'Sin ubicación',
          status: g.status,
          cameras: g.cameraCount ?? 0,
          lastHeartbeatAt: g.lastHeartbeatAt,
          // CPU y RAM siguen siendo mock hasta que haya telemetría real
          cpu: Math.floor(Math.random() * 40) + 10,
          ram: Math.floor(Math.random() * 60) + 20,
          uptime: '99.9%'
        })));
      },
      error: () => {}
    });
  }

  onGatewaySaved() {
    this.showModal.set(false);
    this.loadData();
  }
}
