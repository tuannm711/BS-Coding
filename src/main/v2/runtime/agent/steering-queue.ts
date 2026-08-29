export class SteeringQueue<T> {
  private values: T[] = []

  push(value: T): void {
    this.values.push(value)
  }

  drain(): T[] {
    const drained = this.values
    this.values = []
    return drained
  }
}
