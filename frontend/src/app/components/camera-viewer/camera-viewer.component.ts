import { Component, Input, OnDestroy, AfterViewInit, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-camera-viewer',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './camera-viewer.component.html',
    styleUrl: './camera-viewer.component.scss'
})
export class CameraViewerComponent implements AfterViewInit, OnDestroy {
    @Input() streamUrl!: string;
    @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

    isLoading = true;
    hasError = false;

    // NOTE: Para MediaMTX WebRTC completo, aquí instanciarías RTCPeerConnection.
    // Como esto es un port del layout anterior de HTML puro, usamos un iframe embebido
    // hacia el puerto 8889 de MediaMTX (que trae su propio reproductor WebRTC integrado por defecto)
    // o se conectaría un iframe genérico. Para este componente daremos una UI polish robusta.

    ngAfterViewInit() {
        this.initStream();
    }

    private initStream() {
        // Si la URL es directa de WebRTC de mediamtx, carga más rápido.
        // Simulamos carga para la UI
        setTimeout(() => {
            this.isLoading = false;
        }, 1500);
    }

    retry() {
        this.isLoading = true;
        this.hasError = false;
        this.initStream();
    }

    ngOnDestroy() {
        // Limpieza de WebRTC / HLS si se instancia una librería.
    }
}
