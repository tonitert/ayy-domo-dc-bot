export default class Logger {
  private static getTimeString (): string {
    const date = new Date()
    return `[${date.toLocaleTimeString('fi-FI')}]`
  }

  log (...messages: string[]): void {
    console.log(`${Logger.getTimeString()} ${messages.join(' ')}`)
  }

  warn (...messages: string[]): void {
    console.warn(`${Logger.getTimeString()} ${messages.join(' ')}`)
  }

  error (...messages: string[]): void {
    console.error(`${Logger.getTimeString()} ${messages.join(' ')}`)
  }
}
