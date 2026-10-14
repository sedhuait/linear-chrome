import { describe, it, expect } from 'vitest';
import { isClosedState, isOpenState, getStateIcon } from '../src/components/HistoryView';
import { LinearWorkflowState } from '../src/types/linear';

describe('HistoryView state categorization and helper functions', () => {
  it('correctly classifies closed states as closed', () => {
    const doneState: LinearWorkflowState = {
      id: 's_1',
      name: 'Done',
      color: '#38EF7D',
      type: 'completed',
    };
    const canceledState: LinearWorkflowState = {
      id: 's_2',
      name: 'Canceled',
      color: '#8B90A4',
      type: 'canceled',
    };

    expect(isClosedState(doneState)).toBe(true);
    expect(isOpenState(doneState)).toBe(false);
    expect(isClosedState(canceledState)).toBe(true);
    expect(isOpenState(canceledState)).toBe(false);

    // States named 'Resolved' or custom completed states like CR-208
    const resolvedState: LinearWorkflowState = {
      id: 's_res',
      name: 'Resolved',
      color: '#38EF7D',
      type: 'completed',
    };
    expect(isClosedState(resolvedState)).toBe(true);
    expect(isOpenState(resolvedState)).toBe(false);

    const customDoneState: LinearWorkflowState = {
      id: 's_custom',
      name: 'Done (Verified)',
      color: '#38EF7D',
      type: 'custom',
    };
    expect(isClosedState(customDoneState)).toBe(true);
    expect(isOpenState(customDoneState)).toBe(false);
  });

  it('correctly classifies open and pending states as open', () => {
    const backlogState: LinearWorkflowState = {
      id: 's_3',
      name: 'Backlog',
      color: '#BEC2C8',
      type: 'backlog',
    };
    const todoState: LinearWorkflowState = {
      id: 's_4',
      name: 'Todo',
      color: '#F2994A',
      type: 'unstarted',
    };
    const inProgressState: LinearWorkflowState = {
      id: 's_5',
      name: 'In Progress',
      color: '#5E6AD2',
      type: 'started',
    };

    expect(isOpenState(backlogState)).toBe(true);
    expect(isClosedState(backlogState)).toBe(false);

    expect(isOpenState(todoState)).toBe(true);
    expect(isClosedState(todoState)).toBe(false);

    expect(isOpenState(inProgressState)).toBe(true);
    expect(isClosedState(inProgressState)).toBe(false);
  });

  it('handles null/undefined states as open/pending', () => {
    expect(isOpenState(null)).toBe(true);
    expect(isOpenState(undefined)).toBe(true);
    expect(isClosedState(null)).toBe(false);
    expect(isClosedState(undefined)).toBe(false);
  });

  it('classifies any archived issue as closed', () => {
    expect(isClosedState(null, true)).toBe(true);
    expect(isOpenState(null, true)).toBe(false);

    const openState: LinearWorkflowState = {
      id: 's_open',
      name: 'Backlog',
      color: '#BEC2C8',
      type: 'backlog',
    };
    expect(isClosedState(openState, true)).toBe(true);
    expect(isOpenState(openState, true)).toBe(false);
  });

  it('returns appropriate icon for each workflow state type', () => {
    expect(getStateIcon('backlog', 'Backlog')).toBe('📥');
    expect(getStateIcon('unstarted', 'Todo')).toBe('📋');
    expect(getStateIcon('started', 'In Progress')).toBe('⚡');
    expect(getStateIcon('completed', 'Done')).toBe('✅');
    expect(getStateIcon('canceled', 'Canceled')).toBe('🚫');
    expect(getStateIcon('triage', 'Triage')).toBe('🔍');
    expect(getStateIcon('custom', 'Review')).toBe('⚪');
  });
});
