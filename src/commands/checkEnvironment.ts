import * as vscode from 'vscode';

export function registerCheckEnvironmentCommand(context: vscode.ExtensionContext) {
    const checkEnvCmd = vscode.commands.registerCommand('dx-vscode.checkEnvironment', () => {
        const terminal = vscode.window.createTerminal('DNAnexus Environment');
        terminal.show();
        terminal.sendText('echo "Checking DNAnexus environment..."');
        terminal.sendText('if command -v dx > /dev/null; then');
        terminal.sendText('  echo "✅ dx CLI found: $(which dx)"');
        terminal.sendText('  echo "✅ Version: $(dx --version)"');
        terminal.sendText('  echo "✅ Current user: $(dx whoami)"');
        terminal.sendText('else');
        terminal.sendText('  echo "❌ dx CLI not found in PATH"');
        terminal.sendText('  echo "To activate your dxpy environment, run:"');
        terminal.sendText('  echo "source ~/dxpy-venv/bin/activate"');
        terminal.sendText('fi');
    });
    context.subscriptions.push(checkEnvCmd);
}
