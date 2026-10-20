import { type ApplicationService } from '@adonisjs/core/types';
import type { AiManager } from '../src/ai_manager.js';
declare module '@adonisjs/core/types' {
    interface ContainerBindings {
        ai: AiManager;
    }
}
/**
 * AdonisJS 7 Service Provider for the AI subsystem.
 * Registers 'ai' singleton in container and installs HTTP response macros.
 */
export default class AiProvider {
    protected app: ApplicationService;
    private manager?;
    constructor(app: ApplicationService);
    register(): void;
    boot(): Promise<void>;
    /**
     * Stops ACP agent processes and settles pending confirmations on application shutdown.
     */
    shutdown(): Promise<void>;
}
//# sourceMappingURL=ai_provider.d.ts.map