import { spawn, spawnSync } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as vscode from 'vscode';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const execAsync = promisify(require('child_process').exec);

/**
 * Handles spawning and executing DNAnexus DX CLI commands.
 */
export class DxProcess {
  private cliPath: string;
  private defaultParams: string;

  constructor(workspacePath: string, defaultParams = '') {
    this.cliPath = DxProcess.findDxCliPath(workspacePath);
    this.defaultParams = defaultParams;
  }

  public getDefaultParams(): string {
    return this.defaultParams;
  }

  public getCliPath(): string {
    return this.cliPath;
  }

  public async executeCommand(command: string): Promise<{ stdout: string, stderr: string }> {
    try {
      const result = await execAsync(command);
      return result;
    } catch (error: any) {
      const message = error.stderr ? error.stderr : error.message;
      throw new Error(message);
    }
  }

  public async callDxCli(args: string[], options: { input?: string } = {}): Promise<any> {
    // Ensure JSON output when applicable
    if (!args.includes('--json') && this.commandSupportsJsonFlag(args[0])) {
      args.push('--json');
    }
    
    console.log(`DxProcess: Executing dx ${args.join(' ')}`);
    
    const proc = spawn(this.cliPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';

    return new Promise((resolve, reject) => {
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('error', (err) => {
        console.error(`DxProcess: Error executing dx command: ${err.message}`);
        reject(err);
      });
      
      proc.on('close', (code) => {
        console.log(`DxProcess: Command completed with exit code: ${code}`);
        if (code !== 0) {
          reject(new Error(stderr || `dx exited with code ${code}`));
        } else {
          try {
            // Try to parse as JSON, but fall back to string output if not JSON
            if (stdout.trim().startsWith('{') || stdout.trim().startsWith('[')) {
              const result = JSON.parse(stdout);
              resolve(result);
            } else {
              resolve(stdout);
            }
          } catch (err) {
            console.warn(`DxProcess: Failed to parse JSON output: ${err}`);
            // If parsing fails, just return the raw stdout
            resolve(stdout);
          }
        }
      });

      if (options.input) {
        proc.stdin.write(options.input);
        proc.stdin.end();
      }
    });
  }

  /**
   * Check if a command supports the --json flag
   */
  private commandSupportsJsonFlag(command: string): boolean {
    // List of dx commands that support the --json flag
    const jsonSupportedCommands = [
      'describe', 'find', 'tree', 'wait', 'env',
      'find data', 'find projects', 'get', 'new project',
      'update project'
    ];
    
    return jsonSupportedCommands.includes(command);
  }

  public static findDxCliPath(workspacePath: string): string {
    // First check if the user has specified a custom path in settings
    try {
      const customPath = vscode.workspace.getConfiguration('dx-vscode').get<string>('cliPath');
      if (customPath && customPath.trim() !== '') {
        if (fs.existsSync(customPath)) {
          return customPath;
        }
        console.warn(`Configured DX CLI path ${customPath} does not exist`);
      }
    } catch {
      // Ignore errors when accessing configuration, continue with default search
    }

    // Try to find dx in PATH using 'which'
    const whichResult = spawnSync('which', ['dx']);
    const whichPath = whichResult.stdout?.toString().trim();
    if (whichPath) {
      return whichPath;
    }

    // Add more paths to check, including common Python venv locations
    const possiblePaths = [
      path.join(workspacePath, 'dx'),
      '/usr/local/bin/dx',
      '/usr/bin/dx',
      // Common Python virtual environment paths
      path.join(process.env.HOME || '', 'dxpy-venv/bin/dx'),
      path.join(process.env.HOME || '', '.dxpy-venv/bin/dx'),
      path.join(process.env.HOME || '', 'venv/bin/dx'),
      path.join(process.env.HOME || '', '.venv/bin/dx'),
      path.join(process.env.HOME || '', 'env/bin/dx'),
      path.join(workspacePath, 'dxpy-venv/bin/dx'),
      path.join(workspacePath, 'venv/bin/dx')
    ];
    
    for (const cliPath of possiblePaths) {
      if (fs.existsSync(cliPath)) {
        return cliPath;
      }
    }

    throw new Error(`DNAnexus DX CLI not found. Checked: ${possiblePaths.join(', ')} and PATH. 
You can set the path to dx CLI manually in extension settings (dx-vscode.cliPath).`);
  }
}
