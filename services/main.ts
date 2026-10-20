import app from '@adonisjs/core/services/app'
import type { AiManager } from '../src/ai_manager.js'

let ai: AiManager
await app.booted(async () => {
  ai = await app.container.make('ai')
})

export { ai as default }
