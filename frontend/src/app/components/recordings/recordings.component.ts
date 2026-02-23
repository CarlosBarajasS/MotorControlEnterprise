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

    // Cloud recordings
    availableDates = signal<string[]>([]);
    cloudRecordings = signal<any[]>([]);
    selectedDate = signal<string>('');
    currentVideoSource = signal<string | null>(null);
    loadingRecordings = signal<boolean>(false);

    ngOnInit() {
        this.cameraId.set(this.route.snapshot.paramMap.get('id') || '');
        if (this.cameraId()) {
            this.loadAvailableDates();
        }
    }

    loadAvailableDates() {
        this.http.get<any>(`${API_URL}/recordings/cloud/${this.cameraId()}/dates`).subscribe({
            next: (res) => {
                const dates = res?.dates || [];
                this.availableDates.set(dates);
                if (dates && dates.length > 0) {
                    this.selectDate(dates[0]);
                } else {
                    this.selectDate(new Date().toISOString().split('T')[0]);
                }
            },
            error: () => {
                this.selectDate(new Date().toISOString().split('T')[0]);
            }
        });
    }

    selectDate(date: string) {
        this.selectedDate.set(date);
        this.loadCloudRecordings(date);
        this.currentVideoSource.set(null);
    }

    loadCloudRecordings(date: string) {
        this.loadingRecordings.set(true);
        this.http.get<any>(`${API_URL}/recordings/cloud/${this.cameraId()}?date=${date}`).subscribe({
            next: (res) => {
                this.cloudRecordings.set(res?.files || []);
                this.loadingRecordings.set(false);
            },
            error: () => {
                this.cloudRecordings.set([]);
                this.loadingRecordings.set(false);
            }
        });
    }

    playCloudVideo(filePath: string) {
        const token = localStorage.getItem('motor_control_token') || '';
        const src = `${API_URL}/recordings/cloud/video?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token)}`;
        this.currentVideoSource.set(src);
        this.initVideoSrc(src);
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
