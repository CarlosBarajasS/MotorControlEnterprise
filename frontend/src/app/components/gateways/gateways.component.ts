import { Component, OnInit, signal, inject, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

const API_URL = '/api';

@Component({
  selector: 'app-gateways',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './gateways.component.html',
  styleUrls: ['./gateways.component.scss']
})
export class GatewaysComponent implements OnInit {
  http = inject(HttpClient);

  gateways = signal<any[]>([]);
  searchTerm = signal('');
  filterStatus = signal<'all' | 'active' | 'inactive'>('all');

  filtered = computed(() => {
    let list = this.gateways();
    const q = this.searchTerm().toLowerCase();
    if (q) {
      list = list.filter(g =>
        (g.id || '').toLowerCase().includes(q) ||
        (g.clientName || '').toLowerCase().includes(q)
      );
    }
    if (this.filterStatus() === 'active') list = list.filter(g => g.status === 'active');
    if (this.filterStatus() === 'inactive') list = list.filter(g => g.status !== 'active');
    return list;
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
    this.http.get<any[]>(`${API_URL}/clients`).subscribe({
      next: (clients) => {
        // En este backend los gateways se derivan de los clientes
        const gws = (clients || []).filter(c => c.gatewayId).map(c => ({
          id: c.gatewayId,
          clientName: c.name,
          location: c.city || 'Ubicación local',
          status: c.status,
          cameras: c.cameraCount ?? 0,
          cpu: Math.floor(Math.random() * 40) + 10,
          ram: Math.floor(Math.random() * 60) + 20,
          uptime: '99.9%'
        }));
        this.gateways.set(gws);
      },
      error: (err) => console.error('Error cargando gateways', err)
    });
  }
}
