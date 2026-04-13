import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ClientLayout } from '../models/client-layout.model';

const API_URL = '/api';

@Injectable({ providedIn: 'root' })
export class ClientLayoutService {
  private http = inject(HttpClient);

  getLayouts(): Observable<ClientLayout[]> {
    return this.http.get<ClientLayout[]>(`${API_URL}/client/layouts`);
  }

  createLayout(name: string, config: string, isDefault: boolean): Observable<ClientLayout> {
    return this.http.post<ClientLayout>(`${API_URL}/client/layouts`, { name, config, isDefault });
  }

  updateLayout(id: number, patch: { name?: string; config?: string; isDefault?: boolean }): Observable<ClientLayout> {
    return this.http.put<ClientLayout>(`${API_URL}/client/layouts/${id}`, patch);
  }

  deleteLayout(id: number): Observable<void> {
    return this.http.delete<void>(`${API_URL}/client/layouts/${id}`);
  }

  setRestricted(cameraId: number, restricted: boolean): Observable<{ id: number; isClientRestricted: boolean }> {
    return this.http.patch<{ id: number; isClientRestricted: boolean }>(
      `${API_URL}/client/cameras/${cameraId}/restricted`,
      { restricted }
    );
  }

  getPrivateCameras(): Observable<any[]> {
    return this.http.get<any[]>(`${API_URL}/client/private`);
  }
}
