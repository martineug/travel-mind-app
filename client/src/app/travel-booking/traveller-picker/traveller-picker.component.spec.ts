import { TravellerPickerComponent } from './traveller-picker.component';
import { Traveller } from '../models/traveller';

const SELF: Traveller = {
  given_name: 'Ada', family_name: 'Lovelace', email: 'ada@example.com',
  phone_number: '+353861234567', born_on: '1990-01-01', gender: 'f', title: 'ms',
};

function createComponent(min: number, max: number): TravellerPickerComponent {
  const component = new TravellerPickerComponent();
  component.min = min;
  component.max = max;
  component.self = SELF;
  return component;
}

describe('TravellerPickerComponent', () => {
  it('pre-ticks the account holder on init', () => {
    const component = createComponent(1, 4);
    component.ngOnInit();
    expect(component.isSelected('self')).toBe(true);
    expect(component.selectedCount).toBe(1);
  });

  describe('toggle', () => {
    it('behaves like a radio button when max === 1', () => {
      const component = createComponent(1, 1);
      component.ngOnInit();
      component.toggle('other');
      expect(component.isSelected('self')).toBe(false);
      expect(component.isSelected('other')).toBe(true);
      expect(component.selectedCount).toBe(1);
    });

    it('adds and removes within bounds when max > 1', () => {
      const component = createComponent(1, 2);
      component.ngOnInit();
      component.toggle('other');
      expect(component.isSelected('other')).toBe(true);
      expect(component.selectedCount).toBe(2);

      component.toggle('other');
      expect(component.isSelected('other')).toBe(false);
      expect(component.selectedCount).toBe(1);
    });

    it('ignores a tick past max rather than dropping someone already chosen', () => {
      const component = createComponent(1, 2);
      component.ngOnInit(); // pre-ticks 'self', leaving room for exactly one more
      component.toggle('a');
      expect(component.selectedCount).toBe(2);

      component.toggle('b');
      expect(component.selectedCount).toBe(2);
      expect(component.isSelected('b')).toBe(false);
      expect(component.isSelected('self')).toBe(true);
      expect(component.isSelected('a')).toBe(true);
    });
  });

  describe('isOptionDisabled', () => {
    it('is never disabled in single-person mode', () => {
      const component = createComponent(1, 1);
      component.ngOnInit();
      expect(component.isOptionDisabled('other')).toBe(false);
    });

    it('is only disabled for unselected options once the multi-person selection is full', () => {
      const component = createComponent(1, 2);
      component.ngOnInit();
      component.toggle('a');
      expect(component.selectedCount).toBe(2);

      expect(component.isOptionDisabled('b')).toBe(true);
      expect(component.isOptionDisabled('self')).toBe(false);
      expect(component.isOptionDisabled('a')).toBe(false);
    });
  });

  describe('countLabel', () => {
    it('reads "N of M selected" when min === max', () => {
      const component = createComponent(2, 2);
      component.ngOnInit();
      expect(component.countLabel).toBe('1 of 2 selected');
    });

    it('reads "N selected (min–max)" when min !== max', () => {
      const component = createComponent(1, 3);
      component.ngOnInit();
      expect(component.countLabel).toBe('1 selected (1–3)');
    });
  });

  describe('confirmAddNew', () => {
    it('does nothing when the new traveller is incomplete', () => {
      const component = createComponent(1, 4);
      component.ngOnInit();
      component.newTraveller = { ...SELF, email: '' };
      component.confirmAddNew();
      expect(component.selectedCount).toBe(1);
    });

    it('adds and selects a complete new traveller', () => {
      const component = createComponent(1, 4);
      component.ngOnInit();
      component.newTraveller = {
        given_name: 'Grace', family_name: 'Hopper', email: 'grace@example.com',
        phone_number: '+353861112222', born_on: '1985-05-05', gender: 'f', title: 'ms',
      };
      component.confirmAddNew();

      expect(component.selectedCount).toBe(2);
      const added = component.options.find(o => o.label === 'Grace Hopper');
      expect(added).toBeTruthy();
      expect(component.isSelected(added!.key)).toBe(true);
    });
  });
});
