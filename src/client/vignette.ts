/*
 * decaffeinate suggestions:
 * DS102: Remove unnecessary code created because of implicit returns
 * Full docs: https://github.com/decaffeinate/decaffeinate/blob/main/docs/suggestions.md
 */

class Vignette {

  container: HTMLDivElement;
  messageLine: HTMLDivElement;

  constructor() {
    this.container = document.createElement('div');
    this.container.className = 'vignette';
    document.body.appendChild(this.container);
    this.messageLine = document.createElement('div');
    this.messageLine.className = 'vignette-message';
    this.container.appendChild(this.messageLine);
  }

  message(text: string): void {
    this.messageLine.textContent = text;
  }

  showProgress(): void {
    // FIXME
  }

  hideProgress(): void {
    // FIXME
  }

  progress(p: any): void {
    // FIXME
  }

  destroy(): void {
    this.container.remove();
    (this.container as any) = (this.messageLine as any) = null;
  }
}


//# Exports
export default Vignette;
