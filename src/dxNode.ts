export class DxNode {
  // Reference to parent node for easier navigation
  public parent?: DxNode;
  
  constructor(
    readonly id: string,
    readonly label: string,
    readonly path: string,
    readonly isDirectory: boolean,
    readonly projectId?: string,
    readonly extension?: string
  ) {}
  
  /**
   * Set the parent reference for this node
   * @param parent The parent node
   */
  public setParent(parent: DxNode): void {
    this.parent = parent;
  }

  /**
   * Gets the full path with project ID if available
   */
  public getFullPath(): string {
    if (this.projectId) {
      return `${this.projectId}:${this.path}`;
    }
    return this.path;
  }
}
