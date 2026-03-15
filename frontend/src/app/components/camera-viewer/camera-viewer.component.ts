import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

/** @deprecated Use WebrtcViewerComponent instead. Kept for compile-time compatibility. */
@Component({
    selector: 'app-camera-viewer',
    standalone: true,
    imports: [CommonModule],
    template: ''
})
export class CameraViewerComponent {
    @Input() streamUrl = '';
    @Input() hideOverlay = false;
}
