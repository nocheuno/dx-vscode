import * as vscode from 'vscode';
import { DxCli } from '../dxCli';
import { DxNode } from '../dxNode';

/**
 * Handles drag and drop for the DX File Explorer
 */
export class DxDragAndDropController {
  constructor(
    private dxCli: DxCli, 
    private refreshCallback: (projectId?: string) => void
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
    projectId?: string
  ): Promise<void> {
    // Check for URIs being dropped
    const uriListItem = dataTransfer.get('text/uri-list');
    
    if (!uriListItem) {
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
        return;
      }
      
      // Get file paths from URIs
      const filePaths = uriList.map((uri: vscode.Uri) => uri.fsPath);
      
      // Determine target folder
      const targetFolder = target && target.isDirectory ? target.path : '/';
      
      // Upload the files
      await this.dxCli.uploadFiles(filePaths, projectId, targetFolder);
      
      // Refresh the view
      this.refreshCallback(projectId);
    } catch (error) {
      console.error('Failed to handle drop:', error);
      vscode.window.showErrorMessage(`Upload failed: ${error}`);
    }
  }
}
