import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
})
export class LandingComponent {
  mockStats = [
    { val: '12', lbl: 'Gateways', color: '#137fec' },
    { val: '48', lbl: 'Cámaras', color: '#10b981' },
    { val: '99%', lbl: 'Uptime', color: '#8b5cf6' },
  ];
}
