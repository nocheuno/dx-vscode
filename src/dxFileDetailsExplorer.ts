import * as vscode from 'vscode';
import { DxCli } from './dxCli';
import { DxNode } from './dxNode';
import { ProjectManager } from './services/projectManager';

export class FileDetailNode extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly value: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
    ) {
        super(label, collapsibleState);
        this.description = value;
        this.tooltip = `${label}: ${value}`;
        this.contextValue = 'fileDetail';
    }
}

export class DxFileDetailsExplorer implements vscode.TreeDataProvider<FileDetailNode> {
    private _onDidChangeTreeData: vscode.EventEmitter<FileDetailNode | undefined | null | void> = new vscode.EventEmitter<FileDetailNode | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<FileDetailNode | undefined | null | void> = this._onDidChangeTreeData.event;

    private fileDetails: any = null;
    private selectedFile: DxNode | null = null;
    private dxCli: DxCli;
    private projectManager: ProjectManager;
    private disposables: vscode.Disposable[] = [];
    private view: vscode.TreeView<FileDetailNode>;

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
        this.view = vscode.window.createTreeView('dxFileDetailsExplorer', { 
            treeDataProvider: this, 
            showCollapseAll: false
        });

        // Register commands
        this.disposables.push(this.view);
        this.disposables.push(vscode.commands.registerCommand('dxFileDetailsExplorer.refresh', () => this.refresh()));
        this.disposables.push(vscode.commands.registerCommand('dxFileDetailsExplorer.clear', () => this.clear()));

        // Also register in the context subscriptions
        context.subscriptions.push(this);
    }

    /**
     * Set the selected file and load its details
     */
    public async setSelectedFile(file: DxNode): Promise<void> {
        if (file.isDirectory) {
            return; // Don't show details for directories
        }

        this.selectedFile = file;
        await this.loadFileDetails();
        this.refresh();
    }

    /**
     * Clear the file details
     */
    public clear(): void {
        this.selectedFile = null;
        this.fileDetails = null;
        this.refresh();
    }

    /**
     * Load file details from DNAnexus
     */
    private async loadFileDetails(): Promise<void> {
        if (!this.selectedFile) {
            return;
        }

        try {
            const args = ['describe', '--json', this.selectedFile.id];
            const result = await this.dxCli.callDxCli(args);
            this.fileDetails = result;
        } catch (error) {
            console.error('DxFileDetailsExplorer: Failed to load file details', error);
            this.fileDetails = null;
        }
    }

    /**
     * Refresh the tree view
     */
    public refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Dispose resources
     */
    public dispose(): void {
        console.log('DxFileDetailsExplorer: Disposing');
        this.disposables.forEach(d => d.dispose());
    }

    /**
     * Get tree item for node
     */
    public getTreeItem(element: FileDetailNode): vscode.TreeItem {
        return element;
    }

    /**
     * Get children of node
     */
    public getChildren(element?: FileDetailNode): Thenable<FileDetailNode[]> {
        if (!this.selectedFile || !this.fileDetails) {
            return Promise.resolve([]);
        }

        if (!element) {
            // Root level - show main file properties
            const items: FileDetailNode[] = [];
            
            if (this.fileDetails.name) {
                items.push(new FileDetailNode('Name', this.fileDetails.name));
            }
            
            if (this.fileDetails.id) {
                items.push(new FileDetailNode('File ID', this.fileDetails.id));
            }
            
            if (this.fileDetails.class) {
                items.push(new FileDetailNode('Class', this.fileDetails.class));
            }
            
            if (this.fileDetails.size !== undefined) {
                const sizeFormatted = this.formatFileSize(this.fileDetails.size);
                items.push(new FileDetailNode('Size', sizeFormatted));
            }
            
            if (this.fileDetails.state) {
                items.push(new FileDetailNode('State', this.fileDetails.state));
            }
            
            if (this.fileDetails.folder) {
                items.push(new FileDetailNode('Folder', this.fileDetails.folder));
            }
            
            if (this.fileDetails.project) {
                items.push(new FileDetailNode('Project', this.fileDetails.project));
            }
            
            if (this.fileDetails.created) {
                const createdDate = new Date(this.fileDetails.created).toLocaleString();
                items.push(new FileDetailNode('Created', createdDate));
            }
            
            if (this.fileDetails.modified) {
                const modifiedDate = new Date(this.fileDetails.modified).toLocaleString();
                items.push(new FileDetailNode('Modified', modifiedDate));
            }
            
            if (this.fileDetails.createdBy && this.fileDetails.createdBy.user) {
                items.push(new FileDetailNode('Created By', this.fileDetails.createdBy.user));
            }
            
            if (this.fileDetails.media && this.fileDetails.media.type) {
                items.push(new FileDetailNode('Media Type', this.fileDetails.media.type));
            }
            
            // Add properties section if it exists
            if (this.fileDetails.properties && Object.keys(this.fileDetails.properties).length > 0) {
                const propertiesNode = new FileDetailNode(
                    'Properties', 
                    `${Object.keys(this.fileDetails.properties).length} item(s)`,
                    vscode.TreeItemCollapsibleState.Collapsed
                );
                propertiesNode.contextValue = 'properties';
                items.push(propertiesNode);
            }
            
            // Add tags if they exist
            if (this.fileDetails.tags && this.fileDetails.tags.length > 0) {
                const tagsNode = new FileDetailNode(
                    'Tags',
                    this.fileDetails.tags.join(', '),
                    this.fileDetails.tags.length > 3 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None
                );
                tagsNode.contextValue = 'tags';
                items.push(tagsNode);
            }
            
            return Promise.resolve(items);
        } else if (element.contextValue === 'properties') {
            // Show properties
            const items: FileDetailNode[] = [];
            for (const [key, value] of Object.entries(this.fileDetails.properties || {})) {
                items.push(new FileDetailNode(key, String(value)));
            }
            return Promise.resolve(items);
        } else if (element.contextValue === 'tags') {
            // Show individual tags
            const items: FileDetailNode[] = [];
            for (const tag of this.fileDetails.tags || []) {
                items.push(new FileDetailNode('Tag', tag));
            }
            return Promise.resolve(items);
        }

        return Promise.resolve([]);
    }

    /**
     * Format file size in human readable format
     */
    private formatFileSize(bytes: number): string {
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        if (bytes === 0) {
            return '0 B';
        }
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    }
}
