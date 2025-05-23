import * as vscode from 'vscode';

/**
 * Centralized manager for DNAnexus active project
 * Acts as a single source of truth for active project across the extension
 */
export class ProjectManager {
  private static instance: ProjectManager;
  
  private _activeProjectId: string | undefined;
  private _onProjectChanged = new vscode.EventEmitter<string | undefined>();
  
  // Public event for components to subscribe to project changes
  readonly onProjectChanged = this._onProjectChanged.event;
  
  private constructor(private context: vscode.ExtensionContext) {
    // Restore saved project from workspace state if available
    this._activeProjectId = context.workspaceState.get<string>('activeProjectId');
    console.log(`ProjectManager: Initialized with active project: ${this._activeProjectId || 'none'}`);
  }
  
  /**
   * Get the ProjectManager singleton instance
   */
  public static getInstance(context?: vscode.ExtensionContext): ProjectManager {
    if (!ProjectManager.instance) {
      if (!context) {
        throw new Error('ProjectManager needs context for first initialization');
      }
      ProjectManager.instance = new ProjectManager(context);
    }
    return ProjectManager.instance;
  }
  
  /**
   * Get the current active project ID
   */
  public getActiveProject(): string | undefined {
    return this._activeProjectId;
  }
  
  /**
   * Set the active project ID
   */
  public async setActiveProject(projectId: string | undefined): Promise<void> {
    if (this._activeProjectId === projectId) {
      return; // No change, do nothing
    }
    
    console.log(`ProjectManager: Setting active project to ${projectId || 'none'}`);
    this._activeProjectId = projectId;
    
    // Save to workspace state
    await this.context.workspaceState.update('activeProjectId', projectId);
    
    // Notify subscribers
    this._onProjectChanged.fire(projectId);
  }
}
