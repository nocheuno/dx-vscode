import * as vscode from 'vscode';
import * as path from 'path';
import { DxCli } from './dxCli';
import { ProjectManager } from './services/projectManager';

export interface ProjectDescribe {
  id: string;
  name: string;
  class: string;
  created: number;
  modified: number;
  billTo: string;
  cloudAccount: string;
  level: string;
  dataUsage: number;
  sponsoredDataUsage: number;
  remoteDataUsage: number;
  region: string;
  summary: string;
  description: string;
  protected: boolean;
  restricted: boolean;
  downloadRestricted: boolean;
  createdBy: {
    user: string;
  };
  version: number;
  previewViewerRestricted: boolean;
  externalUploadRestricted: boolean;
  displayDataProtectionNotice: boolean;
  databaseUIViewOnly: boolean;
  databaseResultsRestricted: null | boolean;
  allowedExecutables: null | string[];
  httpsAppIsolatedBrowsing: boolean;
  containsPHI: boolean;
  archivedDataUsage: number;
  pendingTransfer: null | any;
  tags: string[];
  defaultInstanceType: string;
  totalSponsoredEgressBytes: number;
  consumedSponsoredEgressBytes: number;
  atSpendingLimit: boolean;
  provider: Record<string, any>;
}

export interface ProjectData {
  id: string;
  level: string;
  permissionSources: string[];
  public: boolean;
  describe: ProjectDescribe;
}

export interface ProjectNode {
  id: string;
  label: string;
  description?: string;
  isActive: boolean;
  iconPath?: vscode.Uri | { light: vscode.Uri; dark: vscode.Uri };
  projectData?: ProjectData;  // The full project data from API
}

interface ProjectQuickPickItem extends vscode.QuickPickItem {
  id: string;
  projectData?: ProjectData;
}

export class ProjectSelector implements vscode.TreeDataProvider<ProjectNode>, vscode.Disposable {
  private _onDidChangeTreeData: vscode.EventEmitter<ProjectNode | undefined | null | void> = new vscode.EventEmitter<ProjectNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ProjectNode | undefined | null | void> = this._onDidChangeTreeData.event;

  private projects: ProjectNode[] = [];
  private dxCli: DxCli;
  private projectManager: ProjectManager;
  private disposables: vscode.Disposable[] = [];

  constructor(private context: vscode.ExtensionContext) {
    const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      throw new Error('No workspace folder is open');
    }
    
    // Initialize DxCli instance
    this.dxCli = new DxCli(rootPath);

    // Get ProjectManager instance
    this.projectManager = ProjectManager.getInstance(context);
    
    // Register view
    const view = vscode.window.createTreeView('projectSelector', { 
      treeDataProvider: this, 
      showCollapseAll: true 
    });
    
    // Register commands
    this.disposables.push(view);
    this.disposables.push(vscode.commands.registerCommand('projectSelector.refresh', () => this.refresh()));
    this.disposables.push(vscode.commands.registerCommand('projectSelector.selectProject', (node: ProjectNode) => this.selectProject(node)));
    this.disposables.push(vscode.commands.registerCommand('projectSelector.addProject', () => this.addProject()));
    
    // Add an event handler for when the view becomes visible
    this.disposables.push(view.onDidChangeVisibility(e => {
      if (e.visible && this.projects.length === 0) {
        this.refresh();
      }
    }));
    
    // Subscribe to project changes from ProjectManager
    this.disposables.push(
      this.projectManager.onProjectChanged(projectId => {
        console.log(`ProjectSelector: Project changed event received: ${projectId}`);
        // Mark the project as active in our projects list
        this.projects.forEach(p => p.isActive = (p.id === projectId));
        // Refresh the view to show the active project
        this._onDidChangeTreeData.fire();
      })
    );
    
