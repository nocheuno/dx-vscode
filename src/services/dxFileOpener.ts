import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DxCli } from '../dxCli';
import { DxNode } from '../dxNode';
import { allowedExtensions } from './extens';

export class DxFileOpener {
    // Current active project ID
    private activeProjectId: string | undefined;
    
    constructor(private dxCli: DxCli) {}

    // List of allowed file extensions that can be opened
    private allowedExt = allowedExtensions;

    // Maximum file size for opening (5 MB)
    private maxFileSize = 5 * 1024 * 1024;
    
    /**
     * Set the active project ID
     */
    public setActiveProjectId(projectId: string | undefined): void {
        this.activeProjectId = projectId;
    }

    /**
     * Open a file from the DNAnexus platform
     */
    public async openFile(node: DxNode): Promise<void> {
        if (node.isDirectory) {
            vscode.window.showWarningMessage('Cannot open a directory.');
            return;
        }

        // Check file extension
        const ext = path.extname(node.label).toLowerCase();
        if (!this.allowedExt.includes(ext)) {
            vscode.window.showWarningMessage('Only text files and PDFs can be opened or downloaded.');
            return;
        }

        // Check file size before downloading
        let fileSize = 0;
        try {
            const args = ['describe', node.id, '--json'];
            
            // File describe in DNAnexus doesn't need project ID as the file ID contains it
            const info = await this.dxCli.callDxCli(args);
            if (info && typeof info.size === 'number') {
                fileSize = info.size;
            }
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to get file info: ${err}`);
            return;
        }

        if (fileSize > this.maxFileSize) {
            vscode.window.showWarningMessage('File is larger than 5 MB and will not be downloaded or opened.');
            return;
        }

        // Setup local file path
        const rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
        const tmpDir = path.join(rootPath || '', 'tmp');

        if (!fs.existsSync(tmpDir)) {
            fs.mkdirSync(tmpDir, { recursive: true });
        }
        
        // Create a project-specific directory inside tmp
        const projectId = this.activeProjectId || 'my-home';
        const projectTmpDir = path.join(tmpDir, projectId);
        
        if (!fs.existsSync(projectTmpDir)) {
            fs.mkdirSync(projectTmpDir, { recursive: true });
        }
        
        // Preserve the exact path from the tree structure
        const fileName = path.basename(node.path);
        let dirPath = path.dirname(node.path);
        if (dirPath === ".") {
            dirPath = "";
        }
        const localDir = path.join(projectTmpDir, dirPath);
        const localPath = path.join(localDir, fileName);

        // Create the directory structure if it doesn't exist
        if (!fs.existsSync(localDir)) {
            fs.mkdirSync(localDir, { recursive: true });
        }

        // Download and open the file
        await this.downloadAndOpenFile(node, localPath, localDir);
    }

    /**
     * Download and open a file
     */
    private async downloadAndOpenFile(node: DxNode, localPath: string, localDir: string): Promise<void> {
        const fileName = path.basename(node.path);
        const ext = path.extname(fileName).toLowerCase();
        
        try {
            if (!fs.existsSync(localPath)) {
                // For DNAnexus, the download command uses file-id-or-path format and -o for output
                const args = ['download', node.id, '-o', localDir, '--overwrite'];
                
                await this.dxCli.callDxCli(args);
                if (!fs.existsSync(localPath)) {
                    vscode.window.showErrorMessage(`Download did not produce expected file: ${localPath}`);
                    return;
                }
            }
            
            // Open PDF, image, or notebook in VS Code viewer, otherwise open as text
            if (ext === '.pdf' || ext === '.ipynb' || ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.tiff', '.webp'].includes(ext)) {
                await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(localPath));
            } else {
                const doc = await vscode.workspace.openTextDocument(localPath);
                await vscode.window.showTextDocument(doc, { preview: false });
            }
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to download or open file: ${err}`);
        }
    }

    /**
     * Dispose of resources
     */
    public dispose(): void {
        // Clean up resources if needed
    }
}
