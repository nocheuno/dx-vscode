import * as vscode from 'vscode';
import * as path from 'path';
import { DxCli } from '../dxCli';
import { DxNode } from '../dxNode';
import { DxUpload } from './dxUpload';
import { DxDirectory } from './dxDirectory';

export class DxFileOperations {
    // Current active project ID
    private activeProjectId: string | undefined;
    private uploader: DxUpload;
    private directoryManager: DxDirectory;
    
    constructor(private dxCli: DxCli, uploader: DxUpload, directoryManager: DxDirectory) {
        this.uploader = uploader;
        this.directoryManager = directoryManager;
    }
    
    // Set the active project ID
    public setActiveProjectId(projectId: string | undefined): void {
        this.activeProjectId = projectId;
    }

    public async uploadFile(): Promise<void> {
        console.log('DxFileOperations: Starting file upload process');
        // Show file picker
        const fileUris = await vscode.window.showOpenDialog({
            canSelectMany: false,
            openLabel: 'Upload'
        });
        
        if (!fileUris || fileUris.length === 0) {
            console.log('DxFileOperations: No file selected for upload');
            return;
        }
        
        const filePath = fileUris[0].fsPath;
        const fileName = path.basename(filePath);
        console.log(`DxFileOperations: File selected for upload: ${filePath}`);
        
        // Ask for destination folder
        const destinationFolders = await this.getDirectories();
        console.log(`DxFileOperations: Available destination folders: ${JSON.stringify(destinationFolders)}`);
        
        const selectedFolder = await vscode.window.showQuickPick(
            destinationFolders,
            { placeHolder: 'Select destination folder' }
        );
        
        if (!selectedFolder) {
            console.log('DxFileOperations: No destination folder selected');
            return;
        }
        console.log(`DxFileOperations: Selected destination folder: ${selectedFolder}`);
        
        // Execute the upload command
        try {
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Uploading ${fileName}`,
                cancellable: false
            }, async (progress) => {
                try {
                    progress.report({ increment: 0, message: 'Starting upload...' });
                    await this.uploadFiles([filePath], this.activeProjectId, selectedFolder, { showProgress: true });
                    progress.report({ increment: 100, message: 'Upload complete' });
                    vscode.window.showInformationMessage(`Successfully uploaded ${fileName}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Upload failed: ${error}`);
                }
            });
        } catch (error) {
            vscode.window.showErrorMessage(`Upload failed: ${error}`);
        }
    }

    public async downloadFile(node: DxNode): Promise<void> {
        if (node.isDirectory) {
            vscode.window.showWarningMessage('Cannot download a directory. Select a file to download.');
            return;
        }

        // Show folder picker for download
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Download to'
        });

        if (!folderUri || folderUri.length === 0) {
            return;
        }

        const downloadPath = folderUri[0].fsPath;
        const fileName = path.basename(node.path);

        vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Downloading ${fileName}`,
                cancellable: false
            },
            async (progress) => {
                try {
                    progress.report({ increment: 0, message: 'Starting download...' });
                    
                    // In DNAnexus, download command uses -o for output folder
                    const args = ['download', node.id, '-o', downloadPath];
                    await this.dxCli.callDxCli(args);
                    
                    progress.report({ increment: 100, message: 'Download complete' });
                    vscode.window.showInformationMessage(`Successfully downloaded ${fileName} to ${downloadPath}`);
                } catch (error) {
                    vscode.window.showErrorMessage(`Download failed: ${error}`);
                }
            }
        );
    }

    public async deleteFile(node: DxNode): Promise<boolean> {
        // Confirm deletion
        const confirmMessage = node.isDirectory ?
            `Are you sure you want to delete the folder "${node.label}" and all its contents?` :
            `Are you sure you want to delete "${node.label}"?`;

        const confirmed = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true },
            'Delete'
        );

        if (confirmed !== 'Delete') {
            return false;
        }

        try {
            if (node.isDirectory) {
                // For directories, we use the rm command with -r flag
                await this.dxCli.deleteRemoteDirectory(node.path, { projectId: this.activeProjectId });
            } else {
                // For files, we use the rm command directly (path includes project)
                const args = ['rm', node.id];
                await this.dxCli.callDxCli(args);
            }
            
            vscode.window.showInformationMessage(`Successfully deleted ${node.label}`);
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Deletion failed: ${error}`);
            return false;
        }
    }

    public async createDirectory(parentPath?: string): Promise<boolean> {
        const inputResult = await vscode.window.showInputBox({
            prompt: 'Enter folder name',
            placeHolder: 'New Folder',
            validateInput: (value) => {
                if (!value.trim()) {
                    return 'Folder name cannot be empty';
                }
                if (value.includes('/')) {
                    return 'Folder name cannot contain "/"';
                }
                return null;
            }
        });

        if (!inputResult) {
            return false;
        }

        const folderName = inputResult.trim();
        let fullPath: string;
        
        if (parentPath && parentPath !== '/') {
            // If parent path doesn't end with / add it
            const normalizedParent = parentPath.endsWith('/') ? parentPath : `${parentPath}/`;
            fullPath = `${normalizedParent}${folderName}`;
        } else {
            fullPath = `/${folderName}`;
        }

        try {
            if (!this.activeProjectId) {
                throw new Error('No active project selected');
            }

            // For DNAnexus, we use the mkdir command with --parents option
            const args = ['mkdir', '-p', `${this.activeProjectId}:${fullPath}`];
            await this.dxCli.callDxCli(args);
            
            vscode.window.showInformationMessage(`Successfully created folder ${folderName}`);
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to create folder: ${error}`);
            return false;
        }
    }

    public async renameFile(node: DxNode, newName: string): Promise<boolean> {
        if (!newName || newName.trim() === '') {
            vscode.window.showErrorMessage(`New ${node.isDirectory ? 'folder' : 'file'} name cannot be empty.`);
            return false;
        }

        if (newName.includes('/')) {
            vscode.window.showErrorMessage(`New ${node.isDirectory ? 'folder' : 'file'} name cannot contain path separators (/).`);
            return false;
        }

        const oldName = node.label;
        if (newName === oldName) {
            vscode.window.showInformationMessage('New name is the same as the current name. No changes made.');
            return false;
        }

        const confirmMessage = `Are you sure you want to rename ${node.isDirectory ? 'folder' : 'file'} "${oldName}" to "${newName}"?`;
        const confirmed = await vscode.window.showWarningMessage(
            confirmMessage,
            { modal: true },
            'Rename'
        );

        if (confirmed !== 'Rename') {
            return false;
        }

        try {
            // Await the vscode.window.withProgress to ensure the operation completes
            // before this function returns.
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `Renaming ${node.isDirectory ? 'folder' : 'file'} ${oldName} to ${newName}`,
                cancellable: false
            }, async (progress) => {
                progress.report({ increment: 0, message: 'Starting rename...' });
                // Use dx mv <object_id> <new_name>
                // This command works for both files and folders when providing the object ID and a new name.
                // It renames the item in its current location.
                const args = ['mv', node.id, newName];
                await this.dxCli.callDxCli(args);
                progress.report({ increment: 100, message: 'Rename complete' });
                vscode.window.showInformationMessage(`Successfully renamed ${node.isDirectory ? 'folder' : 'file'} "${oldName}" to "${newName}".`);
            });
            return true;
        } catch (error) {
            vscode.window.showErrorMessage(`Rename failed: ${error}`);
            return false;
        }
    }

    public async moveFiles(
        sourcePaths: string[],
        targetPath: string,
        projectId?: string,
        options?: { createParents?: boolean }
      ): Promise<void> {
        const args = ['mv'];
        if (options?.createParents) {
          args.push('--parents');
        }
    
        let finalTargetPath = targetPath;
        // Ensure directory target paths end with a slash for dx mv,
        // but only if it's not already the root path "/"
        if (finalTargetPath !== '/' && !finalTargetPath.endsWith('/')) {
          finalTargetPath += '/';
        }
    
        if (projectId) {
          sourcePaths.forEach(sourcePath => {
            args.push(`${projectId}:${sourcePath}`);
          });
          args.push(`${projectId}:${finalTargetPath}`);
        } else {
          sourcePaths.forEach(sourcePath => {
            args.push(sourcePath);
          });
          args.push(finalTargetPath);
        }
        await this.dxCli.callDxCli(args);
      }
    
      public async uploadFiles(
        filePaths: string[],
        projectId?: string,
        folderPath?: string,
        options?: { threads?: number; chunksize?: number; showProgress?: boolean }
      ): Promise<void> {
        return this.uploader.uploadFiles(filePaths, projectId, folderPath, options);
      }

    private async getDirectories(): Promise<string[]> {
        if (!this.activeProjectId) {
            return ['/'];
        }

        try {
            // Use ls command to list all folders in the project with JSON output
            const args = ['ls', '-l', `${this.activeProjectId}:`, '--folders', '--json'];
            const result = await this.dxCli.callDxCli(args);
            
            // Start with the root directory
            const directories = ['/'];
            
            if (result && Array.isArray(result)) {
                // Collect all folder paths
                result.forEach((item: any) => {
                    if (item.id && item.folder) {
                        directories.push(item.folder);
                    }
                });
            }
            
            return directories.sort();
        } catch (error) {
            console.error('Error getting directories:', error);
            return ['/'];
        }
    }
    
    /**
     * Dispose of resources
     */
    public dispose(): void {
        // Clean up resources if needed
    }
}
