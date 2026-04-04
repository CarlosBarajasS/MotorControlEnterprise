import { Component, OnInit, AfterViewInit, OnDestroy, inject, HostListener } from '@angular/core';
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
export class LandingComponent implements OnInit, AfterViewInit, OnDestroy {
  isLightMode = document.body.classList.contains('theme-light');
  showScrollTop = false;
  isMobileMenuOpen = false;

  // ─── Hero camera loop ─────────────────────────────────────────────────────
  heroPhase: 'single' | 'grid' = 'single';
  activeCam = 1;
  currentTime = '';

  private heroInterval: ReturnType<typeof setTimeout> | null = null;
  private clockInterval: ReturnType<typeof setInterval> | null = null;
  private revealObserver: IntersectionObserver | null = null;

  private readonly CAM_DURATION = 4000;
  private readonly GRID_DURATION = 5000;
  private readonly SINGLE_CAMS = [1, 2, 3];
  private singleIdx = 0;

  private runHeroLoop(): void {
    if (this.singleIdx < this.SINGLE_CAMS.length) {
      this.heroPhase = 'single';
      this.activeCam = this.SINGLE_CAMS[this.singleIdx];
      this.singleIdx++;
      this.heroInterval = setTimeout(() => this.runHeroLoop(), this.CAM_DURATION);
    } else {
      this.heroPhase = 'grid';
      this.singleIdx = 0;
      this.heroInterval = setTimeout(() => this.runHeroLoop(), this.GRID_DURATION);
    }
  }

  private startClock(): void {
    const update = () => {
      const now = new Date();
      this.currentTime = now.toLocaleTimeString('es-MX', { hour12: false });
    };
    update();
    this.clockInterval = setInterval(update, 1000);
  }
  // ─────────────────────────────────────────────────────────────────────────

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
    document.body.style.overflow = this.isMobileMenuOpen ? 'hidden' : '';
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.isMobileMenuOpen) {
      this.isMobileMenuOpen = false;
      document.body.style.overflow = '';
    }
  }

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
    this.runHeroLoop();
    this.startClock();
  }

  ngAfterViewInit() {
    this.revealObserver = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          this.revealObserver?.unobserve(e.target);
        }
      }),
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal').forEach(el => this.revealObserver!.observe(el));
  }

  ngOnDestroy() {
    if (this.heroInterval) clearTimeout(this.heroInterval);
    if (this.clockInterval) clearInterval(this.clockInterval);
    if (this.revealObserver) this.revealObserver.disconnect();
  }

  checkHealth() {
    this.http.get<{ status: string }>('/health').subscribe({
      next: (res) => {
        this.serverStatus = res?.status === 'healthy' ? 'online' : 'offline';
      },
      error: () => {
        this.serverStatus = 'offline';
      }
    });
  }
}
