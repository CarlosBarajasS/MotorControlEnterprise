import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { LandingComponent } from './landing.component';
import { HttpClientTestingModule } from '@angular/common/http/testing';
import { RouterTestingModule } from '@angular/router/testing';

describe('LandingComponent', () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingComponent, HttpClientTestingModule, RouterTestingModule]
    })
    .compileComponents();

    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

describe('LandingComponent — hero view toggle', () => {
  let component: LandingComponent;
  let fixture: ComponentFixture<LandingComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LandingComponent, HttpClientTestingModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(LandingComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    component.ngOnDestroy();
  });

  it('should start with heroView = video', () => {
    expect(component.heroView).toBe('video');
  });

  it('should toggle from video to mockup after 21s', fakeAsync(() => {
    component.ngOnInit();
    expect(component.heroView).toBe('video');

    tick(21000);
    expect(component.heroView).toBe('mockup');
  }));

  it('should toggle from mockup back to video after 9s more', fakeAsync(() => {
    component.ngOnInit();
    tick(21000); // video → mockup
    tick(9000);  // mockup → video
    expect(component.heroView).toBe('video');
  }));

  it('should clear timeout on ngOnDestroy — no state change after destroy', fakeAsync(() => {
    component.ngOnInit();
    component.ngOnDestroy();
    tick(30000); // advance time — no toggle should happen
    expect(component.heroView).toBe('video');
  }));
});
