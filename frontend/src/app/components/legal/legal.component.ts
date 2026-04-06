import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';

type LegalTab = 'privacy' | 'terms';

@Component({
  selector: 'app-legal',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './legal.component.html',
  styleUrls: ['./legal.component.scss'],
})
export class LegalComponent implements OnInit {
  activeTab: LegalTab = 'privacy';

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.route.queryParams.subscribe(params => {
      if (params['tab'] === 'terms') {
        this.activeTab = 'terms';
      }
    });
  }

  setTab(tab: LegalTab): void {
    this.activeTab = tab;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
