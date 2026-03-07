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
    @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;

    isLoading = true;
    hasError = false;
    private hls: Hls | null = null;
    private mediaErrorRecoveryAttempted = false;
    private reconnectAttempts = 0;
    private readonly MAX_RECONNECT_ATTEMPTS = 5;
    private reconnectTimer: any = null;
    private safariLoadedHandler: (() => void) | null = null;
    private safariErrorHandler: (() => void) | null = null;

    ngAfterViewInit() {
        this.initStream();
    }

    private initStream() {
        const video = this.videoEl.nativeElement;

        if (Hls.isSupported()) {
            this.hls = new Hls({
                liveDurationInfinity: true,
                maxLiveSyncPlaybackRate: 1.5,
                maxMaxBufferLength: 30,
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
            this.safariLoadedHandler = () => {
                this.isLoading = false;
                video.play().catch(() => { });
            };
            this.safariErrorHandler = () => {
                this.isLoading = false;
                this.hasError = true;
                this.scheduleReconnect();
            };
            video.addEventListener('loadedmetadata', this.safariLoadedHandler);
            video.addEventListener('error', this.safariErrorHandler);
            video.src = this.streamUrl;
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
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.hasError) {
                this.retry();
            }
        }, 5000);
    }

    ngOnDestroy() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }
        const videoEl = this.videoEl?.nativeElement;
        if (videoEl) {
            if (this.safariLoadedHandler) {
                videoEl.removeEventListener('loadedmetadata', this.safariLoadedHandler);
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
