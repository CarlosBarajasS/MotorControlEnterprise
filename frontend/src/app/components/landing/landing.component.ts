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

  // ─── Hero alternating view ────────────────────────────────────────────────
  heroView: 'video' | 'mockup' = 'video';

  private heroTimeout: ReturnType<typeof setTimeout> | null = null;

  // video stays 21s (20s video + 1s crossfade); mockup stays 9s (8s visible + 1s crossfade)
  private readonly HERO_DURATIONS = { video: 21000, mockup: 9000 } as const;

  private scheduleHeroToggle(): void {
    const duration = this.HERO_DURATIONS[this.heroView];
    this.heroTimeout = setTimeout(() => {
      this.heroView = this.heroView === 'video' ? 'mockup' : 'video';
      this.scheduleHeroToggle();
    }, duration);
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
    this.scheduleHeroToggle();
  }

  ngAfterViewInit() {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('is-visible');
          observer.unobserve(e.target);
        }
      }),
      { threshold: 0.12 }
    );
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }

  ngOnDestroy() {
    if (this.heroTimeout) clearTimeout(this.heroTimeout);
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
