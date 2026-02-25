import { Component, OnInit, inject, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.scss'],
})
export class LandingComponent implements OnInit {
  isLightMode = document.body.classList.contains('theme-light');
  showScrollTop = false;

  @HostListener('window:scroll', [])
  onWindowScroll() {
    this.showScrollTop = window.scrollY > 300;
  }

  scrollToTop() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  toggleTheme() {
    this.isLightMode = !this.isLightMode;
    if (this.isLightMode) {
      document.body.classList.add('theme-light');
      localStorage.setItem('theme', 'light');
    } else {
      document.body.classList.remove('theme-light');
      localStorage.setItem('theme', 'dark');
    }
  }
  private http = inject(HttpClient);

  mockStats = [
    { val: '12', lbl: 'Gateways', color: '#137fec' },
    { val: '48', lbl: 'Cámaras', color: '#10b981' },
    { val: '99%', lbl: 'Uptime', color: '#8b5cf6' },
  ];

  serverStatus: 'online' | 'offline' | 'checking' = 'checking';

  ngOnInit() {
    this.checkHealth();
  }

  checkHealth() {
    this.http.get<{ status: string }>('/health').subscribe({
      next: (res) => {
        this.serverStatus = res?.status === 'Healthy' ? 'online' : 'offline';
      },
      error: () => {
        this.serverStatus = 'offline';
      }
    });
  }
}
