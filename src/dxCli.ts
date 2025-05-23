import { DxProcess } from './services/dxProcess';
import { DxUpload } from './services/dxUpload';
import { DxDirectory } from './services/dxDirectory';

export class DxCli {
  private process: DxProcess;
  private uploader: DxUpload;
  private directoryManager: DxDirectory;

  constructor(workspacePath: string, defaultParams = '') {
    this.process = new DxProcess(workspacePath, defaultParams);
    const cliPath = this.process.getCliPath();
    this.uploader = new DxUpload(cliPath);
    this.directoryManager = new DxDirectory(this.process);
  }

  public getDefaultParams(): string {
    return this.process.getDefaultParams();
  }

  public getCliPath(): string {
    return this.process.getCliPath();
  }

  public async executeCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    return this.process.executeCommand(command);
  }

  public async callDxCli(args: string[], options: { input?: string } = {}): Promise<any> {
    return this.process.callDxCli(args, options);
  }

  public async uploadFiles(
    filePaths: string[],
    projectId?: string,
    folderPath?: string,
    options?: { threads?: number; chunksize?: number; showProgress?: boolean }
  ): Promise<void> {
    return this.uploader.uploadFiles(filePaths, projectId, folderPath, options);
  }

  public async deleteRemoteDirectory(
    directoryPath: string,
    options: { projectId?: string; showProgress?: boolean } = { showProgress: true }
  ): Promise<void> {
    return this.directoryManager.deleteRemoteDirectory(directoryPath, options);
  }

  public static findDxCliPath(workspacePath: string): string {
    return DxProcess.findDxCliPath(workspacePath);
  }
}
