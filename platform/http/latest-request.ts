export class LatestRequestGate {
  private requestId = 0;
  private cancelled = false;

  begin() {
    return ++this.requestId;
  }

  isCurrent(requestId: number) {
    return !this.cancelled && requestId === this.requestId;
  }

  reset() {
    this.cancelled = false;
  }

  cancel() {
    this.cancelled = true;
  }
}
