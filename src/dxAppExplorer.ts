import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DxCli } from './dxCli';
import { DxAppNode, DxAppNodeType, AppRunTemplate } from './dxAppNode';

export class DxAppExplorer implements vscode.TreeDataProvider<DxAppNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<DxAppNode | undefined | null | void> = new vscode.EventEmitter<DxAppNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<DxAppNode | undefined | null | void> = this._onDidChangeTreeData.event;

  private appNodes: DxAppNode[] = [];
  private dxCli: DxCli;
  private activeProjectId: string | undefined;
  private disposables: vscode.Disposable[] = [];
  private rootPath: string;

  constructor(private context: vscode.ExtensionContext) {
    const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
    if (!rootPath) {
      throw new Error('No workspace folder is open');
    }
    
    this.rootPath = rootPath;
    
    // Initialize DxCli instance
    this.dxCli = new DxCli(rootPath);
    
    // Restore saved active project ID if available
    const savedProject = this.context.workspaceState.get<string>('activeProjectId');
    if (savedProject) {
      console.log(`DxAppExplorer: Restoring active project from workspace state: ${savedProject}`);
      this.activeProjectId = savedProject;
    }
    
    // Register view
    const view = vscode.window.createTreeView('dxAppExplorer', { 
      treeDataProvider: this, 
      showCollapseAll: true,
      canSelectMany: false
    });
    
    // Register commands
    this.disposables.push(view);
    this.disposables.push(vscode.commands.registerCommand('dxAppExplorer.refresh', () => this.refresh()));
    this.disposables.push(vscode.commands.registerCommand('dxAppExplorer.openApp', (node: DxAppNode) => this.openApp(node)));
    this.disposables.push(vscode.commands.registerCommand('dxAppExplorer.createTemplate', (node: DxAppNode) => this.createTemplate(node)));
    this.disposables.push(vscode.commands.registerCommand('dxAppExplorer.editTemplate', (node: DxAppNode) => this.editTemplate(node)));
    this.disposables.push(vscode.commands.registerCommand('dxAppExplorer.deleteTemplate', (node: DxAppNode) => this.deleteTemplate(node)));
    this.disposables.push(vscode.commands.registerCommand('dxAppExplorer.runTemplate', (node: DxAppNode) => this.runTemplate(node)));
    
    // Initialize and load apps
    this.initialize();
  }

  /**
   * Initialize the app explorer
   */
  private async initialize(): Promise<void> {
    console.log('DxAppExplorer: Initializing');
    
    // Add a small delay to ensure the view is ready
    setTimeout(async () => {
      try {
        await this.loadApps();
      } catch (error) {
        console.error('DxAppExplorer: Error initializing', error);
      }
    }, 1000);
  }
  
  /**
   * Dispose resources
   */
  public dispose(): void {
    console.log('DxAppExplorer: Disposing');
    this.disposables.forEach(d => d.dispose());
  }
  
  /**
   * Set active project ID
   */
  public setActiveProject(projectId: string | undefined): void {
    console.log(`DxAppExplorer: Setting active project to ${projectId}`);
    this.activeProjectId = projectId;
    this.refresh();
  }
  
  /**
   * Refresh the app explorer
   */
  public async refresh(): Promise<void> {
    console.log('DxAppExplorer: Refreshing');
    await this.loadApps();
    this._onDidChangeTreeData.fire();
  }
  
  /**
   * Get tree item for node
   */
  public getTreeItem(element: DxAppNode): vscode.TreeItem {
    if (element.type === DxAppNodeType.Template) {
      // Template node
      const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.None);
      treeItem.contextValue = 'app-template';
      treeItem.tooltip = `Template: ${element.label}\nApp: ${element.jsonData.name || element.dxid}`;
      
      // Use template icon
      const lightIconPath = path.join(this.context.extensionPath, 'resources', 'light', 'document.svg');
      const darkIconPath = path.join(this.context.extensionPath, 'resources', 'dark', 'document.svg');
      treeItem.iconPath = {
        light: vscode.Uri.file(lightIconPath),
        dark: vscode.Uri.file(darkIconPath)
      };
      
      return treeItem;
    } else {
      // App node
      const treeItem = new vscode.TreeItem(element.label, vscode.TreeItemCollapsibleState.Collapsed);
      treeItem.contextValue = 'app';
      treeItem.tooltip = `App: ${element.label}\nID: ${element.dxid}\nVersion: ${element.jsonData.version || 'unknown'}`;
      
      // Use app icon
      const lightIconPath = path.join(this.context.extensionPath, 'resources', 'light', 'app.svg');
      const darkIconPath = path.join(this.context.extensionPath, 'resources', 'dark', 'app.svg');
      treeItem.iconPath = {
        light: vscode.Uri.file(lightIconPath),
        dark: vscode.Uri.file(darkIconPath)
      };
      
      return treeItem;
    }
  }
  
  /**
   * Get children of node
   */
  public getChildren(element?: DxAppNode): Thenable<DxAppNode[]> {
    if (!element) {
      // Return top-level apps
      return Promise.resolve(this.appNodes);
    } else if (element.type === DxAppNodeType.App) {
      // Return templates for this app
      return Promise.resolve(DxAppNode.loadTemplates(this.rootPath, element));
    } else {
      // No children for templates
      return Promise.resolve([]);
    }
  }
  
  /**
   * Get parent of node
   */
  public getParent(element: DxAppNode): vscode.ProviderResult<DxAppNode> {
    if (element.type === DxAppNodeType.Template && element.parent) {
      return element.parent;
    }
    return null;
  }
  
  /**
   * Load apps from the DNAnexus platform
   */
  private async loadApps(): Promise<void> {
    try {
      console.log('DxAppExplorer: Loading apps');
      
      // Use dx find apps command to get a list of apps
      const args = ['find', 'apps', '--json', '--all'];
      
      const result = await this.dxCli.callDxCli(args);
      
      // Process the app data
      this.appNodes = (result || []).map((app: any) => {
        return new DxAppNode(
          app.id || app.name,
          app.name || app.id,
          app.id,
          app
        );
      });
      
      console.log(`DxAppExplorer: Loaded ${this.appNodes.length} apps`);
    } catch (error) {
      console.error('DxAppExplorer: Failed to load apps', error);
      vscode.window.showErrorMessage(`Failed to load apps: ${error}`);
      this.appNodes = [];
    }
  }
  
  /**
   * Open app in a new tab to display details
   */
  private async openApp(node: DxAppNode): Promise<void> {
    if (!node) {
      return;
    }
    
    try {
      console.log(`DxAppExplorer: Opening app ${node.dxid}`);
      
      // Get detailed app info
      const appInfo = await this.dxCli.callDxCli(['describe', '--json', node.dxid]);
      
      // Create a markdown document to display app info
      const markdownContent = this.generateAppMarkdown(appInfo);
      
      // Create a temp file and open it
      const tempFile = path.join(this.rootPath, 'tmp', 'apps', `${node.dxid.replace(':', '_')}.md`);
      fs.mkdirSync(path.dirname(tempFile), { recursive: true });
      fs.writeFileSync(tempFile, markdownContent);
      
      const doc = await vscode.workspace.openTextDocument(tempFile);
      await vscode.window.showTextDocument(doc);
    } catch (error) {
      console.error('DxAppExplorer: Failed to open app', error);
      vscode.window.showErrorMessage(`Failed to open app: ${error}`);
    }
  }
  
  /**
   * Generate markdown content for app details
   */
  private generateAppMarkdown(appInfo: any): string {
    const md = [];
    
    md.push(`# ${appInfo.name} (${appInfo.version || 'unknown'})`);
    md.push('');
    md.push(`**ID**: ${appInfo.id}`);
    md.push(`**Created by**: ${appInfo.createdBy || 'unknown'}`);
    md.push(`**Created at**: ${appInfo.created ? new Date(appInfo.created * 1000).toLocaleString() : 'unknown'}`);
    md.push('');
    
    if (appInfo.description) {
      md.push('## Description');
      md.push('');
      md.push(appInfo.description);
      md.push('');
    }
    
    if (appInfo.inputSpec && appInfo.inputSpec.length > 0) {
      md.push('## Inputs');
      md.push('');
      md.push('| Name | Type | Optional | Description |');
      md.push('| ---- | ---- | -------- | ----------- |');
      
      for (const input of appInfo.inputSpec) {
        const optional = input.optional ? 'Yes' : 'No';
        const description = input.help || '';
        md.push(`| ${input.name} | ${input.class} | ${optional} | ${description} |`);
      }
      
      md.push('');
    }
    
    if (appInfo.outputSpec && appInfo.outputSpec.length > 0) {
      md.push('## Outputs');
      md.push('');
      md.push('| Name | Type | Description |');
      md.push('| ---- | ---- | ----------- |');
      
      for (const output of appInfo.outputSpec) {
        const description = output.help || '';
        md.push(`| ${output.name} | ${output.class} | ${description} |`);
      }
      
      md.push('');
    }
    
    return md.join('\n');
  }
  
  /**
   * Create a new template for an app
   */
  private async createTemplate(node: DxAppNode): Promise<void> {
    if (!node || node.type !== DxAppNodeType.App) {
      return;
    }
    
    if (!this.activeProjectId) {
      vscode.window.showWarningMessage('Please select a project first.');
      return;
    }
    
    try {
      console.log(`DxAppExplorer: Creating template for app ${node.dxid}`);
      
      // Get the app info for input specification
      // const appInfo = await this.dxCli.callDxCli(['describe', '--json', node.dxid]);
      
      // Get template name
      const templateName = await vscode.window.showInputBox({
        prompt: 'Enter a name for this template',
        placeHolder: 'My Template'
      });
      
      if (!templateName) {
        return;
      }
      
      // Get job name
      const jobName = await vscode.window.showInputBox({
        prompt: 'Enter a job name',
        placeHolder: `${node.label} run`,
        value: `${node.label} run`
      });
      
      if (!jobName) {
        return;
      }
      
      // Get output folder path
      const outputFolder = await vscode.window.showInputBox({
        prompt: 'Enter output folder path',
        placeHolder: '/output',
        value: '/output'
      });
      
      if (!outputFolder) {
        return;
      }
      
      // Create template with default values
      const template: AppRunTemplate = {
        jobName,
        instanceType: 'mem1_ssd1_v2_x2',
        output_folder: outputFolder,
        project: this.activeProjectId,
        inputs: {}
      };
      
      // Save the template
      DxAppNode.saveTemplate(this.rootPath, node.dxid, templateName, template);
      
      // Refresh to show new template
      this.refresh();
      
      // Open editor for the template
      const templateNode = DxAppNode.loadTemplates(this.rootPath, node)
        .find(t => t.label === templateName);
      
      if (templateNode) {
        this.editTemplate(templateNode);
      }
    } catch (error) {
      console.error('DxAppExplorer: Failed to create template', error);
      vscode.window.showErrorMessage(`Failed to create template: ${error}`);
    }
  }
  
  /**
   * Edit an existing template
   */
  private async editTemplate(node: DxAppNode): Promise<void> {
    if (!node || node.type !== DxAppNodeType.Template || !node.parent) {
      return;
    }
    
    try {
      console.log(`DxAppExplorer: Editing template ${node.label} for app ${node.dxid}`);
      
      // Get the template file path
      const templateFile = path.join(
        DxAppNode.getAppDirectoryPath(this.rootPath, node.dxid),
        `${node.label}.json`
      );
      
      // Open the file in the editor
      const document = await vscode.workspace.openTextDocument(templateFile);
      await vscode.window.showTextDocument(document);
    } catch (error) {
      console.error('DxAppExplorer: Failed to edit template', error);
      vscode.window.showErrorMessage(`Failed to edit template: ${error}`);
    }
  }
  
  /**
   * Delete a template
   */
  private async deleteTemplate(node: DxAppNode): Promise<void> {
    if (!node || node.type !== DxAppNodeType.Template) {
      return;
    }
    
    const confirm = await vscode.window.showWarningMessage(
      `Are you sure you want to delete the template '${node.label}'?`,
      { modal: true },
      'Delete'
    );
    
    if (confirm !== 'Delete') {
      return;
    }
    
    try {
      console.log(`DxAppExplorer: Deleting template ${node.label} for app ${node.dxid}`);
      
      // Delete the template file
      DxAppNode.deleteTemplate(this.rootPath, node.dxid, node.label);
      
      // Refresh to update the tree
      this.refresh();
      vscode.window.showInformationMessage(`Template '${node.label}' deleted.`);
    } catch (error) {
      console.error('DxAppExplorer: Failed to delete template', error);
      vscode.window.showErrorMessage(`Failed to delete template: ${error}`);
    }
  }
  
  /**
   * Run a template
   */
  private async runTemplate(node: DxAppNode): Promise<void> {
    if (!node || node.type !== DxAppNodeType.Template || !node.templateData || !node.parent) {
      return;
    }
    
    if (!this.activeProjectId) {
      vscode.window.showWarningMessage('Please select a project first.');
      return;
    }
    
    try {
      console.log(`DxAppExplorer: Running template ${node.label} for app ${node.dxid}`);
      
      // Get app info
      // const appInfo = node.parent.jsonData;
      
      // Prepare the run command
      const args = ['run', node.dxid];
      
      // Add project
      args.push('--destination', this.activeProjectId);
      
      // Add job name
      args.push('--name', node.templateData.jobName);
      
      // Add instance type if specified
      if (node.templateData.instanceType) {
        args.push('--instance-type', node.templateData.instanceType);
      }
      
      // Add inputs as JSON
      args.push('--input-json', JSON.stringify(node.templateData.inputs || {}));
      
      // Add output folder if specified
      if (node.templateData.output_folder) {
        args.push('--folder', node.templateData.output_folder);
      }
      
      // Run the app
      const result = await this.dxCli.callDxCli(args);
      
      vscode.window.showInformationMessage(`Job '${node.templateData.jobName}' has been launched.`);
      
      // Show the job ID in the output
      const outputChannel = vscode.window.createOutputChannel('DNAnexus App Runner');
      outputChannel.show();
      outputChannel.appendLine(`Launched job: ${result}`);
      
      // Refresh the job explorer to show the new job
      vscode.commands.executeCommand('dxJobExplorer.refresh');
    } catch (error) {
      console.error('DxAppExplorer: Failed to run template', error);
      vscode.window.showErrorMessage(`Failed to run template: ${error}`);
    }
  }
}
