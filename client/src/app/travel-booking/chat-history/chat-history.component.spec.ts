import { ChangeDetectorRef } from '@angular/core';
import { vi } from 'vitest';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { ChatHistoryComponent } from './chat-history.component';
import { TravelBookingService } from '../travel-booking.service';
import { ChatbotStateResponse } from '../models/chat';

function stateWith(currentChatId: string): ChatbotStateResponse {
  return { chats: [], currentChatId, currentTripId: 'trip-1' } as unknown as ChatbotStateResponse;
}

function createComponent() {
  const chatUpdated$ = new Subject<void>();
  const pendingChatIds$ = new Subject<ReadonlySet<string>>();
  const failedChatIds$ = new Subject<ReadonlySet<string>>();
  const currentChatId$ = new BehaviorSubject<string | null>(null);
  // A fresh, immediately-completing observable per call — like the real HTTP client — so a
  // later emission never lands on an earlier, still-open subscription.
  let nextState: ChatbotStateResponse = stateWith('chat-1');

  const svc = {
    chatUpdated$,
    pendingChatIds$,
    failedChatIds$,
    currentChatId$,
    getChatbotState: vi.fn(() => of(nextState)),
    setCurrentChatId: vi.fn(),
    setCurrentTripId: vi.fn(),
  } as unknown as TravelBookingService;

  const cdr = { detectChanges: vi.fn() } as unknown as ChangeDetectorRef;
  const component = new ChatHistoryComponent(svc, cdr);
  return {
    component,
    svc,
    chatUpdated$,
    currentChatId$,
    setNextState: (s: ChatbotStateResponse) => { nextState = s; },
  };
}

describe('ChatHistoryComponent', () => {
  it('only syncs currentChatId/currentTripId on the initial load, not on later chatUpdated$ refreshes', () => {
    const { component, svc, chatUpdated$, setNextState } = createComponent();

    component.ngOnInit();
    expect(svc.setCurrentChatId).toHaveBeenCalledTimes(1);
    expect(svc.setCurrentTripId).toHaveBeenCalledTimes(1);

    setNextState(stateWith('chat-2'));
    chatUpdated$.next();
    expect(svc.setCurrentChatId).toHaveBeenCalledTimes(1);
    expect(svc.setCurrentTripId).toHaveBeenCalledTimes(1);
  });

  it('drives activeChatId reactively from currentChatId$, ignoring the initial null seed', () => {
    const { component, currentChatId$ } = createComponent();

    component.ngOnInit();
    expect(component.activeChatId).toBeNull();

    currentChatId$.next('chat-a');
    expect(component.activeChatId).toBe('chat-a');

    currentChatId$.next('chat-b');
    expect(component.activeChatId).toBe('chat-b');
  });
});
