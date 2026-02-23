import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';

const API_URL = '/api';

interface DeviceLive {
    deviceId: string;
    speed: number;
    current: number;
    voltage: number;
    state: string;
    timestamp: string;
    online: boolean; // Computed field for UI
}

@Component({
    selector: 'app-telemetry-dashboard',
    standalone: true,
    imports: [CommonModule, NgChartsModule],
    templateUrl: './telemetry-dashboard.component.html',
    styleUrls: ['./telemetry-dashboard.component.scss']
})
export class TelemetryDashboardComponent implements OnInit, OnDestroy {
    devices = signal<DeviceLive[]>([]);
    stats = signal<any>(null);
    private pollingInterval: any;
    private _chartLabels: string[] = [];
    private _chartValues: number[] = [];

    // Chart Properties
    public lineChartData: ChartConfiguration['data'] = {
        datasets: [
            {
                data: [],
                label: 'RPM Promedio',
                backgroundColor: 'rgba(59, 130, 246, 0.2)',
                borderColor: '#3b82f6',
                pointBackgroundColor: '#1d4ed8',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgba(59, 130, 246, 0.8)',
                fill: 'origin',
                tension: 0.4
            }
        ],
        labels: []
    };

    public lineChartOptions: ChartConfiguration['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        elements: {
            line: { tension: 0.4 }
        },
        scales: {
            y: { position: 'left', beginAtZero: true },
            x: { display: true }
        },
        plugins: {
            legend: { display: true, position: 'top' }
        }
    };

    public lineChartType: ChartType = 'line';

    constructor(private http: HttpClient) { }

    ngOnInit() {
        this.fetchData();
        this.pollingInterval = setInterval(() => this.fetchData(), 5000); // Polling every 5s
    }

    ngOnDestroy() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }
    }

    fetchData() {
        // 1. Fetch Stats
        this.http.get<any>(`${API_URL}/admin/telemetry/stats`).subscribe({
            next: (res) => this.stats.set(res.stats || res), // Fallback according to response shape
            error: (err) => console.error('Error fetching stats:', err)
        });

        // 2. Fetch Live Telemetry Devices
        this.http.get<DeviceLive[]>(`${API_URL}/admin/telemetry/live`).subscribe({
            next: (res) => {
                const liveDevices = Array.isArray(res) ? res : ((res as any).devices || []); // Handle different payload shapes safely

                // Add computed field `online` based on recent timestamp (e.g. within 60s)
                const now = new Date().getTime();
                const devices = liveDevices.map((d: any) => {
                    const dTime = new Date(d.timestamp).getTime();
                    return { ...d, online: (now - dTime) < 60000 };
                });

                this.devices.set(devices);
                this.updateChart(devices);
            },
            error: (err) => console.error('Error fetching live telemetry:', err)
        });
    }

    updateChart(devices: DeviceLive[]) {
        const timeLabel = new Date().toLocaleTimeString();
        let avgSpeed = 0;

        if (devices.length > 0) {
            avgSpeed = devices.reduce((sum, d) => sum + (d.speed || 0), 0) / devices.length;
        }

        // Use private arrays as source of truth — do not read back from Chart.js state
        this._chartLabels.push(timeLabel);
        this._chartValues.push(avgSpeed);

        // Keep last 20 points
        if (this._chartLabels.length > 20) {
            this._chartLabels.shift();
            this._chartValues.shift();
        }

        this.lineChartData = {
            ...this.lineChartData,
            labels: [...this._chartLabels],
            datasets: [
                { ...this.lineChartData.datasets[0], data: [...this._chartValues] }
            ]
        };
    }
}
