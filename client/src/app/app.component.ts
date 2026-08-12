import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopBannerComponent } from './top-banner/top-banner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, TopBannerComponent],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
})
export class AppComponent {}
