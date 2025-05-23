import * as vscode from 'vscode';
import { DxCli } from '../dxCli';
import { DxNode } from '../dxNode';
import { DxFileOperations } from './dxFileOperations';

/**
 * Handles drag and drop for the DX File Explorer
 */
export class DxDragAndDropController {
  constructor(
    private dxCli: DxCli, 
    private refreshCallback: (projectId?: string) => void,
    private fileOperations: DxFileOperations
  ) {}
  
  /**
   * Handle drag from the tree view
   */
  public handleDrag(
    _source: readonly DxNode[],
    _dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken
  ): void {
    // Not yet implemented - would need to transfer DNAnexus file IDs
  }
  
  /**
   * Handle drop onto the tree view
   */
  public async handleDrop(
    target: DxNode | undefined,
    dataTransfer: vscode.DataTransfer,
    _token: vscode.CancellationToken,
    projectId?: string,
    sourceNodes?: DxNode[] // Added sourceNodes parameter
  ): Promise<void> {

    // Check if it's an internal drag (sourceNodes are provided)
    if (sourceNodes && sourceNodes.length > 0) {
      if (target && target.isDirectory) {
        const sourcePaths = sourceNodes.map(node => node.path);
        await this.fileOperations.moveFiles(sourcePaths, target.path, projectId); // Updated to use fileOperations
        this.refreshCallback(projectId);
      } else {
        // Handle cases where the target is not a directory or is undefined for internal moves
        vscode.window.showWarningMessage('Cannot move items here. Please select a target folder.');
      }
      return;
    }

    // Existing logic for external drags (e.g., from local filesystem)
    const uriListItem = dataTransfer.get('text/uri-list');
    
    if (!uriListItem) {
      console.error('No URI list found in data transfer.');
      return;
    }
    
    try {
      // Parse the URI list
      const uriList = uriListItem.value.split('\n')
        .map((uri: string) => uri.trim())
        .filter((uri: string) => uri.length > 0)
        .map((uri: string) => vscode.Uri.parse(uri));
      
      // No URIs to process
      if (uriList.length === 0) {
        console.error('No valid URIs found in the URI list.');
        return;
      }
      
      // Get file paths from URIs
      const filePaths = uriList.map((uri: vscode.Uri) => uri.fsPath);
      
      // Determine target folder
      const targetFolder = target && target.isDirectory ? target.path : '/';
      
      
      if (target && target.isDirectory) {
        console.log(`Moving files to directory: ${target.path}`);
        
        // Moving files or folders into another folder
        // The --parents flag is implicitly handled by dx mv if the source is a directory and target is a directory.
        // If specific handling for --parents is needed based on source type, fs.stat would be required here.
        await this.fileOperations.moveFiles(filePaths, targetFolder, projectId, { createParents: true }); // Updated to use fileOperations
      } else {
        // Fallback to upload if not dragging onto a directory or if other conditions apply
        // This part might need more specific logic based on exact requirements for non-directory targets
        await this.fileOperations.uploadFiles(filePaths, projectId, targetFolder); // Updated to use fileOperations
      }
      
      // Refresh the view
      this.refreshCallback(projectId);
    } catch (error) {
      console.error('Failed to handle drop:', error);
      vscode.window.showErrorMessage(`Upload failed: ${error}`);
    }
  }
}
