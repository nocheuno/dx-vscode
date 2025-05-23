import { spawn } from 'child_process';
import * as vscode from 'vscode';
import { dxStatusBarItem } from '../statusBar';
import * as fs from 'fs';
import * as path from 'path';

export class DxUpload {
  constructor(private cliPath: string) {}

  public async uploadFiles(
    filePaths: string[],
    projectId?: string,
    folderPath?: string,
    options?: { threads?: number; chunksize?: number; showProgress?: boolean }
  ): Promise<void> {
    const { showProgress, ...internalOptions } = options || {};
    if (showProgress === false) {
      // Directly call _uploadFilesInternal without vscode.Progress
      // Need to ensure totalFiles is calculated and used appropriately if needed by other parts for non-progress scenarios
      // For now, _uploadFilesInternal calculates totalFiles internally.
      return this._uploadFilesInternal(filePaths, projectId, folderPath, internalOptions, undefined, undefined);
    }
    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "DNAnexus Upload", // Simplified title
        cancellable: true,
      },
      (progress, token) => {
        // Pass the progress and token to _uploadFilesInternal
        return this._uploadFilesInternal(filePaths, projectId, folderPath, internalOptions, progress, token);
      }
    );
  }

  private async _uploadFilesInternal(
    filePaths: string[],
    projectId?: string,
    folderPath?: string,
    options?: { threads?: number; chunksize?: number },
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
    token?: vscode.CancellationToken
  ): Promise<void> {
    console.log("Starting _uploadFilesInternal with refined progress logic.");
    let processedCount = 0;
    let totalFiles = 0;

    const countFilesInDirectory = async (dirPath: string): Promise<number> => {
      let fileCount = 0;
      try {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dirPath, entry.name);
          if (entry.isDirectory()) {
            console.log(`Counting in subdirectory: ${fullPath}`);
            fileCount += await countFilesInDirectory(fullPath);
          } else {
            fileCount++;
          }
        }
      } catch (e) {
        console.error(`Error reading directory ${dirPath}:`, e);
      }
      console.log(`Directory ${dirPath} contains ${fileCount} files`);
      return fileCount;
    };

    console.log("Calculating total files...");
    for (const filePath of filePaths) {
      try {
        const stats = await fs.promises.stat(filePath);
        if (stats.isDirectory()) {
          console.log(`Path is a directory: ${filePath}`);
          totalFiles += await countFilesInDirectory(filePath);
        } else {
          console.log(`Path is a file: ${filePath}`);
          totalFiles += 1;
        }
      } catch (e) {
        console.error(`Error stating file/directory ${filePath}:`, e);
        vscode.window.showErrorMessage(`Error accessing ${filePath}. It might not exist or there's a permission issue.`);
      }
    }
    console.log(`Total files to upload: ${totalFiles}`);

    if (totalFiles === 0) {
      vscode.window.showWarningMessage("No files found to upload.");
      if (progress) {
        progress.report({ message: "No files to upload." });
      }
      // Ensure status bar is reset if it was shown before this check
      if (dxStatusBarItem) {
        dxStatusBarItem.text = "$(cloud) DNAnexus";
        dxStatusBarItem.tooltip = "DNAnexus Platform";
        // dxStatusBarItem.hide(); // Optionally hide if not needed
      }
      return; // Exit early
    }

    if (progress) {
      // Align initial message format with subsequent updates
      progress.report({ message: `Uploaded 0/${totalFiles} files (0%)` });
    }

    if (dxStatusBarItem) {
      dxStatusBarItem.text = `$(cloud-upload) DNAnexus: 0/${totalFiles} files (0%)`;
      dxStatusBarItem.tooltip = `Initializing upload for ${totalFiles} file(s)`;
      dxStatusBarItem.show();
    }

    const args = ['upload', '--wait', '--brief'];
    let effectiveFolderPath = folderPath;
    if (folderPath === "") {
        effectiveFolderPath = "/";
    }

    if (effectiveFolderPath) {
      const targetFolder = effectiveFolderPath.endsWith('/') ? effectiveFolderPath : `${effectiveFolderPath}/`;
      if (projectId) {
        args.push('--destination', `${projectId}:${targetFolder}`);
      } else {
        args.push('--destination', targetFolder);
      }
    } else if (projectId) {
      args.push('--destination', `${projectId}:/`);
    }
    args.push('-p'); // Create parent directories

    let hasDirectory = false;
    for (const filePath of filePaths) {
      try {
        if ((await fs.promises.stat(filePath)).isDirectory()) {
          hasDirectory = true;
          break;
        }
      } catch (e) {
        console.warn(`Could not stat file ${filePath} for -r flag check: `, e);
      }
    }
    if (hasDirectory) {
      args.push('-r');
    }
    args.push(...filePaths);

    console.log(`Spawning process. CLI Path: ${this.cliPath}, Args: ${JSON.stringify(args)}`);

    return new Promise<void>((resolve, reject) => {
      if (token?.isCancellationRequested) {
        console.log("Upload cancelled before starting process.");
        if (dxStatusBarItem) {
          dxStatusBarItem.text = "$(cloud) DNAnexus";
          dxStatusBarItem.tooltip = "DNAnexus Platform";
        }
        return reject(new Error("Upload cancelled by user."));
      }

      let proc;
      try {
        proc = spawn(this.cliPath, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          env: { ...process.env, PYTHONUNBUFFERED: "1" },
        });
        console.log(`Process spawned. PID: ${proc.pid}`);
      } catch (spawnError) {
        console.error("Error spawning process:", spawnError);
        if (dxStatusBarItem) {
          dxStatusBarItem.text = "$(cloud) DNAnexus";
          dxStatusBarItem.tooltip = "DNAnexus Platform";
        }
        return reject(spawnError);
      }

      if (token) {
        token.onCancellationRequested(() => {
          console.log("Cancellation requested. Terminating process...");
          proc.kill();
          // Status bar reset and rejection will be handled in 'close' or 'error' event
        });
      }

      let stderr = "";
      let stdoutBuffer = "";

      const reportProgress = () => {
        // Ensure processedCount does not exceed totalFiles for percentage calculation
        const currentProcessed = Math.min(processedCount, totalFiles);
        const percent = totalFiles > 0 ? Math.round((currentProcessed / totalFiles) * 100) : 0;
        // Ensure percent does not exceed 100
        const displayPercent = Math.min(percent, 100);

        console.log(`Processed file ${currentProcessed}/${totalFiles}. Percent: ${displayPercent}%`);
        if (progress) {
          progress.report({
            message: `Uploaded ${currentProcessed}/${totalFiles} files (${displayPercent}%)`,
            // Increment is based on one file's contribution to total progress
            increment: totalFiles > 0 ? (1 / totalFiles) * 100 : 0,
          });
        }
        if (dxStatusBarItem) {
          dxStatusBarItem.text = `$(cloud-upload) DNAnexus: ${currentProcessed}/${totalFiles} (${displayPercent}%)`;
          dxStatusBarItem.tooltip = `Uploading ${totalFiles} file(s) - ${displayPercent}% complete`;
        }
      };

      proc.stdout.on("data", (data: Buffer) => {
        console.log("stdout data event. Raw data:", data.toString());
        stdoutBuffer += data.toString();
        let EOL;
        while ((EOL = stdoutBuffer.indexOf('\n')) >= 0) { // Corrected: Changed from '\\\\n' to '\\n'
            const line = stdoutBuffer.substring(0, EOL).trim();
            stdoutBuffer = stdoutBuffer.substring(EOL + 1);
            if (line.length > 0) { // Each non-empty line is a file ID
              processedCount++;
              reportProgress();
            }
        }
      });

      proc.stdout.on("end", () => {
        console.log("stdout stream ended.");
        if (stdoutBuffer.trim().length > 0) { // Process any remaining data
            const line = stdoutBuffer.trim();
            console.log("Processing remaining line from stdout after end:", line);
            if (line.length > 0) {
                processedCount++;
                reportProgress();
            }
        }
        stdoutBuffer = "";
      });

      proc.stdout.on("error", (err: Error) => {
        console.error("stdout stream error:", err);
        // This might not be fatal for the process itself, stderr or close event will give more info
      });

      proc.stderr.on("data", (data: Buffer) => {
        const errChunk = data.toString();
        console.log("stderr data:", errChunk);
        stderr += errChunk;
      });

      proc.on("error", (err: Error) => {
        console.error("Process error event (e.g., spawn failed):", err);
        if (dxStatusBarItem) {
          dxStatusBarItem.text = "$(cloud) DNAnexus";
          dxStatusBarItem.tooltip = "DNAnexus Platform";
        }
        // Ensure progress reflects failure
        if (progress) {
            progress.report({ message: `Upload failed: ${err.message}` });
        }
        reject(err);
      });

      proc.on("close", (code: number, signal: string) => {
        console.log(`Process closed. Code: ${code}, Signal: ${signal}`);
        if (dxStatusBarItem) {
          dxStatusBarItem.text = "$(cloud) DNAnexus";
          dxStatusBarItem.tooltip = "DNAnexus Platform";
        }

        if (token?.isCancellationRequested && (signal === 'SIGTERM' || code === null || (process.platform !== "win32" && code === 130) )) { // SIGINT (Ctrl+C) often results in 130
          console.log("Upload process was cancelled by user.");
          if (progress) {
            progress.report({ message: "Upload cancelled by user." });
          }
          // No need to reject again if already rejected by onCancellationRequested handler,
          // but ensure it is rejected if not.
          // However, the promise is typically rejected by the token's handler directly.
          // For safety, ensure rejection if not already handled.
          // The original token handler already calls reject.
          return; // Avoid double rejection or incorrect success reporting
        }

        if (code === 0) {
          let finalMessage: string;
          const finalProcessed = Math.min(processedCount, totalFiles); // Cap processedCount at totalFiles

          if (finalProcessed === totalFiles) {
            finalMessage = `Successfully uploaded all ${totalFiles} file(s). (100%)`;
            vscode.window.showInformationMessage(`Successfully uploaded all ${totalFiles} file(s) to the DNAnexus platform.`);
          } else {
            // This case implies dx upload finished successfully (exit 0) but reported fewer file IDs than expected.
            const finalPercent = totalFiles > 0 ? Math.round((finalProcessed / totalFiles) * 100) : 0;
            finalMessage = `Upload completed. Processed ${finalProcessed} of ${totalFiles} expected file(s). (${finalPercent}%)`;
            console.warn(`Upload completed with code 0, but processedCount (${finalProcessed}) != totalFiles (${totalFiles}).`);
            vscode.window.showWarningMessage(
              `Upload completed, but ${finalProcessed} of ${totalFiles} expected files were confirmed. Please verify the upload.`
            );
          }
          if (progress) {
            // Report final state. The sum of increments should ideally match.
            // Setting a final message is key.
            progress.report({ message: finalMessage });
          }
          resolve();
        } else {
          const errorMsg = stderr.trim() || `Upload failed with exit code ${code}${signal ? ` (signal: ${signal})` : ''}.`;
          console.error(`Upload failed. Full stderr: ${stderr}`);
          if (progress) {
            progress.report({ message: `Upload failed: ${errorMsg.split('\\n')[0]}` }); // Show first line of error
          }
          reject(new Error(errorMsg));
        }
      });
    });
  }
}
