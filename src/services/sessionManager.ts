import * as vscode from 'vscode';
import { DxCli } from '../dxCli';

export class SessionManager implements vscode.Disposable {
    private isLoggedIn = false;
    private dx: DxCli;

    constructor() {
        const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
        this.dx = new DxCli(workspacePath);
        this.checkLoginStatus();
    }

    public async checkLoginStatus(): Promise<void> {
        try {
            // Use CLI to get current user; output is username if logged in
            const output = await this.dx.callDxCli(['whoami']);
            const username = typeof output === 'string' ? output.trim() : '';
            if (username) {
                this.isLoggedIn = true;
                console.log(`User is logged in as ${username}`);
            } else {
                this.handleLoggedOut();
            }
        } catch (error: any) {
            console.error('Error checking login status:', error);
            // If authentication expired vs not logged in
            if (error.message && error.message.includes('InvalidAuthentication')) {
                this.handleLoggedOut('Your DNAnexus session has expired. Would you like to log in again?');
            } else {
                this.handleLoggedOut();
            }
        }
    }

    private handleLoggedOut(message = 'You are not logged into DNAnexus. Would you like to log in?') {
        this.isLoggedIn = false;
        vscode.window.showInformationMessage(message, 'Login').then(selection => {
            if (selection === 'Login') {
                const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || '';
                const cliPath = this.dx.getCliPath();
                const loginTaskName = 'dnanexus Login';
                const shellExec = new vscode.ShellExecution(`${cliPath} login`, { cwd: workspacePath });
                const task = new vscode.Task(
                    { type: 'shell' },
                    vscode.TaskScope.Workspace,
                    loginTaskName,
                    'dnanexus',
                    shellExec
                );
                vscode.tasks.executeTask(task).then(execution => {
                    const listener = vscode.tasks.onDidEndTaskProcess(e => {
                        if (e.execution === execution && e.exitCode === 0) {
                            listener.dispose();
                            this.checkLoginStatus().then(() => {
                                if (this.isLoggedIn) {
                                    vscode.commands.executeCommand('dxFileExplorer.refresh');
                                    vscode.commands.executeCommand('dxJobExplorer.refresh');
                                    vscode.commands.executeCommand('projectSelector.refresh');
                                }
                            });
                        }
                    });
                });
            }
        });
    }

    public getLoginStatus(): boolean {
        return this.isLoggedIn;
    }

    public dispose(): void {
        // No-op cleanup for SessionManager
    }
}
