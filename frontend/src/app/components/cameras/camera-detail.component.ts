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
  private initPlayerTimer: any = null;
  private mediaErrorRecoveryAttempted = false;
  private safariRetryTimer: any = null;
  private safariRetryCount = 0;
  private readonly SAFARI_MAX_RETRIES = 5;

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
    if (this.initPlayerTimer) {
      clearTimeout(this.initPlayerTimer);
      this.initPlayerTimer = null;
    }
    if (this.safariRetryTimer) {
      clearTimeout(this.safariRetryTimer);
      this.safariRetryTimer = null;
    }
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
        this.initPlayerTimer = setTimeout(() => this.initPlayer(), 0);
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

    // iOS Safari: forzar native HLS — evita problemas de MSE con init segment fMP4
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (Hls.isSupported() && !isIOS) {
      this.hls = new Hls({
        liveDurationInfinity: true,
        maxLiveSyncPlaybackRate: 1.0,
        maxMaxBufferLength: 60,
        backBufferLength: 0,
        liveSyncDurationCount: 3,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 500,
        levelLoadingMaxRetry: 6,
        levelLoadingRetryDelay: 500,
        manifestLoadingMaxRetry: 4,
        manifestLoadingRetryDelay: 1000,
        xhrSetup: (xhr: XMLHttpRequest) => {
          const token = localStorage.getItem('motor_control_token');
          if (token) {
            xhr.setRequestHeader('Authorization', `Bearer ${token}`);
          }
        }
      });
      this.hls.loadSource(streamUrl);
      this.hls.attachMedia(video);
      this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(e => console.log('Auto-play prevent:', e));
      });
      this.hls.on(Hls.Events.ERROR, (_, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this.mediaErrorRecoveryAttempted) {
          this.mediaErrorRecoveryAttempted = true;
          this.hls!.recoverMediaError();
          return;
        }
        console.warn('HLS fatal error — stream detenido:', data);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Safari native HLS — token via query param (Authorization headers not supported)
      const safariToken = localStorage.getItem('motor_control_token') ?? '';
      video.src = safariToken ? `${streamUrl}?token=${encodeURIComponent(safariToken)}` : streamUrl;
      video.addEventListener('loadedmetadata', () => {
        video.play().catch(e => console.log('Auto-play prevent:', e));
      });
      video.addEventListener('error', () => {
        if (this.safariRetryCount >= this.SAFARI_MAX_RETRIES) return;
        this.safariRetryCount++;
        this.safariRetryTimer = setTimeout(() => {
          video.src = '';
          this.initPlayer();
        }, 5000);
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
