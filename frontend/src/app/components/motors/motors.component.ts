import { Component, OnInit, signal, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MotorControlComponent } from '../motor-control/motor-control.component';

const API_URL = '/api';

@Component({
    selector: 'app-motors',
    standalone: true,
    imports: [CommonModule, FormsModule, MotorControlComponent],
    templateUrl: './motors.component.html',
    styleUrls: ['./motors.component.scss']
})
export class MotorsComponent implements OnInit {
    http = inject(HttpClient);

    motors = signal<any[]>([]);
    mqttStatus = signal<any>(null);

    selectedMotor = signal<any>(null);

    // Variables para modos especiales
    arranqueValues = signal<number[]>([0, 0, 0, 0, 0, 0]);

    ngOnInit() {
        this.loadData();
        // Poll mqtt status every 15s
        setInterval(() => this.loadMqttStatus(), 15000);
    }

    loadData() {
        this.http.get<any[]>(`${API_URL}/admin/motors`).subscribe({
            next: (res) => this.motors.set(res || []),
            error: (err) => console.error('Error cargando motores', err)
        });
        this.loadMqttStatus();
    }

    loadMqttStatus() {
        this.http.get<any>(`${API_URL}/admin/motors/mqtt/info`).subscribe({
            next: (res) => this.mqttStatus.set(res),
            error: () => this.mqttStatus.set(null)
        });
    }

    openMotorControl(motor: any) {
        this.selectedMotor.set(motor);
        // Reset defaults
        this.arranqueValues.set([0, 0, 0, 0, 0, 0]);
    }

    closeMotorControl() {
        this.selectedMotor.set(null);
    }

    // Comandos extendidos (los normales están en MotorControlComponent)
    sendArranque6P() {
        const id = this.selectedMotor()?.id;
        if (!id) return;
        this.http.post(`${API_URL}/admin/motors/${id}/arranque6p`, { values: this.arranqueValues() }).subscribe({
            next: () => alert('Comando de Arranque de 6 Pasos enviado.'),
            error: (err) => alert('Error al enviar arranque 6p')
        });
    }

    sendContinuo() {
        const id = this.selectedMotor()?.id;
        if (!id) return;
        this.http.post(`${API_URL}/admin/motors/${id}/continuo`, {}).subscribe({
            next: () => alert('Comando de Avance Continuo enviado.'),
            error: (err) => alert('Error al enviar Continuo')
        });
    }

    sendParo() {
        const id = this.selectedMotor()?.id;
        if (!id) return;
        this.http.post(`${API_URL}/admin/motors/${id}/paro`, {}).subscribe({
            next: () => alert('Comando de Paro Normal enviado.'),
            error: (err) => alert('Error al enviar Paro')
        });
    }
}
