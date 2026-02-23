import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { NgChartsModule } from 'ng2-charts';
import { ChartConfiguration, ChartType } from 'chart.js';

const API_URL = '/api';

@Component({
    selector: 'app-telemetry-history',
    standalone: true,
    imports: [CommonModule, FormsModule, NgChartsModule],
    templateUrl: './telemetry-history.component.html',
    styleUrls: ['./telemetry-history.component.scss']
})
export class TelemetryHistoryComponent implements OnInit {
    http = inject(HttpClient);

    devices = signal<string[]>([]);
    selectedDevice = signal<string>('all');
    timeRangeHours = signal<number>(24);
    historyData = signal<any[]>([]);

    // Chart configuration
    public lineChartType: ChartType = 'line';
    public lineChartOptions: ChartConfiguration['options'] = {
        responsive: true,
        maintainAspectRatio: false,
        elements: {
            line: { tension: 0.2 },
            point: { radius: 2 }
        },
        scales: {
            y: { position: 'left', beginAtZero: true, title: { display: true, text: 'Valores' } },
            x: { display: true, title: { display: true, text: 'Tiempo' } }
        },
        plugins: {
            legend: { display: true, position: 'top' },
            tooltip: { mode: 'index', intersect: false }
        },
        interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
        }
    };

    public lineChartData: ChartConfiguration['data'] = {
        datasets: [],
        labels: []
    };

    ngOnInit() {
        this.loadDevices();
        this.loadHistory();
    }

    loadDevices() {
        this.http.get<string[]>(`${API_URL}/admin/telemetry/devices`).subscribe({
            next: (res) => this.devices.set(res || []),
            error: (err) => console.error('Error fetching device list', err)
        });
    }

    loadHistory() {
        let url = `${API_URL}/admin/telemetry/history?hours=${this.timeRangeHours()}`;
        if (this.selectedDevice() !== 'all') {
            url += `&device=${encodeURIComponent(this.selectedDevice())}`;
        }

        this.http.get<any>(url).subscribe({
            next: (res) => {
                // Handle paginated response: { total, page, pageSize, data: [...] }
                let data: any[] = Array.isArray(res) ? res : ((res as any)?.data || []);
                if (this.selectedDevice() !== 'all') {
                    data = data.filter((d: any) => d.deviceId === this.selectedDevice());
                }
                this.historyData.set(data);
                this.buildChart(data);
            },
            error: (err) => {
                console.warn('Error fetching history:', err);
                this.historyData.set([]);
                this.buildChart([]);
            }
        });
    }

    onFilterChange() {
        this.loadHistory();
    }

    buildChart(data: any[]) {
        if (!data || data.length === 0) {
            this.lineChartData = { labels: [], datasets: [] };
            return;
        }

        // Sort by timestamp asc
        const sorted = [...data].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        const labels = sorted.map(d => new Date(d.timestamp).toLocaleString());

        // Series
        const speeds = sorted.map(d => d.speed || 0);
        const currents = sorted.map(d => d.current || 0);
        const voltages = sorted.map(d => d.voltage || 0);

        this.lineChartData = {
            labels,
            datasets: [
                {
                    data: speeds,
                    label: 'Velocidad (RPM)',
                    borderColor: '#3b82f6',
                    backgroundColor: 'transparent',
                    yAxisID: 'y'
                },
                {
                    data: currents,
                    label: 'Corriente (A)',
                    borderColor: '#ef4444',
                    backgroundColor: 'transparent',
                    borderDash: [5, 5]
                },
                {
                    data: voltages,
                    label: 'Voltaje (V)',
                    borderColor: '#10b981',
                    backgroundColor: 'transparent',
                    borderDash: [2, 2]
                }
            ]
        };
    }
}
