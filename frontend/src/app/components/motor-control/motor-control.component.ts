import { Component, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

const API_URL = '/api';

@Component({
    selector: 'app-motor-control',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './motor-control.component.html',
    styleUrls: ['./motor-control.component.scss']
})
export class MotorControlComponent implements OnInit {
    @Input() deviceId: string = 'device-01'; // Default or passed from parent

    speed = signal<number>(1500);
    isSending = signal<boolean>(false);
    lastCommandResult = signal<{ success: boolean, message: string } | null>(null);

    constructor(private http: HttpClient) { }

    ngOnInit() { }

    sendCommand(command: 'start' | 'stop' | 'set_speed' | 'emergency_stop') {
        if (this.isSending()) return;

        this.isSending.set(true);
        this.lastCommandResult.set(null);

        const payload = {
            command,
            speed: command === 'set_speed' || command === 'start' ? this.speed() : 0
        };

        this.http.post(`${API_URL}/admin/motors/${this.deviceId}/command`, payload)
            .subscribe({
                next: (res: any) => {
                    this.isSending.set(false);
                    this.lastCommandResult.set({ success: true, message: `Comando '${command}' enviado exitosamente.` });
                    setTimeout(() => this.lastCommandResult.set(null), 3000);
                },
                error: (err) => {
                    this.isSending.set(false);
                    this.lastCommandResult.set({ success: false, message: `Error al enviar comando: ${err.message || 'Servidor no disponible'}` });
                }
            });
    }
}