    // Initialize and load projects
    this.initialize();
  }
  
  /**
   * Initialize the project selector
   */
  private async initialize(): Promise<void> {
    console.log('ProjectSelector: Initializing');
    
    try {
      // Load projects immediately without delay
      await this.loadProjects();
      
      // Get the current project ID from dx env
      const currentProjectId = await this.getCurrentProjectId();
      
      if (currentProjectId) {
        console.log(`ProjectSelector: Setting active project to ${currentProjectId} from dx env`);
        // Set the active project in the ProjectManager
        await this.projectManager.setActiveProject(currentProjectId);
        
        // Mark the project as active in our projects list
        this.projects.forEach(p => p.isActive = (p.id === currentProjectId));
      }
      
      // Explicitly update the UI
      this._onDidChangeTreeData.fire();
    } catch (error) {
      console.error('ProjectSelector: Error initializing', error);
      this.projects = [];
      this._onDidChangeTreeData.fire();
    }
  }
  
  /**
   * Dispose resources
   */
  public dispose(): void {
    console.log('ProjectSelector: Disposing');
    this.disposables.forEach(d => d.dispose());
  }
  
  /**
   * Refresh the project selector
   */
  public async refresh(): Promise<void> {
    console.log('ProjectSelector: Refreshing');
    await this.loadProjects();
    this._onDidChangeTreeData.fire();
  }
  
  /**
   * Get tree item for node
   */
  public getTreeItem(element: ProjectNode): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    treeItem.description = element.description;
    treeItem.contextValue = 'project';
    
    // Add selection indicator
    if (element.isActive) {
      treeItem.description = '(active)';
    }
    
    // Set icon
    treeItem.iconPath = element.iconPath || new vscode.ThemeIcon('folder');
    // Make the item clickable to select the project
    treeItem.command = {
      command: 'projectSelector.selectProject',
      title: 'Select Project',
      arguments: [element]
    };
    return treeItem;
  }
  
  /**
   * Get children of node
   */
  public getChildren(_element?: ProjectNode): Thenable<ProjectNode[]> {
    return Promise.resolve(this.projects);
  }
  
  /**
   * Get parent of node
   */
  public getParent(_element: ProjectNode): vscode.ProviderResult<ProjectNode> {
    return null;
  }
  
  /**
   * Load projects from the DNAnexus platform
   */
  private async loadProjects(): Promise<void> {
    try {
      console.log('ProjectSelector: Loading projects');
      vscode.window.setStatusBarMessage('Loading DNAnexus projects...', 3000);
      
      // Get all projects using dx find projects command
      const findResult = await this.dxCli.callDxCli(['find', 'projects', '--json']);
      
      if (!findResult || !Array.isArray(findResult)) {
        console.warn('ProjectSelector: Got invalid result from dx find projects', findResult);
        this.projects = [];
        return;
      }
      
      // Get the current active project from the ProjectManager
      const activeProjectId = this.projectManager.getActiveProject();
      
      // Process project data
      const projects: ProjectNode[] = (findResult || []).map((project: ProjectData) => {
        const isActive = activeProjectId === project.id;
        
        // Create light/dark icons
        const iconPath = {
          light: vscode.Uri.file(
            path.join(this.context.extensionPath, 'resources', 'light', 'folder.svg')
          ),
          dark: vscode.Uri.file(
            path.join(this.context.extensionPath, 'resources', 'dark', 'folder.svg')
          )
        };
        
        return {
          id: project.id,
          label: project.describe.name || project.id,
          description: project.describe.description || project.describe.summary || '',
          isActive,
          projectData: project,
          iconPath
        };
      });
      
      // Sort projects: active first, then alphabetically
      this.projects = projects.sort((a, b) => {
        if (a.isActive && !b.isActive) { return -1; }
        if (!a.isActive && b.isActive) { return 1; }
        return a.label.localeCompare(b.label);
      });
      
      console.log(`ProjectSelector: Loaded ${this.projects.length} projects`);
    } catch (error) {
      console.error('ProjectSelector: Failed to load projects', error);
      vscode.window.showErrorMessage(`Failed to load projects: ${error}`);
      this.projects = [];
    }
  }
  
  /**
   * Select a project
   */
  private async selectProject(node: ProjectNode): Promise<void> {
    console.log(`ProjectSelector: Selecting project ${node.id}`);
    
    if (!node) {
      return;
    }
    
    try {
      console.log(`ProjectSelector: Selecting project ${node.id}`);
      
      // Use dx select to switch to the project
      vscode.window.setStatusBarMessage(`Switching to project: ${node.label}...`, 3000);
      await this.dxCli.callDxCli(['select', node.id]);
      
      // Update the active project in ProjectManager
      // This will trigger notifications to all subscribers
      await this.projectManager.setActiveProject(node.id);
      
      vscode.window.showInformationMessage(`Switched to project: ${node.label}`);
    } catch (error) {
      console.error('ProjectSelector: Failed to select project', error);
      vscode.window.showErrorMessage(`Failed to select project: ${error}`);
    }
  }
  
  /**
   * Add a project to the list
   */
  private async addProject(): Promise<void> {
    try {
      console.log('ProjectSelector: Adding project');
      
      // Show all available projects using dx find projects command
      const allProjects = await this.dxCli.callDxCli(['find', 'projects', '--json', '--all']);
      
      // Filter out already added projects
      const existingIds = this.projects.map(p => p.id);
      const availableProjects = allProjects.filter((p: ProjectData) => !existingIds.includes(p.id));
      
      // Create QuickPick items
      const items: ProjectQuickPickItem[] = availableProjects.map((project: ProjectData) => ({
        label: project.describe.name || project.id,
        description: project.describe.description || project.describe.summary || '',
        id: project.id,
        projectData: project
      }));
      
      // Show QuickPick UI
      const selection = await vscode.window.showQuickPick<ProjectQuickPickItem>(items, {
        placeHolder: 'Select a project to add',
        canPickMany: false
      });
      
      if (!selection) {
        return;
      }
      
      // Add the project to the list
      const iconPath = {
        light: vscode.Uri.file(
          path.join(this.context.extensionPath, 'resources', 'light', 'folder.svg')
        ),
        dark: vscode.Uri.file(
          path.join(this.context.extensionPath, 'resources', 'dark', 'folder.svg')
        )
      };
      
      this.projects.push({
        id: selection.id,
        label: selection.label,
        description: selection.description || '',
        isActive: false,
        iconPath,
        projectData: selection.projectData
      });
      
      // Refresh the view
      this._onDidChangeTreeData.fire();
    } catch (error) {
      console.error('ProjectSelector: Failed to add project', error);
      vscode.window.showErrorMessage(`Failed to add project: ${error}`);
    }
  }

  /**
   * Get the current project ID from the DX environment
   */
  private async getCurrentProjectId(): Promise<string | undefined> {
    try {
      console.log('ProjectSelector: Getting current project ID from dx env');
      
      // Execute dx env for raw output (no JSON)
      const { stdout } = await this.dxCli.executeCommand(`${this.dxCli.getCliPath()} env`);
      const lines = stdout.split('\n');
      for (const line of lines) {
        if (line.startsWith('Current workspace')) {
          // Line format: "Current workspace       project-ID"
          const parts = line.trim().split(/\s+/);
          const projectId = parts[parts.length - 1].replace(/"/g, '');
          console.log(`ProjectSelector: Current workspace from env: ${projectId}`);
          return projectId;
        }
      }
      console.log('ProjectSelector: No current workspace found in dx env output');
      return undefined;
    } catch (error) {
      console.error('ProjectSelector: Error getting current project ID', error);
      return undefined;
    }
  }
}
