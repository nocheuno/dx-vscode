export interface StateTransition {
  newState: string;
  setAt: number;
}

export class DxJobNode {
  constructor(
    readonly id: string,
    readonly label: string,
    readonly description: string,
    readonly status: string,
    readonly startedAt: string,
    readonly projectId: string,
    readonly dxid: string,
    readonly appName = 'Unknown',
    readonly instanceType = 'Unknown',
    readonly launchedBy = 'Unknown',
    readonly billTo = 'Unknown',
    readonly stateTransitions: StateTransition[] = [],
    readonly created?: number,
    readonly modified?: number,
    readonly folder?: string,
    readonly executableName?: string,
    readonly openExternal?: boolean
  ) {}

  /**
   * Get the latest state transition
   */
  public get latestStateTransition(): StateTransition | undefined {
    if (!this.stateTransitions || this.stateTransitions.length === 0) {
      return undefined;
    }
    return this.stateTransitions[this.stateTransitions.length - 1];
  }

  /**
   * Get time since last state transition in a human-readable format
   */
  public get lastStateChangeTime(): string {
    const latest = this.latestStateTransition;
    if (!latest) {
      return 'Unknown';
    }

    const now = Date.now();
    const changeTime = latest.setAt;
    const diffMs = now - changeTime;
    
    // Format time difference
    if (diffMs < 60000) { // Less than 1 minute
      return 'Just now';
    } else if (diffMs < 3600000) { // Less than 1 hour
      const minutes = Math.floor(diffMs / 60000);
      return `${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    } else if (diffMs < 86400000) { // Less than 1 day
      const hours = Math.floor(diffMs / 3600000);
      return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else { // More than 1 day
      const days = Math.floor(diffMs / 86400000);
      return `${days} day${days !== 1 ? 's' : ''} ago`;
    }
  }
}
