import { Component, ElementRef, HostListener, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-top-banner',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './top-banner.component.html',
  styleUrls: ['./top-banner.component.scss'],
})
export class TopBannerComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly elRef = inject(ElementRef);

  readonly currentUser = this.auth.currentUser;
  readonly menuOpen = signal(false);

  readonly initials = computed(() => {
    const user = this.currentUser();
    if (!user) return '';
    return `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase();
  });

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elRef.nativeElement.contains(event.target)) {
      this.menuOpen.set(false);
    }
  }

  signOut(): void {
    this.auth.signOut().subscribe(() => {
      this.menuOpen.set(false);
      this.router.navigateByUrl('/auth');
    });
  }
}
