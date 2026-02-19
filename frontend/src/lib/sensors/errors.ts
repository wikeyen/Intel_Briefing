// ABOUTME: Custom error class for sensor configuration issues (missing API keys, empty account lists).
// ABOUTME: Distinguishes "sensor can't run due to missing config" from "sensor ran but API failed."

export class SensorConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SensorConfigError'
  }
}
