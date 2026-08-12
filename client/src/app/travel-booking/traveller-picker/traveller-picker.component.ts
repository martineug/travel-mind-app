import { Component, EventEmitter, Input, OnInit, Output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Traveller, TravellerProfile } from '../models/traveller';

interface TravellerOption {
  key: string;
  label: string;
  sublabel: string;
  isSelf: boolean;
  traveller: Traveller;
}

const EMPTY_NEW_TRAVELLER = (): Traveller => ({
  given_name: '', family_name: '', email: '', phone_number: '', born_on: '', gender: 'm', title: 'mr',
});

/** Person picker for a booking — same list/profiles, different copy/count per use (flight
 *  travellers, car driver). Plain component, not WizardQuestionsComponent, since that can't
 *  reveal-on-tick for "Add someone new". Details are entered at most once, saved on submit. */
@Component({
  selector: 'app-traveller-picker',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './traveller-picker.component.html',
  styleUrls: ['./traveller-picker.component.scss'],
})
export class TravellerPickerComponent implements OnInit {
  /** Selection bounds: flights need exactly the offer's adult count, a car exactly one driver, a stay a lead guest plus optional extras up to the searched adults. */
  @Input({ required: true }) min!: number;
  @Input({ required: true }) max!: number;
  @Input({ required: true }) self!: Traveller;
  @Input() saved: TravellerProfile[] = [];
  @Input() error: string | null = null;
  @Input() busy = false;
  /** Copy, so the same picker reads naturally for passengers and for a car's driver. */
  @Input() heading = "Who's travelling?";
  @Input() addLabel = '+ Add someone new';
  @Input() newTitle = 'New passenger';
  @Input() confirmLabel = 'Continue to payment';

  @Output() submitTravellers = new EventEmitter<Traveller[]>();
  @Output() cancel = new EventEmitter<void>();

  readonly selectedKeys = signal<Set<string>>(new Set());
  readonly addingNew = signal(false);
  newTraveller: Traveller = EMPTY_NEW_TRAVELLER();

  private extras: TravellerOption[] = [];

  ngOnInit(): void {
    // Pre-tick the account holder — the common single-passenger case becomes one click.
    this.selectedKeys.set(new Set(['self']));
  }

  get options(): TravellerOption[] {
    const savedOptions: TravellerOption[] = this.saved.map(p => ({
      key: p.id,
      label: `${p.givenName} ${p.familyName}`,
      sublabel: p.email,
      isSelf: false,
      traveller: {
        given_name: p.givenName, family_name: p.familyName, email: p.email,
        phone_number: p.phoneNumber, born_on: p.bornOn, gender: p.gender as Traveller['gender'],
        title: p.title as Traveller['title'],
      },
    }));

    return [
      { key: 'self', label: `${this.self.given_name} ${this.self.family_name}`, sublabel: this.self.email, isSelf: true, traveller: this.self },
      ...savedOptions,
      ...this.extras,
    ];
  }

  isSelected(key: string): boolean {
    return this.selectedKeys().has(key);
  }

  /** Single-person pickers (a car's driver) behave like radio buttons. With room for several,
   *  ticks beyond the required count are ignored rather than dropping someone already chosen. */
  toggle(key: string): void {
    if (this.max === 1) {
      this.selectedKeys.set(new Set([key]));
      return;
    }

    this.selectedKeys.update(keys => {
      const next = new Set(keys);
      if (next.has(key)) next.delete(key);
      else if (next.size < this.max) next.add(key);
      return next;
    });
  }

  get selectedCount(): number {
    return this.selectedKeys().size;
  }

  get canSubmit(): boolean {
    return !this.busy && this.selectedCount >= this.min && this.selectedCount <= this.max;
  }

  get isFull(): boolean {
    return this.selectedCount >= this.max;
  }

  /** "1 of 2 selected" reads as unmet when extras are optional — an open-ended range says what's actually needed. */
  get countLabel(): string {
    if (this.min === this.max) return `${this.selectedCount} of ${this.max} selected`;
    return `${this.selectedCount} selected (${this.min}–${this.max})`;
  }

  /** Always available in single-person mode (newcomer replaces the pick) — multi-person needs room made first. */
  get canAddNew(): boolean {
    return this.max === 1 || !this.isFull;
  }

  /** Whether clicking this option would genuinely do nothing, so it's greyed out.
   *  Only true when multiple people are needed and the selection is full — single-person mode stays live. */
  isOptionDisabled(key: string): boolean {
    return this.max > 1 && !this.isSelected(key) && this.isFull;
  }

  get newTravellerComplete(): boolean {
    const p = this.newTraveller;
    return !!(p.given_name && p.family_name && p.email && p.phone_number && p.born_on && p.gender && p.title);
  }

  startAddNew(): void {
    this.newTraveller = EMPTY_NEW_TRAVELLER();
    this.addingNew.set(true);
  }

  cancelAddNew(): void {
    this.addingNew.set(false);
  }

  /** Adds the typed traveller and ticks them — only held client-side until the server persists them with the booking. */
  confirmAddNew(): void {
    if (!this.newTravellerComplete) return;

    const traveller = { ...this.newTraveller };
    const key = `new:${traveller.given_name}:${traveller.family_name}:${traveller.born_on}`;
    this.extras = [
      ...this.extras.filter(e => e.key !== key),
      { key, label: `${traveller.given_name} ${traveller.family_name}`, sublabel: traveller.email, isSelf: false, traveller },
    ];

    if (this.max === 1) {
      this.selectedKeys.set(new Set([key]));
    } else {
      this.selectedKeys.update(keys => {
        const next = new Set(keys);
        if (next.size < this.max) next.add(key);
        return next;
      });
    }

    this.addingNew.set(false);
  }

  submit(): void {
    if (!this.canSubmit) return;
    const byKey = new Map(this.options.map(o => [o.key, o.traveller]));
    const chosen = [...this.selectedKeys()].map(k => byKey.get(k)).filter((p): p is Traveller => !!p);
    this.submitTravellers.emit(chosen);
  }
}
