import { Component, ElementRef, OnInit, ViewChild, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

const API_URL = '/api';

@Component({
    selector: 'app-recordings',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './recordings.component.html',
    styleUrls: ['./recordings.component.scss']
})
export class RecordingsComponent implements OnInit {
    @ViewChild('videoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;

    route = inject(ActivatedRoute);
    http = inject(HttpClient);

    cameraId = signal<string>('');

    // Nube
    availableDates = signal<string[]>([]);
    cloudRecordings = signal<any[]>([]);

    // Local (SD Edge)
    localRecordings = signal<any[]>([]);

    selectedDate = signal<string>('');
    currentVideoSource = signal<string | null>(null);

    ngOnInit() {
        this.cameraId.set(this.route.snapshot.paramMap.get('id') || '');
        if (this.cameraId()) {
            this.loadAvailableDates();
        }
    }

    loadAvailableDates() {
        this.http.get<string[]>(`${API_URL}/recordings/cloud/${this.cameraId()}/dates`).subscribe({
            next: (dates) => {
                this.availableDates.set(dates || []);
                if (dates && dates.length > 0) {
                    this.selectDate(dates[0]);
                } else {
                    // Intenta cargar la fecha de hoy si no hay listado pre-cacheado
                    this.selectDate(new Date().toISOString().split('T')[0]);
                }
            },
            error: () => {
                // Fallback a hoy si el endpoint no responde
                this.selectDate(new Date().toISOString().split('T')[0]);
            }
        });
    }

    selectDate(date: string) {
        this.selectedDate.set(date);
        this.loadCloudRecordings(date);
        this.loadLocalRecordings(date);
        this.currentVideoSource.set(null); // Reset player
    }

    loadCloudRecordings(date: string) {
        this.http.get<any[]>(`${API_URL}/recordings/cloud/${this.cameraId()}?date=${date}`).subscribe({
            next: (files) => this.cloudRecordings.set(files || []),
            error: () => this.cloudRecordings.set([])
        });
    }

    loadLocalRecordings(date: string) {
        this.http.get<any[]>(`${API_URL}/recordings/local/${this.cameraId()}?date=${date}`).subscribe({
            next: (files) => this.localRecordings.set(files || []),
            error: () => this.localRecordings.set([])
        });
    }

    playCloudVideo(filePath: string) {
        // Para la nube, es un HTTP byte-range stream servido en NodeJS / C# WebAPI
        const src = `${API_URL}/recordings/cloud/video?path=${encodeURIComponent(filePath)}`;
        this.currentVideoSource.set(src);
        this.initVideoSrc(src);
    }

    playLocalVideo(filename: string) {
        // Pide al edge que inicie transmisión HLS de ese archivo
        this.http.post<any>(`${API_URL}/recordings/local/${this.cameraId()}/play`, { filename }).subscribe({
            next: (res) => {
                if (res.hlsPath) {
                    this.currentVideoSource.set(res.hlsPath);
                    // Nota: Al ser HLS, en una app real requeriríamos hls.js aquí de nuevo 
                    // si la extensión no es soportada nativa. Asumimos HLS soportado/proxy para este MVP o pasarlo al iframe.
                    this.initVideoSrc(res.hlsPath);
                } else {
                    alert("Endpoint Edge no regresó una ruta HLS válida");
                }
            },
            error: (err) => alert('Error al solicitar video Edge local: ' + (err.error?.message || err.message))
        });
    }

    private initVideoSrc(src: string) {
        setTimeout(() => {
            if (this.videoPlayer && this.videoPlayer.nativeElement) {
                const video = this.videoPlayer.nativeElement;
                video.src = src;
                video.load();
                video.play().catch(e => console.warn("Autoplay block", e));
            }
        }, 100);
    }
}
