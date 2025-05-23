import * as vscode from 'vscode';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { DxCli } from './dxCli';
import { DxNode } from './dxNode';
import { DxFileOperations } from './services/dxFileOperations';
import { DxFileOpener } from './services/dxFileOpener';
import { DxTreeDataProvider } from './services/dxTreeDataProvider';
import { DxDragAndDropController } from './services/dxDragAndDropController';
import { ProjectManager } from './services/projectManager';

export class DxFileExplorer implements vscode.TreeDataProvider<DxNode>, vscode.TreeDragAndDropController<DxNode>, vscode.Disposable {
    // Define MIME types for drag and drop operations
    dropMimeTypes = ['application/vnd.code.tree.dxFileExplorer', 'text/uri-list'];
    dragMimeTypes = ['text/uri-list'];

    // Service instances
    private treeDataProvider: DxTreeDataProvider;
    private dragAndDropController: DxDragAndDropController;
    private fileOperations: DxFileOperations;
    private fileOpener: DxFileOpener;
    private disposables: vscode.Disposable[] = [];
    
    // DX CLI instance
    private dxCli: DxCli;
    
    // Project manager
    private projectManager: ProjectManager;

    // Event emitter for tracking tree data changes
    private _onDidChangeTreeData: vscode.EventEmitter<DxNode | undefined | null | void> = new vscode.EventEmitter<DxNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<DxNode | undefined | null | void> = this._onDidChangeTreeData.event;

    constructor(context: vscode.ExtensionContext) {
        // Find the path to the dx CLI - search for it in the workspace
        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        if (!rootPath) {
            throw new Error('No workspace folder is open');
        }
        
        // Initialize DxCli instance
        this.dxCli = new DxCli(rootPath);

        // Initialize service instances
        this.treeDataProvider = new DxTreeDataProvider(this.dxCli);
        this.dragAndDropController = new DxDragAndDropController(this.dxCli, (projectId) => this.refresh(projectId));
        this.fileOperations = new DxFileOperations(this.dxCli);
        this.fileOpener = new DxFileOpener(this.dxCli);
        
        // Get ProjectManager instance
        this.projectManager = ProjectManager.getInstance(context);
        
        // Initialize file operations with current active project
        const currentProject = this.projectManager.getActiveProject();
        if (currentProject) {
            console.log(`DxFileExplorer: Using active project from ProjectManager: ${currentProject}`);
            this.fileOperations.setActiveProjectId(currentProject);
        }
        
        // Register commands and store disposables
        this.disposables.push(
            vscode.commands.registerCommand('dxFileExplorer.refresh', (projectId?: string) => this.refresh(projectId)),
            vscode.commands.registerCommand('dxFileExplorer.copyFileDxid', (node: DxNode) => this.copyFileDxid(node)),
            vscode.commands.registerCommand('dxFileExplorer.deleteItems', (node: DxNode) => this.deleteItem(node)),
            vscode.commands.registerCommand('dxFileExplorer.mkdir', (node: DxNode) => this.createFolder(node)),
            vscode.commands.registerCommand('dxFileExplorer.describeFile', (node: DxNode) => this.describeFile(node)),
            vscode.commands.registerCommand('dxFileExplorer.previewFile', (node: DxNode) => this.previewFile(node))
        );
        
        // Create the treeview in the Explorer
        const view = vscode.window.createTreeView('dxFileExplorer', { 
            treeDataProvider: this, 
            showCollapseAll: true, 
            canSelectMany: true, 
            dragAndDropController: this 
        });
        
        // Add view to disposables
        this.disposables.push(view);
        
        // Subscribe to project changes from ProjectManager
        this.disposables.push(
            this.projectManager.onProjectChanged(projectId => {
                console.log(`DxFileExplorer: Project changed event received: ${projectId}`);
                this.fileOperations.setActiveProjectId(projectId);
                this.refresh();
            })
        );
        
        // Also register in the context subscriptions
        context.subscriptions.push(this);
    }

    /**
     * Sets the active project ID and updates the file operations service
     */
    public async setActiveProject(projectId: string | undefined): Promise<void> {
        console.log(`DxFileExplorer: Setting active project to ${projectId}`);
        // Use ProjectManager to update the active project
        await this.projectManager.setActiveProject(projectId);
        // No need to refresh here as we're subscribed to the onProjectChanged event
    }

    /**
     * Gets the currently active project ID
     */
    public getActiveProject(): string | undefined {
        return this.projectManager.getActiveProject();
    }

