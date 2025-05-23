import * as vscode from 'vscode';
import { DxProcess } from './dxProcess';

/**
 * Handles recursive deletion of remote DNAnexus directories.
 */
export class DxDirectory {
  constructor(private process: DxProcess) {}

  public async deleteRemoteDirectory(
    directoryPath: string,
    options: { projectId?: string; showProgress?: boolean } = { showProgress: true }
  ): Promise<void> {
    if (options.showProgress) {
      return vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `Deleting directory`,
          cancellable: true
        },
        (progress, token) => this._deleteInternal(directoryPath, options.projectId, progress, token)
      );
    } else {
      return this._deleteInternal(directoryPath, options.projectId);
    }
  }

  private async _deleteInternal(
    directoryPath: string,
    projectId?: string,
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
    token?: vscode.CancellationToken
  ): Promise<void> {
    const process = this.process;
    try {
      // Get the full path with project if needed
      const fullPath = projectId ? `${projectId}:${directoryPath}` : directoryPath;
      
      // List contents of directory
      const lsArgs = ['ls', '--json'];
      lsArgs.push(fullPath);
      
      const result = await process.callDxCli(lsArgs);
      
      let items: any[] = [];
      if (Array.isArray(result)) {
        items = result;
      } else {
        // Extract items depending on the structure returned by dx ls --json
        items = result.objects || [];
      }

      const total = items.length;
      let count = 0;

      // First delete all contents recursively
      for (const item of items) {
        if (token && token.isCancellationRequested) {
          return;
        }
        
        const isDir = item.class === 'folder';
        const itemPath = item.id || item.path;
        
        if (isDir) {
          // Handle folder recursively
          const subDirPath = directoryPath + '/' + item.name;
          await this._deleteInternal(subDirPath, projectId, progress, token);
        } else {
          // Remove file using dx rm
          const rmArgs = ['rm'];
          const filePath = projectId ? `${projectId}:${directoryPath}/${item.name}` : `${directoryPath}/${item.name}`;
          rmArgs.push(filePath);
          
          await process.callDxCli(rmArgs);
        }
        
        count++;
        if (progress) {
          progress.report({ message: `Deleted ${count}/${total}`, increment: 100 / total });
        }
      }

      // Finally remove the directory itself
      const rmdirArgs = ['rmdir'];
      rmdirArgs.push(fullPath);
      
      await process.callDxCli(rmdirArgs);

    } catch (error) {
      throw new Error(`Failed to delete directory: ${error}`);
    }
  }
}
