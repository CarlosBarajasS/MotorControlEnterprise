import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

const API_URL = '/api';

export interface AuditEntry {
  id: number;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  createdAt: string;
  user: { id: number; name: string; email: string; role: string };
}

export interface AuditPageResult {
  items: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable({ providedIn: 'root' })
export class AuditLogService {
  private http = inject(HttpClient);

  getAll(filters: {
    userId?: number;
    action?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Observable<AuditPageResult> {
    let params = new HttpParams();
    if (filters.userId)   params = params.set('userId',   filters.userId);
    if (filters.action)   params = params.set('action',   filters.action);
    if (filters.from)     params = params.set('from',     filters.from);
    if (filters.to)       params = params.set('to',       filters.to);
    if (filters.page)     params = params.set('page',     filters.page);
    if (filters.pageSize) params = params.set('pageSize', filters.pageSize);
    return this.http.get<AuditPageResult>(`${API_URL}/admin/audit-log`, { params });
  }
}
