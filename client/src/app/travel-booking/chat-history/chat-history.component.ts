import { Component, OnInit, OnDestroy, ChangeDetectorRef, ElementRef, HostListener, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { Subscription } from 'rxjs';
import { TravelBookingService } from '../travel-booking.service';
import { AgentType } from '../models/agent-type';
import { ChatPreview } from '../models/chat';
import { AgentIconComponent } from '../agent-icon/agent-icon.component';

interface AgentOption {
  type: AgentType;
  label: string;
}

@Component({
  selector: 'app-chat-history',
  standalone: true,
  imports: [CommonModule, DragDropModule, AgentIconComponent],
  templateUrl: './chat-history.component.html',
  styleUrls: ['./chat-history.component.scss'],
})
export class ChatHistoryComponent implements OnInit, OnDestroy {
  chats: ChatPreview[] = [];
  activeChatId: string | null = null;
  loading = true;
  showAgentPicker = false;

  showDeleteConfirm = false;
  deleteChatId: string | null = null;
  deleteChatPreview = '';
  deletingChat = false;

  pendingChatIds: ReadonlySet<string> = new Set();
  failedChatIds: ReadonlySet<string> = new Set();

  readonly agentOptions: AgentOption[] = [
    { type: 'flights', label: 'Flights' },
    { type: 'stays', label: 'Stays' },
    { type: 'cars', label: 'Cars' },
  ];

  @ViewChild('newChatWrap') private newChatWrap?: ElementRef<HTMLElement>;

  private updateSub?: Subscription;
  private pendingSub?: Subscription;
  private failedSub?: Subscription;
  private currentChatSub?: Subscription;

  constructor(private svc: TravelBookingService, private cdr: ChangeDetectorRef) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (this.showAgentPicker && !this.newChatWrap?.nativeElement.contains(event.target as Node)) {
      this.cancelAgentPicker();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.showAgentPicker) {
      this.cancelAgentPicker();
    }
  }

  ngOnInit(): void {
    // Subscribe before the initial fetch (BehaviorSubject emits synchronously) so activeChatId
    // is always driven from the same source of truth chat-panel.component.ts trusts.
    this.currentChatSub = this.svc.currentChatId$.subscribe((chatId) => {
      // currentChatId$ is seeded with null; ignore that initial emission so it doesn't stomp
      // activeChatId before refreshChats(true)'s response arrives.
      if (chatId) this.activeChatId = chatId;
      this.cdr.detectChanges();
    });
    this.refreshChats(true);

    this.updateSub = this.svc.chatUpdated$.subscribe(() => this.refreshChats(false));
    this.pendingSub = this.svc.pendingChatIds$.subscribe((ids) => {
      this.pendingChatIds = ids;
      this.cdr.detectChanges();
    });
    this.failedSub = this.svc.failedChatIds$.subscribe((ids) => {
      this.failedChatIds = ids;
      this.cdr.detectChanges();
    });
  }

  ngOnDestroy(): void {
    this.updateSub?.unsubscribe();
    this.pendingSub?.unsubscribe();
    this.failedSub?.unsubscribe();
    this.currentChatSub?.unsubscribe();
  }

  // syncCurrent is only true on the initial load: it resumes the server's last-known
  // chat/trip. 
  private refreshChats(syncCurrent: boolean): void {
    this.svc.getChatbotState().subscribe({
      next: (state) => {
        // Server returns chats in persisted display order (sort_order).
        this.chats = state.chats;
        if (syncCurrent) {
          this.svc.setCurrentChatId(state.currentChatId);
          this.svc.setCurrentTripId(state.currentTripId);
        }
        this.loading = false;
        this.cdr.detectChanges();
      },
      error: () => {
        this.loading = false;
        this.cdr.detectChanges();
      },
    });
  }

  selectChat(chatId: string): void {
    if (chatId === this.activeChatId) return;
    this.svc.setCurrentChatId(chatId);
    this.cdr.detectChanges();
  }

  retryChat(event: MouseEvent, chatId: string): void {
    event.stopPropagation();
    this.svc.retryChat(chatId);
  }

  openAgentPicker(): void {
    this.showAgentPicker = true;
  }

  cancelAgentPicker(): void {
    this.showAgentPicker = false;
  }

  chooseAgent(agentType: AgentType): void {
    this.showAgentPicker = false;

    this.svc.newChat(agentType).subscribe({
      next: (res) => {
        this.chats = [{ id: res.currentChatId, preview: '(new chat)', agentType }, ...this.chats];
        this.svc.setCurrentChatId(res.currentChatId);
        this.cdr.detectChanges();
      },
    });
  }

  trackById(_index: number, chat: ChatPreview): string {
    return chat.id;
  }

  onDrop(event: CdkDragDrop<ChatPreview[]>): void {
    if (event.previousIndex === event.currentIndex) return;

    moveItemInArray(this.chats, event.previousIndex, event.currentIndex);
    this.cdr.detectChanges();

    this.svc.reorderChats(this.chats.map(c => c.id)).subscribe({
      error: () => this.refreshChats(false),
    });
  }

  openDeleteConfirm(event: MouseEvent, chat: ChatPreview): void {
    event.stopPropagation();
    this.deleteChatId = chat.id;
    this.deleteChatPreview = chat.preview;
    this.showDeleteConfirm = true;
  }

  closeDeleteConfirm(): void {
    this.showDeleteConfirm = false;
  }

  confirmDeleteChat(): void {
    const chatId = this.deleteChatId;
    if (!chatId || this.deletingChat) return;

    this.deletingChat = true;
    this.svc.deleteChat(chatId).subscribe({
      next: () => {
        this.deletingChat = false;
        this.showDeleteConfirm = false;
        this.cdr.detectChanges();
        this.svc.notifyChatUpdated();
      },
      error: () => {
        this.deletingChat = false;
        this.cdr.detectChanges();
      },
    });
  }
}