    /**
     * Refreshes the file explorer
     */
    public async refresh(projectId?: string): Promise<void> {
        if (projectId) {
            await this.setActiveProject(projectId);
        }
        this._onDidChangeTreeData.fire();
    }
    
    /**
     * Dispose resources
     */
    public dispose(): void {
        console.log('DxFileExplorer: Disposing');
        this.disposables.forEach(d => d.dispose());
    }

    /**
     * Copy file ID to clipboard
     */
    private async copyFileDxid(node: DxNode): Promise<void> {
        if (node && node.id) {
            await vscode.env.clipboard.writeText(node.id);
            vscode.window.showInformationMessage(`Copied ${node.id} to clipboard`);
        }
    }

    /**
     * Delete a file or directory
     */
    private async deleteItem(node: DxNode): Promise<void> {
        if (!node) {
            return;
        }
        
        const confirmMessage = node.isDirectory 
            ? `Are you sure you want to delete the folder '${node.label}' and all its contents?` 
            : `Are you sure you want to delete '${node.label}'?`;
            
        const confirm = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true },
            'Delete'
        );
        
        if (confirm !== 'Delete') {
            return;
        }
        
        try {
            const activeProjectId = this.projectManager.getActiveProject();
            
            if (node.isDirectory) {
                await this.dxCli.deleteRemoteDirectory(node.path, { 
                    projectId: activeProjectId 
                });
            } else {
                // For files, use dx rm command
                const args = ['rm'];
                if (activeProjectId) {
                    args.push(`${activeProjectId}:${node.path}`);
                } else {
                    args.push(node.path);
                }
                await this.dxCli.callDxCli(args);
            }
            this.refresh();
            vscode.window.showInformationMessage(`Successfully deleted ${node.isDirectory ? 'folder' : 'file'} '${node.label}'`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to delete: ${error}`);
        }
    }

    /**
     * Create a new folder
     */
    private async createFolder(node?: DxNode): Promise<void> {
        const activeProjectId = this.projectManager.getActiveProject();
        if (!activeProjectId) {
            vscode.window.showWarningMessage('Please select a project first.');
            return;
        }
        
        // Use the selected node's path as parent, or root if none selected
        const parentPath = node && node.isDirectory ? node.path : '/';
        
        const folderName = await vscode.window.showInputBox({
            prompt: 'Enter folder name',
            placeHolder: 'New Folder'
        });
        
        if (!folderName) {
            return;
        }
        
        try {
            // Create the new folder path
            const newPath = parentPath === '/' ? `/${folderName}` : `${parentPath}/${folderName}`;
            
            // Use dx mkdir command to create folder
            const args = ['mkdir', '-p'];
            args.push(`${activeProjectId}:${newPath}`);
            
            await this.dxCli.callDxCli(args);
            this.refresh();
            vscode.window.showInformationMessage(`Created folder '${folderName}'`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
        }
    }

    /**
     * Describe a file and show JSON output in a Monaco editor
     */
    public async describeFile(element: DxNode): Promise<void> {
        if (!element || element.isDirectory) {
            vscode.window.showErrorMessage('Please select a file to describe.');
            return;
        }

        const activeProjectId = this.projectManager.getActiveProject();
        if (!activeProjectId) {
            vscode.window.showWarningMessage('Please select a project first.');
            return;
        }

        if (!element.id) {
            vscode.window.showErrorMessage('File ID is missing.');
            return;
        }

        try {
            const args = ['describe', '--json', element.id];
            const result = await this.dxCli.callDxCli(args);

            const content = typeof result === 'string' ? result : JSON.stringify(result, null, 2);

            if (content.trim() === '') {
                vscode.window.showErrorMessage(`Command \`dx describe --json ${element.id}\` returned no output.`);
                return;
            }

            // Write JSON to a temporary file so it's saved and not marked dirty
            const configDir = path.join(os.homedir(), '.dnanexus_config', 'tmp');
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            const fileName = `file-describe.json`;
            const filePath = path.join(configDir, fileName);
            fs.writeFileSync(filePath, content);
            const uri = vscode.Uri.file(filePath);
            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc, { preview: false });
            // Set language to JSON for syntax highlighting
            await vscode.languages.setTextDocumentLanguage(editor.document, 'json');
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to describe file: ${error.message || error}`);
            console.error(`DxFileExplorer: Failed to describe file '${element.path}'. Error:`, error);
        }
    }

    /**
     * Download and preview a file from its ID
     * @param node Optional node from the file explorer. If not provided, attempts to get file info from open file-describe.json
     */
    public async previewFile(node?: DxNode): Promise<void> {
        let fileInfo: any;

        if (node) {
            // If node is provided, use it directly
            fileInfo = {
                id: node.id,
                name: node.label
            };
        }

        try {
            
            // Ensure we have a file ID
            if (!fileInfo.id) {
                vscode.window.showErrorMessage('File ID not found in description.');
                return;
            }
            
            // Get the file name and extension
            const fileName = fileInfo.name || 'downloaded-file';
            const ext = path.extname(fileName).toLowerCase();
            
            // Create a download directory
            const configDir = path.join(os.homedir(), '.dnanexus_config', 'tmp');
            if (!fs.existsSync(configDir)) {
                fs.mkdirSync(configDir, { recursive: true });
            }
            
            // Use the file's name for the download
            const localPath = path.join(configDir, fileName);
            
            // Show download notification
            const downloadingStatus = vscode.window.setStatusBarMessage(`Downloading file ${fileName}...`);
            
            // Download the file using dx download
            const args = ['download', fileInfo.id, '-o', configDir, '--overwrite'];
            await this.dxCli.callDxCli(args);
            
            // Clear the downloading status
            downloadingStatus.dispose();
            
            // Open the file based on its type
            if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'].includes(ext)) {
                // For images, open in the VS Code image viewer
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(localPath));
                vscode.window.showInformationMessage(`Downloaded and opened image: ${fileName}`);
            } else if (ext === '.pdf') {
                // For PDFs, use the VS Code PDF viewer
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(localPath));
                vscode.window.showInformationMessage(`Downloaded and opened PDF: ${fileName}`);
            } else if (ext === '.md') {
                // For Markdown, open with preview
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(localPath));
                await vscode.commands.executeCommand('markdown.showPreview', doc.uri);
                vscode.window.showInformationMessage(`Downloaded and opened Markdown: ${fileName}`);
            } else if (ext === '.ipynb') {
                // For Jupyter notebooks, open in notebook editor
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(localPath));
                vscode.window.showInformationMessage(`Downloaded and opened notebook: ${fileName}`);
            } else {
                // For other files, open as text
                const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(localPath));
                await vscode.window.showTextDocument(doc);
                vscode.window.showInformationMessage(`Downloaded and opened file: ${fileName}`);
            }
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to preview file: ${error.message || error}`);
            console.error('DxFileExplorer: Failed to preview file. Error:', error);
        }
    }

    // TreeDataProvider implementation

    /**
     * Get tree item for a node
     */
    getTreeItem(element: DxNode): vscode.TreeItem {
        const treeItem = new vscode.TreeItem(
            element.label,
            element.isDirectory ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
        );
        
        treeItem.id = element.id;
        treeItem.tooltip = element.path;
        treeItem.contextValue = element.isDirectory ? 'folder' : 'file';
        
        // Set icon based on item type
        if (element.isDirectory) {
            treeItem.iconPath = vscode.ThemeIcon.Folder;
        } else {
            // For files, set resourceUri to allow VS Code to use file-extension-specific icons.
            // We use Uri.file() assuming element.path is an absolute-like path (e.g., "/folder/file.ext").
            // The 'file://' scheme helps VS Code's icon theme determine the icon from the file extension.
            try {
                treeItem.resourceUri = vscode.Uri.file(element.path);
            } catch (e) {
                // Fallback to a generic file icon if the path is not suitable for Uri.file()
                console.warn(`DxFileExplorer: Could not create URI from path for icon: ${element.path}`, e);
                treeItem.iconPath = vscode.ThemeIcon.File;
            }
            
            treeItem.command = {
                command: 'dxFileExplorer.describeFile',
                title: 'Describe File',
                arguments: [element]
            };
        }
        
        return treeItem;
    }

    /**
     * Get children for a node
     */
    async getChildren(element?: DxNode): Promise<DxNode[]> {
        const activeProjectId = this.projectManager.getActiveProject();
        return this.treeDataProvider.getChildren(element, activeProjectId);
    }

    /**
     * Get parent of a node
     */
    getParent(element: DxNode): vscode.ProviderResult<DxNode> {
        return element.parent;
    }

    // DragAndDropController implementation

    /**
     * Handle drag
     */
    handleDrag(source: readonly DxNode[], dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): void {
        this.dragAndDropController.handleDrag(source, dataTransfer, token);
    }

    /**
     * Handle drop
     */
    async handleDrop(target: DxNode | undefined, dataTransfer: vscode.DataTransfer, token: vscode.CancellationToken): Promise<void> {
        const activeProjectId = this.projectManager.getActiveProject();
        return this.dragAndDropController.handleDrop(target, dataTransfer, token, activeProjectId);
    }
}
