import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { WebrtcViewerComponent } from '../camera-viewer/webrtc-viewer.component';

const API_URL = '/api';

@Component({
  selector: 'app-camera-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, WebrtcViewerComponent],
  templateUrl: './camera-detail.component.html',
  styleUrls: ['./camera-detail.component.scss']
})
export class CameraDetailComponent implements OnInit, OnDestroy {
  route = inject(ActivatedRoute);
  http = inject(HttpClient);

  cameraId: string = '';
  camera = signal<any>(null);
  camStatus = signal<{ isOnline: boolean, lastSeen?: string }>({ isOnline: false });
  presets = signal<any[]>([]);
  streamPath = signal('');

  private statusInterval: any;

  ngOnInit() {
    this.cameraId = this.route.snapshot.paramMap.get('id') || '';
    if (this.cameraId) {
      this.loadCameraData();
      this.statusInterval = setInterval(() => this.checkStatus(), 10000);
      // Load presets
      this.http.get<any[]>(`${API_URL}/cameras/${this.cameraId}/ptz/presets`).subscribe({
        next: (p) => this.presets.set(p || []),
        error: () => { } // PTZ presets may not exist for all cameras
      });
    }
  }

  ngOnDestroy() {
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
  }

  loadCameraData() {
    this.http.get<any>(`${API_URL}/cameras/${this.cameraId}`).subscribe({
      next: (cam) => {
        this.camera.set(cam);
        this.checkStatus();
        if (cam.gatewayId) {
          const cameraKey = cam.cameraId ?? cam.cameraKey ?? cam.name;
          this.streamPath.set(`${cam.gatewayId}/${cameraKey}`);
        }
      },
      error: (err) => console.error(err)
    });
  }

  checkStatus() {
    this.http.get<any>(`${API_URL}/cameras/${this.cameraId}/status`).subscribe({
      next: (status) => this.camStatus.set(status),
      error: () => this.camStatus.set({ isOnline: false })
    });
  }

  // PTZ Control
  ptzMove(pan: number, tilt: number, zoom: number) {
    this.http.post(`${API_URL}/cameras/${this.cameraId}/ptz/move`, { pan, tilt, zoom }).subscribe();
  }

  ptzStop() {
    this.http.post(`${API_URL}/cameras/${this.cameraId}/ptz/stop`, {}).subscribe();
  }

  gotoPreset(presetId: string) {
    this.http.post(`${API_URL}/cameras/${this.cameraId}/ptz/presets/${presetId}/goto`, {}).subscribe();
  }
}
