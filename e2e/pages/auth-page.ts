import { Page, expect } from '@playwright/test';

export interface SignUpDetails {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  bornOn: string;
  gender: 'Male' | 'Female';
  title: 'Mr' | 'Ms' | 'Mrs' | 'Miss';
}

export class AuthPage {
  constructor(private readonly page: Page) {}

  async goto(): Promise<void> {
    await this.page.goto('/auth');
  }

  async signUp(details: SignUpDetails): Promise<void> {
    await this.page.getByRole('button', { name: 'Sign Up' }).click();

    await this.page.getByLabel('First name').fill(details.firstName);
    await this.page.getByLabel('Last name').fill(details.lastName);
    await this.page.getByLabel('Title').selectOption({ label: details.title });
    await this.page.getByLabel('Gender').selectOption({ label: details.gender });
    await this.page.getByLabel('Date of birth').fill(details.bornOn);
    await this.page.getByLabel('Phone number').fill(details.phoneNumber);
    await this.page.getByLabel('Email').fill(details.email);
    await this.page.getByLabel('Password').fill(details.password);

    await this.page.getByRole('button', { name: 'Create account' }).click();
    await expect(this.page).toHaveURL('/');
  }

  async signIn(email: string, password: string): Promise<void> {
    await this.page.getByLabel('Email').fill(email);
    await this.page.getByLabel('Password').fill(password);
    // exact:true to disambiguate from the "Sign In" tab button — Playwright's default
    // name matching is case-insensitive, so "Sign in" alone matches both.
    await this.page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }

  async expectError(text: string | RegExp): Promise<void> {
    await expect(this.page.locator('.error')).toHaveText(text);
  }
}

export function randomTraveller(prefix: string): SignUpDetails {
  const unique = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  return {
    email: `${unique}@example.com`,
    password: 'correct-horse-battery-staple',
    firstName: 'Ada',
    lastName: 'Lovelace',
    phoneNumber: '+353861234567',
    bornOn: '1990-01-01',
    gender: 'Female',
    title: 'Ms',
  };
}
