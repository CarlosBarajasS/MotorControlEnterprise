import { Component, ElementRef, OnDestroy, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import Hls from 'hls.js';

const API_URL = '/api';

@Component({
  selector: 'app-camera-detail',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './camera-detail.component.html',
  styleUrls: ['./camera-detail.component.scss']
})
export class CameraDetailComponent implements OnInit, OnDestroy {
  // static: false because the element is inside *ngIf="camera()" which is null on init
  @ViewChild('videoElement', { static: false }) videoElement?: ElementRef<HTMLVideoElement>;

  route = inject(ActivatedRoute);
  http = inject(HttpClient);

  cameraId: string = '';
  camera = signal<any>(null);
  camStatus = signal<{ isOnline: boolean, lastSeen?: string }>({ isOnline: false });
  presets = signal<any[]>([]);

  private hls: Hls | null = null;
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
    if (this.hls) {
      this.hls.destroy();
    }
    if (this.statusInterval) {
      clearInterval(this.statusInterval);
    }
  }

  loadCameraData() {
    this.http.get<any>(`${API_URL}/cameras/${this.cameraId}`).subscribe({
      next: (cam) => {
        this.camera.set(cam);
        this.checkStatus();
        // *ngIf="camera()" is now true — wait one tick for the DOM to render
        setTimeout(() => this.initPlayer(), 0);
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

  initPlayer() {
    if (!this.videoElement) return;
    const video = this.videoElement.nativeElement;
    const streamUrl = `${API_URL}/stream/${this.cameraId}/hls`;

    if (Hls.isSupported()) {
      this.hls = new Hls({
        maxLiveSyncPlaybackRate: 1.5,
      });
      this.hls.loadSource(streamUrl);
      this.hls.attachMedia(video);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.log('Auto-play prevent:', e));
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // For Safari HTML5 Native Support
      video.src = streamUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.log('Auto-play prevent:', e));
      });
    }
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
