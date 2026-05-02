import { Component, Input, OnDestroy, AfterViewInit, ElementRef, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';


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
    @Input() streamPath!: string;
    /** Retraso antes de iniciar la conexión — escalonar múltiples viewers evita tormenta de ICE */
    @Input() connectDelay = 0;
    @ViewChild('videoEl') videoEl!: ElementRef<HTMLVideoElement>;

    state: 'connecting' | 'playing' | 'error' = 'connecting';

    private pc: RTCPeerConnection | null = null;
    private sessionUrl: string | null = null;
    private reconnectTimer: any = null;
    private reconnectAttempts = 0;
    private startTimer: any = null;

    constructor(private zone: NgZone) {}

    ngAfterViewInit() {
        if (this.connectDelay > 0) {
            this.startTimer = setTimeout(() => this.connect(), this.connectDelay);
        } else {
            this.connect();
        }
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
                    this.reconnectAttempts = 0;
                    // requestVideoFrameCallback fires on first rendered frame (Chrome 83+).
                    // onplaying is the reliable fallback — fires when MediaStream starts flowing.
                    const markPlaying = () => this.zone.run(() => { this.state = 'playing'; });
                    const vid: any = video;
                    if (typeof vid.requestVideoFrameCallback === 'function') {
                        vid.requestVideoFrameCallback(markPlaying);
                    } else {
                        vid.onplaying = () => { markPlaying(); vid.onplaying = null; };
                    }
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

            // Esperar ICE gathering con timeout de 3s — evita bloqueo indefinido
            // si el servidor STUN no responde. Con NAT 1:1 en el servidor el
            // host candidate es suficiente para establecer la conexión.
            await new Promise<void>((resolve) => {
                if (this.pc!.iceGatheringState === 'complete') { resolve(); return; }
                const timeout = setTimeout(resolve, 3000);
                const handler = () => {
                    if (this.pc?.iceGatheringState === 'complete') {
                        clearTimeout(timeout);
                        this.pc.removeEventListener('icegatheringstatechange', handler);
                        resolve();
                    }
                };
                this.pc!.addEventListener('icegatheringstatechange', handler);
            });

            // WHEP va por nginx (mismo origen, puerto 8080)
            // nginx agrega las credenciales de MediaMTX internamente — nunca expuestas al browser
            const whepUrl = `/${this.streamPath}/whep`;
            const res = await fetch(whepUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/sdp' },
                body: this.pc!.localDescription!.sdp
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
        this.reconnectAttempts++;
        const delay = Math.min(2000 * Math.min(this.reconnectAttempts, 8), 15000);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    private cleanup() {
        if (this.startTimer) { clearTimeout(this.startTimer); this.startTimer = null; }
        if (this.reconnectTimer) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
        if (this.sessionUrl) {
            fetch(this.sessionUrl, { method: 'DELETE', keepalive: true }).catch(() => {});
            this.sessionUrl = null;
        }
        if (this.pc) { this.pc.close(); this.pc = null; }
        const video = this.videoEl?.nativeElement;
        if (video) { video.srcObject = null; }
    }

    ngOnDestroy() { this.cleanup(); }
}
