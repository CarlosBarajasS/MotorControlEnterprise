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

    ngAfterViewInit() {
        this.initStream();
    }

    private initStream() {
        const video = this.videoEl.nativeElement;

        if (Hls.isSupported()) {
            this.hls = new Hls({ maxLiveSyncPlaybackRate: 1.5 });
            this.hls.loadSource(this.streamUrl);
            this.hls.attachMedia(video);
            this.hls.on(Hls.Events.MANIFEST_PARSED, () => {
                this.isLoading = false;
                video.play().catch(() => {});
            });
            this.hls.on(Hls.Events.ERROR, (_, data) => {
                if (data.fatal) {
                    this.isLoading = false;
                    this.hasError = true;
                }
            });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = this.streamUrl;
            video.addEventListener('loadedmetadata', () => {
                this.isLoading = false;
                video.play().catch(() => {});
            });
            video.addEventListener('error', () => {
                this.isLoading = false;
                this.hasError = true;
            });
        } else {
            this.isLoading = false;
            this.hasError = true;
        }
    }

    retry() {
        this.isLoading = true;
        this.hasError = false;
        if (this.hls) {
            this.hls.destroy();
            this.hls = null;
        }
        this.initStream();
    }

    ngOnDestroy() {
        if (this.hls) {
            this.hls.destroy();
        }
    }
}
