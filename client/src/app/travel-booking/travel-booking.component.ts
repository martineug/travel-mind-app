import { ChangeDetectorRef, Component, ElementRef, OnDestroy, OnInit, Signal, ViewChild, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ChatHistoryComponent } from './chat-history/chat-history.component';
import { ChatPanelComponent } from './chat-panel/chat-panel.component';
import { ItineraryPanelComponent } from './itinerary-panel/itinerary-panel.component';
import { TripWizardComponent } from './trip-wizard/trip-wizard.component';
import { TravelBookingService } from './travel-booking.service';
import { UserTrip } from './models/trip';

const MIN_PANEL_WIDTH = 180;
const MAX_PANEL_WIDTH = 480;

type ResizablePanel = 'history' | 'itinerary';

// Hero images shown behind the trip wizard popup — defaults to a single static image; flip
// ENABLE_HERO_ROTATION to cycle. First image (/wizard-hero.jpg) is the project owner's own
// photo — no attribution needed, per HERO_CREDITS; flag if that assumption turns out wrong.
const HERO_IMAGES: string[] = [
  '/wizard-hero.jpg',
  'https://picsum.photos/seed/travel-hero-2/1600/900',
  'https://picsum.photos/seed/travel-hero-3/1600/900',
  'https://picsum.photos/seed/travel-hero-4/1600/900',
  'https://picsum.photos/seed/travel-hero-5/1600/900',
];
// CC BY-SA (and similar) licenses legally require a visible credit — null entries don't need one.
const HERO_CREDITS: ({ text: string; url: string } | null)[] = [
  null,
  null,
  null,
  null,
  null,
];
const ENABLE_HERO_ROTATION = false;
const HERO_ROTATION_INTERVAL_MS = 7000;

@Component({
  selector: 'app-travel-booking',
  standalone: true,
  imports: [ChatHistoryComponent, ChatPanelComponent, ItineraryPanelComponent, TripWizardComponent],
  templateUrl: './travel-booking.component.html',
  styleUrls: ['./travel-booking.component.scss'],
})
export class TravelBookingComponent implements OnInit, OnDestroy {
  historyWidth = 260;
  itineraryWidth = 300;

  readonly trips = signal<UserTrip[]>([]);
  readonly currentTripId: Signal<string | null | undefined>;
  readonly showNewTripPopup = signal(false);
  readonly wizardTripId = signal<string | null>(null);
  readonly wizardTripName = signal('');
  readonly currentHeroImage = signal(HERO_IMAGES[0]);
  readonly currentHeroCredit = signal(HERO_CREDITS[0]);

  private heroRotationTimer?: ReturnType<typeof setInterval>;
  private heroImageIndex = 0;

  readonly menuTrip = signal<UserTrip | null>(null);
  readonly menuPosition = signal<{ x: number; y: number } | null>(null);

  readonly showRenamePopup = signal(false);
  readonly renameTripId = signal<string | null>(null);
  readonly renameTripName = signal('');
  readonly renamingTrip = signal(false);

  readonly showDeleteConfirm = signal(false);
  readonly deleteTripId = signal<string | null>(null);
  readonly deleteTripName = signal('');
  readonly deletingTrip = signal(false);

  @ViewChild('renameTripInput') private renameTripInput?: ElementRef<HTMLInputElement>;

  private resizing: ResizablePanel | null = null;
  private startX = 0;
  private startWidth = 0;

  constructor(
    private readonly service: TravelBookingService,
    private readonly cdr: ChangeDetectorRef,
  ) {
    this.currentTripId = toSignal(this.service.currentTripId$);
  }

  ngOnInit(): void {
    this.service.getTrips().subscribe(trips => {
      this.trips.set(trips);
      this.maybeAutoLaunchWizard(trips);
    });
  }

  ngOnDestroy(): void {
    this.stopHeroRotation();
  }

  /** First-time users (and anyone who just deleted their last trip) land on an auto-created,
   *  still-default-named trip — walk them straight into the wizard instead of showing it untouched. */
  private maybeAutoLaunchWizard(trips: UserTrip[]): void {
    if (trips.length === 1 && trips[0].tripName === 'My First Trip') {
      this.wizardTripId.set(trips[0].id);
      this.wizardTripName.set(trips[0].tripName);
      this.showWizard();
    }
  }

  private showWizard(): void {
    this.showNewTripPopup.set(true);
    this.startHeroRotation();
  }

  private hideWizard(): void {
    this.showNewTripPopup.set(false);
    this.stopHeroRotation();
  }

