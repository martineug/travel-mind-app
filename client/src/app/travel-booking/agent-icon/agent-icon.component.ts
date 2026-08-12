import { Component, Input } from '@angular/core';
import { AgentType } from '../models/agent-type';

@Component({
  selector: 'app-agent-icon',
  standalone: true,
  templateUrl: './agent-icon.component.html',
  styleUrls: ['./agent-icon.component.scss'],
})
export class AgentIconComponent {
  @Input({ required: true }) type!: AgentType;
}
