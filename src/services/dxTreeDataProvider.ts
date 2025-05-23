import * as path from 'path';
import { DxCli } from '../dxCli';
import { DxNode } from '../dxNode';

/**
 * Provides tree data for the DX File Explorer
 */
export class DxTreeDataProvider {
  constructor(private dxCli: DxCli) {}

  /**
   * Get children for a node
   */
  public async getChildren(element: DxNode | undefined, projectId: string | undefined): Promise<DxNode[]> {
    // If no project is selected, show empty view
    if (!projectId) {
      return [];
    }
    
    try {
      // Get path from the element or use root path
      const nodePath = element ? element.path : '/';
      
      // Use dx ls command with verbose output and custom delimiter
      const delimiter = ';;';
      const args = ['ls', '--verbose', '--delimiter', delimiter, `${projectId}:${nodePath}`];
      const result = await this.dxCli.callDxCli(args) as string;
      // Split output lines
      const lines = result.split(/\r?\n/);
      // Locate header line
      const headerIndex = lines.findIndex(l => l.startsWith(`State${delimiter}`));
      const dirLines = headerIndex > 0 ? lines.slice(2, headerIndex) : [];
      const fileLines = headerIndex > -1 ? lines.slice(headerIndex + 1).filter(l => l.trim()) : [];
      const nodes: DxNode[] = [];
      // Parse directories (entries ending with '/')
      dirLines.forEach(line => {
        const name = line.trim().replace(/\/+$/, '');
        const isDirectory = true;
        const itemPath = nodePath === '/' ? `/${name}` : `${nodePath}/${name}`;
        const node = new DxNode(
          `${projectId}:${itemPath}`,
          name,
          itemPath,
          isDirectory,
          projectId
        );
        if (element) { node.setParent(element); }
        nodes.push(node);
      });
      // Parse files
      fileLines.forEach(line => {
        const parts = line.split(delimiter);
        const name = parts[3] || '';
        const id = parts[4] || '';
        const isDirectory = false;
        const itemPath = nodePath === '/' ? `/${name}` : `${nodePath}/${name}`;
        const extension = path.extname(name).toLowerCase();
        const node = new DxNode(
          id,
          name,
          itemPath,
          isDirectory,
          projectId,
          extension
        );
        if (element) { node.setParent(element); }
        nodes.push(node);
      });
       
      // Sort: folders first, then files, both alphabetically
      return nodes.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) {
          return -1;
        }
        if (!a.isDirectory && b.isDirectory) {
          return 1;
        }
        return a.label.localeCompare(b.label);
      });
    } catch (error) {
      console.error('DxTreeDataProvider: Failed to get children', error);
      return [];
    }
  }
}