  private startHeroRotation(): void {
    if (!ENABLE_HERO_ROTATION || HERO_IMAGES.length <= 1 || this.heroRotationTimer) return;

    this.heroRotationTimer = setInterval(() => {
      this.heroImageIndex = (this.heroImageIndex + 1) % HERO_IMAGES.length;
      this.currentHeroImage.set(HERO_IMAGES[this.heroImageIndex]!);
      this.currentHeroCredit.set(HERO_CREDITS[this.heroImageIndex] ?? null);
      this.cdr.detectChanges();
    }, HERO_ROTATION_INTERVAL_MS);
  }

  private stopHeroRotation(): void {
    if (this.heroRotationTimer) {
      clearInterval(this.heroRotationTimer);
      this.heroRotationTimer = undefined;
    }
    this.heroImageIndex = 0;
    this.currentHeroImage.set(HERO_IMAGES[0]!);
    this.currentHeroCredit.set(HERO_CREDITS[0] ?? null);
  }

  switchTrip(tripId: string): void {
    this.service.switchTrip(tripId).subscribe({
      next: () => this.service.notifyChatUpdated(),
    });
  }

  openNewTripPopup(): void {
    this.service.createTrip('New Trip').subscribe({
      next: (trip) => {
        this.trips.update(t => [...t, trip]);
        this.wizardTripId.set(trip.id);
        this.wizardTripName.set(trip.tripName);
        this.switchTrip(trip.id);
        this.showWizard();
      },
    });
  }

  closeNewTripPopup(): void {
    this.hideWizard();
  }

  onWizardRenamed(): void {
    this.hideWizard();
    this.service.getTrips().subscribe(trips => this.trips.set(trips));
  }

  openTripMenu(event: MouseEvent, trip: UserTrip): void {
    event.preventDefault();
    this.menuTrip.set(trip);
    this.menuPosition.set({ x: event.clientX, y: event.clientY });
  }

  closeTripMenu(): void {
    this.menuTrip.set(null);
    this.menuPosition.set(null);
  }

  openRenamePopup(trip: UserTrip): void {
    this.closeTripMenu();
    this.renameTripId.set(trip.id);
    this.renameTripName.set(trip.tripName);
    this.showRenamePopup.set(true);
    setTimeout(() => this.renameTripInput?.nativeElement.focus());
  }

  closeRenamePopup(): void {
    this.showRenamePopup.set(false);
  }

  confirmRename(): void {
    const name = this.renameTripName().trim();
    const tripId = this.renameTripId();
    if (!name || !tripId || this.renamingTrip()) return;

    this.renamingTrip.set(true);
    this.service.renameTrip(tripId, name).subscribe({
      next: () => {
        this.renamingTrip.set(false);
        this.showRenamePopup.set(false);
        this.service.getTrips().subscribe(trips => this.trips.set(trips));
      },
      error: () => this.renamingTrip.set(false),
    });
  }

  openDeleteConfirm(trip: UserTrip): void {
    this.closeTripMenu();
    this.deleteTripId.set(trip.id);
    this.deleteTripName.set(trip.tripName);
    this.showDeleteConfirm.set(true);
  }

  closeDeleteConfirm(): void {
    this.showDeleteConfirm.set(false);
  }

  confirmDelete(): void {
    const tripId = this.deleteTripId();
    if (!tripId || this.deletingTrip()) return;

    this.deletingTrip.set(true);
    this.service.deleteTrip(tripId).subscribe({
      next: ({ recreatedTrip }) => {
        this.deletingTrip.set(false);
        this.showDeleteConfirm.set(false);
        this.service.getTrips().subscribe(trips => this.trips.set(trips));

        // recreatedTrip is only set when that was the user's last trip — the one case the wizard
        // should auto-launch for. Not routed through maybeAutoLaunchWizard: its name-based
        // heuristic would also fire when deleting down to an untouched-default-named leftover.
        if (recreatedTrip) {
          this.wizardTripId.set(recreatedTrip.id);
          this.wizardTripName.set(recreatedTrip.tripName);
          this.showWizard();
          this.switchTrip(recreatedTrip.id);
        } else {
          this.service.notifyChatUpdated();
        }
      },
      error: () => this.deletingTrip.set(false),
    });
  }

  startResize(event: MouseEvent, panel: ResizablePanel): void {
    event.preventDefault();
    this.resizing = panel;
    this.startX = event.clientX;
    this.startWidth = panel === 'history' ? this.historyWidth : this.itineraryWidth;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (e: MouseEvent) => this.onResize(e);
    const onMouseUp = () => {
      this.resizing = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }

  private onResize(event: MouseEvent): void {
    if (!this.resizing) return;

    const delta = event.clientX - this.startX;
    const rawWidth = this.resizing === 'history' ? this.startWidth + delta : this.startWidth - delta;
    const width = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, rawWidth));

    if (this.resizing === 'history') {
      this.historyWidth = width;
    } else {
      this.itineraryWidth = width;
    }

    this.cdr.detectChanges();
  }
}
