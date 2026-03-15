import { Component, Input, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import Hls from 'hls.js';

@Component({
    selector: 'app-camera-viewer',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './camera-viewer.component.html',
    styleUrl: './camera-viewer.component.scss'
})
export class CameraViewerComponent implements AfterViewInit, OnDestroy {
    @Input() streamUrl!: string;
    @Input() hideOverlay = false;
    @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;

    isLoading = true;
    hasError = false;
    private hls: Hls | null = null;
    private mediaErrorRecoveryAttempted = false;
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 8;
    private reconnectTimer: any = null;
    private safariLoadedHandler: (() => void) | null = null;
    private safariErrorHandler: (() => void) | null = null;

    ngAfterViewInit() {
        this.initStream();
    }

    private initStream() {
        const video = this.videoEl.nativeElement;

        // iOS Safari: forzar native HLS — HLS.js + MSE en iOS no maneja
        // correctamente el init segment fMP4 (#EXT-X-MAP) en todas las versiones
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
            || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (Hls.isSupported() && !isIOS) {
            this.hls = new Hls({
                liveDurationInfinity: true,
                // Low-latency live: stay 1 segment behind live edge
                startPosition: -1,             // jump to live edge on start
                liveSyncDurationCount: 1,      // target 1 segment behind live (was 3)
                liveMaxLatencyDurationCount: 3,// seek forward if >3 segments behind
                maxLiveSyncPlaybackRate: 1.5,  // speed up to catch live (was 1.1)
                maxBufferLength: 4,            // keep only 4s forward buffer
                maxMaxBufferLength: 8,         // hard cap 8s (was 60!)
                backBufferLength: 0,
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
            this.hls.loadSource(this.streamUrl);
            this.hls.attachMedia(video);
            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this.isLoading = false;
                video.play().catch(() => { });
            });
            this.hls.on(Hls.Events.ERROR, (_, data) => {
                if (!data.fatal) return;

                if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !this.mediaErrorRecoveryAttempted) {
                    this.mediaErrorRecoveryAttempted = true;
                    this.hls!.recoverMediaError();
                    return;
                }

                this.isLoading = false;
                this.hasError = true;
                this.scheduleReconnect();
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            // iOS hold-back: start 30s behind live edge so Safari always has
            // multiple buffered segments ahead and never stalls at boundaries.
            // MediaMTX keeps hlsSegmentCount:10 × 4s = 40s of history, so 30s
            // behind is safely within the available range.
            const IOS_HOLD_BACK_SEC = 30;
            this.safariLoadedHandler = () => {
                if (!this.isLoading) return; // guard: loadedmetadata + canplay both fire
                this.isLoading = false;
                const seekAndPlay = () => video.play().catch(() => { });
                if (video.seekable && video.seekable.length > 0) {
                    const liveEdge = video.seekable.end(video.seekable.length - 1);
                    const target = liveEdge - IOS_HOLD_BACK_SEC;
                    if (target > 0) {
                        video.currentTime = target;
                        video.addEventListener('seeked', seekAndPlay, { once: true });
                        return;
                    }
                }
                video.play().catch(() => { });
            };
            this.safariErrorHandler = () => {
                this.isLoading = false;
                this.hasError = true;
                this.scheduleReconnect();
            };
            video.addEventListener('loadedmetadata', this.safariLoadedHandler);
            video.addEventListener('canplay', this.safariLoadedHandler);
            video.addEventListener('error', this.safariErrorHandler);
            const safariToken = localStorage.getItem('motor_control_token') ?? '';
            video.src = safariToken ? `${this.streamUrl}?token=${encodeURIComponent(safariToken)}` : this.streamUrl;
            video.load();
        } else {
            this.isLoading = false;
            this.hasError = true;
        }
    }

    retry() {
        this.isLoading = true;
        this.hasError = false;
        this.mediaErrorRecoveryAttempted = false;
        this.reconnectAttempts = 0;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        // Limpiar video element (path Safari)
        const videoEl = this.videoEl?.nativeElement;
        if (videoEl) {
            if (this.safariLoadedHandler) {
                videoEl.removeEventListener('loadedmetadata', this.safariLoadedHandler);
                videoEl.removeEventListener('canplay', this.safariLoadedHandler);
                this.safariLoadedHandler = null;
            }
            if (this.safariErrorHandler) {
                videoEl.removeEventListener('error', this.safariErrorHandler);
                this.safariErrorHandler = null;
            }
            videoEl.src = '';
            videoEl.load();
        }
        this.initStream();
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        if (this.reconnectAttempts >= this.MAX_RECONNECT_ATTEMPTS) return;
        this.reconnectAttempts++;
        const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts - 1), 30000);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.hasError) {
                this.retry();
            }
        }, delay);
    }

    ngOnDestroy() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        const videoEl = this.videoEl?.nativeElement;
        if (videoEl) {
            if (this.safariLoadedHandler) {
                videoEl.removeEventListener('loadedmetadata', this.safariLoadedHandler);
                videoEl.removeEventListener('canplay', this.safariLoadedHandler);
            }
            if (this.safariErrorHandler) {
                videoEl.removeEventListener('error', this.safariErrorHandler);
            }
        }
        if (this.hls) {
            this.hls.destroy();
        }
    }
}
