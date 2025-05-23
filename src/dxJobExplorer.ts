import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { DxCli } from './dxCli';
import { DxJobNode } from './dxJobNode';
import { ProjectManager } from './services/projectManager';

export class DxJobExplorer implements vscode.TreeDataProvider<DxJobNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<DxJobNode | undefined | null | void> = new vscode.EventEmitter<DxJobNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<DxJobNode | undefined | null | void> = this._onDidChangeTreeData.event;

  private jobNodes: DxJobNode[] = [];
  private dxCli: DxCli;
  private projectManager: ProjectManager;
  private disposables: vscode.Disposable[] = [];
  private refreshInterval: NodeJS.Timeout | undefined;

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
    const view = vscode.window.createTreeView('dxJobExplorer', { 
      treeDataProvider: this, 
      showCollapseAll: true,
      canSelectMany: true
    });
    
    // Add refresh button to the view title
    vscode.commands.executeCommand('setContext', 'dxJobExplorerEnabled', true);
    
    // Register commands
    this.disposables.push(view);
    this.disposables.push(vscode.commands.registerCommand('dxJobExplorer.refresh', () => this.refresh()));
    this.disposables.push(vscode.commands.registerCommand('dxJobExplorer.terminateJob', (node: DxJobNode) => this.terminateJob(node)));
    this.disposables.push(vscode.commands.registerCommand('dxJobExplorer.rerunJob', (node: DxJobNode) => this.rerunJob(node)));
    this.disposables.push(vscode.commands.registerCommand('dxJobExplorer.openExternal', (node: DxJobNode) => this.openExternal(node)));
    this.disposables.push(vscode.commands.registerCommand('dxJobExplorer.describeJob', (node: DxJobNode) => this.describeJob(node)));
    this.disposables.push(vscode.commands.registerCommand('dxJobExplorer.watchJob', (node: DxJobNode) => this.watchJob(node)));
    this.disposables.push(vscode.commands.registerCommand('dxJobExplorer.sshJob', (node: DxJobNode) => this.sshJob(node)));
    
    // Subscribe to project changes from ProjectManager
    this.disposables.push(
      this.projectManager.onProjectChanged(projectId => {
        console.log(`DxJobExplorer: Project changed event received: ${projectId}`);
        this.refresh();
      })
    );
    
    // Initialize and load jobs
    this.initialize();
  }
  
  /**
   * Initialize the job explorer
   */
  private async initialize(): Promise<void> {
    console.log('DxJobExplorer: Initializing');
    
    // Add a small delay to ensure the view is ready
    setTimeout(async () => {
      try {
        await this.loadJobs();
        
        // Set up automatic refresh every 60 seconds
        this.refreshInterval = setInterval(() => {
          this.loadJobs();
        }, 60000);
      } catch (error) {
        console.error('DxJobExplorer: Error initializing', error);
      }
    }, 1000);
  }
  
  /**
   * Dispose resources
   */
  public dispose(): void {
    console.log('DxJobExplorer: Disposing');
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
    this.disposables.forEach(d => d.dispose());
  }
  
  /**
   * Set active project ID
   */
  public async setActiveProject(projectId: string | undefined): Promise<void> {
    console.log(`DxJobExplorer: Setting active project to ${projectId}`);
    // Use ProjectManager to update active project
    await this.projectManager.setActiveProject(projectId);
    // No need to refresh here as we're subscribed to the onProjectChanged event
  }
  
  /**
   * Get active project ID
   */
  public getActiveProject(): string | undefined {
    return this.projectManager.getActiveProject();
  }
  
  /**
   * Refresh the job explorer
   */
  public async refresh(): Promise<void> {
    console.log('DxJobExplorer: Refreshing based on current active project from ProjectManager');
    
    // loadJobs will internally use the active project from projectManager
    await this.loadJobs();
    this._onDidChangeTreeData.fire();
  }
  
  /**
   * Get tree item for node
   */
  public getTreeItem(element: DxJobNode): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
    treeItem.id = element.id;
    
    // Add latest state transition info to the description if available
    const latestTransition = element.latestStateTransition;
    const stateChangeTime = element.lastStateChangeTime;
    if (latestTransition) {
      treeItem.description = `${element.description} - ${stateChangeTime}`;
    } else {
      treeItem.description = element.description;
    }
    
    // Create a tooltip message
    const tooltip = new vscode.MarkdownString();
    tooltip.appendMarkdown(`**Job:** ${element.label}\n\n`);
    tooltip.appendMarkdown(`**ID:** \`${element.dxid}\`\n\n`);
    tooltip.appendMarkdown(`**Status:** ${element.status}\n\n`);
    tooltip.appendMarkdown(`**Created:** ${element.created ? new Date(element.created).toLocaleString() : 'Unknown'}\n\n`);
    tooltip.appendMarkdown(`**Last Modified:** ${element.modified ? new Date(element.modified).toLocaleString() : 'Unknown'}\n\n`);
    
    if (element.folder) {
      tooltip.appendMarkdown(`**Folder:** ${element.folder}\n\n`);
    }
    
    tooltip.appendMarkdown(`**Started:** ${element.startedAt}\n\n`);
    tooltip.appendMarkdown(`**Instance Type:** ${element.instanceType}\n\n`);
    tooltip.appendMarkdown(`**Launched by:** ${element.launchedBy}\n\n`);
    tooltip.appendMarkdown(`**Bill To:** ${element.billTo}\n\n`);
		tooltip.appendMarkdown(`**App Name:** ${element.appName}\n\n`);
    
    treeItem.tooltip = tooltip;
    
    // Set contextValue based on status - this allows us to show/hide context menu items conditionally
    treeItem.contextValue = `job-${element.status.toLowerCase()}`;
    
    // Set icon based on status
    const iconName = this.getStatusIcon(element.status);
    const lightIconPath = path.join(this.context.extensionPath, 'resources', 'light', 'status', `${iconName}.svg`);
    const darkIconPath = path.join(this.context.extensionPath, 'resources', 'dark', 'status', `${iconName}.svg`);
    treeItem.iconPath = {
      light: vscode.Uri.file(lightIconPath),
      dark: vscode.Uri.file(darkIconPath)
    };
    
    return treeItem;
  }
  
  /**
   * Get children of node
   */
  public getChildren(_element?: DxJobNode): Thenable<DxJobNode[]> {
    return Promise.resolve(this.jobNodes);
  }
  
  /**
   * Get parent of node
   */
  public getParent(_element: DxJobNode): vscode.ProviderResult<DxJobNode> {
    return null;
  }
  
  /**
   * Map job status to icon name
   */
  private getStatusIcon(status: string): string {
    switch (status.toLowerCase()) {
      case 'running':
        return 'running';
      case 'done':
        return 'done';
      case 'failed':
        return 'failed';
      case 'terminated':
        return 'terminated';
      case 'waiting':
        return 'runnable';
      default:
        return 'idle';
    }
  }
  
  /**
   * Load jobs from the DNAnexus platform
   */
  private async loadJobs(): Promise<void> {
    try {
      const activeProjectId = this.projectManager.getActiveProject();
      
      if (!activeProjectId) {
        console.log('DxJobExplorer: No active project, clearing job list');
        this.jobNodes = [];
        return;
      }
      
      console.log(`DxJobExplorer: Loading jobs for project ${activeProjectId}`);
      
      // Fetch jobs using dx find jobs command with the specified limit
      const args = ['find', 'jobs', '--json', '-n', '50'];
      
      // Add project filter if we have an active project
      if (activeProjectId) {
        args.push('--project', activeProjectId);
      }
      
      const result = await this.dxCli.callDxCli(args);
      
      // Process the job data
      this.jobNodes = (result || []).map((job: any) => {
        const status = job.state || 'unknown';
        const startedAt = job.startedRunning ? new Date(job.startedRunning).toLocaleString() : 'Not started';
        const appName = job.executableName || job.executable || 'Unknown';
        
        return new DxJobNode(
          job.id,
          job.name || job.id,
          `${status} | ${appName}`,
          status,
          startedAt,
          job.project || activeProjectId,
          job.id,
          appName,
          job.instanceType || 'Unknown',
          job.launchedBy || 'Unknown',
          job.billTo || 'Unknown',
          job.stateTransitions || [],
          job.created,
          job.modified,
          job.folder,
          job.executableName
        );
      });
      
      console.log(`DxJobExplorer: Loaded ${this.jobNodes.length} jobs`);
    } catch (error) {
      console.error('DxJobExplorer: Failed to load jobs', error);
      vscode.window.showErrorMessage(`Failed to load jobs: ${error}`);
      this.jobNodes = [];
    }
  }
  
  /**
   * Terminate a running job
   */
  private async terminateJob(node: DxJobNode): Promise<void> {
    if (!node) {
      return;
    }
    
    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to terminate the job '${node.label}'?`,
      { modal: true },
      'Terminate'
    );
    
    if (confirm !== 'Terminate') {
      return;
    }
    
    try {
      console.log(`DxJobExplorer: Terminating job ${node.dxid}`);
      await this.dxCli.callDxCli(['terminate', node.dxid]);
      vscode.window.showInformationMessage(`Job ${node.label} has been terminated.`);
      this.refresh();
    } catch (error) {
      console.error('DxJobExplorer: Failed to terminate job', error);
      vscode.window.showErrorMessage(`Failed to terminate job: ${error}`);
    }
  }
  
  /**
   * Rerun a job
   */
  private async rerunJob(node: DxJobNode): Promise<void> {
    if (!node) {
      return;
    }
    
    try {
      console.log(`DxJobExplorer: Rerunning job ${node.dxid}`);
      
      // const activeProjectId = this.projectManager.getActiveProject();
      
      // Get the input JSON for the original job
      // const describeResult = await this.dxCli.callDxCli(['describe', '--json', node.dxid]);
      
      // Rerun with same parameters
      // const runResult = await this.dxCli.callDxCli([
      //   'run',
      //   describeResult.executableName,
      //   '--destination', activeProjectId!,
      //   '--input-json', JSON.stringify(describeResult.runInput),
      //   '--name', `${node.label} (rerun)`
      // ]);
      
      vscode.window.showInformationMessage(`Job ${node.label} has been rerun.`);
      this.refresh();
    } catch (error) {
      console.error('DxJobExplorer: Failed to rerun job', error);
      vscode.window.showErrorMessage(`Failed to rerun job: ${error}`);
    }
  }
  
  /**
   * Open job in external browser
   */
  private async openExternal(node: DxJobNode): Promise<void> {
    if (!node) {
      return;
    }
    
    try {
      // Get the DNAnexus platform URL
      const envResult = await this.dxCli.callDxCli(['env', '--json']);
      const apiServerHost = envResult.DX_APISERVER_HOST || 'https://platform.dnanexus.com';
      
      // Construct job URL
      const jobUrl = `${apiServerHost}/panx/jobs/${node.dxid}`;
      
      // Open URL in browser
      await vscode.env.openExternal(vscode.Uri.parse(jobUrl));
    } catch (error) {
      console.error('DxJobExplorer: Failed to open job in browser', error);
      vscode.window.showErrorMessage(`Failed to open job in browser: ${error}`);
    }
  }

  /**
   * SSH into job
   */
  private async sshJob(node: DxJobNode): Promise<void> {
    if (!node) {
      return;
    }
    
    try {
      const terminal = vscode.window.createTerminal(`SSH: ${node.label}`);
      terminal.show();
      terminal.sendText(`source ~/dxpy-venv/bin/activate && dx ssh ${node.dxid}`);
      
      console.log(`DxJobExplorer: SSHing into job ${node.dxid} in terminal`);
    } catch (error) {
      console.error('DxJobExplorer: Failed to SSH into job', error);
      vscode.window.showErrorMessage(`Failed to SSH into job: ${error}`);
    }
  }

  /**
   * Watch job in terminal
   */
  private async watchJob(node: DxJobNode): Promise<void> {
    if (!node) {
      return;
    }
    
    try {
      const terminal = vscode.window.createTerminal(`Job: ${node.label}`);
      terminal.show();
      terminal.sendText(`source ~/dxpy-venv/bin/activate && dx watch ${node.dxid}`);
      
      console.log(`DxJobExplorer: Watching job ${node.dxid} in terminal`);
    } catch (error) {
      console.error('DxJobExplorer: Failed to watch job in terminal', error);
      vscode.window.showErrorMessage(`Failed to watch job: ${error}`);
    }
  }

  /**
   * Describe a job and show JSON output in Monaco editor
   */
  private async describeJob(node: DxJobNode): Promise<void> {
    if (!node) {
      vscode.window.showErrorMessage('Please select a job to describe.');
      return;
    }
    const activeProjectId = this.projectManager.getActiveProject();
    if (!activeProjectId) {
      vscode.window.showWarningMessage('Please select a project first.');
      return;
    }
    const jobId = node.dxid;
    if (!jobId) {
      vscode.window.showErrorMessage('Job ID is missing.');
      return;
    }
    try {
      const args = ['describe', '--json', jobId];
      const result = await this.dxCli.callDxCli(args);
      const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
      if (content.trim() === '') {
        vscode.window.showErrorMessage(`Command \`dx describe --json ${jobId}\` returned no output.`);
        return;
      }
      const configDir = path.join(os.homedir(), '.dnanexus_config', 'tmp');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      const fileName = `job-describe.json`;
      const filePath = path.join(configDir, fileName);
      fs.writeFileSync(filePath, content);
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const editor = await vscode.window.showTextDocument(doc, { preview: false });
      await vscode.languages.setTextDocumentLanguage(editor.document, 'json');
    } catch (error: any) {
      vscode.window.showErrorMessage(`Failed to describe job: ${error.message || error}`);
      console.error(`DxJobExplorer: Failed to describe job '${jobId}'.`, error);
    }
  }
}
