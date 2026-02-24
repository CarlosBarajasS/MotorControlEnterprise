import { Component, ElementRef, OnInit, ViewChild, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

const API_URL = '/api';

@Component({
    selector: 'app-recordings',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, DecimalPipe, DatePipe],
    templateUrl: './recordings.component.html',
    styleUrls: ['./recordings.component.scss']
})
export class RecordingsComponent implements OnInit {
    @ViewChild('videoPlayer') videoPlayer!: ElementRef<HTMLVideoElement>;

    route = inject(ActivatedRoute);
    http = inject(HttpClient);

    cameraId = signal<string>('');
    cameraName = computed(() => `Cámara #${this.cameraId()}`);

    // Cloud recordings
    availableDates = signal<string[]>([]);
    cloudRecordings = signal<any[]>([]);
    selectedDate = signal<string>('');
    currentVideoSource = signal<string | null>(null);
    loadingRecordings = signal<boolean>(false);

    // Filters
    searchRec = signal('');
    filterType = signal<'all' | 'cloud'>('all');

    // Computed
    filteredRecordings = computed(() => {
        let recs = this.cloudRecordings();
        const q = this.searchRec().toLowerCase();
        if (q) recs = recs.filter(r => (r.filename || r.name || '').toLowerCase().includes(q));
        return recs;
    });

    totalSizeMb = computed(() =>
        this.cloudRecordings().reduce((sum, r) => sum + (r.sizeMb || 0), 0)
    );

    // Progress bar % of total (cap at 100)
    cloudPct = computed(() => {
        const total = this.totalSizeMb();
        return total > 0 ? Math.min((total / 1000) * 100, 100) : 0;
    });

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
                const today = new Date().toISOString().split('T')[0];
                this.selectDate(dates.length > 0 ? dates[0] : today);
            },
            error: () => {
                this.selectDate(new Date().toISOString().split('T')[0]);
            }
        });
    }

    selectDate(date: string) {
        this.selectedDate.set(date);
        this.currentVideoSource.set(null);
        this.loadCloudRecordings(date);
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
        setTimeout(() => {
            if (this.videoPlayer?.nativeElement) {
                const video = this.videoPlayer.nativeElement;
                video.src = src;
                video.load();
                video.play().catch(e => console.warn('Autoplay block', e));
            }
        }, 100);
    }

    getDownloadUrl(filePath: string): string {
        const token = localStorage.getItem('motor_control_token') || '';
        return `${API_URL}/recordings/cloud/video?path=${encodeURIComponent(filePath)}&token=${encodeURIComponent(token)}`;
    }
}
