export default class Logger {
  private static getTimeString (): string {
    const date = new Date()
    return `[${date.toLocaleTimeString('fi-FI')}]`
  }

  log (message: string): void {
    console.log(`${Logger.getTimeString()} ${message}`)
  }

  warn (message: string): void {
    console.warn(`${Logger.getTimeString()} ${message}`)
  }

  error (message: string): void {
    console.error(`${Logger.getTimeString()} ${message}`)
  }
}
