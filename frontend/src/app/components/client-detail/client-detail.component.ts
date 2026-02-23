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

  ngOnInit() {
    this.clientId.set(this.route.snapshot.paramMap.get('id') || '');
    if (this.clientId()) {
      this.loadClientDetails();
    }
  }

  loadClientDetails() {
    this.loading.set(true);
    // GET /api/clients/{id} -> { client: {...}, cameras: [{id,name,status,lastSeen,cameraId}] }
    this.http.get<any>(`${API_URL}/clients/${this.clientId()}`).subscribe({
      next: (res) => {
        // Soporte para variaciones de payload del backend en lo que la API es construida formalmente
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
}
