import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
    selector: 'app-telemetry-dashboard',
    standalone: true,
    imports: [CommonModule],
    templateUrl: './telemetry-dashboard.component.html',
    styleUrl: './telemetry-dashboard.component.scss'
})
export class TelemetryDashboardComponent implements OnInit, OnDestroy {
    public deviceId: string = "edge-gateway-bodega-1";
    public motorState: string = "RUNNING";

    ngOnInit() { }
    ngOnDestroy() { }
}
