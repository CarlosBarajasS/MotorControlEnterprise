import { Component, Input, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

const WHEP_BASE = 'http://177.247.175.4:8891';

/**
 * WebRTC viewer via WHEP (WebRTC-HTTP Egress Protocol).
 * Uses native RTCPeerConnection — zero npm dependencies.
 * Latency: 300-800ms vs 3-5s of HLS.
 *
 * streamPath: el nombre del path en MediaMTX, ej. "edge-gateway-casa-carlos/cuarto"
 */
@Component({
    selector: 'app-webrtc-viewer',
    standalone: true,
    imports: [CommonModule],
    template: `
        <div class="webrtc-wrap">
            <video #videoEl autoplay muted playsinline></video>
            <div class="webrtc-overlay loading" *ngIf="state === 'connecting'">
                <span class="spinner"></span>
            </div>
            <div class="webrtc-overlay error" *ngIf="state === 'error'">
                <span>Sin señal</span>
                <button (click)="connect()">Reintentar</button>
            </div>
        </div>
    `,
    styles: [`
        .webrtc-wrap { position: relative; width: 100%; height: 100%; background: #000; }
        video { width: 100%; height: 100%; object-fit: cover; display: block; }
        .webrtc-overlay {
            position: absolute; inset: 0;
            display: flex; flex-direction: column;
            align-items: center; justify-content: center;
            gap: 10px; font-size: 13px; color: #fff;
        }
        .webrtc-overlay.loading { background: rgba(0,0,0,0.5); }
        .webrtc-overlay.error   { background: rgba(0,0,0,0.6); }
        .spinner {
            width: 24px; height: 24px; border: 2px solid rgba(255,255,255,0.3);
            border-top-color: #fff; border-radius: 50%;
            animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        button {
            background: rgba(255,255,255,0.15); border: 1px solid rgba(255,255,255,0.4);
            color: #fff; border-radius: 6px; padding: 4px 14px;
            font-size: 12px; cursor: pointer;
        }
    `]
})
export class WebrtcViewerComponent implements AfterViewInit, OnDestroy {
    @Input() streamPath!: string;   // ej: "edge-gateway-casa-carlos/cuarto"
    @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;

    state: 'connecting' | 'playing' | 'error' = 'connecting';

    private pc: RTCPeerConnection | null = null;
    private sessionUrl: string | null = null;
    private reconnectTimer: any = null;
    private reconnectAttempts = 0;

    ngAfterViewInit() {
        this.connect();
    }

    async connect() {
        this.cleanup();
        this.state = 'connecting';

        try {
            this.pc = new RTCPeerConnection({
                iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
            });

            this.pc.addTransceiver('video', { direction: 'recvonly' });
            this.pc.addTransceiver('audio', { direction: 'recvonly' });

            this.pc.ontrack = (ev) => {
                if (ev.track.kind === 'video') {
                    const video = this.videoEl.nativeElement;
                    if (!video.srcObject) {
                        video.srcObject = new MediaStream();
                    }
                    (video.srcObject as MediaStream).addTrack(ev.track);
                    video.play().catch(() => {});
                    this.state = 'playing';
                    this.reconnectAttempts = 0;
                }
            };

            this.pc.onconnectionstatechange = () => {
                const s = this.pc?.connectionState;
                if (s === 'failed' || s === 'disconnected') {
                    this.scheduleReconnect();
                }
            };

            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);

            const whepUrl = `${WHEP_BASE}/${this.streamPath}/whep`;
            const res = await fetch(whepUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/sdp' },
                body: this.pc.localDescription!.sdp
            });

            if (!res.ok) throw new Error(`WHEP ${res.status}`);

            this.sessionUrl = res.headers.get('location');
            const answerSdp = await res.text();
            await this.pc.setRemoteDescription({ type: 'answer', sdp: answerSdp });

        } catch (err) {
            console.error('[WebRTC] Connection failed:', err);
            this.state = 'error';
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect() {
        if (this.reconnectTimer) return;
        if (this.reconnectAttempts >= 6) return;
        this.reconnectAttempts++;
        const delay = Math.min(2000 * this.reconnectAttempts, 15000);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private cleanup() {
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        if (this.sessionUrl) {
            fetch(this.sessionUrl, { method: 'DELETE' }).catch(() => {});
            this.sessionUrl = null;
        }
        if (this.pc) { this.pc.close(); this.pc = null; }
        const video = this.videoEl?.nativeElement;
        if (video) { video.srcObject = null; }
    }

    ngOnDestroy() { this.cleanup(); }
}
